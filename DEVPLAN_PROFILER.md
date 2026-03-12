# AI Agent Session Profiler Development Plan

## 0. 2026-03-12 UI 재개발 반영

이번 개정에서는 프로파일러 UI의 정보 밀도와 가독성을 다시 정의한다.

- Sidebar `Profiler Panel`의 세션 리스트는 `세션 파일명`, `timestamp(YYYY-MM-DD HH:mm)`, `파일 크기`만 보여주는 초경량 목록으로 단순화한다.
- 세션 파일명은 긴 경우 20자 이내로 잘라 리스트 폭을 고정한다.
- 에이전트 탭은 유지하되, 세션 행 내부의 `model`, `input/output token`, 기타 부가 문구는 제거한다.
- Bottom `iProfiler`는 기존의 큰 카드 나열형 구성을 버리고, `상단 compact overview + 중앙 chart + 우측 event/raw rail` 구조의 고밀도 레이아웃으로 재정렬한다.
- 메타/통계/인사이트는 한 덩어리의 overview 보드 안에 통합한다.
- 차트는 패딩, 레전드, 보조 문구, 포커스 카드 크기를 줄여 한 화면에서 더 많은 시계열과 요약값을 읽을 수 있어야 한다.
- 이벤트 카드와 raw 이벤트도 작은 활자와 짧은 요약 중심으로 줄여 차트와 동시에 보이게 한다.

### 0.1 2026-03-12 통계 카드 compact 재구성

- Sidebar와 Bottom Panel 양쪽의 통계 정보가 개별 카드 형태(`profiler-metric-card`, `profiler-summary-cell`, `profiler-insight-card`)로 표시되어 공간 낭비가 심했다.
- key name과 value가 불필요하게 개행되고, 큰 폰트와 bold 처리로 공간 효율이 낮았다.
- 이미 완성된 `Prompt Panel`의 `prompt-metric-cell` 패턴(label 좌측, value 우측, 한 행에 inline 배치, 10px 폰트, 1px gap grid)을 기준으로 통일한다.
- Sidebar: `profiler-metric-grid` → `profiler-metrics-board` (2열 compact grid)
- Bottom Panel: `profiler-summary-grid` + `profiler-insight-grid` → `profiler-overview-board` (3열 compact grid) 하나로 병합
- 모든 셀은 `profiler-metric-cell` 클래스로 통일하여 `flex row`, `justify-content: space-between`, `padding: 4px 8px`, `font-size: 10px`로 렌더링한다.
- insight card의 부가 설명(p 태그)은 제거하고, 핵심 수치만 남긴다.

## 1. 목적

이 문서는 `vscode-figma-mcp-helper`에 `AI Agent 세션 프로파일러`를 추가하기 위한 개발 기획서다.

목표는 다음과 같다.

- 로컬 스토리지에 저장된 `Claude`, `Codex`, `Gemini` 세션 파일을 검색한다.
- 세션 파일을 표준화된 구조로 파싱해 요약 목록과 상세 분석 데이터를 제공한다.
- 사이드바에 `Profiler Panel`을 추가해 에이전트별 세션 목록을 보여준다.
- VS Code 하단 `Panel` 영역에 `iProfiler` 뷰를 추가해 선택된 세션의 상세 분석을 시각화한다.
- 사용자가 원할 경우, 발견된 세션 파일을 지정 폴더로 정리하여 일괄 보관할 수 있게 한다.

핵심은 단순 파일 뷰어가 아니라 `세션 검색 -> 정규화 -> 요약 -> 상세 분석 -> 보관`까지 이어지는 분석 워크플로우를 확장 내부에서 완결하는 것이다.

가장 중요한 제품 목표는 `Bottom Panel > iProfiler`의 시간 기반 차트다. 이 차트는 사용자가 지난 세션에서 `어떤 대화가 있었는지`, `어떤 시점에 데이터(KB)와 토큰 사용량이 급증했는지`, `어떤 이벤트가 비용 증가를 유발했는지`를 빠르게 분석할 수 있어야 한다.

이 문서에서 말하는 "완성도 높은 차트"의 기준은 이번 작업에 첨부된 참조 이미지와 동일한 수준의 읽기 경험이다. 즉, 다중 시계열 라인이 한 화면에서 명확히 분리되고, 수평 그리드와 우측 y축 라벨만으로도 값의 높낮이를 빠르게 읽을 수 있으며, 범례와 종점 마커만 보고도 어느 시리즈가 어떤 추세를 보이는지 즉시 파악할 수 있는 차트를 목표로 한다.

## 2. 요구사항 재정의

### 기능 요구사항

- `Profiler Panel(view tree)`를 추가한다.
- 배치는 기존 사이드바의 `Prompt`와 `Log` 사이에 둔다.
- 분석 대상은 `Claude`, `Codex`, `Gemini` 3종이다.
- 각 에이전트의 로컬 세션 파일을 읽어 요약 리스트를 만든다.
- 요약 리스트에서 특정 세션을 선택하면 상세 분석 결과를 하단 `Panel`에 표시한다.
- `Start Analysis` 버튼으로 전체 스캔을 실행하고, 총 세션 수와 총 토큰 사용량을 집계한다.
- 탭 리스트뷰는 `Claude / Codex / Gemini` 3개로 나눈다.
- 각 세션 요약 항목에는 기본적으로 `파일명`, `timestamp`, `파일 크기`만 보여준다.
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
- 하단 `iProfiler` 뷰 추가

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
- 하단 `iProfiler`: 상세 분석과 시각화 중심

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

Bottom iProfiler Panel
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
- 전체 집계 보드 (Prompt Panel과 동일한 compact inline key-value 레이아웃)
  - 총 세션 수
  - 총 input tokens
  - 총 output tokens
  - 총 파일 크기
- 탭 헤더
  - `Claude`
  - `Codex`
  - `Gemini`
- 세션 리스트
  - 파일명(최대 20자)
  - 날짜/시간(`YYYY-MM-DD HH:mm`)
  - 파일 크기
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

## 7.2 하단 `Panel` 영역의 `iProfiler`

VS Code 공식 용어 기준 이 영역은 `Panel`이다. `Problems / Output / Terminal`과 같은 레벨에 새 패널 컨테이너를 추가한다.

권장 구현:

- `contributes.viewsContainers.panel`에 `figma-mcp-helper-profiler-panel` 추가
- 제목은 `iProfiler`
- 그 안에 단일 webview view `figma-mcp-helper.profiler-detail` 등록

### 상세 뷰 구성

- 헤더
  - agent name
  - model
  - source path
  - compact timestamp / range
- compact overview 보드
  - 세션 식별 정보
  - source / provider / status / workspace / range pill
  - total / turns / peak turn / slowest / span / file size
  - peak tokens / largest payload / slowest request 인사이트
- 그래프 영역
  - 가로 스크롤 지원
  - x축: timestamp
  - y축: 기본은 tokens
  - 기본 시각화는 첨부 참조 이미지처럼 `다중 시계열 line chart` 품질을 목표로 한다
  - 수평 grid line, 우측 y축 라벨, 하단 범례, 시리즈 종점 마커를 포함한다
  - 시리즈: `total / input / output / cached / trend`를 우선 제공하고, 필요한 경우 `max context` 또는 `payload trend`를 보조 시리즈로 확장한다
  - 보조 metric: data size(KB) 토글 또는 보조 축
  - latency metric: request -> response-received / response-complete duration(ms)
  - 특정 시점 spike가 명확히 보이도록 hover, crosshair, zoom 또는 좁은 구간 집중 탐색 지원
  - 주요 목표는 `언제`, `어떤 대화/이벤트 때문에`, `얼마나 많은 token/data가 사용되었는지`를 빠르게 읽게 하는 것이다
  - 추가 목표는 `어떤 요청이 오래 걸렸는지`, `긴 응답 시간이 높은 token/data 사용량과 연결되는지`를 읽게 하는 것이다
- 이벤트 버블 레이어
  - 주요 event message 요약
  - hover tooltip
  - click 시 원본 이벤트 또는 메시지를 editor에 표시
- 우측 rail
  - key events
  - linked raw events
  - 모두 compact card로 표시
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
- 세션 상세 분석 요청 시 하단 `iProfiler` 뷰에 `로딩중..` 상태를 먼저 렌더링한다.
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

## 10.3 참조 차트 수준 목표

이번 작업의 참조 이미지는 단순한 선 그래프 예시가 아니라, 실제로 달성해야 하는 시각적 판독성 기준이다.

- 한 차트 안에서 4~5개 시리즈를 동시에 올려도 라인이 서로 뭉개지지 않아야 한다.
- 우측 y축 숫자만으로도 대략적인 규모를 즉시 읽을 수 있어야 한다.
- 종점 마커를 통해 "현재/마지막 상태"를 빠르게 비교할 수 있어야 한다.
- 날짜 축 라벨은 과도하게 빽빽하지 않게 유지하되, 세션이 며칠에 걸치면 월/일 단위 변화를 읽을 수 있어야 한다.
- 범례는 색만이 아니라 마커 형태까지 함께 보여서 테마가 바뀌어도 구분이 가능해야 한다.
- spike hotspot, key event card, raw row가 차트와 직접 연결되어 "차트에서 본 이상치"를 바로 원문 이벤트로 추적할 수 있어야 한다.

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
- `iProfiler` panel container 및 detail webview 추가
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

- ~~초기 버전은 SVG 또는 Canvas 기반 단순 커스텀 차트로 시작~~ → visx(Airbnb) 라이브러리로 전환 완료 (섹션 19 참조)
- visx 모듈식 import로 번들 크기 증가를 최소화
- 가로 스크롤, hover crosshair, series toggle, bar click navigation 구현 완료

## 16. 권장 구현 우선순위

가장 먼저 해야 할 일은 아래 세 가지다.

1. `Profiler` 사이드바와 `iProfiler` 하단 패널 뼈대 추가
2. `CodexSessionProvider`를 기준 구현체로 완성
3. 공통 `SessionSummary/SessionDetail` 모델을 확정

이 세 가지가 잡히면 Claude/Gemini는 provider 추가 작업으로 확장 가능하다.

## 17. 결론

이 기능은 현재 확장 구조와 잘 맞는다. 다만 `Prompt` 기능의 하위 옵션이 아니라 `세션 분석 도메인`으로 분리해야 한다.

권장 방향은 다음과 같다.

- 사이드바에 `Profiler` webview 추가
- 하단 `Panel`에 `iProfiler` webview 추가
- 에이전트별 `SessionProvider` 구조 도입
- 파일 검색, 요약 분석, 상세 분석, 아카이브를 독립 서비스로 분리

v1의 성공 기준은 명확하다.

- Codex 세션 파일을 안정적으로 스캔하고 분석할 수 있다.
- Claude/Gemini는 설정 가능한 경로 기반으로 동일 UI에 수용된다.
- 사용자는 세션 목록 탐색, 상세 분석 확인, 파일 아카이브를 VS Code 안에서 수행할 수 있다.

## 18. 2026-03-11 재평가 및 수정 계획

### 현재 draft 구현 평가

- 사이드바/하단 패널 뼈대는 이미 들어갔다.
- `Codex`는 부분 파싱만 되어 있었고, turn 단위 누적 token delta와 latency 분석이 부족했다.
- `Claude`는 실제 로컬 JSONL 포맷이 존재하지만 상세 분석이 사실상 미구현이었다.
- `Gemini`는 현재 로컬에서 세션 원본 포맷을 확인하지 못했고, `.gemini` 루트에는 브라우저 프로필 노이즈가 많아 탐색 전략을 보수적으로 다뤄야 한다.
- `iProfiler`는 SVG polyline 수준이라 `시간순 세션 구간`, `turn/request 단위 token 소모`, `spike 구간`, `payload/latency 비교`를 읽기 어려웠다.

즉, 현재 구현은 v1 초안으로는 의미가 있지만, 사용자가 원하는 "지난 세션을 다시 읽는 분석 도구" 수준에는 도달하지 못했다.

### 실포맷 재확인 결과

#### Codex

- 실제 포맷은 `session_meta`, `task_started`, `user_message`, `token_count`, `agent_message`, `task_complete`, `function_call/custom_tool_call` 중심의 JSONL이다.
- `token_count.info.total_token_usage`는 누적값이므로 차트는 raw 누적치가 아니라 `turn delta`로 다시 계산해야 한다.
- latency는 `task_started -> first response` 또는 `task_started -> task_complete` 기준으로 계산하는 것이 자연스럽다.

#### Claude

- 실제 포맷은 `user`, `assistant`, `progress`, `queue-operation`, `file-history-snapshot` 등이 섞인 JSONL이다.
- assistant record의 `message.usage` 안에 `input/output/cache_*`가 있으며, `requestId` 기준으로 묶어야 중복 집계가 줄어든다.
- assistant content는 `text`, `tool_use`, `thinking`으로 나뉘므로 bubble title/detail 생성 규칙이 agent별로 달라야 한다.

#### Gemini

- 현재 로컬 환경에서는 세션 원본을 확인하지 못했다.
- 따라서 이번 수정에서는 `Gemini parser 완성`보다 `탐색 noise 축소 + fallback 안전화`를 우선한다.
- 실제 Gemini 세션 샘플 확보 후 parser를 별도 phase로 확정하는 것이 맞다.

### 수정 구현 원칙

- 차트의 기본 단위는 low-level event 전체가 아니라 `Codex turn`, `Claude request` 같은 의미 단위로 재구성한다.
- x축은 시간순, y축은 metric별(`tokens`, `KB`, `latency`)로 분리한다.
- `tokens`는 stacked bar보다 참조 이미지 수준의 비교 가독성을 우선해 `multi-series line chart`를 기본으로 본다.
- `KB`, `latency`도 동일한 time rail 위에서 line chart + trend overlay 구조로 맞춘다.
- raw event list는 길게 늘이지 말고, spike와 직접 연결되는 핵심 row만 짧게 보여준다.
- matrix 형태의 보조 수치는 축소하고, `총량`, `peak`, `slowest`, `span` 같은 고신호 수치만 전면에 둔다.

### 이번 수정 작업 범위

- `Codex` turn aggregation 재구현
- `Claude` request aggregation 신규 구현
- directory walker에 noise directory skip 추가
- `iProfiler`를 참조 이미지 수준의 판독성을 목표로 한 horizontal scrollable multi-series chart로 재구현
- spike hotspot / concise event cards / compact raw rows 추가
- parser/UI 회귀 방지 테스트 추가

### 이번 수정 이후 남는 후속 과제

- 실제 Gemini session fixture 확보 및 parser 구현
- ~~chart hover/crosshair 세밀화~~ → visx 전환으로 해결
- 선택 구간 zoom/filter UI 추가
- ~~series visibility toggle~~, highlighted focus range, percentile guide line 추가 → visx 전환으로 toggle 해결
- data/latency chart에도 endpoint marker와 trend overlay를 일관되게 적용
- raw event list와 chart hotspot 간 양방향 selection sync 추가
- archive manifest에 통계 요약 추가
- parse warning, partial parse 원인, skipped directory 이유를 UI에 더 구체적으로 노출
- 모바일 폭과 좁은 panel 폭에서의 axis tick density 최적화
- 접근성 보강: 색상 외 마커/텍스트 대체, keyboard focus 이동, screen-reader용 summary 문구 추가

## 19. 2026-03-12 차트 라이브러리 전환: visx

### 배경

기존 차트는 `ProfilerDetailLayer.ts` 내에서 SVG path 문자열을 직접 생성하는 ~450줄의 커스텀 구현이었다. 유지보수 비용, 인터랙션 확장성(hover, crosshair, series toggle, bar click navigation 등)을 고려하여 범용 차트 라이브러리로 전환한다.

### 라이브러리 선정: visx (Airbnb)

선정 사유:

- **SVG 기반 + React**: 기존 렌더링 방식(SVG)과 동일하며, 프로젝트에 이미 React 의존성이 존재
- **모듈식 패키지**: 필요한 모듈만 import하여 번들 크기를 최소화 (~15-20KB gzip)
- **D3 기반 저수준 제어**: 기존 커스텀 구현과 동등한 수준의 스타일링/마커/레이아웃 자유도 유지
- **VS Code Webview 호환**: DOM 직접 조작 없이 React 컴포넌트로 동작하므로 webview 환경에서 안정적

비교 검토한 대안:

- `Recharts`: 선언적 API로 빠른 개발이 가능하지만 세밀한 커스터마이징에 제약
- `Chart.js / uPlot`: Canvas 기반으로 접근성이 떨어지며 React 래퍼가 별도 필요
- `ECharts`: 기능이 풍부하지만 번들 크기가 큼

### 설치 패키지

```
@visx/scale @visx/shape @visx/axis @visx/grid @visx/group @visx/tooltip @visx/event @visx/responsive
```

### 구현 구조

```
ProfilerDetailLayer.ts (host layer)
  └─ mountChart() → React.createElement(ProfilerChart)
       └─ ProfilerChart.tsx (visx React component)
            ├─ scaleTime / scaleLinear  (x/y 축)
            ├─ LinePath                 (시리즈 라인)
            ├─ Bar (rect)              (데이터 포인트별 막대)
            ├─ GridRows                (수평 그리드)
            ├─ AxisBottom / AxisRight  (축 라벨)
            ├─ Group                   (마커, 크로스헤어)
            └─ localPoint              (마우스 이벤트 좌표)
```

- `ProfilerDetailLayer`는 기존처럼 overview, bubble list, raw list를 문자열 HTML로 렌더링
- 차트 영역만 `ReactDOM.createRoot()`로 마운트하여 React 컴포넌트로 위임
- esbuild 설정에 `jsx: 'automatic'`, `loader: { '.tsx': 'tsx' }` 추가

### 구현된 요구사항

1. **시리즈 토글**: 범례(legend) 내 각 시리즈 라벨을 클릭하면 해당 시리즈의 visibility가 토글된다. 비활성 시리즈는 strikethrough + 반투명 처리.
2. **막대그래프 오버레이**: 각 타임라인 포인트에 반투명 bar를 렌더링하여 데이터가 존재하는 시점을 시각적으로 표시한다.
3. **막대 클릭 → 원본 로그 포커스**: 막대를 클릭하면 해당 타임라인 포인트의 `sourceEventId`를 통해 원본 raw event의 `filePath:lineNumber`로 커서를 이동시킨다 (`profiler.openSource` 커맨드).
4. **고정 시간 간격 횡스크롤**: 차트 너비는 시간 범위에 비례하여 계산되며(`PIXELS_PER_MINUTE = 14`, `MIN_POINT_SPACING = 72`), 화면을 초과하면 수평 스크롤로 탐색한다. 데이터를 한 화면에 압축하지 않는다.

### 추가 구현 사항

- **Tooltip + Crosshair**: 차트 위에서 마우스 이동 시 가장 가까운 데이터 포인트에 수직 크로스헤어와 tooltip 카드를 표시한다.
- **Area fill**: 첫 번째 visible 시리즈 아래에 반투명 area fill을 렌더링한다.
- **Endpoint markers**: 각 시리즈의 마지막 데이터 포인트에 고유 형상(circle, square, diamond, triangle) 마커를 표시한다.

### 번들 영향

- 변경 전: `dist/webview.js` ~245KB
- 변경 후: `dist/webview.js` ~388KB (+143KB, visx + d3-scale 의존성)
- gzip 후 실질 증가분은 ~40KB 수준으로 VS Code 확장 로드 시간에 미미한 영향

### 테스트

- 기존 `ProfilerDetailLayer` 테스트를 `react.act()`로 래핑하여 React 비동기 렌더링에 대응
- 차트 내 `.profiler-chart-bar` 요소 존재 확인으로 bar 렌더링 검증
- 범례 텍스트('Input', 'Trend') 존재 확인으로 시리즈 정의 검증
