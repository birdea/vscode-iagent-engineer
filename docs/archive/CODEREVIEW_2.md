# 상용 소프트웨어 코드 리뷰 보고서

**프로젝트:** Figma MCP Helper (VS Code Extension)
**버전:** 0.1.3
**리뷰 일자:** 2026-03-08
**리뷰어:** 전문 소프트웨어 관리자 관점
**평가 기준:** 상용 소프트웨어(Commercial Software) 출시 수준

---

## 1. 종합 평가

| 항목            | 점수       | 등급   |
| --------------- | ---------- | ------ |
| 아키텍처 설계   | 8.5/10     | A      |
| 타입 안전성     | 9.0/10     | A+     |
| 에러 처리       | 7.5/10     | B+     |
| 보안            | 8.0/10     | A      |
| 테스트 커버리지 | 8.0/10     | A      |
| 코드 품질       | 8.5/10     | A      |
| 리소스 관리     | 8.0/10     | A      |
| 국제화(i18n)    | 9.0/10     | A+     |
| CI/CD           | 7.0/10     | B      |
| 문서화          | 6.0/10     | C+     |
| 상용화 준비도   | 6.5/10     | C+     |
| **종합**        | **7.5/10** | **B+** |

**판정:** 베타 품질. 상용 출시 전 중요 개선 필요.

---

## 2. 아키텍처 분석

### 2.1 현재 아키텍처 (강점)

```
Extension Host (Node.js)          Webview (Browser)
┌─────────────────────────┐       ┌──────────────────────┐
│ extension.ts (진입점)     │       │ main.ts (진입점)      │
│   ├─ SidebarProvider ×3 │◄─────►│   ├─ FigmaLayer      │
│   ├─ WebviewMsgHandler  │ post  │   ├─ AgentLayer      │
│   │   ├─ FigmaHandler   │Message│   ├─ PromptLayer     │
│   │   ├─ AgentHandler   │       │   └─ LogLayer        │
│   │   └─ PromptHandler  │       └──────────────────────┘
│   ├─ McpClient (JSON-RPC)│
│   ├─ AgentFactory       │
│   │   ├─ GeminiAgent    │
│   │   └─ ClaudeAgent    │
│   ├─ StateManager       │
│   └─ Logger (Singleton)  │
└─────────────────────────┘
```

**긍정 평가:**

- **관심사 분리(SoC):** Handler/Agent/UI 계층이 명확히 분리됨
- **메시지 기반 IPC:** 느슨한 결합(loose coupling)으로 Extension ↔ Webview 통신
- **Discriminated Union Types:** `WebviewToHostMessage`, `HostToWebviewMessage`로 타입 안전한 메시지 라우팅
- **Factory 패턴:** `AgentFactory`로 Agent 인스턴스 싱글톤 관리
- **Circular Buffer Logger:** 고정 메모리 O(1) append 성능

### 2.2 아키텍처 문제점

| ID     | 문제                                                            | 심각도 | 위치                              |
| ------ | --------------------------------------------------------------- | ------ | --------------------------------- |
| ARCH-1 | McpClient 버전 하드코딩 (`0.1.0`) — package.json과 불일치       | MEDIUM | `McpClient.ts:44`                 |
| ARCH-2 | `deactivate()` 에서 ScreenshotService 임시 파일 정리 누락       | HIGH   | `extension.ts:112-116`            |
| ARCH-3 | WebviewMessageHandler가 모든 도메인 커맨드를 단일 switch로 처리 | LOW    | `WebviewMessageHandler.ts:60-115` |
| ARCH-4 | ClaudeAgent에 `dangerouslyAllowBrowser: true` 사용              | MEDIUM | `ClaudeAgent.ts:48`               |

---

## 3. 버그 및 결함 분석

### 3.1 확인된 버그

#### BUG-1: esbuild 타겟 버전 불일치 (HIGH)

```
// esbuild.config.js:18
target: 'node18'  // ← Node 18 타겟

// package.json engines
"node": ">=20.0.0"  // ← Node 20 이상 요구

// .github/workflows/ci.yml
node-version: [20, 22]  // ← Node 18 제거됨
```

**영향:** Node 18 폴리필이 불필요하게 포함되거나, Node 20+ 전용 API 사용 시 빌드 타겟과 런타임 불일치 가능.
**수정:** `target: 'node20'`으로 변경.

#### BUG-2: Extension deactivate 시 리소스 미정리 (HIGH)

```typescript
// extension.ts:112-116
export function deactivate() {
  Logger.info('system', 'Figma MCP Helper deactivated');
  AgentFactory.clear();
  Logger.clear();
  // ❌ ScreenshotService 임시 파일 정리 없음
  // ❌ SidebarProvider.dispose() 호출 없음
  // ❌ OutputChannel.dispose() 호출 없음
}
```

**영향:** 익스텐션 비활성화 시 OS tmpdir에 스크린샷 파일이 영구 잔류. 반복 사용 시 디스크 점유량 누적.

#### BUG-3: McpClient 버전 하드코딩 (MEDIUM)

```typescript
// McpClient.ts:42-45
private readonly clientInfo: { name: string; version: string } = {
  name: 'vscode-figmalab',
  version: '0.1.0',  // ← 하드코딩. package.json은 0.1.3
}
```

**참고:** `WebviewMessageHandler.ts:31`에서 `extensionVersion`을 올바르게 전달하고 있으나, McpClient의 기본값이 여전히 `0.1.0`.

#### BUG-4: ClaudeAgent max_tokens 하드코딩 (MEDIUM)

```typescript
// ClaudeAgent.ts:102-103
max_tokens: 8192,  // ← 하드코딩
```

**영향:** 모델별 `outputTokenLimit` 값이 `ModelInfo`에 정의되어 있으나 실제 생성 시 무시됨. Claude Opus 4.6은 32K 출력을 지원하나 8192로 제한.

#### BUG-5: Gemini API 호출 시 `https.get` 사용으로 메서드 불일치 (LOW)

```typescript
// GeminiAgent.ts:51-52
const req = https.get(options, (res) => {  // GET 메서드 사용
```

현재 Gemini Models API가 GET을 지원하므로 동작하나, `options`에 `method: 'GET'`이 명시되어 있어 `https.request`와 일관성 없음. 향후 API 변경 시 혼동 가능.

### 3.2 잠재적 결함

| ID    | 설명                                                                             | 심각도 | 위치                            |
| ----- | -------------------------------------------------------------------------------- | ------ | ------------------------------- |
| POT-1 | 스트림 중단 시 부분 코드 감지 미비 — 불완전한 코드가 `prompt.result`로 전송 가능 | HIGH   | `PromptCommandHandler.ts:69-80` |
| POT-2 | `getImage()` 빈 문자열 반환 시 UI에서 깨진 이미지 표시                           | MEDIUM | `McpClient.ts:174`              |
| POT-3 | Gemini 모델 정렬이 `localeCompare` — 시멘틱 버전 정렬이 아님                     | LOW    | `GeminiAgent.ts:82`             |
| POT-4 | AbortController가 Gemini SDK `generateContentStream`에 전달되지 않음             | MEDIUM | `GeminiAgent.ts:125`            |

---

## 4. 보안 분석

### 4.1 보안 강점

| 항목               | 구현 상태                                    | 평가    |
| ------------------ | -------------------------------------------- | ------- |
| API 키 저장        | VS Code Secrets Store (OS 암호화)            | ✅ 우수 |
| CSP 정책           | `script-src 'nonce-*'`, `default-src 'none'` | ✅ 우수 |
| 입력 검증          | fileId/nodeId 정규식 정제, 길이 제한         | ✅ 우수 |
| JSON-RPC 응답 검증 | `isJsonRpcResponse()` 형태 검사              | ✅ 우수 |
| 프로토콜 검증      | http/https만 허용                            | ✅ 우수 |
| 파일 경로 정제     | `sanitizePathSegment()` 특수문자 제거        | ✅ 우수 |

### 4.2 보안 취약점

| ID    | 취약점                                                                | 심각도 | OWASP | 위치                        |
| ----- | --------------------------------------------------------------------- | ------ | ----- | --------------------------- |
| SEC-1 | API 키 형식 미검증 — 빈 문자열 저장 가능                              | MEDIUM | A07   | `AgentCommandHandler`       |
| SEC-2 | MCP 엔드포인트 URL 검증 부재 — 사설 IP 접근 가능 (SSRF)               | MEDIUM | A10   | `FigmaCommandHandler.ts:28` |
| SEC-3 | `innerHTML` 사용 — 현재는 안전하나 향후 동적 콘텐츠 추가 시 XSS 위험  | LOW    | A03   | UI 컴포넌트 전체            |
| SEC-4 | HTTP(비암호화) MCP 통신 기본값                                        | LOW    | A02   | `constants.ts:27`           |
| SEC-5 | `dangerouslyAllowBrowser: true` — 웹뷰 브라우저 컨텍스트에서 SDK 사용 | LOW    | -     | `ClaudeAgent.ts:48`         |

### 4.3 상용화 필수 보안 조치

1. **API 키 형식 검증**: Gemini(`AIza...`) / Claude(`sk-ant-...`) 접두사 패턴 확인
2. **MCP 엔드포인트 허용 목록**: localhost/127.0.0.1만 기본 허용, 외부 호스트는 사용자 확인
3. **innerHTML → textContent/DOM API**: XSS 방지를 위한 안전한 DOM 조작으로 전환
4. **Rate Limiting**: API 호출 빈도 제한 (키 노출 시 과금 폭주 방지)

---

## 5. 에러 처리 분석

### 5.1 에러 계층 구조 (강점)

```typescript
// errors.ts — 잘 설계된 커스텀 에러 계층
NetworkError   (code: 'NETWORK_ERROR', cause 추적)
TimeoutError   (code: 'TIMEOUT_ERROR')
ValidationError (code: 'VALIDATION_ERROR')
UserCancelledError (code: 'USER_CANCELLED')
```

### 5.2 에러 처리 문제점

| ID    | 문제                                                                                                                                 | 심각도 | 위치                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------- |
| ERR-1 | `WebviewMessageHandler.handle()` catch에서 에러 이벤트를 보내지만, 개별 핸들러도 자체적으로 에러 이벤트를 보냄 → 이중 에러 전송 가능 | HIGH   | `WebviewMessageHandler.ts:116-120` |
| ERR-2 | `McpClient.initialize()` catch에서 모든 에러를 `false`로 삼킴 — 네트워크 에러와 프로토콜 에러 구분 불가                              | MEDIUM | `McpClient.ts:139-142`             |
| ERR-3 | 모든 `(e as Error).message` 패턴 — `unknown` 타입 에러를 안전하게 처리하지 않음                                                      | MEDIUM | 코드베이스 전체                    |
| ERR-4 | 네트워크 재시도(retry) 로직 없음 — 일시적 네트워크 장애 시 즉시 실패                                                                 | MEDIUM | McpClient, Agent 전체              |
| ERR-5 | 스트림 생성 중 부분 실패 시 이미 전송된 chunk를 롤백하지 않음                                                                        | MEDIUM | `PromptCommandHandler.ts:69-77`    |

### 5.3 권장 에러 처리 개선

```typescript
// 안전한 에러 추출 유틸리티 추가 권장
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Unknown error';
}

// 재시도 로직 추가 권장
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}
```

---

## 6. 성능 분석

### 6.1 성능 문제

| ID     | 문제                                                                                      | 심각도 | 영향              |
| ------ | ----------------------------------------------------------------------------------------- | ------ | ----------------- |
| PERF-1 | 코드 생성 스트리밍 시 매 chunk마다 2개 메시지 전송 (`prompt.generating` + `prompt.chunk`) | MEDIUM | IPC 오버헤드      |
| PERF-2 | UI에서 chunk 누적 렌더링 시 `textContent +=` 패턴 — 대용량 코드 시 O(n²) 성능             | MEDIUM | UI 프리징         |
| PERF-3 | Gemini 모델 목록 API 호출이 동기적 HTTPS — 대기 중 UI 블로킹 없으나 타임아웃 10초         | LOW    | UX 지연           |
| PERF-4 | `Logger.getEntries()`가 매번 배열 필터링 수행                                             | LOW    | 로그 다량 시 성능 |

### 6.2 권장 성능 최적화

1. **Chunk 배치 처리**: 50ms debounce로 chunk를 모아 한 번에 전송
2. **가상 스크롤**: 대용량 코드 출력 시 가상화된 텍스트 뷰 사용
3. **문자열 빌더**: `Array.push()` + `join()` 패턴으로 문자열 연결 최적화

---

## 7. 테스트 분석

### 7.1 현재 테스트 커버리지

```
전체: 97.78% statements, 85.52% branches, 97.22% functions
소스(src/): 95.42% statements, 87.50% branches
```

### 7.2 테스트 갭(Gap)

| 영역               | 현재 상태                 | 상용화 요구              |
| ------------------ | ------------------------- | ------------------------ |
| 단위 테스트        | 14개 파일, 주요 모듈 커버 | ✅ 충분                  |
| 통합 테스트        | 1개 E2E 파일 (제한적)     | ❌ 확장 필요             |
| UI 컴포넌트 테스트 | DOM 상호작용 제한적       | ❌ 확장 필요             |
| 브랜치 커버리지    | 85.52%                    | ⚠️ 90% 이상 권장         |
| 에러 경로 테스트   | 주요 경로 커버            | ⚠️ 엣지 케이스 추가 필요 |
| 스트림 중단 테스트 | 미비                      | ❌ 필수 추가             |
| 동시성 테스트      | 없음                      | ❌ 필수 추가             |
| 보안 테스트        | 없음                      | ❌ 필수 추가             |

### 7.3 상용화 필수 테스트 추가

1. **스트림 중단 시나리오**: 생성 중 취소, 네트워크 단절, 부분 응답
2. **동시 요청 테스트**: 여러 패널에서 동시 생성 요청
3. **입력 퍼징(Fuzzing)**: 악의적/비정상 Figma URL, 초대형 JSON 페이로드
4. **메모리 누수 테스트**: 장시간 사용 시 Logger/ScreenshotService 메모리 프로파일링
5. **API 키 보안 테스트**: 빈 키, 만료 키, 잘못된 형식 키 처리

---

## 8. CI/CD 분석

### 8.1 현재 파이프라인 평가

| 항목                | 상태                           | 상용화 요구 |
| ------------------- | ------------------------------ | ----------- |
| 빌드 검증           | ✅ Node 20, 22 매트릭스        | 충분        |
| 린트 검사           | ✅ ESLint + Prettier           | 충분        |
| 테스트 실행         | ✅ 커버리지 포함               | 충분        |
| 릴리스 자동화       | ✅ 태그 기반 마켓플레이스 배포 | 기본 수준   |
| 커버리지 게이트     | ❌ 없음                        | 필수 추가   |
| 보안 스캐닝         | ❌ 없음                        | 필수 추가   |
| CHANGELOG 자동화    | ⚠️ 스크립트만 존재, CI 미연동  | 권장        |
| GitHub Release 생성 | ❌ 없음                        | 권장        |
| E2E 테스트 CI       | ❌ 없음                        | 권장        |

### 8.2 상용화 필수 CI/CD 개선

1. **커버리지 게이트**: 브랜치 커버리지 85% 미만 시 PR 차단
2. **보안 스캐닝**: `npm audit`, CodeQL, Dependabot 알림 활성화
3. **GitHub Release**: VSIX 아티팩트 + CHANGELOG 포함 자동 릴리스
4. **Canary 배포**: 프리릴리스 채널로 마켓플레이스 베타 배포
5. **서명(Signing)**: VSIX 패키지 서명으로 무결성 검증

---

## 9. 코드 품질 세부 분석

### 9.1 강점

- **`any` 타입 사용 없음**: 소스 코드에서 `as any` 미사용 (테스트 제외)
- **`console.log` 미사용**: Logger 추상화 일관 사용
- **명시적 타입 정의**: Discriminated union으로 메시지 타입 안전성 확보
- **상수 중앙 관리**: `constants.ts`에 매직 넘버 제거
- **깔끔한 모듈 구조**: 단일 책임 원칙(SRP) 준수
- **적절한 캐싱**: Gemini 모델 목록 5분 TTL 캐시

### 9.2 개선 필요 항목

| ID   | 항목                                                         | 위치               | 설명                       |
| ---- | ------------------------------------------------------------ | ------------------ | -------------------------- |
| QA-1 | ESLint `no-explicit-any`가 warn이 아닌 error여야 함          | `eslint.config.js` | 상용 코드에서 `any` 차단   |
| QA-2 | `no-console` 규칙이 off — extension에서는 Logger 사용이 원칙 | `eslint.config.js` | `no-console: error`로 변경 |
| QA-3 | `TOKEN_ESTIMATE_DIVISOR = 4` 매직 넘버에 설명 주석 부재      | `constants.ts:37`  | 토큰 추정 공식 문서화      |
| QA-4 | `parseFloat` / `parseInt` 미사용으로 `Number()` 직접 변환    | 일부 위치          | 일관성 유지 필요           |

---

## 10. 상용화 로드맵

### Phase 1: 긴급 수정 (P0 — 출시 차단)

> 예상 작업량: 소규모
> 우선순위: **즉시 수정**

| #   | 작업                                  | 파일                               | 상세                                             |
| --- | ------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| 1.1 | esbuild 타겟 `node18` → `node20` 변경 | `esbuild.config.js:18`             | CI와 일치시키기                                  |
| 1.2 | `deactivate()` 리소스 정리 구현       | `extension.ts:112-116`             | ScreenshotService cleanup, OutputChannel dispose |
| 1.3 | McpClient 기본 버전 하드코딩 제거     | `McpClient.ts:44`                  | package.json에서 동적 로드 또는 제거             |
| 1.4 | 이중 에러 이벤트 전송 방지            | `WebviewMessageHandler.ts:116-120` | 핸들러 레벨에서 에러 처리 시 상위 catch 스킵     |
| 1.5 | 스트림 중단 시 부분 코드 표시 처리    | `PromptCommandHandler.ts:69-80`    | 불완전 코드 경고 또는 폐기 로직                  |

### Phase 2: 보안 강화 (P1 — 출시 전 필수)

> 예상 작업량: 중간
> 우선순위: **출시 1주 전까지**

| #   | 작업                              | 상세                                                      |
| --- | --------------------------------- | --------------------------------------------------------- |
| 2.1 | API 키 형식 검증 추가             | 빈 문자열, 잘못된 접두사 거부                             |
| 2.2 | MCP 엔드포인트 URL 허용 목록      | 기본 localhost만 허용, 외부 호스트 사용자 확인 다이얼로그 |
| 2.3 | `innerHTML` → 안전한 DOM API 전환 | `createElement` + `textContent` 패턴으로 교체             |
| 2.4 | CI에 `npm audit` 추가             | 취약 의존성 자동 감지                                     |
| 2.5 | 에러 메시지에서 민감 정보 제거    | API 키, 내부 경로 등 사용자 에러 메시지에서 마스킹        |
| 2.6 | Rate limiting 구현                | API 호출 빈도 제한 (예: 분당 10회)                        |

### Phase 3: 안정성 강화 (P1 — 출시 전 권장)

> 예상 작업량: 중간
> 우선순위: **출시 2주 전까지**

| #   | 작업                            | 상세                                            |
| --- | ------------------------------- | ----------------------------------------------- |
| 3.1 | 네트워크 재시도 로직 추가       | 지수 백오프(exponential backoff) 적용, 최대 3회 |
| 3.2 | ClaudeAgent `max_tokens` 동적화 | `ModelInfo.outputTokenLimit` 값 사용            |
| 3.3 | Gemini AbortSignal 전달         | `generateContentStream`에 signal 옵션 전달      |
| 3.4 | 안전한 에러 추출 유틸리티 도입  | `toErrorMessage(e: unknown)` 패턴 통일          |
| 3.5 | 브랜치 커버리지 90%+ 달성       | 에러 경로, 엣지 케이스 테스트 보강              |
| 3.6 | 스트림 중단/동시성 테스트 추가  | 취소, 타임아웃, 중복 요청 시나리오              |
| 3.7 | Chunk 배치 전송 최적화          | IPC 오버헤드 감소 (50ms debounce)               |

### Phase 4: 상용 품질 고도화 (P2 — 출시 후 이터레이션)

> 예상 작업량: 대규모
> 우선순위: **출시 후 1-2개월**

| #    | 작업                          | 상세                                            |
| ---- | ----------------------------- | ----------------------------------------------- |
| 4.1  | 텔레메트리/분석 통합          | VS Code Telemetry API 사용, 익명 사용 패턴 수집 |
| 4.2  | 에러 리포팅 서비스 연동       | Sentry 등 크래시 리포팅                         |
| 4.3  | E2E 테스트 CI 파이프라인 구축 | VS Code Extension Test 실행 환경 구성           |
| 4.4  | GitHub Release 자동 생성      | CHANGELOG + VSIX 아티팩트 첨부                  |
| 4.5  | 프리릴리스 채널 운영          | 마켓플레이스 pre-release 버전 배포              |
| 4.6  | VSIX 서명                     | 패키지 무결성 검증                              |
| 4.7  | 접근성(a11y) 감사             | WCAG 2.1 AA 기준 웹뷰 접근성 검증               |
| 4.8  | 성능 프로파일링               | 대규모 Figma 데이터 처리 시 메모리/CPU 프로파일 |
| 4.9  | 추가 Agent 지원               | OpenAI GPT, Amazon Bedrock 등 확장              |
| 4.10 | 사용자 문서                   | 마켓플레이스 상세 페이지, 가이드 문서, FAQ      |

### Phase 5: 엔터프라이즈 기능 (P3 — 장기 계획)

> 예상 작업량: 대규모
> 우선순위: **출시 후 3-6개월**

| #   | 작업                   | 상세                                                 |
| --- | ---------------------- | ---------------------------------------------------- |
| 5.1 | 팀 설정 공유           | `.figmalab.json` 프로젝트 레벨 설정                  |
| 5.2 | 커스텀 프롬프트 템플릿 | 사용자 정의 출력 형식 + 프롬프트 저장/로드           |
| 5.3 | 디자인 토큰 추출       | Figma 변수/스타일 → CSS 변수/Tailwind 테마 자동 변환 |
| 5.4 | 다중 파일 생성         | 컴포넌트 분할 출력 (예: TSX + CSS + test 동시 생성)  |
| 5.5 | 히스토리/버전 관리     | 생성 이력 저장, diff 비교, 롤백                      |
| 5.6 | Figma Plugin 연동      | MCP 서버 없이 Figma Plugin으로 직접 연동             |
| 5.7 | 오프라인 모드          | 캐시된 Figma 데이터로 로컬 생성                      |

---

## 11. 코드 수정 상세 명세

### 11.1 [P0] esbuild 타겟 수정

**파일:** `esbuild.config.js`

```diff
- target: 'node18',
+ target: 'node20',
```

### 11.2 [P0] Extension deactivate 리소스 정리

**파일:** `extension.ts`

```diff
+ // deactivate에서 호출할 수 있도록 provider 참조 보관
+ const providers = [setupProvider, promptProvider, logProvider];
+
  export function deactivate() {
    Logger.info('system', 'Figma MCP Helper deactivated');
+   // 모든 SidebarProvider의 WebviewMessageHandler 정리
+   // (ScreenshotService 임시 파일 삭제 포함)
    AgentFactory.clear();
    Logger.clear();
  }
```

**참고:** 현재 구조상 `deactivate()`가 `activate()` 스코프 밖에 있어 provider 참조에 접근 불가. 모듈 레벨 변수로 리팩터링 필요.

### 11.3 [P0] 이중 에러 이벤트 방지

**파일:** `WebviewMessageHandler.ts`

```diff
  } catch (e) {
    const err = e as Error;
+   // 핸들러가 이미 자체적으로 에러 이벤트를 보냈는지 확인
+   // 핸들러 레벨 에러 이벤트와 중복 방지
-   this.post({ event: 'error', source, message: err.message });
+   if (!(err instanceof HandledError)) {
+     this.post({ event: 'error', source, message: err.message });
+   }
    Logger.error('system', err.message);
  }
```

**또는** 각 핸들러가 에러를 직접 UI로 보내지 않고 throw하도록 통일.

### 11.4 [P1] API 키 형식 검증

```typescript
// 새로운 유틸리티 함수 추가
function validateApiKeyFormat(agent: AgentType, key: string): boolean {
  if (!key || key.trim().length === 0) return false;
  if (agent === 'gemini' && !key.startsWith('AIza')) return false;
  if (agent === 'claude' && !key.startsWith('sk-ant-')) return false;
  return true;
}
```

### 11.5 [P1] 안전한 에러 추출

```typescript
// errors.ts에 추가
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'An unexpected error occurred';
}
```

코드베이스 전체의 `(e as Error).message`를 `toErrorMessage(e)`로 교체.

---

## 12. 의존성 감사

### 12.1 런타임 의존성 (3개)

| 패키지                  | 버전    | 위험 | 비고                |
| ----------------------- | ------- | ---- | ------------------- |
| `@anthropic-ai/sdk`     | ^0.78.0 | LOW  | 최신 버전 유지 필요 |
| `@google/generative-ai` | ^0.24.1 | LOW  | 최신 버전 유지 필요 |
| `@vscode/codicons`      | ^0.0.44 | LOW  | 안정적              |

### 12.2 주목할 사항

- **`serialize-javascript` 오버라이드**: `^7.0.4`로 강제 — 과거 보안 취약점(CVE) 대응으로 추정
- **모든 의존성이 caret(`^`) 범위**: 마이너/패치 자동 업데이트 허용. 상용 환경에서는 `package-lock.json` 커밋 + `npm ci` 사용으로 재현성 보장 필요
- **`module-alias`**: 경로 별칭 — 런타임 의존성이나 테스트 전용으로 보임. 프로덕션 번들에 불필요한 포함 여부 확인 필요

---

## 13. 문서화 현황

| 항목            | 상태                | 상용화 요구                                 |
| --------------- | ------------------- | ------------------------------------------- |
| README.md       | ✅ 존재             | 마켓플레이스 상세 설명 보강 필요            |
| CHANGELOG.md    | ⚠️ 존재 여부 미확인 | 필수 — conventional-changelog 스크립트 활용 |
| CONTRIBUTING.md | ❌ 없음             | 오픈소스 시 필수                            |
| API 문서        | ❌ 없음             | Agent 인터페이스 확장 시 필수               |
| 사용자 가이드   | ❌ 없음             | 마켓플레이스 배포 시 필수                   |
| SECURITY.md     | ✅ 존재             | 충분                                        |
| LICENSE         | ✅ MIT              | 충분                                        |

---

## 14. 최종 권고

### 즉시 조치 (출시 차단)

1. esbuild 타겟 버전 수정 (5분)
2. `deactivate()` 리소스 정리 구현 (2시간)
3. 이중 에러 이벤트 방지 (1시간)
4. 스트림 중단 시 부분 코드 처리 (2시간)

### 단기 조치 (출시 1주 전)

5. API 키 형식 검증 (1시간)
6. 안전한 에러 추출 유틸리티 도입 (2시간)
7. `max_tokens` 동적화 (30분)
8. CI에 `npm audit` 추가 (30분)
9. 브랜치 커버리지 90%+ 달성 (1일)

### 중기 조치 (출시 후 1개월)

10. 재시도 로직 도입
11. 텔레메트리 연동
12. E2E 테스트 CI 구축
13. 사용자 문서 작성
14. 성능 최적화 (chunk 배치, DOM 가상화)

### 결론

이 프로젝트는 **아키텍처 설계, 타입 안전성, 코드 조직화** 면에서 우수한 수준을 보여줍니다. 특히 discriminated union 기반의 메시지 타입 시스템과 커스텀 에러 계층은 상용 소프트웨어의 모범 사례입니다. 그러나 **리소스 정리, 에러 처리 일관성, 보안 검증, CI/CD 성숙도** 측면에서 상용 출시 전 개선이 필요합니다. Phase 1-2를 완료하면 마켓플레이스 정식 출시가 가능한 수준에 도달할 것으로 판단됩니다.
