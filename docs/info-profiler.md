# Profiler Screen Guide

## 한국어

### 개요

`Profiler`는 에이전트 세션 로그를 빠르게 찾아보고, 한 세션을 선택해 토큰 흐름과 이벤트 로그까지 이어서 분석하는 화면입니다. 좌측 패널은 세션 탐색과 선택에 집중하고, 하단 패널은 선택된 세션의 상세 분석에 집중합니다.

### 사용 흐름

1. 좌측 패널에서 `Find`로 세션을 검색합니다.
2. agent 탭에서 `Claude`, `Codex`, `Gemini` 중 분석 대상을 고릅니다.
3. 정렬 버튼으로 이름, 시간, 입력 토큰, 출력 토큰, 파일 크기 기준으로 목록을 바꿉니다.
4. 세션 카드를 클릭하면 하단 패널에 상세 분석이 열립니다.
5. 차트나 이벤트 로그에서 관심 지점을 눌러 원본 세션 파일의 해당 줄로 이동합니다.

### 좌측 패널

#### 1. Toolbar

- `Find`: 설정된 search root를 기준으로 세션 파일을 다시 스캔합니다.
- `Archive All`: 현재 수집된 세션 파일을 아카이브합니다.
- 상태 칩은 현재 상태(`idle`, `loading`, `ready`, `error`)와 마지막 알림을 보여줍니다.

#### 2. Agent Tabs

- 각 탭은 agent별 세션 개수를 함께 보여줍니다.
- 탭을 바꾸면 해당 agent 세션만 목록에 표시됩니다.

#### 3. Session List

- 각 세션 카드는 파일명, live 여부, 파일 크기, 마지막 시각, 입력/출력 토큰을 구분된 구획으로 표시합니다.
- `Live` 배지가 보이면 지금도 갱신 중일 가능성이 높은 세션입니다.
- 선택된 세션은 강조 표시되며, 같은 ID가 하단 상세 패널과 연결됩니다.

#### 4. Sort Row

- `Name`: 파일명 기준 정렬
- `Time`: 시작 또는 수정 시각 기준 정렬
- `tin`: 입력 토큰 기준 정렬
- `tout`: 출력 토큰 기준 정렬
- `Size`: 파일 크기 기준 정렬

같은 항목을 다시 누르면 오름차순/내림차순이 전환됩니다.

### 하단 패널

#### 1. Header

- 좌측에는 vendor, 모델명, 세션 ID가 표시됩니다.
- `Info` 버튼은 이 문서를 엽니다.
- live 세션을 보고 있는 경우 `Live` 버튼이 표시되며, 누르면 실시간 모니터링을 중지합니다.

#### 2. Summary Metrics

- `File`: 현재 선택된 세션 파일명
- `Size`: 세션 파일 크기
- `Tokens`: 입력 / 출력 토큰 합계
- `Cost`: 모델명을 기준으로 계산한 추정 비용
- `Turns`: 요청/응답 턴 수 또는 타임라인 샘플 수
- `Duration`: 세션 시작부터 마지막 이벤트까지의 경과 시간
- `Peak`: 단일 포인트 최대 토큰량
- `Avg/Turn`: 턴당 평균 토큰량
- `Cache`: 전체 토큰 대비 캐시 비율
- `Latency`: 가장 큰 응답 지연 시간
- `Total Tok`: 전체 토큰 총합
- `Date`: 세션 시작 날짜

#### 3. Chart

- 기본 차트는 `Token Flow Comparison`입니다.
- 범례 버튼 `Total`, `Output`, `Input`, `Cached`, `Trend`는 시리즈 표시 여부를 토글합니다.
- 막대는 각 시점의 대표 값이며, 원본 이벤트가 연결된 경우 클릭으로 소스 파일 위치를 엽니다.
- 툴팁은 현재 시점의 시간과 각 시리즈 수치를 보여주고, 연결된 이벤트가 있으면 바로 소스로 이동할 수 있습니다.

### 시리즈 정의

- `Total`: 입력, 출력, 캐시 토큰의 총합
- `Output`: assistant 또는 agent가 생성한 출력 토큰
- `Input`: 사용자 입력과 컨텍스트에 사용된 입력 토큰
- `Cached`: 캐시에서 재사용된 토큰
- `Trend`: 최근 포인트 기준 이동 평균 추세선

### Event Log

- 이벤트는 시간순으로 정렬됩니다.
- `User`, `Agent`, `System` 역할로 구분되어 표시됩니다.
- 각 행에는 시간, 역할, 메시지 미리보기, payload 크기, 토큰 수가 포함될 수 있습니다.
- 행을 클릭하면 해당 이벤트가 기록된 원본 세션 파일의 줄로 이동합니다.

### Live 모드

- live 모드에서는 세션 파일이 갱신될 때 차트와 이벤트 로그가 다시 계산됩니다.
- `Live` 버튼이 보이는 동안에는 현재 선택 세션이 실시간 추적 중임을 의미합니다.
- 추적을 멈추면 마지막 스냅샷은 유지되고 자동 갱신만 중단됩니다.

### 해석 팁

1. 먼저 `Total Tok`, `Duration`, `Turns`로 세션 규모를 파악합니다.
2. `Peak`와 `Trend`를 같이 보면서 급상승 구간이 일시적인지 지속적인지 구분합니다.
3. `Cache` 비율이 낮고 `Input`이 과도하면 프롬프트 컨텍스트가 비효율적일 수 있습니다.
4. `Latency`가 높은 지점은 차트 툴팁과 Event Log를 함께 보며 원인을 좁히는 것이 좋습니다.

### 참고

- 비용은 모델명 기반 추정치이므로 실제 청구액과 다를 수 있습니다.
- 세션 포맷에 따라 일부 값은 비어 있거나 추론값일 수 있습니다.
- 문서는 `Info` 버튼으로 다시 열 수 있으며, 열 때마다 한국어/English 중 원하는 버전을 선택할 수 있습니다.

## English

### Overview

The `Profiler` helps you browse agent session logs, choose a single session, and inspect token flow and raw events in one connected workflow. The left panel is for discovery and selection, while the bottom panel is for detailed analysis of the selected session.

### Typical Flow

1. Use `Find` in the left panel to scan available session files.
2. Switch between `Claude`, `Codex`, and `Gemini` tabs.
3. Change sorting by name, time, input tokens, output tokens, or file size.
4. Click a session card to load the detailed view in the bottom panel.
5. Use the chart or event log to jump back to the exact source line in the original session file.

### Left Panel

#### 1. Toolbar

- `Find`: rescans session files from the configured search roots.
- `Archive All`: archives the currently collected session files.
- The status chip shows the current state (`idle`, `loading`, `ready`, `error`) plus the latest notice.

#### 2. Agent Tabs

- Each tab shows the number of sessions found for that agent.
- Switching tabs filters the list to the selected agent only.

#### 3. Session List

- Each session card separates file name, live state, file size, timestamp, and token totals into distinct regions for quick scanning.
- A `Live` badge marks a session that is likely still being updated.
- The selected card is highlighted and linked to the bottom detail panel.

#### 4. Sort Row

- `Name`: sort by file name
- `Time`: sort by start or modified timestamp
- `tin`: sort by total input tokens
- `tout`: sort by total output tokens
- `Size`: sort by file size

Click the same control again to reverse the sort direction.

### Bottom Panel

#### 1. Header

- The left side shows the vendor, model name, and session ID.
- The `Info` button reopens this guide.
- When live monitoring is active, a `Live` button appears and stops the live stream when clicked.

#### 2. Summary Metrics

- `File`: selected session file name
- `Size`: source file size
- `Tokens`: input / output totals
- `Cost`: estimated cost based on the detected model name
- `Turns`: request-response turns or timeline sample count
- `Duration`: elapsed time from the first event to the last event
- `Peak`: largest token volume in a single point
- `Avg/Turn`: average token volume per turn
- `Cache`: cached-token ratio across the session
- `Latency`: largest observed response delay
- `Total Tok`: total tokens for the session
- `Date`: session start date

#### 3. Chart

- The default chart is `Token Flow Comparison`.
- Legend buttons `Total`, `Output`, `Input`, `Cached`, and `Trend` toggle each series on or off.
- Bars represent the main value for each point in time and can open the linked source record when one exists.
- The tooltip shows the active timestamp and visible series values, and can jump straight to the linked source event.

### Series Definitions

- `Total`: combined input, output, and cached tokens
- `Output`: tokens generated by the assistant or agent
- `Input`: tokens consumed by user input and request context
- `Cached`: tokens reused from cache
- `Trend`: moving-average trend line across recent points

### Event Log

- Events are sorted by time.
- Roles are grouped into `User`, `Agent`, and `System`.
- Rows may include time, role, preview text, payload size, and token count.
- Clicking a row opens the original session file at the matching source line.

### Live Mode

- In live mode, the chart and event log are recomputed whenever the source session file changes.
- While the `Live` button is visible, the selected session is being tracked in real time.
- Stopping live mode keeps the latest snapshot but disables automatic refresh.

### Reading Tips

1. Start with `Total Tok`, `Duration`, and `Turns` to judge the session scale.
2. Compare `Peak` and `Trend` to see whether spikes are isolated or sustained.
3. A low `Cache` ratio with very high `Input` can indicate prompt-context inefficiency.
4. For suspicious latency spikes, inspect both the chart tooltip and the event log around the same timestamp.

### Notes

- Cost is only an estimate and may not match billing exactly.
- Some values can be inferred or unavailable depending on the session file format.
- You can reopen this guide from the `Info` button and choose either the Korean or English section each time.
