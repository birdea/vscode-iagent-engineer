# GUI Iteration Loop Design Plan

## 1. 목적

이 문서는 현재 `vscode-iagent-engineer`에 `반복형 GUI 코드 수정 루프`를 추가하기 위한 상세 설계안이다.

목표는 다음과 같다.

- Figma MCP에서 가져온 디자인 데이터와 원본 스크린샷을 기준으로 GUI 코드를 생성한다.
- 생성 결과를 실제로 렌더링한 뒤 원본 스크린샷과 비교한다.
- 유사도가 목표치(예: `0.90`)에 도달할 때까지 에이전트가 코드를 반복 수정한다.
- 이 과정을 VS Code 확장 내부에서 관찰 가능하고, 취소 가능하며, 재현 가능하게 만든다.

핵심은 `LLM 단발 생성`이 아니라 `오케스트레이션된 반복 루프`다.

## 2. 현재 구조 진단

현재 저장소는 아래 흐름까지는 이미 갖추고 있다.

- Figma MCP 데이터 fetch
- Figma 스크린샷 fetch
- Prompt 조립
- 모델 1회 호출
- 생성 결과를 에디터에 열기
- 생성 결과를 Preview Panel 또는 브라우저 프리뷰로 렌더링

관련 코드:

- `src/webview/handlers/PromptCommandHandler.ts`
- `src/prompt/PromptBuilder.ts`
- `src/agent/ClaudeAgent.ts`
- `src/editor/EditorIntegration.ts`
- `src/editor/BrowserPreviewService.ts`
- `src/figma/ScreenshotService.ts`

현재 구조의 한계는 명확하다.

1. 생성이 `1회성 요청`이다.
2. 생성 결과를 `평가하는 계층`이 없다.
3. 렌더 결과와 원본 스크린샷을 `기계적으로 비교`하지 않는다.
4. 에이전트가 워크스페이스 파일을 직접 읽고 수정하는 `작업 루프`가 없다.
5. 실패 원인과 반복 과정을 누적 관리하는 `session/iteration 상태`가 없다.

즉, 지금의 `prompt.generate`는 그대로 유지할 수 있지만, 사용자가 원하는 기능은 별도 orchestration 레이어가 필요하다.

## 3. 요구사항 재정의

### 기능 요구사항

- Figma MCP 데이터와 원본 스크린샷을 하나의 작업 단위로 저장한다.
- 작업 대상 파일 또는 엔트리 파일을 지정한다.
- 에이전트가 워크스페이스 코드를 읽고 수정할 수 있어야 한다.
- 각 반복마다 결과물을 렌더링하여 스크린샷을 생성한다.
- 생성 스크린샷과 원본 스크린샷의 유사도를 계산한다.
- 목표 유사도 이상이면 자동 종료한다.
- 목표 유사도 미만이면 diff 요약을 만들어 다음 반복의 입력으로 제공한다.
- 사용자가 실행 중 상태, 반복 횟수, 현재 점수, 마지막 변경 요약을 확인할 수 있어야 한다.
- 사용자가 중간에 루프를 취소할 수 있어야 한다.

### 비기능 요구사항

- 동일 입력에 대해 가능한 한 재현 가능한 결과를 제공해야 한다.
- destructive command를 제한해야 한다.
- 로그와 중간 산출물을 남겨 디버깅 가능해야 한다.
- 대형 디자인에서도 context 폭증을 억제해야 한다.
- 브라우저 렌더링 환경을 최대한 고정해야 한다.

## 4. 핵심 결정 사항

### 결정 1. 다른 VS Code 확장을 주 제어 경로로 삼지 않는다

`Claude Code` VS Code 확장을 다른 확장에서 자동 조종하는 방식은 장기적으로 불안정하다.

- 공개 extension API가 없거나 제한적일 수 있다.
- Command ID가 비공식이면 호환성이 깨지기 쉽다.
- 에이전트 내부 상태, 승인 흐름, 세션 재개를 우리 확장이 안정적으로 제어하기 어렵다.

따라서 `다른 확장 제어`는 실험용 보조 경로로만 보고, 제품 설계의 중심에는 두지 않는다.

### 결정 2. `Claude Agent SDK`를 1순위로 고려한다

공식 문서 기준으로 Agent SDK는 Claude Code의 agent loop를 라이브러리로 제공하며, 파일 읽기/수정, Bash, hooks, permission, session, MCP 연결을 지원한다.

이 프로젝트의 요구와 맞는 이유:

- 반복 루프에 필요한 `Read`, `Edit`, `Write`, `Bash` 성격의 작업을 직접 구현하지 않아도 된다.
- Hook으로 파일 접근, 명령 실행, 로그 수집, 위험 차단을 붙일 수 있다.
- Session ID를 관리해 반복 과정의 맥락을 이어갈 수 있다.
- MCP 서버를 코드에서 연결할 수 있다.

공식 참고:

- Agent SDK overview: `https://platform.claude.com/docs/en/agent-sdk/overview`
- MCP integration: `https://platform.claude.com/docs/en/agent-sdk/mcp`
- Permissions: `https://platform.claude.com/docs/en/agent-sdk/permissions`
- Sessions: `https://platform.claude.com/docs/en/agent-sdk/sessions`
- Agent loop: `https://platform.claude.com/docs/en/agent-sdk/agent-loop`

### 결정 3. 현재 `ClaudeAgent`는 유지하고, 별도 Loop Agent를 추가한다

현재 `ClaudeAgent`는 Anthropic Messages API 직접 호출 기반의 단발 생성기다. 이를 반복 루프까지 떠안기면 책임이 섞인다.

권장 방향:

- `ClaudeAgent`: 기존 단발 code generation 유지
- `ClaudeLoopAgent` 또는 `ClaudeAgentSdkRunner`: 반복형 자율 수정 루프 전용

이렇게 분리하면 UI에서도 `Quick Generate`와 `Iterative Loop`를 분리할 수 있다.

### 결정 4. 유사도 판정은 모델이 아니라 확장이 수행한다

유사도 90% 달성 여부를 LLM의 자기평가에 맡기면 안 된다.

반드시 확장이 아래를 결정론적으로 계산해야 한다.

- 렌더 스크린샷 생성
- 이미지 정규화
- similarity score 계산
- stop/continue 결정

모델은 수정 제안과 코드 변경만 담당한다.

### 결정 5. 루프는 기존 `Prompt Layer`의 연장이 아니라 별도 execution domain이다

`prompt.generate` 메시지에 옵션 몇 개를 덧붙이는 수준으로는 부족하다.

새로운 도메인이 필요하다.

- 작업 생성
- iteration state
- artifact 저장
- screenshot diff
- approval/permission 정책
- loop cancellation

따라서 새 레이어 이름은 예를 들어 `Loop`, `Iteration`, `AutoFix`, `Refine` 중 하나로 독립시키는 것이 맞다.

## 5. 권장 아키텍처

### 상위 구조

```text
Webview UI
  -> LoopCommandHandler
    -> LoopOrchestrator
      -> DesignContextResolver
      -> AgentRuntime
      -> RenderCaptureService
      -> ImageDiffService
      -> LoopArtifactStore
      -> LoopPolicy
      -> LoopStateManager
```

### 책임 분리

#### `LoopCommandHandler`

- webview 명령 수신
- 시작, 중지, 상태 조회 처리
- webview 이벤트 송신

#### `LoopOrchestrator`

- 전체 반복 루프의 중심
- iteration 시작/종료
- 에이전트 호출
- 렌더/비교/재시도
- 실패 분기 처리

#### `DesignContextResolver`

- Figma MCP 데이터와 screenshot을 정규화
- 파일 ID, 노드 ID, 화면 크기, 배경색 등의 메타데이터 확보

#### `AgentRuntime`

- 실제 에이전트 실행 어댑터
- 1차 구현은 `Claude Agent SDK`
- 향후 `Codex CLI`, `OpenAI Responses API`, 기타 로컬 에이전트로 확장 가능

#### `RenderCaptureService`

- 생성 결과를 headless browser에서 렌더링
- 고정 viewport, DPR, 폰트, 애니메이션 비활성화 적용
- 결과 스크린샷 저장

#### `ImageDiffService`

- 원본/생성 이미지를 정규화
- pixel similarity 또는 SSIM 계산
- bounding box 별 heatmap 또는 diff summary 생성

#### `LoopArtifactStore`

- iteration별 프롬프트, 스크린샷, diff 결과, 로그, 점수 저장
- temp 디렉터리 또는 workspace 내부 `.iagent-engineer/loops/<runId>` 사용

#### `LoopPolicy`

- max iterations
- similarity threshold
- timeout
- 허용 파일 경로
- 허용 command 목록

#### `LoopStateManager`

- 현재 run 상태
- session ID
- 최신 score
- 취소 신호
- 마지막 성공 산출물

## 6. 왜 SDK가 CLI보다 적합한가

둘 다 가능하지만, 이 저장소의 목적에는 SDK가 더 적합하다.

### CLI 장점

- 설치되어 있으면 빠르게 실험 가능
- 로컬 개발자의 Claude Code 환경을 그대로 활용 가능

### CLI 단점

- 표준 출력 파싱에 의존하기 쉽다.
- 권한/세션/승인/중간 이벤트 구조가 앱 내부 모델과 느슨하게 연결된다.
- 사용자 환경에 따라 CLI 설치 여부, 버전, 인증 상태가 달라진다.
- 제품 기능으로 넣을 때 support burden이 크다.

### SDK 장점

- TypeScript 내부에서 session, hook, permission, tool event를 직접 관리 가능
- 확장 로그 레이어와 더 자연스럽게 연결 가능
- 파일 수정, Bash, 하위 에이전트, MCP를 같은 런타임 규칙으로 관리 가능
- 현재 저장소의 `AgentFactory` 패턴과 잘 맞는다.

### 결론

- 제품 기본 경로: `Claude Agent SDK`
- 실험 또는 개인 개발자 옵션: `Claude Code CLI`

### 브랜딩 주의

공식 Agent SDK 문서 기준으로 제3자 제품은 기본적으로 `Claude Code` 자체처럼 보이게 브랜딩하면 안 된다.

따라서 UI/설정/문서에서는 아래처럼 구분하는 편이 안전하다.

- 내부 구현 명칭: `ClaudeAgentSdkRuntime`
- 사용자 노출 명칭: `Claude Agent`
- 피해야 할 명칭: 우리 제품 내부 에이전트를 `Claude Code` 자체로 오인하게 하는 표현

이는 기능 설계뿐 아니라 `package.json`, 설정 문구, help text, README 문구에도 반영해야 한다.

## 6.1. CLI 기반으로도 가능한가

가능하다.

다만 정확히는 아래처럼 이해해야 한다.

- 가능: `Claude Code CLI`를 비대화형 실행기로 사용해 각 iteration에서 워크스페이스 코드를 읽고 수정하게 만들기
- 불가능에 가까움: 루프의 전체 상태 관리, similarity 계산, 렌더링, artifact 관리까지 CLI 하나에 맡기기

즉, CLI 기반에서도 구상 자체는 해결 가능하지만, `루프의 두뇌`는 여전히 확장 쪽에 있어야 한다.

권장 역할 분담:

- 확장: run 생성, 상태 관리, 렌더링, screenshot 비교, stop/continue 판정, artifact 저장
- CLI: iteration별 코드 수정 에이전트

## 6.2. CLI 기반이 가능한 근거

공식 `Claude Code CLI reference` 기준으로 아래 기능이 확인된다.

- 비대화형 실행: `claude -p` 또는 `--print`
- 기계 파싱용 출력: `--output-format json` 또는 `stream-json`
- partial event 포함: `--include-partial-messages` with `stream-json`
- 세션 이어가기: `--continue`, `--resume`
- 세션 분기: `--fork-session`
- 명시적 세션 ID 지정: `--session-id`
- 반복 턴 제한: `--max-turns`
- 비용 상한: `--max-budget-usd`
- 시스템 프롬프트 파일 주입: `--system-prompt-file`, `--append-system-prompt-file`
- 도구 제한: `--tools`, `--allowedTools`, `--disallowedTools`
- 권한 모드: `--permission-mode`
- MCP 구성 주입: `--mcp-config`, `--strict-mcp-config`
- 추가 작업 디렉터리 허용: `--add-dir`
- 격리된 git worktree 시작: `--worktree`

공식 `Hooks reference` 기준으로도 아래가 가능하다.

- `PreToolUse`에서 tool call 허용/거부/질의
- `updatedInput`으로 tool input 수정
- `PermissionRequest` hook으로 permission dialog 제어

공식 `MCP docs` 기준으로도 아래가 가능하다.

- HTTP MCP 서버 연결
- local stdio MCP 서버 연결
- JSON 기반 MCP 설정 추가
- 실행 시 `--mcp-config`로 MCP 설정 파일 주입

따라서 CLI는 `반복형 GUI 수정 루프`의 실행 엔진이 될 최소 요건을 충족한다.

## 6.3. CLI 기반 권장 아키텍처

CLI 기반에서는 SDK를 아래 컴포넌트로 치환한다.

```text
Webview UI
  -> LoopCommandHandler
    -> LoopOrchestrator
      -> ClaudeCliRuntime
      -> RenderCaptureService
      -> ImageDiffService
      -> LoopArtifactStore
      -> LoopPolicy
      -> LoopStateManager
```

핵심은 `ClaudeCliRuntime`이다.

### `ClaudeCliRuntime` 책임

- `child_process.spawn()`으로 `claude` 실행
- prompt file, settings file, mcp config file 준비
- stdout `json` 또는 `stream-json` 파싱
- session ID 관리
- exit code 해석
- iteration 결과와 changed files 요약 반환

현재 저장소는 이미 [BrowserPreviewService.ts](/Users/1112327/workspace/vscode-iagent-engineer/src/editor/BrowserPreviewService.ts)에서 child process를 사용하므로, 확장 호스트에서 CLI 실행 자체는 구조적으로 자연스럽다.

## 6.4. CLI 기반 표준 실행 방식

초기 권장 방식은 `1 iteration = 1 headless CLI invocation`이다.

예시 개념:

1. 확장이 iteration prompt 파일 생성
2. 확장이 settings / hooks / MCP config 파일 생성
3. `claude -p` 실행
4. 종료 후 수정 파일 수집
5. 렌더링 및 similarity 계산
6. threshold 미달이면 `--resume <session>` 또는 `--session-id <uuid>`로 다음 iteration 실행

### 출력 형식 선택

- 디버깅 중심: `--output-format json`
- 실시간 UI 진행 표시 중심: `--output-format stream-json`

초기 구현 권장은 `json`이다.

이유:

- 구현 단순
- event schema 의존성이 적음

실시간 진행 상황이 중요해지면 `stream-json`으로 확장한다.

## 6.5. CLI 기반에서 세션을 유지하는 방법

공식 문서 기준 CLI는 아래 세션 관련 기능을 제공한다.

- `--continue`
- `--resume`
- `--fork-session`
- `--session-id`
- `--no-session-persistence`

루프 설계에서 권장하는 방식은 둘 중 하나다.

### 방식 A. 명시적 session ID 관리

- run 시작 시 확장이 UUID 생성
- 각 iteration에서 `--session-id <uuid>` 사용

장점:

- run과 session 매핑이 단순
- artifact와 연결하기 쉬움

주의:

- 실제 세션 저장 방식과 충돌 여부는 smoke test로 확인 필요

### 방식 B. 첫 실행 결과에서 session 확보 후 `--resume`

- iteration 1 실행
- 이후 `--resume <session>`

장점:

- CLI의 기본 session 흐름과 더 자연스럽게 맞을 가능성

단점:

- 세션 식별자 파싱 로직이 추가될 수 있음

초기 구현 권장은 방식 A를 먼저 실험하고, 필요 시 방식 B로 전환하는 것이다.

## 6.6. CLI 기반에서 MCP를 연결하는 방법

CLI 기반에서도 Figma MCP 또는 기타 보조 MCP를 사용할 수 있다.

권장 방식:

- 확장이 run 전용 `mcp.json` 생성
- `claude --mcp-config <file> --strict-mcp-config ...` 형태로 실행

이렇게 하면 사용자 전역 Claude 설정과 분리된, run 단위의 deterministic MCP 구성이 가능하다.

예시 구상:

- `figma-local`: HTTP MCP endpoint
- `workspace-tools`: 필요 시 로컬 stdio MCP
- `approval-tool`: non-interactive permission prompt 보조용 MCP tool

중요:

공식 문서 기준 SSE transport는 deprecated다. 새 구현은 가능하면 HTTP 또는 stdio를 써야 한다.

## 6.7. CLI 기반 permission 전략

CLI 기반의 핵심 리스크는 비대화형 실행 중 위험한 도구 호출이다.

공식 문서 기준 아래 제어 수단이 있다.

- `--permission-mode`
- `--allowedTools`
- `--disallowedTools`
- `--tools`
- `--permission-prompt-tool`
- hooks의 `PreToolUse`, `PermissionRequest`

권장 조합:

1. 기본 도구는 최소화한다.
2. `Bash`는 필요할 때만 열고 패턴을 좁힌다.
3. `Edit`, `Read`, `Glob`, `Grep` 중심으로 시작한다.
4. hooks에서 위험 명령을 재차 차단한다.

예시 정책:

- 허용: `Read`, `Edit`, `Write`, `Glob`, `Grep`
- 조건부 허용: `Bash(npm run build)`, `Bash(npm test -- --runInBand)`, `Bash(git diff -- *)`
- 금지: `Bash(rm *)`, `Bash(git reset *)`, `Bash(git clean *)`

중요:

CLI에서 `--dangerously-skip-permissions`는 루프 기능의 기본 설계에 사용하면 안 된다.

## 6.8. CLI hooks를 어떻게 활용할지

CLI 기반에서 hooks는 매우 중요하다. SDK의 세밀한 runtime API가 없기 때문에, policy enforcement를 hooks로 보강해야 한다.

활용 포인트:

- `PreToolUse`: 위험 명령 deny
- `PreToolUse`: tool input 수정
- `PermissionRequest`: 자동 승인/거부 규칙
- `PostToolUse`: 변경 로그 누적

공식 문서상 `PreToolUse`는 `allow`, `deny`, `ask`를 반환할 수 있고, `updatedInput`도 가능하다.

이 의미는 크다.

- 경로를 강제로 workspace 내부로 재작성할 수 있다.
- 금지된 tool input을 차단할 수 있다.
- 로그 파일에 모든 위험 시도를 기록할 수 있다.

따라서 CLI 기반에서는 `hooks.json` 또는 settings 기반 hooks 구성이 사실상 필수다.

## 6.9. CLI 기반의 구체적 실행 전략

권장 구현은 shell escaping을 최소화하는 방향이어야 한다.

### 원칙

- 긴 프롬프트는 인라인 인자가 아니라 파일로 전달
- settings도 파일로 생성
- mcp config도 파일로 생성
- 실행 결과는 stdout JSON으로 읽기

### 추천 실행 흐름

1. run 디렉터리 생성
2. `prompt.md` 생성
3. `claude-settings.json` 생성
4. `claude-mcp.json` 생성
5. 필요 시 `system-prompt.txt` 생성
6. `spawn("claude", [...args])`
7. stdout 파싱
8. stderr와 exit code 기록

이 방식은 prompt escaping, quoting, shell injection 문제를 줄인다.

## 6.10. CLI 기반 LoopPrompt 구성 원칙

CLI는 SDK보다 prompt와 settings 파일 기반 운영이 더 자연스럽다.

권장:

- `--append-system-prompt-file`로 공통 제약 주입
- user task는 `prompt.md`로 분리
- iteration별 diff summary는 별도 section으로 추가

예시 섹션:

- `Run objective`
- `Current iteration`
- `Target similarity`
- `Allowed files`
- `Source screenshot`
- `Observed differences`
- `Required output constraints`
- `Do not`

## 6.11. CLI 기반 artifact 전략

CLI 기반은 SDK보다 runtime introspection이 적으므로 artifact를 더 많이 남기는 편이 안전하다.

권장 artifact:

- `prompt.md`
- `system-prompt.txt`
- `claude-settings.json`
- `claude-mcp.json`
- `stdout.json` 또는 `stdout.ndjson`
- `stderr.log`
- `changed-files.json`
- `render.png`
- `diff.png`
- `score.json`

이렇게 해야 실패 원인을 재현하기 쉽다.

## 6.12. CLI 기반의 장점

- 사용자의 로컬 Claude Code 환경을 그대로 활용 가능
- API SDK 통합보다 초기 실험이 빠를 수 있음
- 비대화형 `-p`와 JSON 출력으로 자동화가 가능
- `--mcp-config`와 hooks로 프로젝트별 policy 적용 가능
- 필요 시 `--worktree`로 더 안전한 격리 실험 가능

## 6.13. CLI 기반의 한계

CLI 기반은 가능하지만, 아래 한계를 인정해야 한다.

### 1. 설치 의존성

- 사용자의 시스템에 `claude` CLI가 설치되어 있어야 한다.
- 버전 차이가 동작 차이로 이어질 수 있다.

### 2. 인증 상태 의존성

- 로컬 `claude auth` 상태에 의존할 수 있다.
- 제품 내부에서 인증 흐름을 완전히 통제하기 어렵다.

### 3. 출력 스키마 결합

- `json` 또는 `stream-json` 출력 파싱 로직이 CLI 출력 스키마에 결합된다.
- SDK보다 타입 안정성이 낮다.

### 4. hooks/config 파일 관리 부담

- SDK 런타임보다 운영 설정 파일 수가 늘어난다.
- 팀 환경마다 로컬 설정 차이를 흡수해야 한다.

### 5. 프로세스 오버헤드

- iteration마다 프로세스를 실행하면 startup overhead가 생긴다.

### 6. 플랫폼 편차

- 로컬 PATH, keychain, shell 환경, corporate proxy에 따라 결과가 달라질 수 있다.

### 7. 제품 완성도 관점

- 제품 내장 기능으로는 SDK 쪽이 더 통제 가능하다.
- CLI는 power-user 기능 또는 experimental mode에 더 가깝다.

## 6.14. CLI 기반 최종 판단

정리하면 다음과 같다.

- `가능 여부`: 가능
- `권장 용도`: 빠른 프로토타입, power-user 모드, 내부 실험
- `제품 기본 경로로 적합한가`: SDK보다 덜 적합

즉, CLI 기반만으로도 사용자가 원하는 `Figma MCP + screenshot + 반복 GUI 수정 + 90% 유사도 종료` 구상은 구현할 수 있다.

하지만 CLI가 해결하는 것은 `에이전트 실행` 부분이며, 아래는 여전히 확장이 책임져야 한다.

- 렌더링
- 이미지 비교
- threshold 판정
- iteration orchestration
- artifact 관리
- UI 상태 반영

따라서 CLI-only 제품이 아니라, `extension-orchestrated loop + Claude CLI runtime` 구조가 현실적인 답이다.

## 7. 반복 루프의 표준 흐름

### 실행 전 준비

1. 사용자가 Figma MCP 데이터와 원본 screenshot을 확보한다.
2. 사용자가 대상 workspace와 엔트리 파일을 선택한다.
3. 확장이 loop config를 검증한다.
4. 초기 artifact 디렉터리를 생성한다.
5. 렌더링용 preview entry를 준비한다.

### Iteration 0

초기 상태는 보통 아래 둘 중 하나다.

- 빈 파일 또는 현재 파일 기준으로 첫 생성
- 사용자가 이미 가진 초안 코드 기준으로 refinement 시작

### Iteration N

각 반복의 처리 순서는 아래와 같다.

1. 현재 코드 상태 수집
2. 원본 screenshot + MCP data + 이전 diff summary + 목표 규칙을 prompt로 구성
3. 에이전트가 워크스페이스를 읽고 필요한 파일을 수정
4. 수정 후 빌드 가능성 또는 최소 smoke check 수행
5. 렌더링 후 새 screenshot 캡처
6. 원본 screenshot과 similarity 계산
7. 점수가 threshold 이상이면 종료
8. 미달이면 diff summary 생성 후 다음 iteration으로 이동

### 종료 조건

- similarity >= threshold
- maxIterations 초과
- 사용자 취소
- 렌더 실패 또는 반복적 build 실패
- 동일 점수 정체가 일정 횟수 이상 지속

## 8. 세부 데이터 모델 제안

```ts
export interface LoopRunConfig {
  runId: string;
  workspaceRoot: string;
  targetEntryFile: string;
  outputFormat: OutputFormat;
  agent: 'claude-sdk';
  model: string;
  similarityThreshold: number;
  maxIterations: number;
  renderViewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  allowCommands: string[];
  allowWriteGlobs: string[];
  startFromExistingCode: boolean;
}

export interface LoopSourceContext {
  mcpData: unknown;
  sourceScreenshot: ScreenshotAsset;
  sourceMetadata?: {
    fileId?: string;
    nodeId?: string;
    figmaName?: string;
    background?: string;
  };
}

export interface LoopIterationResult {
  iteration: number;
  similarity: number;
  status: 'success' | 'continue' | 'failed' | 'cancelled';
  summary: string;
  changedFiles: string[];
  screenshotPath?: string;
  diffImagePath?: string;
  metrics: {
    pixelSimilarity?: number;
    ssim?: number;
    buildMs?: number;
    renderMs?: number;
    agentMs?: number;
  };
}

export interface LoopRunState {
  config: LoopRunConfig;
  sessionId?: string;
  status: 'idle' | 'running' | 'success' | 'failed' | 'cancelled';
  currentIteration: number;
  bestSimilarity: number;
  bestIteration?: number;
  lastError?: string;
}
```

## 9. 메시지 프로토콜 확장안

현재 `types.ts`의 `prompt.*`와 별도로 `loop.*` 채널을 추가한다.

### Webview -> Host

```ts
type LoopWebviewMessage =
  | { command: 'loop.start'; config: LoopStartPayload }
  | { command: 'loop.cancel'; runId?: string }
  | { command: 'loop.getState'; runId?: string }
  | { command: 'loop.openArtifacts'; runId: string }
  | { command: 'loop.openBestResult'; runId: string };
```

### Host -> Webview

```ts
type LoopHostMessage =
  | { event: 'loop.started'; runId: string; config: LoopRunConfig }
  | { event: 'loop.iterationStarted'; runId: string; iteration: number }
  | {
      event: 'loop.iterationResult';
      runId: string;
      result: LoopIterationResult;
    }
  | {
      event: 'loop.progress';
      runId: string;
      phase: 'agent' | 'build' | 'render' | 'compare';
      message: string;
    }
  | {
      event: 'loop.completed';
      runId: string;
      status: 'success' | 'failed' | 'cancelled';
      bestSimilarity: number;
    }
  | { event: 'loop.error'; runId: string; message: string };
```

## 10. 파일 구조 제안

```text
src/
  loop/
    LoopOrchestrator.ts
    LoopStateManager.ts
    LoopArtifactStore.ts
    LoopPolicy.ts
    types.ts
    prompt/
      LoopPromptBuilder.ts
      DiffSummaryBuilder.ts
    render/
      RenderCaptureService.ts
      RenderProfile.ts
    compare/
      ImageDiffService.ts
      SimilarityScorer.ts
    runtime/
      AgentRuntime.ts
      ClaudeAgentSdkRuntime.ts
      RuntimeGuard.ts
  webview/
    handlers/
      LoopCommandHandler.ts
    ui/
      components/
        LoopLayer.ts
```

이 구조는 기존 `figma`, `agent`, `prompt`, `editor` 레이어와 충돌을 줄인다.

## 10.1. 현재 저장소에 대한 구체적 연결 지점

실제 반영 시 수정이 필요한 기존 파일은 아래가 핵심이다.

### `src/types.ts`

- `loop.*` command/event union 추가
- loop 상태 타입 추가
- 필요 시 `AgentType`와 별도 runtime type 정의

중요:

`claude-sdk`를 기존 `AgentType`에 억지로 넣지 않는 편이 낫다.

이유:

- 현재 `AgentType`은 주로 기존 단발 생성용 provider 선택값이다.
- loop runtime은 provider라기보다 orchestration runtime에 가깝다.
- `ClaudeAgent`와 `ClaudeAgentSdkRuntime`은 성격이 다르다.

권장:

- 기존 `AgentType` 유지
- 신규 `LoopRuntimeType = 'claude-agent-sdk' | 'codex-cli' | ...` 분리

### `src/webview/WebviewMessageHandler.ts`

- `LoopCommandHandler` 생성 및 주입
- `loop.start`, `loop.cancel`, `loop.getState` 라우팅 추가
- dispose 시 loop runtime 정리 추가

### `src/state/StateManager.ts`

현재 `StateManager`는 단발 generation 중심이다.

선택지는 둘 중 하나다.

1. `StateManager` 확장
2. `LoopStateManager` 독립

권장은 2번이다.

이유:

- loop는 진행 중 상태, iteration, session ID, artifact path 등 추가 상태가 많다.
- 기존 상태와 결합하면 책임이 빠르게 비대해진다.

### `src/editor/EditorIntegration.ts`

재사용 포인트:

- generated document 열기
- preview panel 열기
- browser preview sync

추가가 필요한 포인트:

- 특정 entry file 열기
- best result file 열기
- artifact directory 열기

### `src/editor/BrowserPreviewService.ts`

이 파일은 사람용 preview에는 적합하지만, 루프 평가용 자동 캡처에는 그대로 쓰기 어렵다.

이유:

- 브라우저 열기 동작이 전제되어 있다.
- active 상태와 사용자 액션 중심이다.
- deterministic screenshot capture API가 없다.

권장:

- 공통 preview asset 생성 부분은 재사용 가능하게 추출
- 자동 캡처는 별도 `RenderCaptureService`로 분리

### `src/webview/ui/components`

새 컴포넌트:

- `LoopLayer.ts`

또는 초기 버전에서는 기존 Prompt 뷰에 fieldset으로 추가할 수도 있다.

하지만 장기적으로는 별도 뷰가 더 낫다.

이유:

- 설정 항목이 많다.
- iteration 로그와 아티팩트 액션이 따로 필요하다.

### `package.json`

추가 검토 항목:

- 새 view를 추가할지
- 새 command를 추가할지
- loop 관련 configuration key를 노출할지

예시 설정:

- `iagent-engineer.loop.defaultThreshold`
- `iagent-engineer.loop.defaultMaxIterations`
- `iagent-engineer.loop.enableBash`
- `iagent-engineer.loop.artifactLocation`
- `iagent-engineer.loop.allowedWriteGlobs`

### `src/i18n.ts`

Loop Layer UI 문구와 host 이벤트 메시지가 대량으로 추가된다.

초기부터 영문/국문 동시 반영이 필요하다.

### `test/`

추가 대상:

- `test/unit/loop/*`
- `test/unit/handlers/LoopCommandHandler.test.ts`
- `test/e2e`에 mock runtime 기반 loop smoke flow

## 11. AgentRuntime 상세 설계

### 인터페이스

```ts
export interface AgentRuntime {
  readonly type: string;
  runIteration(input: AgentIterationInput, signal?: AbortSignal): Promise<AgentIterationOutput>;
}
```

### `ClaudeAgentSdkRuntime` 책임

- Agent SDK query 시작
- session ID 획득/재사용
- allowed tools 제한
- permission mode 적용
- hook 기반 로그 수집
- iteration 결과 요약 반환

### 추천 allowed tools

- `Read`
- `Edit`
- `Write`
- `Glob`
- `Grep`
- `Bash`

초기 버전에서는 최소 집합으로 시작하는 것이 좋다.

- `Read`, `Edit`, `Write`, `Glob`, `Grep`
- 필요 시 제한된 `Bash`

### 권장 permission 전략

- 기본은 `acceptEdits`
- `Bash`는 `canUseTool` 또는 hook로 세밀하게 제어
- `rm`, `git reset`, `git clean`, 대규모 삭제는 차단
- workspace 외부 경로 쓰기는 차단

이 프로젝트는 VS Code 확장 안에서 동작하므로, SDK가 가진 permissive mode를 그대로 열어두면 안 된다.

## 12. Prompt 전략

루프 프롬프트는 기존 `PromptBuilder`보다 훨씬 구조화되어야 한다.

반복 루프용 프롬프트는 최소한 아래 요소를 포함해야 한다.

1. 목표
2. 수정 가능한 파일 범위
3. 출력 형식 및 프레임워크 제약
4. 원본 스크린샷의 역할
5. MCP 데이터의 역할
6. 이전 iteration 결과
7. 이번 iteration에서 해결해야 할 우선순위
8. 중지 규칙

### 시스템 지시 예시

- 최소한의 파일만 수정하라.
- 지정된 엔트리와 연관된 파일만 다뤄라.
- 새 프레임워크로 갈아타지 마라.
- 렌더가 깨지지 않도록 빌드 가능 상태를 유지하라.
- 수정 후 사용자가 바로 diff를 검토할 수 있게 변경 범위를 좁혀라.

### 사용자 입력 예시 블록

- `Target format`
- `Allowed files`
- `Current best similarity`
- `Observed visual differences`
- `Important design constraints`
- `MCP design context`
- `Source screenshot attached`

## 13. Diff Summary 전략

다음 iteration에 raw 이미지 전체만 다시 넣는 것은 비용이 크다. 따라서 요약 계층이 필요하다.

권장 방식:

1. 확장이 이미지 비교를 수행
2. 차이가 큰 영역을 rectangle 목록으로 요약
3. 영역별 요약 문장을 생성
4. 필요 시 diff 이미지 자체도 첨부

예시:

- Header 높이가 원본보다 약 14% 큼
- 좌측 카드 패딩이 부족함
- CTA 버튼의 배경색 대비가 약함
- 우측 섹션의 세로 간격이 과도함
- 전체 레이아웃 폭이 원본보다 좁음

초기 버전에서는 완전 자동화된 semantic diff보다 아래 단계로 시작해도 충분하다.

- pixelmatch heatmap 생성
- 전체 similarity score 계산
- bounding box 기반 지역 차이 추출
- 템플릿 기반 텍스트 요약 생성

## 14. 렌더링 설계

유사도 계산의 품질은 렌더링 품질에 좌우된다.

### 필수 고정값

- viewport width/height
- deviceScaleFactor
- background color
- default font strategy
- animation disable
- transition disable
- caret 숨김
- scroll position 초기화

### 구현 권장

- `Playwright` 기반 headless Chromium
- 첫 버전은 단일 엔트리 렌더
- 대상 페이지가 로컬 dev server를 요구하지 않도록 가능한 정적 preview path 우선

현재 저장소에는 브라우저 프리뷰 인프라가 있으므로, 완전히 새로 만들기보다 재사용 가능한 부분을 추출하는 편이 낫다.

권장 분리:

- 현재 `BrowserPreviewService`: 사람용 preview
- 신규 `RenderCaptureService`: 자동 캡처용 deterministic renderer

둘의 요구사항은 다르다. 사람용 preview는 편의성이 중요하지만, 루프 평가는 결정성이 더 중요하다.

## 15. Similarity 측정 전략

### 1차 지표

- pixel similarity

장점:

- 구현 단순
- 빠름

단점:

- anti-aliasing, font fallback, subpixel 차이에 민감

### 2차 지표

- SSIM

장점:

- 전체 구조 유사도를 더 잘 반영

단점:

- 구현과 튜닝이 조금 더 복잡

### 권장 점수식

초기 버전:

```text
finalScore = 0.7 * pixelSimilarity + 0.3 * ssim
```

이 값은 제안일 뿐이며 실측으로 조정해야 한다.

### Threshold 정책

- 기본값 `0.90`
- 고정값으로 두지 말고 설정 가능하게 둔다.
- `0.90`은 tight한 편이므로 실제 환경에 따라 `0.82 ~ 0.90` 범위 튜닝 가능성을 열어둔다.

### Anti-noise 처리

- 캡처 전 2회 렌더 후 최종 캡처
- 웹폰트 로딩 완료 대기
- 동적 시간 표시, 랜덤 avatar, skeleton loader 제거
- CSS animation 전역 비활성화

## 16. 파일 변경 범위 제어

루프형 에이전트의 가장 큰 리스크는 지나치게 넓은 수정 범위다.

따라서 아래 제약이 필수다.

- 허용된 workspace root 밖으로 쓰기 금지
- 허용 glob 밖의 파일 수정 금지
- `package.json` 수정은 초기 버전에서는 금지 또는 승인 필요
- lockfile 수정 금지
- git 명령은 읽기 전용만 허용
- `rm -rf`, `mv` 대규모 변경 차단

권장 allowlist 예시:

- `src/**/*`
- `app/**/*`
- `components/**/*`
- `pages/**/*`
- `styles/**/*`

## 17. Session 및 Resume 전략

Agent SDK 문서 기준으로 session ID를 획득하고 resume할 수 있다.

이 기능은 반복 루프에 유리하다.

- iteration마다 전체 맥락을 다시 보내지 않아도 된다.
- 이전 수정 의도를 유지할 수 있다.
- 중단 후 이어서 실행하기 쉽다.

하지만 무조건 resume만 쓰면 안 된다.

### 권장 정책

- 한 run 안에서는 session resume 사용
- 새 run 시작 시 기본은 새 session
- 사용자가 원하면 이전 run에서 fork session 가능

### 저장 정보

- `runId`
- `agentSessionId`
- `targetEntryFile`
- `currentIteration`
- `bestIteration`
- `bestSimilarity`
- `artifactPaths`

## 17.1. Secret 및 인증 전략

현재 저장소는 API 키를 `SecretStorage`에 저장한다. loop runtime도 같은 원칙을 따라야 한다.

권장 방식:

- Anthropic API key는 기존 Claude 키를 재사용 가능하게 한다.
- 단, loop runtime이 SDK 환경 변수 방식을 요구하면 런타임 생성 시 메모리 내로만 주입한다.
- 영구 저장은 계속 `context.secrets`만 사용한다.
- artifact에는 절대 API key, env dump, full auth header를 저장하지 않는다.

주의:

Agent SDK 문서상 타사 제품은 `claude.ai` 로그인이나 Claude 소비자 플랜 한도를 제품 기능처럼 노출하면 안 된다. 제품 기능은 API key 기반으로 설계하는 것이 맞다.

## 18. UX 제안

### 새 Loop Layer 필드

- `Target entry file`
- `Output format`
- `Model`
- `Similarity threshold`
- `Max iterations`
- `Viewport preset`
- `Allow Bash`
- `Start from existing code`
- `Run` / `Cancel`

### 실행 중 표시

- 현재 iteration
- 현재 phase
- 최고 similarity
- 마지막 similarity
- 변경된 파일 목록
- 마지막 diff summary

### 실행 후 액션

- Best result 열기
- Best screenshot 열기
- Diff image 열기
- Artifact folder 열기
- 마지막 agent transcript 요약 보기

## 19. 로그 전략

기존 `Log Layer`를 재사용하되, loop 이벤트를 별도 태그로 남긴다.

예시:

- `loop.runStarted`
- `loop.iterationStarted`
- `loop.agentCompleted`
- `loop.renderCompleted`
- `loop.compareCompleted`
- `loop.thresholdMet`
- `loop.plateauDetected`
- `loop.cancelled`

로그는 사람이 읽기 좋아야 하며, 동시에 artifact와 연결 가능해야 한다.

## 20. 오류 처리 전략

### 분류

- 에이전트 실패
- permission 거부
- build 실패
- render 실패
- screenshot compare 실패
- artifact 저장 실패
- user cancel

### 원칙

- iteration 중 실패가 있어도 즉시 전체 run을 버리지 않는다.
- 재시도 가능한 오류와 치명적 오류를 구분한다.
- 마지막 성공 산출물은 보존한다.

예시:

- 일시적 render timeout: 동일 iteration 재시도 가능
- 허용되지 않은 파일 수정 시도: 에이전트에 제약 재고지 후 같은 iteration 재시도 가능
- 지속적인 build 실패: 치명적 종료

## 21. 구현 Phase 제안

### Phase 1. Loop 골격

- `loop` 타입과 메시지 프로토콜 추가
- `LoopCommandHandler`
- `LoopStateManager`
- `LoopArtifactStore`
- mock iteration result UI

목표:

- 실제 agent 없이도 start/cancel/status UI가 동작

### Phase 2. Deterministic render + compare

- `RenderCaptureService`
- `ImageDiffService`
- artifact 저장
- similarity score 계산

목표:

- 정적인 코드 입력에 대해 screenshot 캡처와 diff가 가능

### Phase 3. Agent SDK runtime

- `ClaudeAgentSdkRuntime`
- permission/hook/log/session 연결
- 파일 수정 loop 1회 동작

목표:

- 한 iteration에서 실제 파일 수정 후 렌더/비교까지 수행

실행 전 체크:

- `@anthropic-ai/claude-agent-sdk` 의존성 추가
- Node/VS Code extension host 호환성 확인
- SDK 이벤트 구조에 맞는 로그 어댑터 작성

### Phase 4. Iterative orchestration

- threshold loop
- plateau detection
- retry 정책
- session resume

목표:

- 여러 iteration을 안정적으로 반복

### Phase 5. UX/안전성 강화

- artifact viewer
- diff summary 고도화
- allowlist editor
- 위험 command guard

### Phase 6. Codex/OpenAI runtime 추상화

- `AgentRuntime` 공통 인터페이스 유지
- `CodexRuntime` 또는 `OpenAIRuntime` 추가

목표:

- 특정 에이전트에 종속되지 않는 loop infrastructure 확보

## 21.1. 의존성 제안

현재 범위에서 검토할 패키지는 아래와 같다.

- `@anthropic-ai/claude-agent-sdk`
- `playwright` 또는 현재 preview 경로와 양립 가능한 screenshot capture 런타임
- `pixelmatch`
- SSIM 계산 라이브러리 한 종

선정 기준:

- VS Code extension host(Node 20+) 호환성
- native build 부담 최소화
- macOS packaged install에서 재현성

주의:

- screenshot 비교 라이브러리는 pure JS 우선
- native dependency가 크면 CI와 배포 복잡도가 급격히 증가한다.

## 22. 테스트 전략

### 단위 테스트

- `LoopPolicy`
- `SimilarityScorer`
- `DiffSummaryBuilder`
- `LoopArtifactStore`
- message routing

### 통합 테스트

- run 시작 -> iteration 이벤트 발행
- render -> compare -> continue 분기
- threshold 충족 -> success 종료
- cancel -> cancelled 종료

### E2E 테스트

실제 LLM까지 포함한 완전 자동 E2E는 비용과 flakiness가 크다. 따라서 두 단계로 나눈다.

1. Mock runtime E2E
2. 실제 SDK 기반 smoke test

Mock runtime E2E에서 확인할 것:

- UI 상태 전환
- artifact 생성
- similarity threshold 분기
- cancel

실제 smoke test에서 확인할 것:

- session ID 수집
- 제한된 파일 수정
- render/capture 성공

## 23. 리스크

### 1. 렌더 결정성 부족

폰트, 브라우저 버전, 운영체제, 웹폰트 로딩 타이밍 차이로 점수가 흔들릴 수 있다.

대응:

- headless 환경 고정
- 폰트 전략 고정
- 애니메이션 제거

### 2. 에이전트의 과도한 파일 수정

대응:

- allowlist
- permission hooks
- artifact audit

### 3. context 비용 폭증

MCP 데이터, screenshot, diff history를 모두 매 iteration마다 넣으면 비용이 커진다.

대응:

- session resume
- diff summary 압축
- 큰 MCP 데이터는 초기 요약본 병행

### 4. 90% 기준의 과신

90%는 시각적으로 충분할 수도, 부족할 수도 있다.

대응:

- score와 함께 diff image 제공
- threshold configurable

### 5. 빌드/런타임 환경 의존성

프로젝트마다 프레임워크와 실행 방식이 달라 generic loop가 복잡해진다.

대응:

- 초기 범위는 현재 extension이 생성 가능한 preview format 중심으로 제한
- 이후 framework adapter 분리

### 6. SDK/CLI 제품 변화

Claude Agent SDK와 Claude Code 관련 기능은 빠르게 변할 수 있다.

대응:

- 외부 확장 제어가 아니라 공식 SDK를 우선 사용
- CLI는 선택 기능으로 격리
- runtime adapter 내부에 외부 제품 의존성을 캡슐화

## 24. 초기 범위에서 제외할 것

아래는 1차 구현에서 제외하는 것이 맞다.

- 여러 화면을 동시에 최적화하는 multi-screen loop
- Figma node tree의 semantic layout diff 완전 해석
- video 기반 motion similarity
- 다른 VS Code 확장 직접 제어를 기본 경로로 채택
- remote browser farm 렌더링
- 자동 commit/push

## 25. 최종 권장안

이 저장소에서 가장 현실적인 구현 순서는 아래다.

1. `loop` 도메인을 새로 만든다.
2. `RenderCaptureService`와 `ImageDiffService`를 먼저 만든다.
3. `Claude Agent SDK` 기반 `ClaudeAgentSdkRuntime`을 추가한다.
4. iteration orchestration을 `LoopOrchestrator`에 집중시킨다.
5. 기존 `prompt.generate`는 유지하고, loop는 별도 UX로 제공한다.

즉, 이 기능은 기존 code generation 기능의 옵션이 아니라, `에이전트 기반 GUI refinement 시스템`으로 다뤄야 한다.

## 26. 다음 구현 제안

문서 기준 다음 실제 작업 순서는 아래가 적절하다.

1. `src/loop/types.ts` 초안 작성
2. `types.ts` 메시지 프로토콜에 `loop.*` 추가
3. `LoopCommandHandler`와 `LoopStateManager` 추가
4. `RenderCaptureService` 초안 작성
5. `ImageDiffService` 초안 작성
6. `ClaudeAgentSdkRuntime` 의존성 및 인터페이스 설계
7. mock runtime으로 first-run UI 연결

## 27. 참고

- Claude Code CLI reference: `https://docs.claude.com/en/docs/claude-code/cli-reference`
- Claude Code hooks reference: `https://docs.claude.com/en/docs/claude-code/hooks`
- Claude Code MCP docs: `https://docs.claude.com/en/docs/claude-code/mcp`
- Claude Code settings docs: `https://docs.claude.com/en/docs/claude-code/settings`
- Claude Agent SDK overview: `https://platform.claude.com/docs/en/agent-sdk/overview`
- Claude Agent SDK MCP: `https://platform.claude.com/docs/en/agent-sdk/mcp`
- Claude Agent SDK permissions: `https://platform.claude.com/docs/en/agent-sdk/permissions`
- Claude Agent SDK sessions: `https://platform.claude.com/docs/en/agent-sdk/sessions`
- Claude Agent SDK agent loop: `https://platform.claude.com/docs/en/agent-sdk/agent-loop`
- TypeScript package install example in official docs: `npm install @anthropic-ai/claude-agent-sdk`
