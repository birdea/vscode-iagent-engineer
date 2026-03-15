# Profiler Screen Guide

## 한국어

### 개요

`Profiler`는 로컬 에이전트 세션 로그를 찾아보고, 선택한 세션을 하단 `iProfiler` 패널에서 자세히 분석하는 화면입니다. 현재 UI 기준으로 사이드바는 `Claude`, `Codex` 중심 탐색에 맞춰져 있고, 상세 분석은 하단 패널에서 수행합니다.

- 프로파일러는 처음 열릴 때 저장된 기본 탭 기준으로 자동 스캔을 시도합니다.
- 상세 패널은 별도 하단 패널 컨테이너 `iProfiler`에 표시됩니다.

### 사용 흐름

1. 사이드바에서 `Find`를 눌러 세션 파일을 다시 스캔합니다.
2. `Claude` 또는 `Codex` 탭을 선택합니다.
3. 정렬 버튼으로 이름, 시간, 입력 토큰, 출력 토큰, 파일 크기 기준을 바꿉니다.
4. 세션 카드를 클릭하면 하단 `iProfiler` 패널에 상세 분석이 열립니다.
5. 차트 포인트나 이벤트 로그를 눌러 원본 파일 위치로 이동합니다.

### 좌측 패널

#### Toolbar

- `Find`: 설정된 search root를 기준으로 세션 파일을 다시 스캔합니다.
- 상태 칩은 현재 상태(`idle`, `loading`, `ready`, `error`)와 마지막 알림을 보여줍니다.
- 스캔 중에는 `Find` 버튼이 잠시 비활성화됩니다.
- 자동 갱신이 켜져 있으면 `Latest` / `Live` 배지가 조용히 다시 계산됩니다.

#### Agent Tabs

- 현재 활성 탭은 `Claude`, `Codex`입니다.
- `Gemini` 탭은 현재 UI에서 비활성화되어 있습니다.

#### Session List

- 각 세션 카드는 파일명, latest/live 여부, 파일 크기, 시간, 입력/출력 토큰을 보여줍니다.
- `Latest` 배지는 같은 agent 탭에서 가장 최근에 업데이트된 세션을 뜻합니다.
- `Live` 배지는 `Latest` 세션 중에서도 아주 최근까지 갱신된 세션을 뜻합니다.
- 선택된 카드는 하단 상세 패널과 연결됩니다.

#### Sort Row

- `Name`: 파일명 기준 정렬
- `Time`: 시작 또는 수정 시각 기준 정렬
- `tin`: 입력 토큰 기준 정렬
- `tout`: 출력 토큰 기준 정렬
- `Size`: 파일 크기 기준 정렬

같은 버튼을 다시 누르면 오름차순/내림차순이 전환됩니다.

### 하단 `iProfiler` 패널

#### Header

- vendor, 모델명, 세션 ID가 표시됩니다.
- 제목 우측에 마지막 overview 갱신 시각인 `Updated`가 표시됩니다.
- `Auto Refresh`로 overview 새로고침 주기를 선택할 수 있습니다.
- 제목 영역의 액션으로 overview를 즉시 다시 불러올 수 있습니다.
- `Info` 버튼으로 이 문서를 다시 열 수 있습니다.
- `Live` 버튼은 라이브 모니터링을 시작하거나 중지합니다.
- `Info` 버튼을 누르면 한국어/English 중 원하는 섹션으로 바로 이동할 수 있습니다.

#### Summary

- `File`, `Size`, `Tokens`, `Cost`, `Turns`, `Duration`, `Peak`, `Avg/Turn`, `Cache`, `Latency`, `Total Tok`, `Date`를 한 보드에서 보여줍니다.
- Summary 영역은 접기/펼치기가 가능합니다.
- Summary 헤더 아무 곳이나 눌러도 접기/펼치기가 가능합니다.
- 선택된 세션이 없거나 아직 로딩 중이면 요약 보드 대신 상태 메시지가 표시됩니다.

#### Chart

- 선택한 세션의 타임라인을 시각화합니다.
- 토큰, 데이터 크기, 지연 시간 중심으로 분석합니다.
- 원본 이벤트와 연결된 포인트는 클릭으로 소스 파일 위치를 열 수 있습니다.
- 포인트 주변 클릭 영역이 넓어져 밀집된 세션에서도 선택이 쉬워졌습니다.
- Chart 영역도 접기/펼치기가 가능합니다.

#### Event Log

- 이벤트는 시간순으로 정렬됩니다.
- `User`, `Agent`, `System` 역할로 묶여 표시됩니다.
- payload 크기, 토큰 수, 메시지 미리보기가 함께 나올 수 있습니다.
- 항목을 클릭하면 대응되는 원본 로그 줄을 엽니다.
- 라이브 모드가 켜져 있으면 실시간 상태 메시지도 같은 로그 영역에 함께 합쳐져 보일 수 있습니다.
- Event Log 영역도 접기/펼치기가 가능합니다.
- Event Log 헤더도 클릭으로 바로 접기/펼치기가 가능합니다.

### Live 모드

- 라이브 모드에서는 세션 파일이 바뀔 때 차트와 이벤트 로그가 다시 계산됩니다.
- 모니터링을 중지하면 마지막 스냅샷은 유지되고 자동 갱신만 멈춥니다.
- 라이브 모니터링은 현재 선택 세션이 `Live` 후보로 판단되는 경우 자동 연결될 수 있습니다.
- overview의 `Auto Refresh`는 세션 목록과 `Latest`/`Live` 배지를 조용히 다시 계산하고, 선택된 상세 패널은 유지합니다.

### 참고

- 비용은 모델명 기반 추정치라 실제 청구액과 다를 수 있습니다.
- 세션 포맷에 따라 일부 값은 비어 있거나 추론값일 수 있습니다.
- 현재 사이드바의 기본 노출 대상은 `Claude`, `Codex`입니다.
- 현재 사이드바에는 `Archive All` 버튼이 노출되어 있지 않습니다. 아카이브 기능은 호스트 쪽에만 남아 있습니다.

## English

### Overview

The `Profiler` helps you browse local agent session logs and inspect a selected session in the bottom `iProfiler` panel. In the current UI, the sidebar is focused on `Claude` and `Codex`, while the bottom panel handles the detailed analysis workflow.

- When opened, the profiler attempts an initial scan using the stored selected tab.
- Detailed analysis is shown in the separate bottom-panel view named `iProfiler`.

### Typical Flow

1. Use `Find` in the sidebar to rescan session files.
2. Choose the active `Claude` or `Codex` tab.
3. Change sorting by name, time, input tokens, output tokens, or file size.
4. Click a session card to load the detailed view in `iProfiler`.
5. Use the chart or event log to jump back to the matching source line.

### Sidebar

#### Toolbar

- `Find`: rescans session files from the configured search roots.
- The status chip shows the current state (`idle`, `loading`, `ready`, `error`) and the latest notice.
- The `Find` action is temporarily disabled while a scan is in progress.
- When auto refresh is enabled, `Latest` and `Live` badges are recomputed quietly in the background.

#### Agent Tabs

- `Claude` and `Codex` are the active sidebar tabs.
- The `Gemini` tab is currently shown as disabled.

#### Session List

- Each card shows file name, latest/live status, file size, timestamp, and input/output totals.
- A `Latest` badge marks the most recently updated session within the current agent tab.
- A `Live` badge marks a `Latest` session that still appears to be actively updating.
- The selected card is linked to the bottom detail panel.

#### Sort Row

- `Name`: sort by file name
- `Time`: sort by start or modified time
- `tin`: sort by input tokens
- `tout`: sort by output tokens
- `Size`: sort by file size

Clicking the same control again reverses the direction.

### Bottom `iProfiler` Panel

#### Header

- Shows vendor, model name, and session ID.
- `Updated` shows when the overview list was last refreshed.
- `Auto Refresh` lets you choose an overview refresh interval.
- Title-bar actions can also trigger an immediate overview refresh.
- `Info` reopens this guide.
- `Live` toggles live monitoring.
- `Info` lets you reopen the guide in either Korean or English.

#### Summary

- The summary board shows `File`, `Size`, `Tokens`, `Cost`, `Turns`, `Duration`, `Peak`, `Avg/Turn`, `Cache`, `Latency`, `Total Tok`, and `Date`.
- The section can be collapsed.
- Clicking anywhere on the section header toggles the folded state.
- If nothing is selected, or a detail view is still loading, a status message appears instead of the metric board.

#### Chart

- Visualizes the selected session timeline.
- The main analysis dimensions are token volume, payload size, and latency.
- Clickable points can reopen the linked source record.
- Point hit targets were widened so dense timelines are easier to inspect.
- The chart section can also be collapsed.

#### Event Log

- Events are ordered by time.
- Rows are grouped into `User`, `Agent`, and `System`.
- Payload size, token counts, and message previews may appear when available.
- Clicking a row opens the matching source line in the original file.
- During live monitoring, runtime status messages can be merged into the same log area.
- The event log section can be collapsed.
- Its section header also toggles folding on click.

### Live Mode

- In live mode, the chart and event log are recomputed when the source file changes.
- Stopping live mode keeps the latest snapshot and disables automatic refresh.
- Live monitoring can auto-attach when the selected session is considered likely active.
- Overview auto refresh quietly updates the session list and badge state without replacing the current detail view.

### Notes

- Cost is only an estimate and may not match billing exactly.
- Some values are inferred and can vary by session format.
- The current sidebar workflow is intentionally centered on `Claude` and `Codex`.
- The sidebar does not currently expose an `Archive All` button even though archive support still exists on the host side.
