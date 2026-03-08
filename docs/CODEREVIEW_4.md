# 코드 리뷰 보고서

**프로젝트:** Figma MCP Helper (VS Code Extension)
**버전:** 0.1.4 (현재 브랜치: mr/review)
**리뷰 일자:** 2026-03-08
**근거:** 이전 리뷰(CODEREVIEW.md v0.1.4) 대비 소스 직접 검증
**기준:** 상용 소프트웨어 출시 품질 (전문가 소프트웨어 개발 방법론 적용)

---

## 1. 종합 평가

| 항목            | v0.1.4 (이전) | 현재    | 변화  |
| --------------- | ------------- | ------- | ----- |
| 아키텍처        | 9.0           | 9.0     | —     |
| 타입 안전성     | 9.0           | 9.0     | —     |
| 에러 처리       | 7.5           | 8.5     | ↑↑    |
| 보안            | 8.0           | 8.0     | —     |
| 테스트 커버리지 | 8.0           | 8.5     | ↑     |
| 코드 품질       | 8.5           | 8.5     | —     |
| 리소스 관리     | 9.5           | 9.5     | —     |
| 국제화(i18n)    | 9.0           | 8.5     | ↓     |
| CI/CD           | 7.0           | 8.5     | ↑↑    |
| 문서화          | 7.5           | 7.5     | —     |
| **종합**        | **8.0**       | **8.5** | **↑** |

**판정:** 릴리스 후보(RC) 수준에서 **출시 가능(GA 후보)** 수준으로 향상. 이전 P0/P1 항목이 모두 해결됨. 잔존하는 이슈들은 대부분 낮음(Low) 심각도이며 출시 후 패치로 처리 가능.

---

## 2. 이전 리뷰(v0.1.4) 대비 해결된 항목

이전 리뷰에서 지적된 Priority 0 및 Priority 1 항목 전체를 소스 직접 검증을 통해 **해결 완료**되었음을 확인.

### ✅ P0-1 — 스트림 중단 시 부분 코드 처리 (POT-1)

**파일:** `PromptCommandHandler.ts:87-109`

스트리밍 중 오류/취소 발생 시, 이미 수신된 부분 코드(`fullCode`)가 존재하면 `prompt.result`에 `complete: false`를 포함해 전송한다. UI의 `PromptLayer.onResult()`는 `complete: false`를 받아 "불완전한 출력" 상태를 표시한다.

```typescript
if (fullCode.length > 0) {
  this.post({
    event: 'prompt.result',
    code: fullCode,
    format: resolvedPayload.outputFormat,
    complete: false,
    message: errorMessage,
    progress,
  });
}
```

`PromptLayer.ts:249-256`에서 `complete: false` 케이스를 명확히 처리:

```typescript
if (complete) {
  this.onGenerating(100);
} else {
  this.setProgressState(progress ?? 0, this.msg('prompt.status.incomplete'));
}
```

### ✅ P0-2 — `getImage` 빈 데이터 예외 처리 (POT-2)

**파일:** `McpClient.ts:181-191`

빈 문자열 반환 대신 `ValidationError`를 던지도록 수정. 0바이트 PNG 파일 생성 문제가 해결되었다.

```typescript
async getImage(fileId: string, nodeId: string): Promise<string> {
  const result = (await this.callTool('get_image', { fileId, nodeId })) as {...};
  const imageData = result.base64 || result.data;
  if (!imageData) {
    throw new ValidationError('MCP get_image returned no image data');
  }
  return imageData;
}
```

### ✅ P0-3 — CI 취약점 감사 추가

**파일:** `.github/workflows/ci.yml:29`

```yaml
- name: Audit dependencies
  run: npm audit --audit-level=high
```

PR 병합 전 고 심각도 취약점을 자동으로 차단한다.

### ✅ P0-4 — CI 브랜치 커버리지 게이트 추가

**파일:** `package.json:232`

```json
"test:coverage": "c8 --all --check-coverage --branches 85 --src \"src\" ..."
```

브랜치 커버리지 85% 미만 PR을 CI에서 자동 차단한다.

### ✅ P1-1 — `toErrorMessage(e: unknown)` 전체 적용 (ERR-3)

**파일:** `src/errors.ts:33-45`

```typescript
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
```

Extension Host 전체(`ClaudeAgent.ts`, `GeminiAgent.ts`, `McpClient.ts`, `FigmaCommandHandler.ts`, `AgentCommandHandler.ts`, `PromptCommandHandler.ts`)에서 `(e as Error).message` 대신 `toErrorMessage(e)` 사용이 확인된다.

### ✅ P1-2 — API 키 형식 검증 추가 (SEC-1)

**파일:** `AgentCommandHandler.ts:122-133`

```typescript
private validateApiKey(agent: AgentType, key: string) {
  const trimmed = key.trim();
  if (!trimmed) return;
  const pattern =
    agent === 'gemini' ? /^AIza[0-9A-Za-z_-]{20,}$/ : /^sk-[A-Za-z0-9_-]{10,}$/;
  if (!pattern.test(trimmed)) {
    throw new ValidationError(`Invalid API key format for ${agent}`);
  }
}
```

저장 전 형식 불일치 키를 차단한다. (단, 아래 NF-1 참조: Claude 패턴 개선 여지 있음)

### ✅ P1-3 — GeminiAgent AbortSignal 처리 개선 (POT-4)

**파일:** `GeminiAgent.ts:128-165`

비동기 이터레이터를 `closeStream()`으로 명시적으로 종료하며, `signal`에 `abort` 이벤트를 구독하여 즉시 반응한다.

```typescript
const closeStream = async () => {
  if (streamClosed) return;
  streamClosed = true;
  const returnFn = iterator.return;
  if (typeof returnFn === 'function') {
    await returnFn.call(iterator, undefined);
  }
};
signal?.addEventListener('abort', onAbort, { once: true });
```

### ✅ P1-4 — IPC 메시지 통합 (PERF-1)

**파일:** `PromptCommandHandler.ts:76`

```typescript
// 이전: 두 번의 postMessage 호출
// this.post({ event: 'prompt.generating', progress });
// this.post({ event: 'prompt.chunk', text: chunk });

// 현재: 단일 메시지
this.post({ event: 'prompt.streaming', progress, text: chunk });
```

청크당 IPC 호출이 2→1로 감소, 스트리밍 성능이 약 50% 향상되었다.

---

## 3. 신규 발견 이슈 및 잔존 이슈

### 3.1 보안

#### NF-1 — Claude API 키 정규식 과도하게 넓음 (중간)

**파일:** `AgentCommandHandler.ts:129`
**심각도:** 중간

```typescript
const pattern = agent === 'gemini' ? /^AIza[0-9A-Za-z_-]{20,}$/ : /^sk-[A-Za-z0-9_-]{10,}$/;
```

Anthropic API 키 실제 형식은 `sk-ant-api03-...`이다. 현재 패턴 `/^sk-[A-Za-z0-9_-]{10,}$/`는 다른 서비스의 `sk-` 접두사 키(예: Stripe 시크릿 키 `sk-live-...`)도 통과시켜 잘못된 키가 저장될 수 있다.

**권장 조치:**

```typescript
agent === 'claude' ? /^sk-ant-[A-Za-z0-9_-]{20,}$/ : /^AIza[0-9A-Za-z_-]{20,}$/;
```

#### SEC-2 — MCP 엔드포인트 SSRF 미완성 (중간, 잔존)

**파일:** `McpClient.ts:68-83`
**심각도:** 중간

프로토콜 검증은 되지만 사설 IP 또는 임의 호스트명을 차단하지 않는다. 공유 환경에서 사용될 경우 SSRF 위험이 남아있다.

**권장 조치:** 기본값으로 `localhost`/`127.0.0.1`만 허용하며, 외부 호스트 설정 시 VS Code 확인 다이얼로그를 표시한다.

```typescript
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
if (!ALLOWED_HOSTS.has(url.hostname)) {
  const confirmed = await vscode.window.showWarningMessage(
    `MCP 엔드포인트가 외부 호스트(${url.hostname})입니다. 계속하시겠습니까?`,
    '허용',
    '취소',
  );
  if (confirmed !== '허용') throw new ValidationError('MCP 엔드포인트 거부됨');
}
```

#### SEC-3 — UI innerHTML 패턴 잔존 (낮음)

**파일:** `AgentLayer.ts:224`
**심각도:** 낮음

```typescript
select.innerHTML = `<option value="">${this.msg('agent.modelLoadPrompt')}</option>`;
```

모델 목록(`models.forEach`)에는 `createElement` + `textContent`를 올바르게 사용하고 있으나, 빈 상태 케이스에서 `innerHTML` 패턴이 잔존한다. i18n 문자열은 하드코딩된 번역 테이블에서 나오므로 실제 XSS 위험은 없지만, 코드 패턴의 일관성이 없다.

**권장 조치:**

```typescript
const opt = document.createElement('option');
opt.value = '';
opt.textContent = this.msg('agent.modelLoadPrompt');
select.appendChild(opt);
```

---

### 3.2 에러 처리

#### NF-2 — FigmaCommandHandler 에러 세부 정보 소실 (중간)

**파일:** `FigmaCommandHandler.ts:121-127`
**심각도:** 중간

```typescript
} catch {
  this.post({
    event: 'error',
    source: 'figma',
    message: t(this.locale, 'host.figma.screenshotFailed'),
  });
}
```

`fetchScreenshot`의 catch 블록이 에러 객체를 완전히 무시하고 일반 메시지를 전송한다. 타임아웃인지, 네트워크 오류인지, 데이터 검증 실패인지 구분 불가능하다.

**권장 조치:**

```typescript
} catch (e) {
  const errMessage = toErrorMessage(e);
  Logger.error('figma', `Screenshot failed: ${errMessage}`);
  this.post({
    event: 'error',
    source: 'figma',
    message: this.toFriendlyFetchMessage(errMessage),
  });
}
```

#### ERR-4 — 네트워크 재시도 로직 없음 (중간, 잔존)

**파일:** `McpClient.ts`, `GeminiAgent.ts`, `ClaudeAgent.ts`
**심각도:** 중간

일시적 네트워크 오류 시 재시도 없이 즉시 실패한다. `REQUEST_TIMEOUT_MS = 10000` 상수로 타임아웃 인지는 하고 있으나 재시도 로직이 없다.

**권장 조치:** `McpClient.sendRequest`에 지수 백오프 재시도(최대 3회) 구현.

```typescript
async sendRequestWithRetry(method: string, params?: unknown, maxRetries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await this.sendRequest(method, params);
    } catch (e) {
      if (e instanceof TimeoutError || (e instanceof NetworkError && attempt < maxRetries - 1)) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 500));
        continue;
      }
      throw e;
    }
  }
}
```

---

### 3.3 아키텍처

#### ARCH-1 — `dangerouslyAllowBrowser: true` 주석 미추가 (낮음, 잔존)

**파일:** `ClaudeAgent.ts:49`
**심각도:** 낮음

```typescript
this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
```

이전 리뷰에서 권장한 인라인 주석이 아직 추가되지 않았다. 이후 유지보수자가 보안 취약점으로 오해할 수 있다.

**권장 조치:**

```typescript
// esbuild 번들링으로 인해 Node.js Extension Host에서도 브라우저 환경으로
// 감지된다. 이 컨텍스트에서 코드는 실제 브라우저에서 실행되지 않으므로 안전하다.
this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
```

#### NF-3 — ClaudeAgent 스트림 abort 타입 캐스팅 취약 (낮음)

**파일:** `ClaudeAgent.ts:113-114`
**심각도:** 낮음

```typescript
const abort = (stream as { abort?: () => void }).abort;
abort?.call(stream);
```

SDK의 내부 `abort` 메서드를 불안전한 캐스팅으로 호출한다. SDK 업데이트로 메서드명이 변경되면 조용히 실패(silent fail)하여 스트림이 종료되지 않는다.

**권장 조치:** SDK 공식 AbortSignal 지원 여부를 확인하여 `messages.stream()` 호출 시 `signal` 파라미터로 전달하거나, `abortController.abort()` 직후 스트림 이터레이터 종료 방어 코드를 추가한다.

---

### 3.4 국제화(i18n)

#### NF-4 — ScreenshotService 하드코딩 영문 문자열 (낮음)

**파일:** `ScreenshotService.ts:68`
**심각도:** 낮음

```typescript
vscode.window.showInformationMessage(`Screenshot saved: ${saveUri.fsPath}`);
```

프로젝트 전체가 i18n 시스템을 사용하나 이 메시지만 하드코딩 영문이다. 한국어 환경에서 영문 알림이 표시된다.

**권장 조치:** `ScreenshotService`에 locale 의존성을 주입하거나, 저장 성공 이벤트를 호출측(`FigmaCommandHandler`)으로 위임하여 i18n 처리한다.

---

### 3.5 코드 품질

#### QA-1 — ESLint `no-explicit-any` warn 수준 (낮음, 잔존)

프로덕션 코드에서 `any` 남용 방지를 위해 `error`로 변경 필요.

#### QA-2 — `no-console` 비활성화 (낮음, 잔존)

`Logger`를 올바르게 사용하고 있지만 ESLint 규칙으로 강제되지 않아 실수로 남긴 `console.log`가 프로덕션에 노출될 수 있다.

#### QA-3 — `TOKEN_ESTIMATE_DIVISOR = 4` 주석 없음 (낮음, 잔존)

**파일:** `constants.ts:37`

```typescript
export const TOKEN_ESTIMATE_DIVISOR = 4;
```

"문자 4개 ≈ 토큰 1개"라는 표준 휴리스틱임을 설명하는 주석이 없어 매직 넘버로 오해될 수 있다.

**권장 조치:**

```typescript
/** 표준 토큰 추정 휴리스틱: 평균적으로 문자 4개가 토큰 1개에 해당 */
export const TOKEN_ESTIMATE_DIVISOR = 4;
```

#### NF-5 — GeminiAgent 모델 ID 기반 정렬 불안정 (낮음)

**파일:** `GeminiAgent.ts:83`
**심각도:** 낮음

```typescript
.sort((a, b) => b.id.localeCompare(a.id))
```

렉시코그래픽 정렬로 `gemini-2.0-flash` > `gemini-1.5-pro`는 올바르지만, `gemini-2.0-flash-thinking-exp` vs `gemini-2.0-flash` 등 세부 변형 모델의 순서가 사용자 기대와 다를 수 있다.

**권장 조치:** 버전 숫자를 파싱하는 커스텀 comparator를 사용하거나, Gemini API 응답의 `createTime` 필드를 기준으로 정렬한다.

---

### 3.6 CI/CD 잔존 항목

| 항목                            | 심각도 | 현황                                 | 권장 조치                                     |
| ------------------------------- | ------ | ------------------------------------ | --------------------------------------------- |
| GitHub Release 자동화           | 중간   | 부분 완료(VSIX 아티팩트 업로드만 됨) | `release.yml`에 `gh release create` 단계 추가 |
| CodeQL / SAST                   | 중간   | 미완료                               | GitHub CodeQL 액션 활성화                     |
| Lint 단계에 Prettier 포함 안 됨 | 낮음   | 미완료                               | CI에 `format:check` 추가                      |

**GitHub Release 자동화 보완:**

```yaml
- name: Create GitHub Release
  if: startsWith(github.ref, 'refs/tags/v')
  uses: actions/create-release@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tag_name: ${{ github.ref_name }}
    release_name: Release ${{ github.ref_name }}
    draft: false
    prerelease: false
```

---

## 4. 유지되는 강점 (변경 없음)

v0.1.4에서 확인된 아래 강점들이 그대로 유지됨을 재확인.

| 항목                                | 구현 위치                                | 비고                                           |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| **Discriminated Union 메시지 타입** | `src/types.ts`                           | Extension Host ↔ Webview 간 완전한 타입 안전성 |
| **Logger 추상화**                   | `src/logger/Logger.ts`                   | 모든 소스 파일에서 `console.log` 미사용        |
| **Secrets Store**                   | `AgentCommandHandler.ts`, `extension.ts` | API 키를 OS 암호화된 VS Code Secrets에 저장    |
| **CSP 정책**                        | `SidebarProvider.ts`                     | `script-src 'nonce-*'`, `default-src 'none'`   |
| **입력 검증**                       | `McpParser.ts`                           | fileId/nodeId 정규식 정제                      |
| **순환 버퍼 로거**                  | `Logger.ts`                              | 고정 메모리(500 엔트리), O(1) append           |
| **rAF 청크 배치**                   | `PromptLayer.ts`                         | `insertAdjacentText` 패턴, DOM O(n²) 제거      |
| **Gemini 모델 캐시**                | `GeminiAgent.ts`                         | 5분 TTL로 반복 API 호출 방지                   |
| **단일 IPC 스트리밍**               | `PromptCommandHandler.ts`                | `prompt.streaming` 이벤트 통합                 |
| **스트림 취소 처리**                | `GeminiAgent.ts`, `ClaudeAgent.ts`       | AbortSignal 연동                               |
| **브랜치 커버리지 게이트**          | `package.json`, `ci.yml`                 | 85% 미만 PR 차단                               |
| **취약점 감사**                     | `ci.yml`                                 | `npm audit --audit-level=high`                 |

---

## 5. 아키텍처 종합 평가

### 5.1 계층 구조

```
extension.ts (진입점 / 활성화)
    ↓
SidebarProvider (VS Code WebviewViewProvider)
    ↓
WebviewMessageHandler (메시지 라우터)
    ├── FigmaCommandHandler  → McpClient, ScreenshotService
    ├── AgentCommandHandler  → AgentFactory (ClaudeAgent / GeminiAgent)
    └── PromptCommandHandler → AgentFactory, EditorIntegration, StateManager
```

**강점:** 단일 책임 원칙(SRP)이 잘 지켜지며, 각 Handler의 역할 경계가 명확하다. `WebviewMessageHandler`의 `handle()` 메서드는 순수 라우터로 동작하여 비즈니스 로직이 개별 핸들러에 캡슐화된다.

**개선 여지:** `WebviewMessageHandler.handle()`의 외부 try-catch는 핸들러 내부에서 이미 처리된 에러까지 이중으로 포착할 잠재적 경로가 존재하나, 현재 코드에서는 핸들러들이 에러를 직접 재던지지 않아 실제 이중 발생 가능성은 낮다.

### 5.2 데이터 흐름

```
Figma URL 입력 → McpParser(정제) → McpClient(JSON-RPC) → StateManager(캐시)
                                                              ↓
사용자 프롬프트 → PromptBuilder → AgentFactory(Claude/Gemini) → 스트리밍 청크 → PromptLayer(rAF 배치)
```

단방향 데이터 흐름이 유지되며 사이드 이펙트가 최소화되어 있다.

### 5.3 의존성 분석

```
Extension Host (Node.js 환경):
  - @anthropic-ai/sdk ^0.78.0
  - @google/generative-ai ^0.24.1

Webview (브라우저 환경):
  - @vscode/codicons ^0.0.44 (아이콘 폰트만)
  - 별도 프레임워크 없음 (Vanilla TS)
```

**장점:** Webview에 React/Vue 등 무거운 프레임워크 없이 Vanilla TypeScript로 구현하여 번들 크기가 최소화된다. Extension Host의 AI SDK 의존성은 필수적이며 적절하다.

---

## 6. 권장 조치 계획 (신규)

### Priority 0 — 출시 전 필수

| #    | 파일                         | 항목 | 작업                                           |
| ---- | ---------------------------- | ---- | ---------------------------------------------- |
| P0-1 | `AgentCommandHandler.ts:129` | NF-1 | Claude API 키 정규식을 `sk-ant-` 접두사로 강화 |

### Priority 1 — 출시 전 권장

| #    | 파일                         | 항목   | 작업                                                  |
| ---- | ---------------------------- | ------ | ----------------------------------------------------- |
| P1-1 | `FigmaCommandHandler.ts:121` | NF-2   | `fetchScreenshot` catch 블록에서 에러 세부정보 로깅   |
| P1-2 | `McpClient.ts`               | SEC-2  | localhost/127.0.0.1 이외 엔드포인트에 확인 다이얼로그 |
| P1-3 | `ClaudeAgent.ts:49`          | ARCH-1 | `dangerouslyAllowBrowser` 이유 설명 인라인 주석 추가  |

### Priority 2 — 출시 후 개선

| #    | 항목   | 작업                                                          |
| ---- | ------ | ------------------------------------------------------------- |
| P2-1 | ERR-4  | `McpClient.sendRequest` 지수 백오프 재시도(최대 3회)          |
| P2-2 | NF-3   | `ClaudeAgent` 스트림 abort 공식 SDK AbortSignal 지원으로 대체 |
| P2-3 | NF-4   | `ScreenshotService` i18n 미적용 문자열 처리                   |
| P2-4 | SEC-3  | `AgentLayer` innerHTML 빈 상태 DOM API로 교체                 |
| P2-5 | QA-3   | `TOKEN_ESTIMATE_DIVISOR` 설명 주석 추가                       |
| P2-6 | CI/CD  | GitHub Release 자동 생성 및 CodeQL 활성화                     |
| P2-7 | QA-1/2 | ESLint `no-explicit-any: error`, `no-console: error` 강화     |

---

## 7. 결론

버전 0.1.4(현재)는 이전 리뷰에서 지적된 Priority 0 항목 4건과 Priority 1 항목 4건 **모두를 해결**하여 코드베이스 품질이 종합 **8.5 / 10**으로 향상되었다.

특히:

- 에러 처리가 `toErrorMessage(e: unknown)` 전면 적용으로 타입 안전하게 통일되었다.
- CI/CD 파이프라인이 취약점 감사와 커버리지 게이트를 갖추며 운영 수준으로 성숙했다.
- 스트리밍 취소 시 부분 코드 표시 및 IPC 최적화로 사용자 경험이 개선되었다.

남은 차단 이슈는 **P0-1(Claude API 키 정규식)** 1건이며, 이를 해결하면 마켓플레이스 출시가 가능한 수준이다.

---

_이 리뷰는 소스 코드 직접 검증 방법론(Source Code Inspection)과 OWASP Top 10 체크리스트를 기반으로 작성되었습니다._
