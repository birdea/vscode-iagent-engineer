# CODE REVIEW

검토 기준: 상용 프로젝트 수준의 안정성, 설정 신뢰성, 보안성, 유지보수성  
검토 일자: 2026-03-11  
실행 확인: `npm test` 기준 unit test `413 passing`

## 종합 평가

완성도 평점: **6.8 / 10**

이 프로젝트는 구조 분리가 비교적 명확하고, 테스트 밀도도 높으며, VS Code extension 특성에 맞춘 UX 디테일도 꽤 잘 다듬어져 있습니다. 다만 상용 릴리스 기준으로 보면 "겉으로는 정상 동작하지만 실제 상태는 틀어지는" 종류의 문제들이 남아 있습니다. 특히 API 키 lifecycle, 설정값 신뢰성, prompt 입력 상태의 의미 보존이 아직 상용 수준으로 닫히지 않았습니다.

현재 상태는 "기능 데모/초기 공개" 수준으로는 충분히 인상적이지만, 유료 사용자나 팀 단위 사용을 상정한 상용 품질로 보기는 이릅니다.

## 주요 Findings

### 1. High - 삭제되었거나 임시 입력된 API 키가 메모리에 계속 살아 있어, 사용자 기대와 다른 인증 상태로 계속 동작합니다

- 관련 위치:
  - `src/agent/AgentFactory.ts:7`
  - `src/webview/handlers/AgentCommandHandler.ts:97`
  - `src/webview/handlers/AgentCommandHandler.ts:107`
  - `src/webview/handlers/PromptCommandHandler.ts:48`
- 문제:
  - `AgentFactory`는 provider별 agent 인스턴스를 singleton으로 캐시합니다.
  - `listModels()`는 저장하지 않은 runtime key를 agent 인스턴스에 그대로 주입합니다.
  - `clearSettings()`는 secret storage만 지우고, 이미 메모리에 올라간 agent의 `apiKey`는 비우지 않습니다.
  - 이후 `generate()`는 저장된 secret이 없으면 새로 key를 설정하지 않고, 기존 singleton 인스턴스를 그대로 사용합니다.
- 결과:
  - 사용자가 "저장하지 않은 임시 키"로 모델 목록만 조회해도, 그 키가 이후 생성 요청에 계속 사용될 수 있습니다.
  - 사용자가 설정을 clear한 뒤에도 extension reload 전까지는 실제로는 이전 키로 요청이 성공할 수 있습니다.
  - UI의 `hasApiKey=false` 상태와 실제 런타임 인증 상태가 불일치합니다.
- 상용 관점:
  - 인증/비밀정보 lifecycle이 UI와 다르게 움직이면 운영 이슈, 보안 이슈, 장애 분석 난이도가 급격히 올라갑니다.
  - "키를 지웠는데 왜 아직 호출되느냐"는 유형은 상용 제품에서 신뢰를 크게 깎는 결함입니다.
- 권장 수정:
  - `clearSettings()`에서 해당 agent 인스턴스의 API key도 명시적으로 초기화해야 합니다.
  - runtime key는 모델 조회용 ephemeral context로만 쓰고, agent singleton에 영구 주입하지 않도록 분리하는 편이 안전합니다.
  - 이 동작을 검증하는 회귀 테스트가 필요합니다.

### 2. Medium - `openFetchedDataInEditor` 설정이 사실상 무시되고 있어 설정 신뢰성이 깨집니다

- 관련 위치:
  - `package.json:176`
  - `src/constants.ts:23`
  - `src/webview/handlers/FigmaCommandHandler.ts:197`
  - `src/webview/handlers/FigmaCommandHandler.ts:219`
  - `src/webview/handlers/FigmaCommandHandler.ts:368`
- 문제:
  - 설정에는 `figma-mcp-helper.openFetchedDataInEditor`가 존재하고 기본값도 `false`로 선언되어 있습니다.
  - 하지만 실제 fetch 경로는 design context, parse-only fallback, metadata/variable defs 모두에서 항상 `editorIntegration.openInEditor()`를 호출합니다.
- 결과:
  - 사용자는 설정을 꺼도 에디터 포커스가 계속 강제로 이동합니다.
  - 설정 화면과 실제 제품 동작 사이의 contract가 깨집니다.
- 상용 관점:
  - 이런 종류의 mismatch는 기능 버그 자체보다 "설정이 믿을 수 없다"는 인상을 남깁니다.
  - 팀 환경에서 자동 포커스 전환은 꽤 큰 UX 불만으로 이어질 수 있습니다.
- 권장 수정:
  - fetch 결과 open 여부를 config gate로 감싸고, UI/README/테스트를 동일한 기준으로 맞추는 것이 필요합니다.

### 3. Medium - Metadata와 Variable Definitions가 동일한 상태 슬롯을 공유해 prompt에 잘못된 컨텍스트가 들어갈 수 있습니다

- 관련 위치:
  - `src/state/StateManager.ts:8`
  - `src/state/StateManager.ts:59`
  - `src/webview/handlers/FigmaCommandHandler.ts:237`
  - `src/webview/handlers/FigmaCommandHandler.ts:364`
  - `src/webview/handlers/PromptCommandHandler.ts:287`
  - `src/webview/ui/components/FigmaLayer.ts:99`
- 문제:
  - UI는 metadata fetch와 variable definitions fetch를 별도 기능처럼 노출합니다.
  - 하지만 host state는 `lastMetadata` 슬롯 하나만 가지고 있고, `fetchVariableDefs()`도 여기에 덮어씁니다.
  - 이후 Prompt 쪽에서 `mcpDataKind === 'metadata'`를 고르면 이 단일 슬롯을 그대로 사용합니다.
- 결과:
  - 사용자는 metadata를 넣는다고 생각하지만 실제로는 variable definitions가 prompt에 들어갈 수 있습니다.
  - 더 나쁜 점은 이 문제가 조용히 발생한다는 것입니다. 에러도 없고 UI도 이를 구분해주지 않습니다.
- 상용 관점:
  - 생성형 기능에서 input provenance가 흐려지면 결과 품질 문제가 재현 불가능한 형태로 나타납니다.
  - "왜 이번 생성만 다르게 나왔는지" 설명하기 어려워져 support cost가 올라갑니다.
- 권장 수정:
  - metadata와 variable definitions를 상태/타입/UI 모두에서 분리해야 합니다.
  - Prompt 옵션에도 variable definitions를 독립적으로 선택할지, 아니면 fetch 기능을 viewer-only로 제한할지 제품 결정을 명확히 해야 합니다.

### 4. Medium - Remote OAuth 콜백 검증이 약해서, 기능 활성화 시 session fixation 계열 문제가 생길 여지가 있습니다

- 관련 위치:
  - `workers/src/routes/oauth.ts:17`
  - `workers/src/routes/oauth.ts:32`
  - `workers/src/routes/oauth.ts:65`
  - `workers/src/routes/oauth.ts:106`
  - `src/extension.ts:59`
  - `src/figma/RemoteFigmaAuthService.ts:57`
- 문제:
  - worker의 OAuth `state`에는 `vscodeRedirectUri`만 들어가고, nonce/expiry/attempt binding이 없습니다.
  - extension 쪽 `handleCallbackUri()`는 `/figma-remote-auth` 경로로 들어온 URI에서 `access_token`만 있으면 바로 저장합니다.
  - 즉, "현재 extension이 실제로 시작한 인증 요청인지"를 검증하는 정보가 없습니다.
- 결과:
  - remote mode를 실제 활성화할 경우, 외부에서 custom URI를 열어 세션을 주입하는 시나리오를 막기 어렵습니다.
  - 계정 오인증, session fixation, support/debugging 난이도 증가로 이어질 수 있습니다.
- 상용 관점:
  - 현재 README 기준 remote mode는 planned 상태라 즉시 exploit surface는 제한적입니다.
  - 그래도 상용 출시 전에는 반드시 닫아야 하는 보안 설계 결함입니다.
- 권장 수정:
  - auth start 시 nonce/state를 secret storage 또는 globalState에 저장하고, callback에서 일치 여부를 검증해야 합니다.
  - state에 redirect URI만 넣는 현재 구조는 최소한의 anti-CSRF 요구도 충족하지 못합니다.

## 강점

- handler, client, UI component 분리가 비교적 명확해서 코드 탐색성이 좋습니다.
- 테스트 수와 범위가 넓고, 특히 VS Code extension host 특유의 메시지 플로우를 잘 잡아두었습니다.
- i18n, friendly error messaging, preview fallback 같은 사용자 경험 레이어는 생각보다 성숙합니다.
- MCP client의 fallback/tool-compatibility 처리도 실무적입니다.

## 점수 산정 근거

- 아키텍처 / 유지보수성: **7.8 / 10**
- 테스트 / 회귀 방지력: **8.3 / 10**
- 런타임 신뢰성: **6.2 / 10**
- 설정 일관성 / 제품 완성도: **5.8 / 10**
- 보안성: **5.7 / 10**

종합적으로 보면 "기술적으로 잘 만든 v0.x"에 가깝습니다. 다만 상용 프로젝트 수준의 완성도를 묻는다면, 지금 점수는 기능 수보다 상태 관리의 정확성과 설정/보안 contract가 아직 덜 닫혀 있기 때문에 7점을 넘기기 어렵습니다.

## 우선순위 제안

1. Agent API key lifecycle 정리: runtime key, stored key, cleared key를 분리하고 회귀 테스트 추가
2. `openFetchedDataInEditor` 실제 반영
3. metadata / variable definitions 상태 분리
4. remote OAuth state 검증 추가
