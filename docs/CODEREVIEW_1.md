# FigmaLab Code Review — Production Readiness Assessment

- Review date: 2026-03-07 (Asia/Seoul)
- Reviewer: Senior Software Engineer perspective
- Scope: `src/**`, `test/**`, `package.json`
- Validation run:
  - `npm run lint` ✅ pass
  - `npm run test:coverage` ✅ pass
- Coverage snapshot:
  - Statements: **88.60%**
  - Branches: **77.31%**
  - Functions: **95.42%**
  - Lines: **88.60%**

---

## Executive Summary

코드베이스는 베타 수준의 안정성을 갖추고 있으며, 기본 품질 게이트(lint, test)를 통과합니다. 그러나 상용 배포 기준으로는 세 가지 범주에서 해소가 필요한 결함이 존재합니다.

1. **버그**: MCP fetch 실패 시 `onDataResult`가 두 번 호출되는 중복 렌더 버그, generation 실패 시 error 이벤트가 이중으로 전송되는 버그
2. **리소스 누수**: 임시 스크린샷 파일 미정리, extension deactivate 시 메모리 미해제
3. **성능**: 스트리밍 청크마다 전체 `textContent` 재할당(O(n²)), 로그 shift() O(n) 반복

---

## Scoring (정량 평가)

| 범주                   |       점수 | 근거                                                           |
| ---------------------- | ---------: | -------------------------------------------------------------- |
| 정확성 / 버그          |     6.5/10 | MCP fetch 실패 시 이중 render, generation error 이중 전송 확인 |
| 보안                   |     7.5/10 | CSP unsafe-inline, API key 포맷 미검증                         |
| 메모리 / 리소스        |     6.0/10 | 임시 파일 미정리, deactivate 미구현, O(n) Logger shift         |
| 성능                   |     7.0/10 | chunk rendering O(n²), Logger entries O(n) shift               |
| 네트워크 내구성        |     7.0/10 | timeout 있음, retry 없음, stream 중단 미처리                   |
| 아키텍처 / 유지보수성  |     7.5/10 | static shared state, 12+ case switch 단일 클래스               |
| 테스트 커버리지        |     7.5/10 | Branch 77.31%, 주요 에러 경로 미커버                           |
| **Overall (Weighted)** | **7.0/10** | 버그 수정 완료 시 8.0+ 수준으로 상승 가능                      |

---

## Findings (심각도 순)

### [BUG-1] MCP fetch 실패 시 onDataResult 이중 호출

- **심각도**: High
- **위치**: `src/webview/WebviewMessageHandler.ts:175-186`, `src/webview/ui/main.ts:23-26`
- **현상**:
  ```
  // WebviewMessageHandler.ts - MCP 실패 시
  this.post({ event: 'figma.dataFetchError', ..., fallbackData: parsed });
  this.post({ event: 'figma.dataResult', data: parsed }); // 두 번째 전송
  ```
  ```
  // main.ts - 수신 측
  else if (msg.event === 'figma.dataFetchError') {
    layer.onError(msg.message);
    layer.onDataResult(msg.fallbackData); // 1회 호출
  }
  else if (msg.event === 'figma.dataResult') layer.onDataResult(msg.data); // 2회 호출
  ```
- **영향**: MCP 오류 상황에서 미리보기가 두 번 렌더링되고, 에러 노티스 직후 "MCP 데이터를 불러왔습니다" 성공 메시지가 덮어써짐. 사용자는 에러가 발생했는지 알 수 없음.
- **수정**: `handleFigmaFetch` 에러 경로에서 `figma.dataResult` 이중 전송 제거. `figma.dataFetchError` 하나만 전송하고, fallback 데이터 표시는 webview에서 처리.

---

### [BUG-2] generation 실패 시 error 이벤트 이중 전송

- **심각도**: High
- **위치**: `src/webview/WebviewMessageHandler.ts:366-370`, `WebviewMessageHandler.ts:102-106`
- **현상**:

  ```ts
  // handleGenerate 내부
  } catch (e) {
    this.post({ event: 'prompt.error', message: err.message }); // 1차 전송
    throw e; // re-throw → handle() catch에서 다시 catch
  }

  // handle() 외부 catch
  } catch (e) {
    this.post({ event: 'error', source, message: err.message }); // 2차 전송
  }
  ```

- **영향**: PromptLayer는 `prompt.error`와 `error` (source='prompt') 두 이벤트를 순차 수신하여 `onError` → `onHostError`가 연속 호출됨. UI 상태 불일치 가능성.
- **수정**: `handleGenerate`의 `throw e` 제거. 에러는 `prompt.error`로만 전달하고, outer `handle()` catch에서 중복 전송을 막기 위해 inner에서 처리된 에러는 re-throw하지 않음.

---

### [RESOURCE-1] 임시 스크린샷 파일 미정리

- **심각도**: High
- **위치**: `src/figma/ScreenshotService.ts:22-28`
- **현상**:
  ```ts
  const tmpPath = path.join(os.tmpdir(), `figmalab-${fileId}-${Date.now()}.png`);
  await vscode.workspace.fs.writeFile(uri, buffer);
  await vscode.commands.executeCommand('vscode.open', uri);
  // tmpPath 정리 없음
  ```
- **영향**: 스크린샷 요청마다 OS 임시 디렉토리에 PNG 파일이 축적됨. 장기 사용 시 수십 MB 이상 누적 가능. Extension deactivate, VS Code 재시작 시에도 파일이 남음.
- **수정**: `deactivate()` 또는 `SidebarProvider.onDidDispose`에서 생성한 임시 파일 경로를 추적하여 정리. 또는 VS Code가 파일을 열고 나면 짧은 delay 후 삭제.

---

### [RESOURCE-2] extension deactivate 시 메모리 미해제

- **심각도**: Medium
- **위치**: `src/extension.ts:95-97`
- **현상**:
  ```ts
  export function deactivate() {
    Logger.info('system', 'FigmaLab deactivated');
    // AgentFactory.instances 미정리
    // Logger.subscribers 미정리
    // Logger.entries 미정리
  }
  ```
- **영향**: `AgentFactory.instances`에 보관된 `GeminiAgent`, `ClaudeAgent` 인스턴스(Anthropic client, GoogleGenerativeAI client 포함)가 deactivate 후에도 GC 대상이 되지 않을 수 있음. API key 문자열이 메모리에 잔존.
- **수정**: `AgentFactory.clear()` 메서드 추가하여 deactivate 시 호출. Logger.clear() 호출.

---

### [PERF-1] 스트리밍 청크 렌더링 O(n²)

- **심각도**: Medium
- **위치**: `src/webview/ui/components/PromptLayer.ts:177-184`
- **현상**:
  ```ts
  onChunk(text: string) {
    this.generatedCode += text;
    codeOutput.textContent = this.generatedCode; // 청크마다 전체 재할당
    codeOutput.scrollTop = codeOutput.scrollHeight;
  }
  ```
- **영향**: 1000 청크 × 평균 50자 = 50,000자 코드 생성 시, 총 1,250,000자 쓰기 발생(1+2+...+1000 = 500,500). 긴 코드 생성 시 UI 지연 발생.
- **수정**: `textContent` 전체 교체 대신 `document.createTextNode(text)`를 append하거나, `insertAdjacentText('beforeend', text)` 사용.

---

### [PERF-2] Logger entries shift() O(n)

- **심각도**: Medium
- **위치**: `src/logger/Logger.ts:33-35`
- **현상**:
  ```ts
  this.entries.push(entry);
  if (this.entries.length > MAX_LOG_ENTRIES) {
    this.entries.shift(); // O(n) — 500개 배열 매번 전체 이동
  }
  ```
- **영향**: 500개 초과 이후 매 로그 진입마다 O(500) shift 발생. 고빈도 로그(generation 중 chunk 이벤트 등) 시 누적 성능 저하.
- **수정**: `entries`를 circular buffer로 전환하거나, `splice(0, n)` 대신 head 포인터 방식 사용. 또는 단순하게 entries 배열이 MAX 초과 시 `entries = entries.slice(1)`을 `splice(0, 1)` 대신 `entries = entries.slice(-MAX_LOG_ENTRIES)` 방식으로 batch trim.

---

### [NETWORK-1] stream 중단 시 무증상 partial 결과

- **심각도**: Medium
- **위치**: `src/agent/GeminiAgent.ts:102-108`, `src/agent/ClaudeAgent.ts:99-103`
- **현상**: `generateContentStream` 또는 `messages.stream`이 중간에 끊길 경우 AsyncGenerator가 조용히 종료됨. 사용자에게는 부분 생성 코드가 완료된 것처럼 표시됨.
- **영향**: 불완전한 코드가 완성된 것처럼 제시되어 사용자가 이를 인지하지 못함.
- **수정**: 스트림 에러 이벤트를 명시적으로 처리하고, 정상 종료와 비정상 종료를 구분하여 UI에 알림. `prompt.result` 이벤트에 `isPartial: boolean` 필드 추가 검토.

---

### [NETWORK-2] McpClient.listTools 응답 shape 미검증

- **심각도**: Medium
- **위치**: `src/figma/McpClient.ts:118-126`
- **현상**:
  ```ts
  async listTools(): Promise<string[]> {
    const result = (await this.sendRequest('tools/list')) as { tools: Array<{ name: string }> };
    return result.tools.map((t) => t.name); // result.tools가 null이면 TypeError
  }
  ```
- **영향**: MCP 서버가 예상과 다른 응답 형태를 반환하면 uncaught TypeError 발생.
- **수정**: `result.tools`가 배열인지 확인 후 처리. 빈 배열 반환 fallback 추가.

---

### [NETWORK-3] McpClient.initialize 클라이언트 버전 하드코딩

- **심각도**: Low
- **위치**: `src/figma/McpClient.ts:104-108`
- **현상**:
  ```ts
  clientInfo: { name: 'vscode-figmalab', version: '0.1.0' }
  // package.json version과 동기화 안 됨 (현재 0.1.1)
  ```
- **수정**: 빌드 시 `package.json` version을 constants에 주입하거나, `McpClient` 생성 시 version을 파라미터로 전달.

---

### [NETWORK-4] retry 없음 — 일시적 오류에 취약

- **심각도**: Low
- **위치**: `src/figma/McpClient.ts`, `src/agent/GeminiAgent.ts`
- **현상**: 네트워크 오류 시 즉시 reject. 일시적 연결 불안정이나 서버 cold start 시 사용자가 매번 수동 재시도해야 함.
- **수정**: MCP connect, Gemini listModels에 한해 exponential backoff retry(최대 2회) 적용 검토.

---

### [ARCH-1] static 공유 상태 source-of-truth 복잡성

- **심각도**: Medium
- **위치**: `src/webview/WebviewMessageHandler.ts:25-27`
- **현상**:
  ```ts
  private static currentAgent: AgentType = 'gemini';
  private static currentModel: string = '';
  private static lastMcpData: unknown = null;
  ```
  4개 SidebarProvider 각각이 독립적인 `WebviewMessageHandler` 인스턴스를 생성하지만, 위 필드는 모든 인스턴스가 공유함.
- **영향**: 현재는 동작하지만, 패널 추가나 멀티-워크스페이스 지원 시 상태 충돌 위험. 문서화는 존재하나 런타임 보장이 없음.
- **수정**: `lastMcpData`와 agent/model 상태를 `ExtensionContext.globalState`(또는 별도 StateManager 싱글턴)에서 단일 관리. static field 의존 제거.

---

### [ARCH-2] WebviewMessageHandler 12+ case 단일 클래스

- **심각도**: Low
- **위치**: `src/webview/WebviewMessageHandler.ts:48-107`
- **현상**: figma, agent, prompt, editor 4개 도메인의 핸들러가 한 클래스의 switch 문에 혼재.
- **영향**: 클래스 책임 과다(SRP 위반). 테스트 격리가 어렵고, 신규 명령 추가 시 충돌 위험.
- **수정**: `FigmaCommandHandler`, `AgentCommandHandler`, `PromptCommandHandler`로 분리 후 `WebviewMessageHandler`가 위임 패턴으로 라우팅.

---

### [ARCH-3] 모든 패널이 동일 JS 번들 로드

- **심각도**: Low
- **위치**: `src/webview/SidebarProvider.ts:73`, esbuild 빌드 설정
- **현상**: 4개 패널 모두 `dist/webview.js` 하나를 로드. section별로 분기하지만 미사용 컴포넌트 코드도 전송됨.
- **영향**: 현재 번들 크기가 작아 실질 영향은 미미하나, 기능 확장 시 불필요한 코드가 모든 패널에 로드됨.
- **수정**: esbuild code splitting 또는 패널별 entry point 분리 검토(Medium-term).

---

### [SECURITY-1] CSP style-src unsafe-inline

- **심각도**: Low
- **위치**: `src/webview/SidebarProvider.ts:85`
- **현상**:
  ```ts
  `style-src ${webview.cspSource} 'unsafe-inline'`;
  ```
- **영향**: webview 내 모든 `style=` inline 속성 허용. 외부 콘텐츠(Figma MCP 응답)가 직접 DOM에 삽입되지 않는 한 실제 위험도는 낮음. 하지만 defense-in-depth 원칙에 위배.
- **수정**: style nonce를 script nonce와 동일하게 적용하거나, 인라인 스타일을 CSS 클래스로 전환하여 `unsafe-inline` 제거.

---

### [SECURITY-2] API key 포맷 미검증

- **심각도**: Low
- **위치**: `src/webview/WebviewMessageHandler.ts:271-275`
- **현상**:
  ```ts
  private async handleSetApiKey(agent: AgentType, key: string) {
    // key 길이, 패턴 검증 없음
    await this.context.secrets.store(secretKey, key);
    await AgentFactory.getAgent(agent).setApiKey(key);
  }
  ```
- **영향**: 빈 문자열이나 명백히 잘못된 형식의 키가 저장될 수 있음. 실제 API 호출 실패 시에야 사용자가 인지함.
- **수정**: 저장 전 최소 길이 검증 및 명백한 공백/잘못된 포맷에 대한 즉시 피드백.

---

### [UX-1] Figma fetch 성공 시 에디터 탭 자동 생성

- **심각도**: Low
- **위치**: `src/webview/WebviewMessageHandler.ts:160-172`
- **현상**: `handleFigmaFetch` 성공 시 항상 VS Code 에디터에 JSON 탭을 강제로 오픈.
- **영향**: 사용자 편집 흐름을 방해하며, 반복 fetch 시 탭이 계속 열림. 닫지 않으면 탭이 누적됨.
- **수정**: 자동 에디터 오픈을 opt-in 설정으로 전환하거나 제거. 데이터는 웹뷰 내 preview로만 표시하는 것이 충분.

---

### [TEST-1] Branch coverage 77.31% — 미커버 에러 경로

- **심각도**: Medium
- **근거**: Coverage 77.31% branch는 주요 에러 분기 다수가 미테스트임을 의미.
- **주요 미커버 예상 경로**:
  - `GeminiAgent.listModels`: HTTP 비-2xx 응답 경로
  - `McpClient.listTools`: `result.tools`가 undefined인 경우
  - `handleGenerate`: API key 없이 generate 호출 경로
  - `handleFigmaFetch`: MCP 연결되었지만 `parsed.fileId` 없는 경우
- **수정 목표**: Branch coverage ≥ 85% (상용 배포 기준).

---

## Recommended Roadmap

### P0 — 배포 전 필수 (버그 / 정확성)

| #    | 항목                                       | 완료 기준                                                        |
| ---- | ------------------------------------------ | ---------------------------------------------------------------- |
| P0-1 | [BUG-1] MCP fetch 실패 시 이중 render 수정 | MCP 오류 시 에러 노티스가 덮어써지지 않음, onDataResult 1회 호출 |
| P0-2 | [BUG-2] generation error 이중 전송 제거    | 실패 시 PromptLayer가 단일 에러 상태 진입                        |
| P0-3 | [RESOURCE-1] 임시 스크린샷 파일 정리       | deactivate 또는 dispose 시 임시 PNG 0건 잔존                     |

### P1 — 배포 후 1주 내 (안정성 / 보안)

| #    | 항목                                       | 완료 기준                                            |
| ---- | ------------------------------------------ | ---------------------------------------------------- |
| P1-1 | [RESOURCE-2] deactivate 정리 구현          | AgentFactory.clear(), Logger.clear() deactivate 호출 |
| P1-2 | [NETWORK-2] McpClient.listTools shape 검증 | 잘못된 응답 시 TypeError 대신 빈 배열 반환           |
| P1-3 | [PERF-1] chunk 렌더링 O(n²) 개선           | 5000자 이상 생성 시 UI lag 없음                      |
| P1-4 | [TEST-1] Branch coverage ≥ 85% 달성        | `npm run test:coverage` branch ≥ 85%                 |

### P2 — 배포 후 1개월 내 (품질 / UX)

| #    | 항목                                         | 완료 기준                                                      |
| ---- | -------------------------------------------- | -------------------------------------------------------------- |
| P2-1 | [PERF-2] Logger circular buffer 전환         | MAX_LOG_ENTRIES 이상에서도 O(1) append                         |
| P2-2 | [ARCH-1] static state → StateManager 분리    | 상태 source-of-truth 단일화                                    |
| P2-3 | [SECURITY-1] CSP unsafe-inline 제거          | style nonce 적용 또는 인라인 스타일 제거                       |
| P2-4 | [UX-1] fetch 시 자동 에디터 오픈 opt-in 전환 | 설정 또는 제거                                                 |
| P2-5 | [NETWORK-3] MCP clientInfo version 동기화    | package.json version 자동 반영                                 |
| P2-6 | [ARCH-2] WebviewMessageHandler 도메인별 분리 | FigmaCommandHandler, AgentCommandHandler, PromptCommandHandler |

---

## What Has Already Been Resolved (이전 리뷰 대비)

- Logger onLog subscriber lifecycle 문제: `logSubscription?.dispose()` + `onDidDispose` 처리 완료
- Gemini models API: HTTP status 검증, timeout(10s), shape 검증 추가 완료
- McpClient: status/path/id 검증, timeout, JSON-RPC 검증 완료
- WebviewMessageHandler static state: 문서화(`source-of-truth` 주석) 완료
- Figma fetch MCP vs local parse fallback: `figma.dataFetchError` 이벤트로 구분 완료
- Claude model catalog: `figmalab.claudeModels` 설정 기반 외부화 완료
- 테스트 게이트: lint + test:coverage 정상 통과

---

## Production Scorecard (Updated)

| Metric                |      Score | Notes                                     |
| --------------------- | ---------: | ----------------------------------------- |
| 정확성 / 버그         |     6.5/10 | BUG-1, BUG-2 해소 후 9.0+ 가능            |
| 보안                  |     7.5/10 | CSP unsafe-inline, key 포맷 미검증        |
| 메모리 / 리소스       |     6.0/10 | 임시 파일 누수, deactivate 미구현         |
| 성능                  |     7.0/10 | chunk O(n²), Logger shift O(n)            |
| 네트워크 내구성       |     7.0/10 | timeout OK, retry/stream중단 미처리       |
| 아키텍처 / 유지보수성 |     7.5/10 | static state 문서화됨, 단일 클래스 과부하 |
| 테스트 커버리지       |     7.5/10 | Branch 77.31%, 에러 경로 미커버           |
| **Overall**           | **7.0/10** | P0 완료 시 8.0+, P1 완료 시 8.5+ 예상     |

---

## Review Notes

- P0-1, P0-2는 사용자에게 직접 노출되는 버그이므로 배포 전 반드시 수정 필요.
- P0-3(임시 파일 누수)는 단기에는 무해하나 장기 사용 시 사용자 환경 오염 위험.
- P1~P2는 신규 기능 추가 없이 품질/안정성 개선에 집중하는 sprint를 권장.
- Branch coverage 85% 이상 달성 전까지는 에러 시나리오에 대한 회귀 위험이 상존함.
