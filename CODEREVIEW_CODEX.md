# CODEREVIEW_CODEX

## 총평

- 평가 점수: **6.5 / 10**
- 현재 판단: **상용 프로덕션 배포 보류 권고**

프로젝트의 기본 체력은 좋습니다. 계층 분리가 비교적 명확하고, 자동화 테스트가 매우 촘촘하며, 실제로 `npm run verify`도 통과했습니다. 다만 상용 배포 직전 기준으로 보면, 기능 완성도와 보안 경계에서 그냥 넘기기 어려운 항목들이 남아 있습니다. 특히 "문서상 지원"과 "실제 동작"이 어긋나는 원격 MCP 경로, 그리고 생성된 코드를 VS Code 웹뷰에서 실행하는 프리뷰 경로의 보안 모델은 출시 전에 정리돼야 합니다.

## 핵심 이슈

### 1. High: 런타임 프리뷰가 워크스페이스 파일을 번들에 포함해 외부로 유출할 수 있습니다

- 근거:
  - `src/editor/PreviewPanelService.ts:15-23` 에서 스크립트 실행이 가능한 웹뷰 패널을 엽니다.
  - `src/preview/PreviewRuntimeBuilder.ts:237-271` 에서 생성 코드의 상대/alias import를 해석하고, 로컬 파일을 `fs.readFileSync`로 읽어 번들에 포함합니다.
  - `src/preview/PreviewRuntimeBuilder.ts:350-352` 에서 `connect-src ... https:` 와 `script-src 'unsafe-inline'` 를 허용합니다.
- 문제:
  - 생성된 TSX가 악의적이거나 오염된 경우, 워크스페이스의 `ts/js/json` 파일을 import한 뒤 외부 HTTPS 엔드포인트로 전송할 수 있습니다.
  - 이 코드는 "미리보기" 기능을 통해 사용자가 상대적으로 경계심을 낮춘 상태에서 실행됩니다.
- 영향:
  - 저장소 내부 설정값, 토큰이 담긴 JSON, 사내 API endpoint 정의 등 민감 정보가 노출될 수 있습니다.
- 권고:
  - 런타임 프리뷰를 기본 비활성화하거나 opt-in으로 전환하십시오.
  - 프리뷰 번들러가 로컬 import를 따라가지 못하게 막고, 생성 코드 단일 파일만 렌더링하도록 제한하십시오.
  - 웹뷰 CSP에서 광범위한 `connect-src https:` 를 제거하십시오.
  - 정적 iframe 프리뷰를 기본값으로 두고, 스크립트 실행은 별도 안전 경로에서만 허용하는 편이 낫습니다.

### 2. High: 원격 MCP 기능이 문서와 설정에는 노출돼 있지만 실제 구현은 비활성화 상태입니다

- 근거:
  - `README.md:18`, `README.md:32`, `README.md:78`, `README.md:104-105` 에서 remote MCP가 지원되는 것처럼 안내합니다.
  - `src/webview/handlers/FigmaCommandHandler.ts:88-96` 에서 remote 모드 분기를 타지만,
  - `src/webview/handlers/FigmaCommandHandler.ts:119-149`, `src/webview/handlers/FigmaCommandHandler.ts:184-185`, `src/webview/handlers/FigmaCommandHandler.ts:193-195`, `src/webview/handlers/FigmaCommandHandler.ts:251-253` 에서 실제 동작은 모두 "coming soon" 처리입니다.
- 문제:
  - 사용자 기대와 실제 기능이 정면으로 충돌합니다.
  - 운영 환경에서 가장 비싼 장애는 "실패"가 아니라 "지원한다고 믿게 만든 뒤 안 되는 기능"입니다.
- 영향:
  - 고객 신뢰 하락, 지원 티켓 증가, 문서/마켓플레이스 설명 허위에 가까운 인상을 줄 수 있습니다.
- 권고:
  - 출시 전까지 remote MCP를 숨기거나 설정에서 제거하십시오.
  - 아니면 `RemoteFigmaAuthService` 와 `RemoteFigmaApiClient` 를 실제 연결해 end-to-end로 완성하십시오.
  - 최소한 README, 설정 설명, 릴리스 노트는 현재 상태와 정확히 맞춰야 합니다.

### 3. Medium-High: Worker의 OAuth token/refresh 엔드포인트가 사실상 공개 프록시 역할을 합니다

- 근거:
  - `workers/src/index.ts:15-35` 의 CORS 처리는 브라우저 제약일 뿐 인증이 아닙니다.
  - `workers/src/index.ts:62-66` 에서 `/api/figma/oauth/token`, `/api/figma/oauth/refresh` 를 별도 인증 없이 노출합니다.
  - `workers/src/routes/oauth.ts:223-295` 에서 요청 본문만 있으면 Figma OAuth 교환/갱신을 수행하고, 서버의 `FIGMA_CLIENT_SECRET` 권한을 그대로 사용합니다.
- 문제:
  - CORS는 서버-투-서버 호출을 막지 못합니다.
  - 현재 구현만 보면, 이 worker는 외부 클라이언트가 confidential client secret의 효력을 우회 사용하게 만드는 공개 proxy가 됩니다.
- 영향:
  - 원치 않는 토큰 교환/갱신 트래픽이 발생할 수 있고, 추후 abuse 대응이 어려워집니다.
- 권고:
  - 이 엔드포인트가 현재 제품에서 불필요하다면 삭제하십시오.
  - 필요하다면 signed nonce, one-time session binding, 허용된 호출자 검증 같은 서버측 인증 계층을 추가하십시오.
  - `Origin` 기반 처리만으로 보호된다고 가정하면 안 됩니다.

### 4. Medium: Source Data 다운로드 경로가 무제한 다운로드/지연 응답에 취약합니다

- 근거:
  - `src/figma/SourceDataService.ts:47-58` 에서 여러 URL을 순차 다운로드합니다.
  - `src/figma/SourceDataService.ts:94-117` 에서 응답 본문 전체를 메모리에 올리고, 이미지면 base64 thumbnail까지 만듭니다.
  - `src/figma/SourceDataService.ts:195-248` 에서 `curl -L` 만 사용하고 `--max-time`, `--max-filesize`, redirect 제한 같은 보호 장치가 없습니다.
- 문제:
  - 대용량 이미지/텍스트, 느린 서버, 긴 redirect chain, 비정상 응답이 들어오면 확장 host의 메모리/응답성이 크게 흔들릴 수 있습니다.
- 영향:
  - VS Code UI 멈춤, 임시 디스크 사용량 급증, 지원하기 어려운 간헐 장애로 이어질 수 있습니다.
- 권고:
  - 다운로드 시간, 크기, redirect 횟수 상한을 두십시오.
  - Figma/CDN 계열 호스트 allowlist가 가능하면 적용하십시오.
  - thumbnail 생성도 크기 제한 후 처리하는 편이 안전합니다.

### 5. Low: 배포 메타데이터의 스크린샷 파일 참조가 깨져 있습니다

- 근거:
  - `package.json:37`, `README.md:12`, `images/README.md:9` 는 `images/screenshot-3.png` 를 가리킵니다.
  - 실제 저장소 파일명은 `images/screentshot-3.png` 입니다.
- 문제:
  - README 이미지, VS Marketplace 메타데이터, 릴리스 검수 과정에서 바로 드러나는 마감 품질 이슈입니다.
- 권고:
  - 파일명 또는 참조를 하나로 통일하십시오.

## 긍정 포인트

- 단위 테스트 범위가 넓고, 핵심 핸들러/에이전트/프리뷰/worker 라우트까지 커버하고 있습니다.
- `SecretStorage` 사용, 설정/상태/핸들러 분리, 에디터 통합 추상화는 전체적으로 유지보수하기 좋은 방향입니다.
- `npm run verify` 기준으로 빌드, 린트, 단위 테스트, worker 타입체크가 모두 통과했습니다.

## 검증 결과

### 실행한 검증

- `npm ci`
- `npm --prefix workers ci`
- `npm run verify`
- `npm audit --omit=dev`
- `npm audit` in `workers/`

### 결과 요약

- `npm run verify`: 통과
- 루트 패키지 `npm audit --omit=dev`: 취약점 0건
- `workers/` 의 `npm audit`: 4건 보고
  - `wrangler@^3.99.0` 체인의 `esbuild`, `miniflare`, `undici` 관련 취약점
  - 이 부분은 런타임 애플리케이션 코드보다 배포/개발 도구 체인 리스크에 가깝지만, 상용 배포 파이프라인 관점에서는 정리하는 편이 좋습니다.

## 최종 판단

현재 저장소는 "테스트가 잘 갖춰진 유망한 베타/프리릴리스 수준"에 가깝고, 바로 상용 프로덕션으로 밀어 넣기에는 경계가 부족합니다. 특히 아래 2가지는 출시 전 필수 조치로 봅니다.

1. 원격 MCP 기능을 실제로 완성하거나, 배포 범위에서 완전히 제외할 것
2. 런타임 프리뷰의 보안 모델을 다시 설계할 것

이 두 축이 정리되면 점수는 빠르게 8점대까지 올라갈 수 있습니다. 현재 상태의 객관적 평가는 **6.5/10** 입니다.
