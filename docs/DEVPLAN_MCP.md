# MCP Connection Expansion Plan

## 목표

- `local`에서는 현재의 Desktop MCP 연결 방식을 유지한다.
- `remote`에서는 Figma OAuth 로그인 후 REST API로 동일 기능을 제공한다.
- 이번 범위의 동일 기능은 아래에 한정한다.
  - 연결 상태 확인
  - 디자인 데이터 가져오기
  - 스크린샷 가져오기
- 이번 범위는 `remote MCP transport 직접 구현`이나 `agent의 direct MCP tool call`을 포함하지 않는다.

## 구현 원칙

- UI는 `local / remote` 두 모드를 명확히 구분하되 사용 흐름은 최대한 동일하게 유지한다.
- host가 local/remote 결과를 정규화해서 webview는 같은 방식으로 렌더링한다.
- `local = MCP`, `remote = OAuth + REST`를 명확히 분리한다.

## 현재 상태

### 완료

- Setup 패널에 `local / remote` 선택 UI 추가
- `local`에서는 `Connect`, `remote`에서는 `Auth Login` 액션 분기
- remote OAuth callback 처리
- access token / refresh token 저장
- remote 연결 상태 확인
- remote 데이터/스크린샷 API 연동
- 전용 OAuth Worker 추가
- 관련 설정 키 및 기본값 추가

### 미완료

- token refresh
- local/remote 응답 정규화
- publish/release 이후 실제 사용자 환경에서의 remote smoke test 누적

## 권장 구조

### Local

- 기존 [`src/figma/McpClient.ts`](/Users/birdea/workspace/vscode-iagent-engineer/src/figma/McpClient.ts) 유지
- Desktop MCP endpoint에 연결

### Remote

- `RemoteFigmaAuthService`
  - 로그인 시작
  - callback 처리
  - token 저장/복구
  - refresh
- `RemoteFigmaApiClient`
  - 연결 상태 확인
  - 디자인 데이터 조회
  - 스크린샷 조회

### Handler

- [`src/webview/handlers/FigmaCommandHandler.ts`](/Users/birdea/workspace/vscode-iagent-engineer/src/webview/handlers/FigmaCommandHandler.ts)에서 mode 분기
  - `local`: 기존 MCP 경로
  - `remote`: 인증 상태 확인 후 REST 호출

## 단계별 계획

### Phase 1. UI 정리

- `local / remote` 상태 문구와 가이드를 정리한다.
- remote는 OAuth 기준의 안내 문구로 맞춘다.

### Phase 2. OAuth 기반 인증

- login 시작
- callback 처리
- state 검증
- access token / refresh token 저장

### Phase 3. Remote 연결 상태

- 인증 완료 후 status API로 연결 상태 확인
- 성공 시 connected 상태로 전환
- 실패 또는 만료 시 재로그인 유도

### Phase 4. Remote 데이터 연동

- Figma URL에서 `fileKey`, `nodeId` 추출
- REST API로 디자인 데이터 조회
- 현재 preview 흐름과 맞도록 응답 정규화

### Phase 5. Remote 스크린샷 연동

- REST API로 이미지 조회
- 현재 screenshot preview/editor 흐름과 연결

## v0.3.0 결과

- 이번 릴리즈에서 `remote = OAuth + REST` 최소 동작 경로가 구현되었다.
- 사용자는 기본 제공 Worker를 통해 브라우저 로그인 후 VS Code로 복귀할 수 있다.
- remote 모드에서 연결 상태 확인, 디자인 데이터 조회, 스크린샷 조회가 가능하다.
- 현재 남은 핵심 과제는 refresh, 응답 정규화 고도화, 운영 안정화다.

## 핵심 결정 사항

- 현재 요구 범위에는 `remote direct MCP`보다 `OAuth + REST`가 적합하다.
- 목표는 `remote에서도 local과 같은 기능 제공`이다.
- `ifigmalab` 경험상 OAuth 흐름과 token 관리 구조는 재사용 가능하다.
- 다만 OAuth 일반론과 별개로, `Figma OAuth가 public client의 PKCE-only token exchange를 허용하는지`는 아직 확인되지 않았다.
- 만약 Figma가 token exchange 시 `client_secret`를 요구한다면 extension 단독 구현은 어렵다.

## 확인 필요

- Figma OAuth가 VS Code extension 같은 public client에 대해 `client_secret` 없이 token exchange를 허용하는지
- 허용하지 않는다면 기존 `ifigmalab` Worker 같은 별도 backend를 재사용할지
- callback을 어떤 방식으로 받을지
- remote에서 사용할 최소 REST API 집합
- local/remote 응답 정규화 규칙

## 리스크

- Figma가 public client의 PKCE-only token exchange를 허용하지 않으면 별도 backend 또는 중계 계층이 필요하다.
- callback 방식이 확정되지 않으면 remote auth 구현이 중간 단계에서 멈춘다.
- local과 remote 응답 shape 차이로 preview 품질 차이가 생길 수 있다.

## 테스트 계획

- 단위 테스트
  - mode 선택 UI
  - remote auth 시작/실패
  - token 없음/만료/refresh 분기
  - remote fetch/screenshot 정규화
- 통합 테스트
  - callback 후 connected 전환
  - remote data fetch
  - remote screenshot
- E2E 테스트
  - `local connect -> fetch -> screenshot`
  - `remote login -> connected -> fetch -> screenshot`

## 릴리즈 체크

- `npm run lint`
- `npm run test:coverage`
- `npm run build`
- `npm run typecheck` in `workers/`

## 참고

- Figma remote server docs: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/
- Figma desktop server docs: https://developers.figma.com/docs/figma-mcp-server/local-server-installation/
- ifigmalab OAuth flow: [`/Users/birdea/workspace/ifigmalab/src/services/figmaOAuth.ts`](/Users/birdea/workspace/ifigmalab/src/services/figmaOAuth.ts)
- ifigmalab auth hook: [`/Users/birdea/workspace/ifigmalab/src/hooks/useFigmaAuth.ts`](/Users/birdea/workspace/ifigmalab/src/hooks/useFigmaAuth.ts)
