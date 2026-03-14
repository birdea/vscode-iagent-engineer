# Profiler Screen Guide

## 한국어

### 개요

`Profiler`는 로컬 에이전트 세션 로그를 찾아보고, 선택한 세션을 하단 `iProfiler` 패널에서 자세히 분석하는 화면입니다. 현재 UI 기준으로 사이드바는 `Claude`, `Codex` 중심 탐색에 맞춰져 있고, 상세 분석은 하단 패널에서 수행합니다.

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

#### Agent Tabs

- 현재 활성 탭은 `Claude`, `Codex`입니다.
- `Gemini` 탭은 현재 UI에서 비활성화되어 있습니다.

#### Session List

- 각 세션 카드는 파일명, live 여부, 파일 크기, 시간, 입력/출력 토큰을 보여줍니다.
- `Live` 배지는 아직 갱신 중일 가능성이 높은 세션을 뜻합니다.
- 선택된 카드는 하단 상세 패널과 연결됩니다.

### 하단 `iProfiler` 패널

#### Header

- vendor, 모델명, 세션 ID가 표시됩니다.
- `Info` 버튼으로 이 문서를 다시 열 수 있습니다.
- `Live` 버튼은 라이브 모니터링을 시작하거나 중지합니다.

#### Summary

- `File`, `Size`, `Tokens`, `Cost`, `Turns`, `Duration`, `Peak`, `Avg/Turn`, `Cache`, `Latency`, `Total Tok`, `Date`를 한 보드에서 보여줍니다.
- Summary 영역은 접기/펼치기가 가능합니다.

#### Chart

- 선택한 세션의 타임라인을 시각화합니다.
- 토큰, 데이터 크기, 지연 시간 중심으로 분석합니다.
- 원본 이벤트와 연결된 포인트는 클릭으로 소스 파일 위치를 열 수 있습니다.

#### Event Log

- 이벤트는 시간순으로 정렬됩니다.
- `User`, `Agent`, `System` 역할로 묶여 표시됩니다.
- payload 크기, 토큰 수, 메시지 미리보기가 함께 나올 수 있습니다.
- 항목을 클릭하면 대응되는 원본 로그 줄을 엽니다.

### Live 모드

- 라이브 모드에서는 세션 파일이 바뀔 때 차트와 이벤트 로그가 다시 계산됩니다.
- 모니터링을 중지하면 마지막 스냅샷은 유지되고 자동 갱신만 멈춥니다.

### 참고

- 비용은 모델명 기반 추정치라 실제 청구액과 다를 수 있습니다.
- 세션 포맷에 따라 일부 값은 비어 있거나 추론값일 수 있습니다.
- 현재 사이드바의 기본 노출 대상은 `Claude`, `Codex`입니다.

## English

### Overview

The `Profiler` helps you browse local agent session logs and inspect a selected session in the bottom `iProfiler` panel. In the current UI, the sidebar is focused on `Claude` and `Codex`, while the bottom panel handles the detailed analysis workflow.

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

#### Agent Tabs

- `Claude` and `Codex` are the active sidebar tabs.
- The `Gemini` tab is currently shown as disabled.

#### Session List

- Each card shows file name, live status, file size, timestamp, and input/output totals.
- A `Live` badge marks a session that is likely still being updated.
- The selected card is linked to the bottom detail panel.

### Bottom `iProfiler` Panel

#### Header

- Shows vendor, model name, and session ID.
- `Info` reopens this guide.
- `Live` toggles live monitoring.

#### Summary

- The summary board shows `File`, `Size`, `Tokens`, `Cost`, `Turns`, `Duration`, `Peak`, `Avg/Turn`, `Cache`, `Latency`, `Total Tok`, and `Date`.
- The section can be collapsed.

#### Chart

- Visualizes the selected session timeline.
- The main analysis dimensions are token volume, payload size, and latency.
- Clickable points can reopen the linked source record.

#### Event Log

- Events are ordered by time.
- Rows are grouped into `User`, `Agent`, and `System`.
- Payload size, token counts, and message previews may appear when available.
- Clicking a row opens the matching source line in the original file.

### Live Mode

- In live mode, the chart and event log are recomputed when the source file changes.
- Stopping live mode keeps the latest snapshot and disables automatic refresh.

### Notes

- Cost is only an estimate and may not match billing exactly.
- Some values are inferred and can vary by session format.
- The current sidebar workflow is intentionally centered on `Claude` and `Codex`.
