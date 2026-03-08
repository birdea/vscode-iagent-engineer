# 코드 리뷰 보고서

**프로젝트:** Figma MCP Helper (VS Code Extension)
**버전:** 0.1.4
**리뷰 일자:** 2026-03-08
**근거:** 이전 리뷰(CODEREVIEW_2.md v0.1.3) 대비 전체 소스 직접 검증
**기준:** 상용 소프트웨어 출시 품질

---

## 1. 종합 평가

| 항목            | v0.1.3  | v0.1.4  | 변화  |
| --------------- | ------- | ------- | ----- |
| 아키텍처        | 8.5     | 9.0     | ↑     |
| 타입 안전성     | 9.0     | 9.0     | —     |
| 에러 처리       | 7.5     | 7.5     | —     |
| 보안            | 8.0     | 8.0     | —     |
| 테스트 커버리지 | 8.0     | 8.0     | —     |
| 코드 품질       | 8.5     | 8.5     | —     |
| 리소스 관리     | 8.0     | 9.5     | ↑↑    |
| 국제화(i18n)    | 9.0     | 9.0     | —     |
| CI/CD           | 7.0     | 7.0     | —     |
| 문서화          | 6.0     | 7.5     | ↑     |
| **종합**        | **7.5** | **8.0** | **↑** |

**판정:** 베타 → 릴리스 후보(RC) 수준. 잔존 과제는 관리 가능한 수준. 아래 항목을 해결하면 마켓플레이스 출시 가능.

---

## 2. v0.1.3 이후 해결된 항목

이전 리뷰에서 지적된 아래 이슈들이 소스 직접 검증을 통해 **해결 완료**되었음을 확인.

### ✅ BUG-1: esbuild 타겟 버전 불일치 (`esbuild.config.js:18`)

```js
// 수정 전
target: 'node18';
// 수정 후
target: 'node20'; // engines.node >= 20.0.0 및 CI 매트릭스와 일치
```

### ✅ BUG-2: `deactivate()` 리소스 누수 (`extension.ts:117-124`)

모듈 레벨 `sidebarProviders` 배열이 유지된다. `deactivate()` 에서 모든 provider의 `dispose()`를 호출하고(`ScreenshotService.cleanupTempFiles()` 포함), `OutputChannel`을 해제하며 참조를 초기화한다.

```typescript
export async function deactivate(): Promise<void> {
  Logger.info('system', 'Figma MCP Helper deactivated');
  await Promise.allSettled(sidebarProviders.splice(0).map((p) => p.dispose()));
  AgentFactory.clear();
  Logger.clear();
  outputChannelRef?.dispose();
  outputChannelRef = undefined;
}
```

### ✅ BUG-3: McpClient 버전 하드코딩 (`McpClient.ts:9-17`)

`resolveDefaultClientVersion()`이 런타임에 `package.json`을 읽어 버전을 동적으로 결정하며, 읽기 실패 시 `'0.0.0'`으로 대체한다. `WebviewMessageHandler` 생성자에서 전달된 버전이 우선 적용된다.

### ✅ BUG-4: ClaudeAgent `max_tokens` 하드코딩 (`ClaudeAgent.ts:104-105`)

```typescript
// 수정 전
max_tokens: 8192;
// 수정 후
max_tokens: modelInfo.outputTokenLimit ?? 8192;
```

Claude Opus 4.6(32K)가 이제 최대 출력 한도를 온전히 활용한다.

### ✅ BUG-5: GeminiAgent `https.get` vs `https.request` (`GeminiAgent.ts:51`)

`https.request()` 로 일관되게 변경. 응답 본문 소비 전 HTTP 상태 코드 검사가 추가되었다.

### ✅ PERF-2: `textContent +=` O(n²) DOM 패턴 (`PromptLayer.ts:215-235`)

청크가 `pendingChunks[]` 배열에 누적된 뒤 `requestAnimationFrame` + `insertAdjacentText`로 프레임당 한 번씩 일괄 반영된다. DOM 노드 대상 문자열 반복 연결이 제거되었다.

---

## 3. 잔존 이슈

### 3.1 아키텍처

#### ARCH-1 — ClaudeAgent의 `dangerouslyAllowBrowser: true` (낮음)

**파일:** `ClaudeAgent.ts:48`

```typescript
this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
```

Anthropic SDK는 전역 객체를 기반으로 브라우저 환경을 감지한다. esbuild 번들링으로 인해 Node.js Extension Host에서도 이 감지가 오동작한다. 이 플래그는 **VS Code 확장에서 알려진 패턴**이며, 코드가 실제 브라우저에서 실행되지 않으므로 실질적인 보안 위험은 없다. 그러나 이후 유지보수자가 오해할 수 있는 코드 냄새이다.

**권장 조치:** 이유를 설명하는 인라인 주석 추가.

```typescript
// Extension Host는 Node.js에서 실행되지만 esbuild 번들링으로 인해
// 브라우저 환경 감지가 오동작한다. 이 컨텍스트에서 이 플래그는 안전하다.
this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
```

---

### 3.2 에러 처리

#### ERR-1 — 이중 에러 이벤트 가능성 (중간 → 부분 완화)

**파일:** `WebviewMessageHandler.ts:116-120` / 핸들러 메서드

핸들러들은 일반적으로 내부에서 자체적으로 에러를 처리하고 재던지지 않으므로, `handle()`의 외부 catch는 미처리 예외에 대한 안전망 역할을 한다. 이중 이벤트 위험은 실제로 낮다. 다만 `FigmaCommandHandler.fetchScreenshot`은 catch 블록에서 `event: 'error'`를 직접 전송하는데, 해당 catch 블록 자체가 예외를 던지면(예: catch 경로의 버그) 외부 핸들러가 두 번째 에러 이벤트를 전송할 수 있다.

**권장 조치:** 에러 보고 경로를 단일화한다. 두 가지 방법 중 하나를 선택한다.

- 모든 핸들러가 실패 시 예외를 던지고, 외부 catch가 유일한 보고자가 된다.
- 핸들러가 이미 에러를 보고했을 때 외부 catch를 억제하는 센티넬(`HandledError`)을 도입한다.

#### ERR-3 — 비안전한 `(e as Error).message` 캐스트 (중간)

**파일:** `ClaudeAgent.ts:122`, `GeminiAgent.ts:138`, `FigmaCommandHandler.ts:47`, `McpClient.ts:152`, `AgentCommandHandler.ts:62`

TypeScript의 `catch` 블록은 `e`를 `unknown`으로 타입 지정한다. `Error`로 직접 캐스팅하는 것은 안전하지 않으며, 문자열이나 객체를 던지는 경우 `.message`가 `undefined`가 된다.

UI 레이어용 `toErrorMessage` 유틸리티가 `src/webview/ui/utils/errorUtils.ts`에 이미 존재하지만 Extension Host 측에서는 사용되지 않고 있다.

**권장 조치:** 공용 유틸리티를 추가하고 모든 캐스트를 교체한다.

```typescript
// src/errors.ts — 추가:
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '예기치 않은 오류가 발생했습니다';
}
```

Extension Host 코드 전체의 `(e as Error).message`를 `toErrorMessage(e)`로 교체한다.

#### ERR-4 — 네트워크 재시도 로직 없음 (중간)

**파일:** `McpClient.ts`, `GeminiAgent.ts`, `ClaudeAgent.ts`

일시적인 네트워크 오류가 발생하면 재시도 없이 즉시 실패한다. `REQUEST_TIMEOUT_MS` 상수(10초)가 정의되어 있어 지연 문제를 인지하고 있음을 알 수 있다.

**권장 조치:** MCP 호출 및 AI 모델 요청에 지수 백오프 재시도(최대 3회)를 구현한다. `McpClient.sendRequest` 메서드가 적절한 주입 지점이다.

---

### 3.3 보안

#### SEC-1 — API 키 형식 미검증 (중간)

**파일:** `AgentCommandHandler.ts:66-71`

`setApiKey`는 잘못된 형식의 키를 포함해 비어있지 않은 문자열이면 무엇이든 저장한다. 저장 전에 `key.trim()`만 적용된다.

**권장 조치:**

```typescript
function validateApiKeyFormat(agent: AgentType, key: string): boolean {
  if (!key.trim()) return false;
  if (agent === 'gemini' && !key.startsWith('AIza')) return false;
  if (agent === 'claude' && !key.startsWith('sk-ant-')) return false;
  return true;
}
```

저장 전에 명백히 잘못된 키를 거부한다.

#### SEC-2 — MCP 엔드포인트 SSRF (중간)

**파일:** `McpClient.ts:68-72`

프로토콜은 검증된다(`http`/`https`만 허용). 그러나 내부/사설 IP를 포함한 임의의 호스트명(예: `http://192.168.1.1:9000`)이 허용된다. 공유 환경에서 확장 프로그램이 사용될 경우 서버 사이드 요청 위조(SSRF) 벡터가 된다.

**권장 조치:** 기본적으로 `localhost` / `127.0.0.1`만 허용한다. 외부 호스트를 입력하면 사용자에게 명시적 확인을 요청한다.

#### SEC-3 — UI 스캐폴딩에 `innerHTML` 사용 (낮음)

**파일:** `AgentLayer.ts:223`, 모든 Layer 컴포넌트의 render 템플릿

`render()` 메서드가 템플릿 리터럴을 통해 i18n 문자열을 `innerHTML`에 삽입한다. 이 문자열들은 하드코딩된 번역 테이블에서 오며 사용자 입력이 아니므로 실제 XSS 위험은 거의 없다. 그러나 이 패턴은 나쁜 선례가 된다.

**권장 조치:** 변수(i18n 키 포함)에서 오는 문자열은 `innerHTML` 대신 DOM API(`createElement` + `textContent`)로 교체한다.

---

### 3.4 잠재적 결함

#### POT-1 — 스트림 중단 시 부분 코드 표시 (높음)

**파일:** `PromptCommandHandler.ts:69-80`

스트리밍 중 `prompt.chunk` 이벤트가 UI에 순차적으로 전송된다. 스트림이 중간에 중단되면 UI의 `code-output` 요소에 이미 부분적인 코드가 표시된 상태이다. `PromptLayer`의 `onError` 핸들러는 이 부분 출력을 초기화하지 않는다.

**권장 조치:** 취소 시 (a) 코드 출력 영역을 초기화하고 "취소됨" 플레이스홀더를 표시하거나, (b) 불완전한 출력임을 나타내는 배너를 시각적으로 표시한다.

#### POT-2 — `getImage` 실패 시 빈 base64 반환 (중간)

**파일:** `McpClient.ts:182-186`

```typescript
return result.base64 || result.data || '';
```

빈 문자열이 `ScreenshotService`로 조용히 반환되어 `.png` 파일에 0바이트를 기록하고 에디터에서 열린다. 사용자는 오류 메시지 없이 깨진 이미지를 보게 된다.

**권장 조치:** 결과가 비어있을 때 `''`을 반환하는 대신 `ValidationError`를 던진다.

#### POT-4 — AbortSignal이 Gemini SDK에 전달되지 않음 (중간)

**파일:** `GeminiAgent.ts:126`

```typescript
const result = await model.generateContentStream(prompt);
// signal은 yield된 청크 사이에서만 확인되며 SDK에 전달되지 않음
```

사용자가 중단해도 기저 HTTP 요청이 네트워크 레벨에서 취소되지 않는다. 서버는 모든 청크를 전송 완료할 때까지 스트리밍을 계속하여 API 쿼터가 낭비된다.

**권장 조치:** SDK가 지원하는 경우 `generateContentStream`에 `AbortSignal`을 전달하거나, 중단 시 `result.stream.return()`으로 비동기 이터레이터를 종료한다.

---

### 3.5 성능

#### PERF-1 — 청크당 IPC 메시지 2개 발송 (중간)

**파일:** `PromptCommandHandler.ts:74-76`

```typescript
this.post({ event: 'prompt.generating', progress });
this.post({ event: 'prompt.chunk', text: chunk });
```

스트리밍 청크마다 `postMessage` 호출이 두 번 발생한다. 일반적인 코드 생성에서 수백 개의 청크가 생성되면 IPC 오버헤드가 두 배가 된다.

**권장 조치:** 진행률 업데이트를 청크 메시지에 통합한다.

```typescript
this.post({ event: 'prompt.chunk', text: chunk, progress });
```

---

### 3.6 CI/CD 미비 항목

| 항목                        | 심각도 | 권장 조치                                        |
| --------------------------- | ------ | ------------------------------------------------ |
| 브랜치 커버리지 게이트 없음 | 높음   | `c8` 임계값으로 브랜치 커버리지 85% 미만 PR 차단 |
| CI에 `npm audit` 없음       | 높음   | lint 단계에 `npm audit --audit-level=high` 추가  |
| GitHub Release 자동화 없음  | 중간   | 태그 푸시 시 VSIX 아티팩트 포함 릴리스 자동 생성 |
| CodeQL / SAST 없음          | 중간   | GitHub CodeQL 액션 활성화                        |
| E2E 테스트가 CI에 없음      | 낮음   | 파이프라인에 Headless VS Code 테스트 러너 추가   |

---

### 3.7 코드 품질

#### QA-1 — ESLint `@typescript-eslint/no-explicit-any`가 `warn` (낮음)

프로덕션 코드에서 `any` 남용을 방지하려면 `error`로 변경해야 한다.

#### QA-2 — `no-console`이 `off` (낮음)

코드베이스 전체에서 올바르게 `Logger`를 사용하고 있지만 규칙이 강제되지 않는다. 실수로 남긴 `console.log`가 프로덕션에서 VS Code Output에 그대로 노출된다.

#### QA-3 — `TOKEN_ESTIMATE_DIVISOR = 4` 주석 없음 (낮음)

**파일:** `constants.ts:37`

이 제수는 "문자 4개 ≈ 토큰 1개"라는 표준 휴리스틱을 구현한 것이다. 설명 주석이 없으면 이후 유지보수자가 임의의 매직 넘버로 오해할 수 있다.

---

## 4. 유지되는 강점 (변경 없음)

v0.1.3에서 확인된 아래 강점들이 그대로 유지됨을 재확인.

- **소스 코드에 `any` 없음** — discriminated union 메시지 타입으로 완전한 타입 안전성 확보
- **Logger 추상화** — 모든 소스 파일에서 `console.log` 미사용
- **Secrets Store** — API 키를 OS 암호화된 VS Code Secrets에 저장, 일반 설정에 평문 저장 없음
- **CSP 정책** — 모든 웹뷰에 `script-src 'nonce-*'`, `default-src 'none'` 적용
- **입력 검증** — 경로 사용 전 fileId/nodeId를 정규식으로 정제
- **순환 버퍼 로거** — 고정 메모리, O(1) append 성능
- **requestAnimationFrame 청크 배치 처리** — `insertAdjacentText` 패턴 (0.1.4 신규)
- **Gemini 모델 목록 캐시** — 5분 TTL로 반복 API 호출 방지

---

## 5. 권장 조치 계획

### Priority 0 — 출시 차단 항목

| #    | 파일                      | 작업                                                               |
| ---- | ------------------------- | ------------------------------------------------------------------ |
| P0-1 | `PromptCommandHandler.ts` | 스트림 중단 시 부분 코드 초기화 또는 불완전 표시 (POT-1)           |
| P0-2 | `McpClient.ts`            | `getImage`에서 빈 문자열 반환 대신 예외 던지기 (POT-2)             |
| P0-3 | CI workflow               | 알려진 취약점 배포 방지를 위해 `npm audit --audit-level=high` 추가 |
| P0-4 | CI workflow               | 브랜치 커버리지 게이트 추가 (최소 85%)                             |

### Priority 1 — 출시 전 권장

| #    | 파일                      | 작업                                                                  |
| ---- | ------------------------- | --------------------------------------------------------------------- |
| P1-1 | `errors.ts`               | `toErrorMessage(e: unknown)` 추가 및 모든 `(e as Error).message` 교체 |
| P1-2 | `AgentCommandHandler.ts`  | 저장 전 API 키 형식 검증                                              |
| P1-3 | `GeminiAgent.ts`          | AbortSignal 전달 또는 취소 시 스트림 이터레이터 종료                  |
| P1-4 | `PromptCommandHandler.ts` | `prompt.generating` + `prompt.chunk`를 단일 메시지로 통합             |

### Priority 2 — 출시 후 개선

| #    | 작업                                                          |
| ---- | ------------------------------------------------------------- |
| P2-1 | McpClient 및 에이전트 요청에 지수 백오프 네트워크 재시도 구현 |
| P2-2 | MCP 엔드포인트 허용 목록 / 외부 호스트 확인 다이얼로그        |
| P2-3 | VSIX 아티팩트 포함 GitHub Release 자동화                      |
| P2-4 | render 템플릿의 `innerHTML`을 안전한 DOM API로 교체           |
| P2-5 | `dangerouslyAllowBrowser` 이유 설명 인라인 주석 추가          |

---

## 6. 결론

버전 0.1.4는 이전 리뷰에서 확인된 버그 5건과 아키텍처 공백 2건(리소스 정리, 버전 하드코딩)을 모두 해결했다. 청크 렌더링 개선은 체감 가능한 성능 향상이다. 코드베이스는 종합 **8.0 / 10**으로 릴리스 후보 품질에 도달했다.

Priority-0 항목 4건만이 마켓플레이스 출시를 위해 남은 유일한 차단 요소이며, 나머지 항목들은 출시 이후 패치에서 순차적으로 개선할 수 있다.
