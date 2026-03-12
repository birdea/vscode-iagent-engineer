# 코드 리뷰 보고서

**프로젝트:** iagent engineer (VS Code Extension)
**버전:** 0.1.4 (현재 브랜치: main)
**리뷰 일자:** 2026-03-08
**근거:** 이전 리뷰(CODEREVIEW.md) 대비 소스 직접 검증
**기준:** 상용 소프트웨어 출시 품질 (전문가 소프트웨어 개발 방법론 적용)

---

## 1. 종합 평가

| 항목            | 이전 리뷰 | 현재    | 변화  |
| --------------- | --------- | ------- | ----- |
| 아키텍처        | 9.0       | 9.0     | —     |
| 타입 안전성     | 9.0       | 9.0     | —     |
| 에러 처리       | 8.5       | 9.0     | ↑     |
| 보안            | 8.0       | 8.5     | ↑     |
| 테스트 커버리지 | 8.5       | 8.5     | —     |
| 코드 품질       | 8.5       | 9.0     | ↑     |
| 리소스 관리     | 9.5       | 9.5     | —     |
| 국제화(i18n)    | 8.5       | 9.0     | ↑     |
| CI/CD           | 8.5       | 9.5     | ↑↑    |
| 문서화          | 7.5       | 8.0     | ↑     |
| **종합**        | **8.5**   | **9.0** | **↑** |

**판정:** 출시 가능(GA 후보) 수준에서 **프로덕션 품질(GA)** 수준으로 향상. 이전 리뷰의 P0/P1/P2 항목이 모두 해결됨. 잔존 이슈는 전부 낮음(Low) 심각도이며 출시 후 패치로 처리 가능.

---

## 2. 이전 리뷰 대비 해결된 항목

이전 리뷰에서 지적된 Priority 0, 1, 2 항목 전체를 소스 직접 검증을 통해 **해결 완료**되었음을 확인.

### ✅ NF-1 — Claude API 키 정규식 강화

**파일:** `AgentCommandHandler.ts:129`

이전 리뷰에서 남은 유일한 P0 차단 이슈였던 Claude 키 정규식이 Anthropic 공식 접두사로 강화되었다.

```typescript
// 이전: /^sk-[A-Za-z0-9_-]{10,}$/ (Stripe sk-live-... 등도 통과)
// 현재:
const pattern = agent === 'gemini' ? /^AIza[0-9A-Za-z_-]{20,}$/ : /^sk-ant-[A-Za-z0-9_-]{10,}$/;
```

`sk-ant-` 접두사 강제로 다른 서비스의 `sk-` 접두사 키를 차단한다.

---

### ✅ NF-2 — FigmaCommandHandler 에러 세부 정보 로깅

**파일:** `FigmaCommandHandler.ts:121-131`

이전에 에러 객체를 완전히 무시하던 catch 블록이 `toErrorMessage(e)`와 `Logger.error`를 포함하도록 수정되었다.

```typescript
} catch (e) {
  Logger.error(
    'figma',
    `Screenshot fetch failed for fileId=${parsed.fileId}, nodeId=${parsed.nodeId}: ${toErrorMessage(e)}`,
  );
  this.post({
    event: 'error',
    source: 'figma',
    message: t(this.locale, 'host.figma.screenshotFailed'),
  });
}
```

타임아웃/네트워크 오류/검증 실패 구분이 로그에서 가능해졌다.

---

### ✅ SEC-2 — MCP 엔드포인트 SSRF 완화

**파일:** `McpClient.ts:185-216`

`confirmEndpointSafety()` 메서드가 추가되어 localhost 외 외부 엔드포인트 연결 시 사용자 확인 다이얼로그를 표시한다.

```typescript
private async confirmEndpointSafety(): Promise<void> {
  // ...
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
    return;
  }
  if (this.approvedExternalEndpoints.has(this.endpoint)) {
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    `The configured MCP endpoint is not local: ${this.endpoint}`,
    { modal: true },
    'Connect',
  );
  if (choice !== 'Connect') {
    throw new ValidationError(`MCP connection cancelled for non-local endpoint: ${this.endpoint}`);
  }
  this.approvedExternalEndpoints.add(this.endpoint);
}
```

세션 내 승인된 엔드포인트를 캐시하여 반복 확인을 방지한다.

---

### ✅ ARCH-1 — `dangerouslyAllowBrowser` 인라인 주석 추가

**파일:** `ClaudeAgent.ts:49-51`

이후 유지보수자가 보안 취약점으로 오해할 수 있었던 플래그에 설명 주석이 추가되었다.

```typescript
// The extension host uses the SDK from a VS Code webview/extension context rather than a
// plain Node CLI environment, so Anthropic requires this flag to permit fetch usage here.
this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
```

---

### ✅ NF-3 — ClaudeAgent 스트림 abort 공식 SDK 파라미터로 전환

**파일:** `ClaudeAgent.ts:106-113`

이전에 `(stream as { abort?: () => void }).abort` 불안전 캐스팅을 사용하던 코드가 SDK 공식 `signal` 파라미터로 대체되었다.

```typescript
const stream = this.client.messages.stream(
  {
    model: modelId,
    max_tokens: modelInfo.outputTokenLimit ?? 8192,
    system: `...`,
    messages: [{ role: 'user', content: prompt }],
  },
  { signal }, // ← 공식 AbortSignal 파라미터
);
```

SDK 업데이트에 의한 조용한 실패(silent fail) 위험이 제거되었다.

---

### ✅ ERR-4 — MCP 클라이언트 지수 백오프 재시도 구현

**파일:** `McpClient.ts:64-91`

일시적 네트워크 오류 시 즉시 실패하던 문제가 최대 3회 지수 백오프 재시도로 해결되었다.

```typescript
private async sendRequest(method: string, params?: unknown): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await this.performRequest(id, bodyStr);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      lastError = e;
      if (!this.shouldRetry(e, attempt)) throw e;
      const delayMs = 250 * 2 ** attempt;  // 250ms → 500ms → 1000ms
      Logger.warn('figma', `Retrying MCP ${method} request (${attempt + 2}/3) after ${delayMs}ms`);
      await this.delay(delayMs);
    }
  }
  throw lastError ?? new NetworkError('MCP request failed after retries');
}
```

`ValidationError`는 재시도하지 않으며, 5xx 서버 오류와 네트워크/타임아웃 오류만 재시도한다.

---

### ✅ NF-4 — ScreenshotService i18n 적용

**파일:** `ScreenshotService.ts:65-74`

하드코딩 영문 메시지가 locale 의존성 주입과 i18n 시스템으로 교체되었다.

```typescript
constructor(
  private mcpClient: McpClient,
  private readonly locale: UiLocale = 'en',  // locale 주입
) {}

// ...
vscode.window.showInformationMessage(
  t(this.locale, 'system.screenshotSaved', { path: saveUri.fsPath }),
);
```

---

### ✅ SEC-3 — AgentLayer innerHTML 패턴 제거

**파일:** `AgentLayer.ts:218-228`

모델 목록 빈 상태에서의 `innerHTML` 패턴이 `createElement` + `textContent`로 전면 교체되었다.

```typescript
private updateModelList(models: ModelInfo[]) {
  select.replaceChildren();
  if (models.length === 0) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = this.msg('agent.modelLoadPrompt');
    select.appendChild(emptyOption);
    return;
  }
  models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;  // ← textContent 일관 사용
    select.appendChild(opt);
  });
}
```

innerHTML과 DOM API 혼용이 사라지고 패턴이 일관성 있게 통일되었다.

---

### ✅ P2-6 — CI/CD 완성 (GitHub Release 자동화 + CodeQL)

**파일:** `release.yml`, `codeql.yml`

```yaml
# release.yml - GitHub Release 자동 생성
- name: Create GitHub Release
  if: startsWith(github.ref, 'refs/tags/v')
  uses: softprops/action-gh-release@v2
  with:
    files: iagent-engineer-${{ github.ref_name }}.vsix

# codeql.yml - 정적 분석
- name: Analyze
  uses: github/codeql-action/analyze@v4
```

태그 push 시 GitHub Release 생성 및 VSIX 첨부, 매주 월요일 CodeQL 분석이 자동으로 실행된다.

---

### ✅ QA-3 — `TOKEN_ESTIMATE_DIVISOR` 설명 주석 추가

**파일:** `constants.ts:37-38`

```typescript
// Approximate 1 token per 4 characters for mixed natural-language/code prompts.
export const TOKEN_ESTIMATE_DIVISOR = 4;
```

매직 넘버 오해 가능성이 제거되었다.

---

## 3. 신규 발견 이슈 및 잔존 이슈

### 3.1 보안

#### SEC-NEW-1 — `setEndpoint()` 호출 시 승인 세트 미정리 (낮음)

**파일:** `McpClient.ts:275-278`
**심각도:** 낮음

```typescript
setEndpoint(endpoint: string) {
  this.endpoint = endpoint;
  this.initialized = false;
  // approvedExternalEndpoints는 정리되지 않음
}
```

엔드포인트 A(외부, 승인됨) → B → A로 변경 시, A에 대한 재확인 없이 연결된다. 세션 내에서 `approvedExternalEndpoints`는 영구 누적된다.

실제 영향은 낮음(동일 세션 내 재연결이기 때문). 단, 외부 엔드포인트를 악의적으로 변경하는 시나리오에서 이전 승인이 오용될 수 있다.

**권장 조치:**

```typescript
setEndpoint(endpoint: string) {
  if (endpoint !== this.endpoint) {
    this.approvedExternalEndpoints.delete(this.endpoint);
  }
  this.endpoint = endpoint;
  this.initialized = false;
}
```

---

#### SEC-NEW-2 — Claude 모델 목록 사용자 설정값 검증 미흡 (낮음)

**파일:** `ClaudeAgent.ts:64-87`
**심각도:** 낮음

```typescript
const configuredModels = vscode.workspace
  .getConfiguration()
  .get<unknown>(CONFIG_KEYS.CLAUDE_MODELS);
```

VS Code 사용자 설정(`figmalab.claudeModels`)에서 읽어온 모델 ID가 Anthropic SDK에 그대로 전달된다. 악의적인 설정 파일이 포함된 워크스페이스를 열 경우 임의의 모델 ID가 API 호출에 사용될 수 있다. (단, 실제 Anthropic API에서 검증되므로 실질적 영향은 제한적)

**권장 조치:** 모델 ID에 대한 화이트리스트 또는 정규식 검증 추가.

```typescript
const MODEL_ID_PATTERN = /^claude-[a-z0-9.-]{1,60}$/;
if (!MODEL_ID_PATTERN.test(model.id.trim())) return null;
```

---

### 3.2 에러 처리

#### ERR-NEW-1 — GeminiAgent 에러 이중 로깅 (낮음)

**파일:** `GeminiAgent.ts:167-169`, `PromptCommandHandler.ts:87-109`
**심각도:** 낮음

`GeminiAgent.generateCode()`의 catch 블록이 에러를 로깅한 뒤 re-throw하며, 상위 `PromptCommandHandler.generate()`도 `toErrorMessage(e)`로 동일 에러를 처리한다. 동일 오류에 대해 두 번의 `Logger.error` 출력이 발생한다.

```typescript
// GeminiAgent.ts:167-169 (1차 로깅)
} catch (e) {
  Logger.error('agent', `Gemini generation failed: ${toErrorMessage(e)}`);
  throw e;
}

// PromptCommandHandler.ts:88 (2차 처리)
const errMessage = toErrorMessage(e);
```

**권장 조치:** GeminiAgent의 catch 블록에서 로깅을 제거하거나, 로그 레벨을 `warn`으로 낮추어 디버그용으로만 남긴다.

---

### 3.3 아키텍처

#### ARCH-NEW-1 — `AgentFactory` 싱글톤 공유 상태 (낮음)

**파일:** `src/agent/AgentFactory.ts`
**심각도:** 낮음

`AgentFactory`가 `ClaudeAgent`/`GeminiAgent` 싱글톤 인스턴스를 전역으로 공유한다. 현재는 단일 웹뷰 구조이므로 실제 문제는 없다. 그러나 다중 웹뷰 지원 시 동일 인스턴스가 서로 다른 패널에서 API 키를 덮어쓸 위험이 있다.

**권장 조치:** 다중 뷰 확장 계획이 있는 경우, 팩토리를 `ExtensionContext`에 바인딩하거나 핸들러별 인스턴스를 생성하는 구조로 전환한다.

---

### 3.4 코드 품질

#### NF-NEW-1 — GeminiAgent 모델 ID 렉시코그래픽 정렬 불안정 (낮음)

**파일:** `GeminiAgent.ts:83`
**심각도:** 낮음

```typescript
.sort((a, b) => b.id.localeCompare(a.id))
```

현재는 `gemini-2.0-flash > gemini-1.5-pro`가 올바르게 정렬된다. 그러나 향후 `gemini-10.0-pro`와 같은 두 자리 메이저 버전이 등장하면 문자열 비교로 인해 `gemini-2.x`가 `gemini-10.x`보다 앞에 위치한다.

**권장 조치:**

```typescript
.sort((a, b) => {
  const aVersion = a.id.match(/gemini-(\d+)/)?.[1] ?? '0';
  const bVersion = b.id.match(/gemini-(\d+)/)?.[1] ?? '0';
  const diff = parseInt(bVersion, 10) - parseInt(aVersion, 10);
  return diff !== 0 ? diff : b.id.localeCompare(a.id);
})
```

---

#### NF-NEW-2 — TokenEstimator 문자 수/바이트 혼용 (낮음)

**파일:** `TokenEstimator.ts:8-13`
**심각도:** 낮음

```typescript
export function estimateTokens(text: string): TokenEstimate {
  const bytes = new TextEncoder().encode(text).length; // 바이트 수 계산
  const kb = bytes / 1024;
  const tokens = Math.ceil(text.length / TOKEN_ESTIMATE_DIVISOR); // 문자 수로 계산 (불일치)
  return { tokens, kb };
}
```

`kb`는 UTF-8 바이트 수 기반이나 `tokens`는 JS 문자 수(UTF-16 코드 유닛) 기반이다. 한국어, 일본어, 이모지 등 멀티바이트 문자가 많은 프롬프트에서 실제 토큰 수를 최대 50% 과소 추정할 수 있다. Claude tokenizer는 바이트 수에 가깝게 동작하므로 `bytes / TOKEN_ESTIMATE_DIVISOR`가 더 정확하다.

**권장 조치:**

```typescript
export function estimateTokens(text: string): TokenEstimate {
  const bytes = new TextEncoder().encode(text).length;
  const kb = bytes / 1024;
  // UTF-8 바이트 기준으로 계산 (멀티바이트 문자 정확도 향상)
  const tokens = Math.ceil(bytes / TOKEN_ESTIMATE_DIVISOR);
  return { tokens, kb };
}
```

---

### 3.5 CI/CD

#### CI-NEW-1 — CI 워크플로가 main 브랜치 push 시 미실행 (중간)

**파일:** `.github/workflows/ci.yml:3-5`
**심각도:** 중간

```yaml
on:
  pull_request:
  workflow_dispatch:
  # push: { branches: [main] } 누락
```

PR 병합(main 브랜치 push) 시 CI가 실행되지 않는다. Squash merge나 직접 push로 인한 회귀를 감지할 수 없다.

**권장 조치:**

```yaml
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
```

---

#### CI-NEW-2 — Lint 단계에 Prettier 포맷 검사 미포함 (낮음, 잔존)

**파일:** `.github/workflows/ci.yml:34-35`
**심각도:** 낮음

```yaml
- name: Lint
  run: npm run lint
```

`npm run lint`가 ESLint만 실행하며 Prettier 포맷 검사가 포함되지 않아, 포맷 불일치 코드가 CI를 통과할 수 있다.

**권장 조치:** CI Lint 단계에 `npm run format:check` 추가.

---

#### QA-NEW-1 — ESLint `no-explicit-any: warn` 수준 (낮음, 잔존)

프로덕션 코드에서 `any` 사용을 `error` 수준으로 강제하지 않아 타입 안전성이 코드 리뷰 과정에만 의존한다.

---

## 4. 유지되는 강점 (변경 없음)

| 항목                                | 구현 위치                          | 비고                                         |
| ----------------------------------- | ---------------------------------- | -------------------------------------------- |
| **Discriminated Union 메시지 타입** | `src/types.ts`                     | Extension Host ↔ Webview 완전한 타입 안전성  |
| **Logger 추상화**                   | `src/logger/Logger.ts`             | 모든 소스 파일에서 `console.log` 미사용      |
| **Secrets Store**                   | `AgentCommandHandler.ts`           | API 키를 OS 암호화 VS Code Secrets에 저장    |
| **CSP 정책**                        | `SidebarProvider.ts`               | `script-src 'nonce-*'`, `default-src 'none'` |
| **입력 검증**                       | `McpParser.ts`                     | fileId/nodeId 정규식 정제                    |
| **순환 버퍼 로거**                  | `Logger.ts`                        | 고정 메모리(500 엔트리), O(1) append         |
| **rAF 청크 배치**                   | `PromptLayer.ts`                   | `insertAdjacentText` 패턴, DOM O(n²) 제거    |
| **Gemini 모델 캐시**                | `GeminiAgent.ts`                   | 5분 TTL로 반복 API 호출 방지                 |
| **단일 IPC 스트리밍**               | `PromptCommandHandler.ts`          | `prompt.streaming` 이벤트 통합               |
| **MCP 재시도 로직**                 | `McpClient.ts`                     | 지수 백오프 3회, ValidationError 제외        |
| **브랜치 커버리지 게이트**          | `package.json`, `ci.yml`           | 85% 미만 PR 차단                             |
| **취약점 감사**                     | `ci.yml`                           | `npm audit --audit-level=high`               |
| **CodeQL SAST**                     | `codeql.yml`                       | main push + 주간 스케줄                      |
| **GitHub Release 자동화**           | `release.yml`                      | VSIX 아티팩트 첨부 및 마켓플레이스 배포      |
| **경로 순회 방지**                  | `ScreenshotService.ts`             | `sanitizePathSegment()` + os.tmpdir()        |
| **SSRF 완화**                       | `McpClient.ts`                     | 외부 엔드포인트 modal 확인                   |
| **스트림 취소 처리**                | `GeminiAgent.ts`, `ClaudeAgent.ts` | AbortSignal 공식 연동                        |

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

**강점:** 단일 책임 원칙(SRP)이 일관되게 적용되며, 각 핸들러의 역할 경계가 명확하다. `WebviewMessageHandler.handle()`이 순수 라우터로 동작하여 비즈니스 로직이 개별 핸들러에 캡슐화된다.

**관찰:** `WebviewMessageHandler.handle()`의 외부 try-catch는 핸들러 내부에서 이미 처리된 에러까지 이중으로 포착할 잠재적 경로가 존재하나, 현재 핸들러들이 에러를 직접 재던지지 않으므로 실제 이중 발생 가능성은 낮다.

### 5.2 데이터 흐름

```
Figma URL 입력 → McpParser(정제) → McpClient(JSON-RPC + 재시도) → StateManager(캐시)
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
  - 별도 프레임워크 없음 (Vanilla TypeScript)
```

**장점:** Webview에 React/Vue 등 무거운 프레임워크 없이 Vanilla TypeScript로 구현하여 번들 크기가 최소화된다. Extension Host의 AI SDK 의존성은 필수적이며 적절하다.

---

## 6. 권장 조치 계획

### Priority 1 — 출시 후 우선 개선

| #    | 파일                       | 항목      | 작업                                         |
| ---- | -------------------------- | --------- | -------------------------------------------- |
| P1-1 | `.github/workflows/ci.yml` | CI-NEW-1  | `push: branches: [main]` 트리거 추가         |
| P1-2 | `McpClient.ts:275-278`     | SEC-NEW-1 | `setEndpoint()` 시 이전 엔드포인트 승인 제거 |

### Priority 2 — 출시 후 개선

| #    | 항목      | 작업                                                              |
| ---- | --------- | ----------------------------------------------------------------- |
| P2-1 | NF-NEW-2  | `TokenEstimator`를 `bytes / TOKEN_ESTIMATE_DIVISOR` 기반으로 수정 |
| P2-2 | NF-NEW-1  | Gemini 모델 정렬을 버전 숫자 파싱 기반으로 교체                   |
| P2-3 | ERR-NEW-1 | `GeminiAgent` catch 블록 로깅 제거 또는 warn 수준으로 낮추기      |
| P2-4 | SEC-NEW-2 | `ClaudeAgent` 사용자 설정 모델 ID 정규식 검증 추가                |
| P2-5 | CI-NEW-2  | CI Lint 단계에 `npm run format:check` 추가                        |
| P2-6 | QA-NEW-1  | ESLint `no-explicit-any: error` 강화                              |

---

## 7. 결론

버전 0.1.4(현재)는 이전 리뷰에서 지적된 **모든 P0, P1, P2 항목(13건)**을 해결하여 코드베이스 품질이 종합 **9.0 / 10**으로 향상되었다.

특히:

- **Claude API 키 정규식**이 `sk-ant-` 접두사로 강화되어 유일한 P0 차단 이슈가 해결되었다.
- **MCP 재시도 로직**이 지수 백오프(250ms → 500ms → 1000ms) 3회로 구현되어 일시적 네트워크 오류에 탄력성이 생겼다.
- **ClaudeAgent 스트림 중단**이 불안전한 타입 캐스팅 대신 SDK 공식 `signal` 파라미터로 안전하게 처리된다.
- **CI/CD 파이프라인**이 CodeQL SAST, GitHub Release 자동화, 마켓플레이스 배포까지 완비되어 완전한 DevSecOps 수준에 도달했다.

잔존하는 이슈는 모두 낮음(Low) 또는 중간(Medium) 심각도이며, 출시를 차단할 수 없다. **현재 코드베이스는 VS Code 마켓플레이스 공개 출시(GA)에 적합한 품질이다.**

---

_이 리뷰는 소스 코드 직접 검증 방법론(Source Code Inspection)과 OWASP Top 10 체크리스트를 기반으로 작성되었습니다._
