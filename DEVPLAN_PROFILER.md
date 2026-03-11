# AI Agent Session Profiler Development Plan

## 1. 목적

이 문서는 `vscode-figma-mcp-helper`에 `AI Agent 세션 프로파일러`를 추가하기 위한 개발 기획서다.

목표는 다음과 같다.

- 로컬 스토리지에 저장된 `Claude`, `Codex`, `Gemini` 세션 파일을 검색한다.
- 세션 파일을 표준화된 구조로 파싱해 요약 목록과 상세 분석 데이터를 제공한다.
- 사이드바에 `Profiler Panel`을 추가해 에이전트별 세션 목록을 보여준다.
- VS Code 하단 `Panel` 영역에 `F.Profiler` 뷰를 추가해 선택된 세션의 상세 분석을 시각화한다.
- 사용자가 원할 경우, 발견된 세션 파일을 지정 폴더로 정리하여 일괄 보관할 수 있게 한다.

핵심은 단순 파일 뷰어가 아니라 `세션 검색 -> 정규화 -> 요약 -> 상세 분석 -> 보관`까지 이어지는 분석 워크플로우를 확장 내부에서 완결하는 것이다.

가장 중요한 제품 목표는 `Bottom Panel > F.Profiler`의 시간 기반 차트다. 이 차트는 사용자가 지난 세션에서 `어떤 대화가 있었는지`, `어떤 시점에 데이터(KB)와 토큰 사용량이 급증했는지`, `어떤 이벤트가 비용 증가를 유발했는지`를 빠르게 분석할 수 있어야 한다.

## 2. 요구사항 재정의

### 기능 요구사항

- `Profiler Panel(view tree)`를 추가한다.
- 배치는 기존 사이드바의 `Prompt`와 `Log` 사이에 둔다.
- 분석 대상은 `Claude`, `Codex`, `Gemini` 3종이다.
- 각 에이전트의 로컬 세션 파일을 읽어 요약 리스트를 만든다.
- 요약 리스트에서 특정 세션을 선택하면 상세 분석 결과를 하단 `Panel`에 표시한다.
- `Start Analysis` 버튼으로 전체 스캔을 실행하고, 총 세션 수와 총 토큰 사용량을 집계한다.
- 탭 리스트뷰는 `Claude / Codex / Gemini` 3개로 나눈다.
- 각 세션 요약 항목에는 `날짜`, `파일 크기`, `총 토큰 사용량(input/output)`을 보여준다.
- 상세 뷰에는 `에이전트 이름`, `모델`, `원본 파일 경로`, `시간별 사용량 그래프`, `주요 이벤트 요약`, `원본 메시지 열기` 기능을 포함한다.
- 사용자가 원하면 발견된 원본 파일을 선택 폴더로 모아 저장하는 `archive/export` 기능을 제공한다.
- 분석 진행 중이거나 오래 걸리는 작업 중에는 `로딩중..` 상태를 명확히 표시한다.
- 상세 분석의 핵심은 `시간별 data(KB) + token 사용량 그래프`이며, 사용자가 세션 내 비용 급증 구간과 대화 맥락을 연결해서 볼 수 있어야 한다.
- 상세 차트에는 각 요청 시점 대비 응답 수신 또는 응답 완료까지 걸린 시간도 함께 표시해야 한다.

### 비기능 요구사항

- 원본 파일은 기본적으로 수정하지 않는다.
- 대용량 세션 폴더를 스캔해도 UI가 멈추지 않아야 한다.
- 상세 분석은 지연 로딩으로 처리한다.
- 포맷이 불완전하거나 에이전트별 구조가 달라도 파서 실패가 전체 분석을 깨뜨리지 않아야 한다.
- 민감한 대화 데이터가 포함될 수 있으므로 로컬 처리 우선 원칙을 유지한다.
- 장시간 작업의 진행 상태를 사용자가 즉시 인지할 수 있어야 한다.

## 3. 현재 구조 진단

현재 확장은 다음과 같은 구조를 사용한다.

- Activity Bar 컨테이너: `figma-mcp-helper`
- Sidebar Webview Views: `setup`, `prompt`, `log`
- 각 뷰는 `SidebarProvider` + `WebviewMessageHandler` + UI `Layer` 조합으로 동작한다.
- 프런트엔드는 `src/webview/ui/main.ts`에서 `section` 값에 따라 레이어를 분기한다.

현재 상태에서 확인되는 특징:

1. 사이드바 뷰는 모두 `webview view` 방식이다.
2. 하단 `Panel` 전용 컨테이너는 아직 없다.
3. `StateManager`는 현재 에이전트 설정과 Figma 컨텍스트 중심이며, 프로파일러 상태를 담는 구조는 없다.
4. 로컬 파일 스캔, 세션 파싱, 분석 집계, 차트 렌더링 계층은 아직 없다.

즉, 이번 기능은 기존 `Prompt` 기능의 단순 옵션 추가가 아니라 별도 도메인으로 설계하는 것이 맞다.

## 4. 제품 범위

### 이번 기획서 기준 v1 범위

- 세션 파일 검색
- 에이전트별 파서 추가
- 세션 요약 목록 제공
- 세션 상세 분석 제공
- 선택 파일 아카이브 기능 제공
- 하단 `F.Profiler` 뷰 추가

### v1 제외 범위

- 실시간 에이전트 프로세스 감시
- 원격 클라우드 동기화
- 토큰 비용 환산
- 세션 데이터 자동 삭제 정책
- 다중 기기 스토리지 통합

## 5. 핵심 결정 사항

### 결정 1. 사이드바와 하단 패널을 분리한다

요약 목록과 상세 분석은 정보 밀도가 다르다.

- 사이드바 `Profiler Panel`: 탐색과 필터링 중심
- 하단 `F.Profiler`: 상세 분석과 시각화 중심

이렇게 나누면 현재 `Prompt`/`Log` 패턴도 유지되고, 그래프 같은 넓은 UI는 하단 패널에서 자연스럽게 처리할 수 있다.

### 결정 2. 파일 검색과 파일 파싱을 분리한다

에이전트별 저장 위치와 포맷은 다를 수 있으므로 아래 두 계층이 필요하다.

- `Discovery`: 어디에 어떤 파일이 있는지 찾는 계층
- `Parser`: 찾은 파일을 읽고 요약/상세 구조로 정규화하는 계층

경로 검색 실패와 파싱 실패를 분리하면 디버깅과 확장이 쉬워진다.

### 결정 3. 에이전트별 파서는 공통 인터페이스를 따른다

권장 인터페이스:

```ts
interface SessionProvider {
  agent: 'claude' | 'codex' | 'gemini';
  discover(context: DiscoveryContext): Promise<DiscoveredSessionFile[]>;
  summarize(file: DiscoveredSessionFile): Promise<SessionSummary>;
  analyze(file: DiscoveredSessionFile): Promise<SessionDetail>;
}
```

이 구조를 쓰면 향후 DeepSeek, Qwen 같은 신규 에이전트도 같은 패턴으로 확장할 수 있다.

### 결정 4. 상세 분석은 원본 이벤트 기반 타임라인으로 만든다

사용자가 원하는 그래프는 단순 aggregate만으로는 부족하다.

세션 파일에서 이벤트 단위 데이터를 유지한 채 다음을 생성해야 한다.

- timestamp 기반 시계열
- token usage 변화
- file size 또는 payload size 추정
- request-start -> response-received/response-complete 지연 시간
- 주요 이벤트 요약 버블
- 메시지 원문 참조 포인터

즉, 파서 출력은 `최종 통계`뿐 아니라 `time-series samples`를 제공해야 한다.

### 결정 5. KB와 token은 동일 축에 강제로 합치지 않는다

`KB`와 `token`은 단위가 다르다. 하나의 절대 y축에 같이 올리면 해석이 왜곡된다.

권장안:

- 기본 분석 초점은 `시간별 토큰 사용량`이다.
- `KB`는 같은 시간축 위에서 함께 비교할 수 있어야 하지만, y축은 분리하거나 metric toggle로 전환한다.
- input/output/cached/max는 stacked 또는 multi-series로 표시한다.
- 요청 대비 응답 지연 시간은 별도 시리즈 또는 marker로 함께 표시한다.
- 사용자는 특정 spike 구간을 보고 즉시 그 시점의 대화/이벤트로 내려갈 수 있어야 한다.

문서상 요구는 유지하되, 구현 기획에서는 `metric toggle + multi-series`를 권장안으로 채택한다.

## 6. 권장 아키텍처

### 상위 구조

```text
Sidebar Profiler View
  -> ProfilerCommandHandler
    -> SessionDiscoveryService
    -> SessionSummaryService
    -> ProfilerStateManager

Bottom F.Profiler Panel
  -> ProfilerDetailCommandHandler
    -> SessionAnalysisService
    -> SessionTimelineBuilder
    -> EditorIntegration

Shared Domain
  -> ClaudeSessionProvider
  -> CodexSessionProvider
  -> GeminiSessionProvider
  -> SessionArchiveService
  -> SessionRepository
```

### 주요 책임

#### `ProfilerStateManager`

- 마지막 분석 시각
- 에이전트별 검색 상태
- 검색 결과 캐시
- 현재 선택된 세션 ID
- 현재 상세 분석 로딩 상태

#### `SessionDiscoveryService`

- OS별 기본 후보 경로 관리
- 사용자 지정 루트/글롭 설정 반영
- 파일 메타데이터 수집
- 중복 파일 제거

#### `SessionSummaryService`

- 요약 통계 계산
- 총 세션 수, 총 토큰 사용량 계산
- 사이드바 목록용 데이터 구성

#### `SessionAnalysisService`

- 선택된 세션 파일 상세 파싱
- 모델, 에이전트, 이벤트, 토큰, 메시지 요약 계산
- 그래프용 시계열 데이터 생성

#### `SessionTimelineBuilder`

- timestamp 정렬
- event bubble용 요약 생성
- 차트 샘플 포맷 생성
- 에디터 오픈용 원문 포인터 생성

#### `SessionArchiveService`

- 사용자가 선택한 폴더에 파일 복사
- 에이전트/날짜 기준 하위 디렉터리 정리
- manifest 파일 저장

## 7. VS Code UI 설계

## 7.1 사이드바 `Profiler Panel`

### 배치

기존 `package.json`의 `contributes.views.figma-mcp-helper` 순서를 아래처럼 조정한다.

```json
[
  { "id": "figma-mcp-helper.setup" },
  { "id": "figma-mcp-helper.prompt" },
  { "id": "figma-mcp-helper.profiler" },
  { "id": "figma-mcp-helper.log" }
]
```

즉, `Prompt`와 `Log` 사이에 `Profiler`를 삽입한다.

### 구성 요소

- `Start Analysis` 버튼
- 분석 상태 배지 (`idle`, `scanning`, `done`, `error`)
- 장시간 작업 중 `로딩중..` 인라인 상태 표시
- 전체 집계 카드
  - 총 세션 수
  - 총 input tokens
  - 총 output tokens
  - 총 파일 크기
- 탭 헤더
  - `Claude`
  - `Codex`
  - `Gemini`
- 세션 리스트
  - 날짜/시간
  - 파일 크기
  - 총 input/output tokens
  - 모델명 요약
  - 경고 아이콘(파싱 불완전)
- 보조 액션
  - `Refresh`
  - `Archive All`
  - `Open Folder`

### 상호작용

1. `Start Analysis` 클릭
2. 백그라운드 스캔 시작
3. 스캔 중 `로딩중..` 상태와 비활성 버튼을 표시
4. 탭별 세션 목록 생성
5. 리스트 아이템 클릭 시 상세 뷰 갱신
6. 필요 시 `Archive All`로 결과 파일 정리

## 7.2 하단 `Panel` 영역의 `F.Profiler`

VS Code 공식 용어 기준 이 영역은 `Panel`이다. `Problems / Output / Terminal`과 같은 레벨에 새 패널 컨테이너를 추가한다.

권장 구현:

- `contributes.viewsContainers.panel`에 `figma-mcp-helper-profiler-panel` 추가
- 제목은 `F.Profiler`
- 그 안에 단일 webview view `figma-mcp-helper.profiler-detail` 등록

### 상세 뷰 구성

- 헤더
  - agent name
  - model
  - session id
  - source path
  - start/end time
- 요약 블록
  - total input tokens
  - total output tokens
  - cached tokens
  - max context / max observed payload
  - file size
- 그래프 영역
  - 가로 스크롤 지원
  - x축: timestamp
  - y축: 기본은 tokens
  - 시리즈: input / output / cached / max
  - 보조 metric: data size(KB) 토글 또는 보조 축
  - latency metric: request -> response-received / response-complete duration(ms)
  - 특정 시점 spike가 명확히 보이도록 hover, crosshair, zoom 또는 좁은 구간 집중 탐색 지원
  - 주요 목표는 `언제`, `어떤 대화/이벤트 때문에`, `얼마나 많은 token/data가 사용되었는지`를 빠르게 읽게 하는 것이다
  - 추가 목표는 `어떤 요청이 오래 걸렸는지`, `긴 응답 시간이 높은 token/data 사용량과 연결되는지`를 읽게 하는 것이다
- 이벤트 버블 레이어
  - 주요 event message 요약
  - hover tooltip
  - click 시 원본 이벤트 또는 메시지를 editor에 표시
- 하단 raw event list
  - timestamp
  - type
  - short summary
  - open action
- 상세 분석 로딩 중 `로딩중..` 오버레이 또는 skeleton 표시

## 8. 데이터 소스 전략

### 원칙

에이전트별 기본 저장 위치는 OS, 앱 종류, 버전에 따라 달라질 수 있다. 따라서 v1은 `preset path + user override + glob pattern` 구조로 간다.

### 경로 탐색 전략

- 기본 preset roots
  - macOS 기준 알려진 루트 후보를 우선 검사
  - 홈 디렉터리 기반 숨김 폴더 후보를 검사
  - 앱 support 폴더 후보를 검사
- 사용자 설정 오버라이드
  - agent별 `searchRoots`
  - agent별 `globPatterns`
- 스캔 정책
  - 숨김 폴더 허용
  - symlink loop 방지
  - 파일 크기 상한
  - 최근 수정일 기준 우선 정렬

### Codex

현재 확인된 로컬 구조 예시는 다음과 같다.

- `~/.codex/sessions/**/*.jsonl`
- 보조 인덱스: `~/.codex/session_index.jsonl`
- 보조 히스토리: `~/.codex/history.jsonl`

Codex는 이벤트 기반 JSONL 포맷으로 보이며 `session_meta`, `event_msg`, `response_item`, `token_count` 같은 이벤트를 활용할 수 있다.

### Claude / Gemini

Claude와 Gemini는 실제 저장 경로와 포맷이 설치 형태에 따라 달라질 가능성이 높다. 따라서 기획상 아래처럼 처리한다.

- v1에서 기본 preset path를 제공하되 하드코딩 하나에 의존하지 않는다.
- 사용자가 agent별 루트 경로를 설정할 수 있게 한다.
- 텍스트/JSON/JSONL 혼합 포맷을 허용하는 parser chain을 둔다.
- 포맷 미지원 파일은 `unsupported`로 분류하고 로그에 남긴다.

즉, v1의 핵심은 `정해진 한 경로를 가정하는 것`이 아니라 `발견 가능한 세션 파일을 유연하게 흡수하는 것`이다.

## 9. 데이터 모델 설계

### 요약 모델

```ts
type AgentProfilerType = 'claude' | 'codex' | 'gemini';

interface SessionSummary {
  id: string;
  agent: AgentProfilerType;
  filePath: string;
  fileName: string;
  modifiedAt: string;
  startedAt?: string;
  endedAt?: string;
  fileSizeBytes: number;
  model?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCachedTokens?: number;
  totalTokens?: number;
  parseStatus: 'ok' | 'partial' | 'unsupported' | 'error';
  warnings: string[];
}
```

### 상세 모델

```ts
interface SessionDetail {
  summary: SessionSummary;
  metadata: {
    sessionId?: string;
    cwd?: string;
    provider?: string;
    sourceFormat: string;
  };
  timeline: SessionTimelinePoint[];
  eventBubbles: SessionEventBubble[];
  rawEvents: SessionRawEventRef[];
}

interface SessionTimelinePoint {
  timestamp: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  maxTokens?: number;
  payloadKb?: number;
  latencyMs?: number;
  latencyPhase?: 'response_received' | 'response_completed';
  eventType: string;
}

interface SessionEventBubble {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  rawEventIndex: number;
}
```

## 10. 세션 분석 로직

### 요약 분석

- 파일 메타데이터 수집
- 첫 이벤트/마지막 이벤트 시간 계산
- 모델 추출
- 마지막 누적 token_count 추출
- 파싱 오류 여부 계산

### 상세 분석

- 전체 이벤트 로드
- timestamp 정규화
- 토큰 샘플 누적 추적
- payload 크기를 KB 단위로 근사 계산
- request event와 response event를 매칭해 latency 계산
- 시간순 token/data spike 구간 탐지
- 주요 이벤트 후보 추출
  - user message
  - assistant message
  - tool call
  - error
  - session meta
- 이벤트 버블용 짧은 요약 생성
- spike 시점과 직전/직후 대화를 연결하는 contextual summary 생성
- 장시간 응답 구간과 높은 token/data 사용량의 상관관계 요약

### 원문 열기

사용자가 버블을 클릭하면:

- 임시 readonly document를 열거나
- 원본 파일을 해당 라인 근처로 연다

v1 권장안은 `원본 파일 + line anchor` 우선이다. 별도 임시 포맷터는 v2로 미룬다.

## 10.1 로딩 상태 UX 원칙

- `Start Analysis` 실행 직후 사이드바 상단에 `로딩중..` 배지를 즉시 표시한다.
- 스캔 중에는 중복 실행을 막기 위해 관련 액션 버튼을 비활성화한다.
- 세션 상세 분석 요청 시 하단 `F.Profiler` 뷰에 `로딩중..` 상태를 먼저 렌더링한다.
- 아카이브 작업 중에도 동일하게 `로딩중..` 상태와 대상 파일 수를 표시한다.
- 가능하면 단순 텍스트만이 아니라 spinner 또는 progress bar를 함께 사용하되, 기본 문구는 요구사항대로 `로딩중..`를 유지한다.

## 10.2 차트 UX 목표

- 차트는 `예쁘게 보이는 것`보다 `분석이 쉬운 것`이 우선이다.
- 사용자는 차트를 보고 지난 세션의 대화 흐름과 token/data 소비 패턴을 바로 읽을 수 있어야 한다.
- 급격한 사용량 증가 구간은 시각적으로 분명히 드러나야 한다.
- spike 지점을 클릭하면 해당 시점의 대화, 툴 호출, 에러, 모델 응답을 곧바로 확인할 수 있어야 한다.
- 차트와 raw event list는 서로 연결되어야 한다.
- 기본 정렬은 시간순이며, 필요한 경우 high-usage event만 필터링할 수 있어야 한다.
- 느린 응답 구간은 latency 시리즈나 marker로 분명히 표시되어야 한다.
- 사용자는 `토큰을 많이 쓴 구간`, `데이터가 큰 구간`, `응답이 오래 걸린 구간`이 서로 어떻게 겹치는지 빠르게 비교할 수 있어야 한다.

## 11. 아카이브 기능 설계

### 사용자 플로우

1. `Archive All` 또는 `Archive Selected` 클릭
2. 대상 폴더 선택
3. 복사 정책 확인
4. 파일 복사 및 manifest 생성
5. 완료 메시지 표시

### 출력 구조 권장안

```text
<chosen-folder>/
  manifest.json
  claude/
    2026/03/...
  codex/
    2026/03/...
  gemini/
    2026/03/...
```

### manifest 정보

- exportedAt
- sourceRoots
- totalFiles
- totalBytes
- copiedFiles[]
- failedFiles[]

## 12. 구현 단계

### Phase 1. 기초 인프라

- `VIEW_IDS` 확장
- `Profiler` sidebar webview 추가
- `F.Profiler` panel container 및 detail webview 추가
- `ProfilerStateManager` 추가

### Phase 2. 데이터 계층

- `SessionProvider` 인터페이스 정의
- `CodexSessionProvider` 구현
- `ClaudeSessionProvider`, `GeminiSessionProvider` 스켈레톤 구현
- `SessionDiscoveryService` 구현

### Phase 3. UI 목록 기능

- `ProfilerLayer` 추가
- 탭 리스트 UI 구현
- Start Analysis / Refresh / Archive 액션 구현
- host <-> webview message schema 추가

### Phase 4. 상세 분석 기능

- `ProfilerDetailLayer` 추가
- 상세 summary 카드 구현
- timeline graph 구현
- event bubble 클릭 -> editor open 연결

### Phase 5. 아카이브 및 안정화

- `SessionArchiveService` 구현
- 설정 항목 추가
- 파싱 실패/대용량 파일 대응
- 테스트 보강

## 13. 테스트 전략

### 단위 테스트

- discovery path resolution
- session summary parsing
- token timeline generation
- archive manifest generation
- parse fallback behavior

### 통합 테스트

- webview message roundtrip
- 분석 시작 후 리스트 갱신
- 세션 선택 후 상세 뷰 렌더링
- 버블 클릭 후 에디터 열기

### fixture 전략

- `test/fixtures/profiler/codex`
- `test/fixtures/profiler/claude`
- `test/fixtures/profiler/gemini`

포맷별 정상/부분손상/미지원 샘플을 분리해 둔다.

## 14. 설정 항목 제안

```json
{
  "figma-mcp-helper.profiler.claudeSearchRoots": [],
  "figma-mcp-helper.profiler.codexSearchRoots": [],
  "figma-mcp-helper.profiler.geminiSearchRoots": [],
  "figma-mcp-helper.profiler.maxFilesPerAgent": 5000,
  "figma-mcp-helper.profiler.maxFileSizeMB": 20,
  "figma-mcp-helper.profiler.archivePreserveStructure": true
}
```

## 15. 리스크와 대응

### 리스크 1. 에이전트별 저장 포맷 차이

대응:

- provider 인터페이스 강제
- partial parse 허용
- unsupported 파일 로그화

### 리스크 2. 대형 세션 파일로 인한 성능 저하

대응:

- 요약 단계와 상세 단계 분리
- 상세는 클릭 시 로딩
- 파일 수/크기 상한 설정

### 리스크 3. 민감 정보 노출

대응:

- 로컬 처리 우선
- export는 명시적 사용자 액션일 때만 실행
- raw message 표시 시 masking 옵션을 v2 후보로 고려

### 리스크 4. 차트 복잡도

대응:

- 초기 버전은 SVG 또는 Canvas 기반 단순 커스텀 차트로 시작
- 외부 차트 라이브러리 의존은 최소화
- 가로 스크롤과 hover만 우선 구현

## 16. 권장 구현 우선순위

가장 먼저 해야 할 일은 아래 세 가지다.

1. `Profiler` 사이드바와 `F.Profiler` 하단 패널 뼈대 추가
2. `CodexSessionProvider`를 기준 구현체로 완성
3. 공통 `SessionSummary/SessionDetail` 모델을 확정

이 세 가지가 잡히면 Claude/Gemini는 provider 추가 작업으로 확장 가능하다.

## 17. 결론

이 기능은 현재 확장 구조와 잘 맞는다. 다만 `Prompt` 기능의 하위 옵션이 아니라 `세션 분석 도메인`으로 분리해야 한다.

권장 방향은 다음과 같다.

- 사이드바에 `Profiler` webview 추가
- 하단 `Panel`에 `F.Profiler` webview 추가
- 에이전트별 `SessionProvider` 구조 도입
- 파일 검색, 요약 분석, 상세 분석, 아카이브를 독립 서비스로 분리

v1의 성공 기준은 명확하다.

- Codex 세션 파일을 안정적으로 스캔하고 분석할 수 있다.
- Claude/Gemini는 설정 가능한 경로 기반으로 동일 UI에 수용된다.
- 사용자는 세션 목록 탐색, 상세 분석 확인, 파일 아카이브를 VS Code 안에서 수행할 수 있다.
