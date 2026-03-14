# iAgent Engineer - Code Review Report

**Reviewer:** Claude (AI Code Reviewer)
**Date:** 2026-03-14
**Version:** 0.7.0
**Scope:** Full codebase review for production readiness

---

## Overall Score: 7.5 / 10

> 잘 구조화된 VS Code 확장이며, 명확한 관심사 분리와 견고한 타입 시스템을 갖추고 있습니다.
> 프로덕션 배포 전 몇 가지 핵심 이슈(거대 모듈 분리, 메모리 누수, 테스트 커버리지)를 해결하면
> 8.5점 이상으로 올라갈 수 있는 잠재력이 있습니다.

---

## 1. Architecture & Design (8.5/10)

### Strengths

- **명확한 레이어 분리**: `agent/`, `figma/`, `prompt/`, `profiler/`, `editor/`, `webview/` 로 도메인별 관심사가 깔끔하게 분리됨
- **Strategy Pattern 적용**: `BaseAgent` → `ClaudeAgent`, `GeminiAgent`, `OpenAIAgent` 구조로 새로운 LLM 프로바이더 추가가 용이
- **Factory Pattern**: `AgentFactory`가 싱글턴 캐싱으로 에이전트 인스턴스를 관리하여 리소스 효율적
- **Message-based Communication**: Extension Host ↔ Webview 간 `WebviewToHostMessage` / `HostToWebviewMessage` 타입 안전한 메시지 통신
- **Pub/Sub Pattern**: `StateManager`, `ProfilerStateManager` 에서 `onAgentStateChange()`, `onOverviewChange()` 등 Disposable 패턴을 활용한 구독 관리
- **Command Handler Pattern**: `WebviewMessageHandler`가 4개의 도메인 핸들러(`FigmaCommandHandler`, `AgentCommandHandler`, `PromptCommandHandler`, `ProfilerCommandHandler`)로 라우팅

### Concerns

- **ProfilerService.ts 과잉 성장**: 2,516줄의 God Class. 파일 탐색, JSONL 파싱, Claude/Codex/Gemini 세션 분석, 타임라인 생성, 인사이트 추출, 아카이브 등이 하나의 클래스에 혼재
  - 권장: `ProfilerFileDiscovery`, `ClaudeSessionParser`, `CodexSessionParser`, `GeminiSessionParser`, `TimelineBuilder`, `InsightExtractor` 등으로 분리
- **Webview UI 계층에 React/Vue/Vanilla JS 혼용**: `ProfilerChart.tsx`는 React, 나머지 Layer 컴포넌트들은 Vanilla JS DOM 조작. 기술 부채 및 신규 개발자 진입 장벽
- **의존성 주입 일관성 부족**: 일부 서비스는 생성자 주입, 일부는 팩토리 패턴, `SidebarProvider`의 생성자는 파라미터 9개로 과다

---

## 2. Code Quality & TypeScript (8/10)

### Strengths

- **Strict TypeScript**: `no-explicit-any: 'error'` ESLint 규칙 적용, `unknown` + type guard 패턴 일관 사용
- **Discriminated Union Types**: `WebviewToHostMessage`, `HostToWebviewMessage`에서 `command`/`event` 필드를 기반으로 한 안전한 타입 분기
- **Custom Error Classes**: `NetworkError`, `TimeoutError`, `ValidationError`, `UserCancelledError` 등 도메인별 에러 타입 정의
- **no-console ESLint Rule**: 프로덕션 코드에서 `console.log` 금지, `Logger` 클래스로 일원화
- **TODO/FIXME/HACK 없음**: 기술 부채 마커가 코드에 없음

### Concerns

- **반복 코드 패턴**:
  - `post()` 메서드가 4개 핸들러 클래스에 동일하게 정의됨 → Base handler class로 추출 가능
  - API key 조회 패턴 (`context.secrets.get(getSecretStorageKey(agent))`)이 `PromptCommandHandler`, `AgentCommandHandler`, `extension.ts` 등에 반복
  - `https.request()` 기반 HTTP 호출이 `ClaudeAgent`, `GeminiAgent`에서 각각 별도 구현 → 공통 HTTP 클라이언트 추출 가능
- **MCP 호출 시 fallback 목록 중복**: `McpClient`의 `getDesignContext`, `getMetadata`, `getVariableDefs`, `getImage` 각 메서드에서 유사한 fallback 시도 목록이 반복. 공통 빌더 함수로 추출 가능
- **i18n.ts 448줄**: 모든 번역 문자열이 단일 파일에 하드코딩. 규모 확대 시 JSON 파일 분리 검토 필요

---

## 3. Security (8/10)

### Strengths

- **API Key 보안**: VS Code `context.secrets` (Keychain/Credential Manager) 사용, 소스 코드에 하드코딩된 시크릿 없음
- **CSP (Content Security Policy)**: Webview HTML에 nonce 기반 스크립트 제한, `default-src 'none'` 적용
- **MCP 엔드포인트 안전성 확인**: 비-localhost 엔드포인트 연결 시 모달 확인 대화상자 (`confirmEndpointSafety`)
- **URL 인코딩**: `encodeURIComponent()` 사용으로 path traversal 방지
- **프로토콜 검증**: MCP 클라이언트에서 `http:`/`https:` 프로토콜만 허용
- **serialize-javascript override**: 알려진 취약점에 대한 선제적 패치 (v7.0.4)

### Concerns

- **`dangerouslyAllowBrowser: true`** (`ClaudeAgent.ts:80`): Anthropic SDK의 브라우저 모드 활성화. VS Code Extension Host 환경에서 필요한 설정이지만, 문서화된 보안 검토 근거가 코드 주석 외에 없음
- **MCP Request Timeout**: `REQUEST_TIMEOUT_MS = 10000` (10초). 대용량 디자인 데이터 전송 시 타임아웃 가능성. 설정 가능하도록 변경 검토
- **HTTP (non-TLS) 허용**: 로컬 MCP 연결에서 `http://127.0.0.1` 사용. 로컬 환경이라 수용 가능하나, 설정 가이드에 명시 권장
- **입력 검증**: API key 포맷 검증은 있으나, MCP 데이터(Figma 디자인 데이터)의 페이로드 사이즈 제한이 명시적이지 않음

---

## 4. Error Handling & Resilience (8.5/10)

### Strengths

- **계층적 에러 처리**: 모든 command handler가 try-catch로 감싸져 있고, `WebviewMessageHandler.handle()`에서 최상위 catch가 에러를 UI로 전달
- **Retry 로직**: `McpClient.sendRequest()`에서 최대 3회 재시도, 지수 백오프(250ms, 500ms, 1000ms)
- **Retry 분류**: `ValidationError`는 재시도 안 함, `TimeoutError`/`NetworkError`/5xx만 재시도
- **Graceful Degradation**: 코드 생성 중 에러 발생 시 부분 결과라도 에디터에 표시
- **Cancel 지원**: `AbortController` 기반 생성 취소, Gemini 스트림의 iterator.return() 호출까지 처리
- **toErrorMessage() 유틸**: 모든 에러 타입(Error, string, unknown)을 안전하게 문자열로 변환

### Concerns

- **MCP fallback 에러 로깅**: `callWithFallback()`에서 중간 fallback 실패 시 로그가 없음. 마지막 실패만 throw되므로 디버깅 시 어떤 시도까지 성공했는지 파악 어려움
- **Extension deactivate**: `deactivate()`에서 `Promise.allSettled()` 사용은 좋으나, 개별 dispose 실패 시 에러 로깅이 없음

---

## 5. Memory Management & Resource Cleanup (7/10)

### Strengths

- **Disposable Pattern**: `SidebarProvider.dispose()`에서 모든 구독 해제, handler dispose 호출
- **ProfilerLiveMonitor**: `setInterval` → `clearInterval` 매칭, `dispose()` 메서드에서 정리
- **ProfilerChart.tsx**: `window.removeEventListener('resize', handleResize)` cleanup 처리
- **GeminiAgent**: `signal?.removeEventListener('abort', onAbort)` 정리
- **Extension deactivate**: `profilerLiveMonitor.dispose()`, `AgentFactory.clear()`, `outputChannel.dispose()` 순차 정리

### Critical Issues

- **PromptLayer 메모리 누수** (`src/webview/ui/components/PromptLayer.ts`):

  ```typescript
  // mount() 에서 리스너 등록
  window.addEventListener('focus', this.requestAgentState);
  document.addEventListener('visibilitychange', this.handleVisibilityChange);
  ```

  대응하는 `removeEventListener` 호출이 없음. Webview가 re-resolve될 때마다 리스너가 누적됨.
  - **수정 필요**: `dispose()` 또는 `unmount()` 메서드 추가하여 리스너 해제

- **FigmaLayer, AgentLayer, ProfilerLayer**: 유사하게 DOM 이벤트 리스너 cleanup 메커니즘이 명시적이지 않음. Webview IIFE 환경 특성상 re-render 시 DOM 교체로 완화되나, best practice 위반

---

## 6. Testing (6.5/10)

### Strengths

- **테스트 인프라 구축**: Mocha + Sinon + c8 + nock + jsdom 조합으로 견고한 테스트 환경
- **커버리지 임계값**: 83% lines, 75% branches, 92% functions
- **VS Code Mock**: `test/unit/mocks/vscode.ts`로 VS Code API를 깔끔하게 목킹
- **HTTP 목킹**: nock 기반 외부 API 호출 테스트
- **E2E 테스트**: `WebviewWorkflow.e2e.test.ts`로 end-to-end 워크플로우 검증

### Concerns

- **ProfilerService 테스트**: 2,516줄의 핵심 서비스에 대해 테스트 파일이 240줄. 파싱 로직, 에지 케이스, 에러 시나리오 테스트 부족
- **PreviewRuntimeBuilder 테스트**: 830줄 서비스에 231줄 테스트. Vite 런타임 빌드 실패 시나리오, Vue/TSX 변환 에러 등 누락 가능
- **BrowserPreviewService**: 524줄에 대해 177줄 테스트. 프로세스 생성/정리 에지 케이스 불충분
- **UI 컴포넌트 테스트**: `UIComponents.test.ts`가 1,956줄로 가장 크지만, 6개 UI 컴포넌트 전체를 커버하는 것은 컴포넌트당 ~300줄로 기본 케이스만 다룸
- **통합 테스트 부족**: Agent → PromptBuilder → Preview 파이프라인 전체를 관통하는 통합 테스트 없음
- **에러 시나리오 테스트**: MCP 연결 실패, API rate limit, 네트워크 단절 시나리오 등의 edge case 테스트 보강 필요

---

## 7. Performance (7.5/10)

### Strengths

- **Model 캐싱**: `GeminiAgent`에서 모델 리스트 5분 캐싱 (`GEMINI_MODELS_CACHE_TTL_MS`)
- **Streaming 응답**: 모든 LLM Agent가 `AsyncGenerator` 기반 스트리밍으로 실시간 결과 전달
- **esbuild 번들링**: 빠른 빌드 속도, 프로덕션 minification
- **retainContextWhenHidden**: 웹뷰 상태 유지로 불필요한 re-render 방지
- **Debounce**: `DEBOUNCE_MS = 300`으로 과도한 이벤트 호출 방지

### Concerns

- **ProfilerService 파일 탐색**: `walkDirectory()`가 재귀적 `readdir` + `stat` 호출. 대량 파일 구조에서 느려질 수 있음. Worker thread 또는 glob 기반 탐색 검토
- **readline 기반 파싱**: 대용량 JSONL 파일(수십 MB) 파싱 시 메인 스레드 차단 가능성. `maxFileSizeMB` 설정이 있으나 기본값 확인 필요
- **MCP Fallback 체인**: `getDesignContext`에서 최대 5가지 시도. 모든 시도가 실패하면 총 `10s × 3회 × 5시도 = 150초` 대기 가능
- **dependencies에 프로덕션 불필요 항목**: `esbuild`, `vite`, `vue`, `@vitejs/plugin-react`, `@vitejs/plugin-vue`가 `dependencies`에 포함됨. 런타임에 Preview 빌드용으로 사용되므로 의도적이나, 확장 패키지 크기 증가 원인

---

## 8. Build & CI/CD (8.5/10)

### Strengths

- **CI Matrix**: Node 20 (full checks) + Node 22 (build only)로 호환성 검증
- **Concurrency Control**: PR별 중복 CI 실행 취소
- **Format Check 최적화**: 변경된 파일만 Prettier 체크 (전체 파일 대상 아님)
- **CodeQL Security Scanning**: 별도 보안 스캐닝 워크플로우
- **Dependency Audit**: 의존성 보안 감사 워크플로우
- **Dependabot**: 자동 의존성 업데이트
- **Pre-commit Hook**: `simple-git-hooks` + `prettier` 포맷팅

### Concerns

- **Coverage Artifact**: `continue-on-error: true`로 커버리지 업로드 실패를 무시. 실패 원인 파악이 어려울 수 있음
- **E2E 테스트 CI 미포함**: `npm test`만 실행, `test:e2e`는 CI에서 실행되지 않음
- **Workers 타입 체크**: `verify` 스크립트에는 포함되나 CI에서 직접 실행되지 않음

---

## 9. Documentation & Maintainability (7.5/10)

### Strengths

- **i18n 지원**: 영어/한국어 NLS 파일 (`package.nls.json`, `package.nls.ko.json`)
- **CONTRIBUTING.md**: 개발 환경 설정, 프로젝트 구조, 테스트 가이드라인 문서화
- **SECURITY.md**: 보안 정책 문서화
- **CHANGELOG.md**: 릴리스 노트 체계적 관리
- **Profiler 사용자 가이드**: `docs/info-profiler.md` (영/한 이중 언어)
- **Release Checklist**: 배포 프로세스 문서화

### Concerns

- **인라인 코드 문서**: JSDoc/TSDoc 주석이 거의 없음. 특히 복잡한 파싱 로직(`ProfilerService`)과 런타임 빌드 로직(`PreviewRuntimeBuilder`)에 대한 설명 부족
- **아키텍처 의사결정 기록(ADR) 없음**: React+Vanilla JS 혼용, MCP fallback 전략 등의 결정 근거가 문서화되지 않음
- **API 문서**: 외부 연동 API(Cloudflare Workers 엔드포인트)의 스키마/계약 문서 없음

---

## 10. Production Readiness Checklist

| 항목                   | 상태 | 비고                                |
| ---------------------- | ---- | ----------------------------------- |
| TypeScript Strict Mode | ✅   | `no-explicit-any: error`            |
| ESLint + Prettier      | ✅   | Pre-commit hook 포함                |
| CI/CD Pipeline         | ✅   | Build, Lint, Test, Coverage         |
| Security Scanning      | ✅   | CodeQL + Dependency Audit           |
| Error Handling         | ✅   | Custom error classes + global catch |
| API Key Security       | ✅   | VS Code SecretStorage               |
| CSP (XSS 방지)         | ✅   | Nonce 기반 스크립트 제한            |
| Input Validation       | ✅   | API key format, URL protocol 검증   |
| Graceful Degradation   | ✅   | 부분 결과 표시, fallback 체인       |
| Streaming Response     | ✅   | AsyncGenerator 기반                 |
| Cancellation Support   | ✅   | AbortController 패턴                |
| Resource Cleanup       | ⚠️   | PromptLayer 메모리 누수             |
| Test Coverage          | ⚠️   | 일부 핵심 모듈 테스트 부족          |
| Performance            | ⚠️   | ProfilerService 대용량 파일 처리    |
| Code Modularity        | ⚠️   | ProfilerService 2,516줄             |
| Documentation          | ⚠️   | 인라인 주석, ADR 부족               |
| Logging                | ✅   | 구조화된 Logger 클래스              |
| i18n                   | ✅   | EN/KO 지원                          |
| License                | ✅   | MIT                                 |

---

## Priority Recommendations

### P0 (배포 전 필수)

1. **PromptLayer 메모리 누수 수정**: `window.addEventListener`에 대응하는 cleanup 추가
2. **ProfilerService 분리**: 최소한 파서 로직(Claude/Codex/Gemini)을 별도 클래스로 추출

### P1 (배포 직후 Sprint)

3. **테스트 커버리지 강화**: ProfilerService 파싱 로직, PreviewRuntimeBuilder 에러 시나리오, MCP 연결 edge case
4. **MCP Fallback 타임아웃 최적화**: 전체 fallback 체인의 총 타임아웃 상한 설정
5. **핸들러 base class 추출**: `post()` 메서드 등 공통 로직 DRY 원칙 적용

### P2 (중기 개선)

6. **UI 프레임워크 통일**: React 또는 Vanilla JS 중 하나로 수렴, 또는 명확한 경계 정의
7. **HTTP 클라이언트 통합**: `ClaudeAgent`, `GeminiAgent`의 `https.request()` 패턴을 공통 유틸로 추출
8. **JSDoc 추가**: 핵심 public API에 대한 문서 주석 추가
9. **E2E 테스트 CI 통합**: 현재 CI에서 제외된 E2E 테스트 추가

---

## Conclusion

iAgent Engineer는 **설계 품질이 높고 보안 고려가 잘 된 VS Code 확장**입니다. Strategy 패턴을 활용한 다중 LLM 프로바이더 추상화, Message 기반 Webview 통신, 그리고 견고한 에러 처리 체계가 특히 우수합니다.

프로덕션 배포를 위해서는 **PromptLayer 메모리 누수 수정**과 **ProfilerService 모듈 분리**가 가장 시급합니다. 이 두 가지를 해결하면 장기 운영 안정성과 유지보수성이 크게 향상될 것입니다.

현재 **7.5/10** 점수이며, P0 이슈 해결 시 **8.0**, P1까지 해결 시 **8.5** 수준으로 향상될 수 있습니다.
