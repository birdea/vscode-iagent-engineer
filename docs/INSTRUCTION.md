# iFigmaLab: VSCode Plugin 포팅 개발 명세서

## 1. 목적

VSCode 확장 프로그램(Plugin)을 개발하자.
앱이름 = vscode-iagent-engineer
주요기능 = 이를 통해 개발자는 VSCode 내부에서 직접 Figma 디자인(Design Context, Screenshot)을 불러오고 Gemini API를 활용하여 코드를 생성/적용할 수 있습니다.

1. Figma 연결 방식은 `local / remote`를 모두 고려하되, 현재 요구 범위는 `local Desktop MCP`와 `remote OAuth + REST` 기준으로 동일한 fetch/screenshot 기능을 제공하기
2. AI Agent (Gemini, Claude, Code) API 를 활용한 prompt -> html, tsx, tailwind 및 기타 형식으로 prompt 결과 파일 얻기
3. 에디터 통합: 생성된 결과를 단순 복사하는 것을 넘어, 활성화된 문서에 코드를 바로 삽입하거나 새로운 파일로 저장하는 VSCode 내장 FileSystem API와 연동할 수 있습니다.

## 2. 구조

VSCode Application
├─ Figma Layer
├── `local / remote` 연결 방식 선택 화면 조회
├── local: Figma Desktop 앱 설치 상태, MCP 연결 상태 화면 조회
├── remote: OAuth 로그인 상태 화면 조회
├── 연결에 필요한 설정값 조회/변경
├── local 연결 시 사용 가능한 API method?를 리스트로 출력
├── Figma Desktop 앱의 가이드북에서 추출한 MCP data를 바로 붙여넣을 수 있는 MCP data 입력창 제공
├── 입력받은 MCP data에서 fileid, nodeid를 추출할 수 있도록 Parser 구현
├── 입력받은 MCP data를 fetch하여 화면 출력 (복사하기)
├── 입력받은 MCP data를 통해 screenshot 출력 (크게보기/에디터에서보기/저장하기)
├─ Agent Layer
├── Gemini / Claude(todo) / Codex(todo) 등 사용자가 원하는 Agent 선택창 제공
├── Gemini 경우, Google Studio AI 웹페이지로 이동할 수 있는 버튼 제공
├── 선택된 Agent API 인증에 필요한 인증토큰 입력창 제공
├── 선택된 Agent API가 제공하는 model list를 얻어오고, 원하는 model을 선택할 수 있는 기능 제공
├── 선택된 model 의 info를 얻어와서 화면에 출력
├─ Prompt Layer
├── 추가적으로 사용자가 원하는 prompt 구성할 수 있도록 입력창 제공 (사용여부 체크박스 제공)
├── Figma Desktop MCP에서 얻어온 data 활용 (사용여부 체크박스 제공)
├── 사용자 prompt 와 mcp data 의 전체크기 (kb) 와 예상 토큰 소비량을 화면 출력
├── 본 Prompt에서 수행되는 것은 입력된 data (prompt + figma mcp data) 를 Agent에게 보내서 Agent가 그려낸 GUI 레이아웃 구성 결과물을 html / tsx / scss / tailwind / kotlin 등 다양한 포맷을 선택하여 개발자와 디자이너가 활용할 수 있도록 함
├── 결과물은 VSCode Editor 연동이 가능해야 함 (파일 쓰기, 코드 삽입)
├─ Log Layer
├── Figma / Agent / Prompt layer에서 수행되는 유의미한 동작에 대해 로그를 기록하고 사용자 친화적으로 로그를 출력
├── 클리어, 복사, 저장 버튼 추가

## 3. VScode plugin

VScode plugin 으로서, 범용적인 VScode plugin style의 아이콘, 텍스트, UI, UX를 사용해서 구현해야 함.
기존에 VScode의 사용 환경에 이질감이 없는 형태로 화면 구성이 되어야 함
VScode plugin 아이콘은, Circle 내부에 Figma MCP (2줄) 문구가 적혀있는 형태로, VScode style로 생성해줘.

## 4. eslint

코드 작성시 eslint 최신 스타일 적용 해줘

## 5.
