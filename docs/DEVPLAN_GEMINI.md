# iFigmaLab: VSCode Plugin 포팅 개발 명세서 (DEVPLAN_GEMINI)

## 1. 개요 및 목적

- **앱 이름**: `vscode-figmalab`
- **목표**: 개발자가 VSCode 내부에서 직접 Figma 디자인(Design Context, Screenshot)을 불러오고, AI Agent (주로 Gemini API)를 활용하여 코드를 생성 및 적용할 수 있는 VSCode 확장 프로그램(Plugin) 개발.
- **주요 기능**:
  1. Figma Desktop App과 MCP 연동: 데이터 조회, 스크린샷 및 MCP API 기능 활용
  2. AI Agent 활용: 프롬프트를 통해 HTML, TSX, Tailwind 및 기타 형식의 코드 생성
  3. 에디터 통합: 생성된 결과를 단순 복사하는 것을 넘어, 활성화된 문서에 코드를 바로 삽입하거나 새로운 파일로 저장하는 VSCode 내장 FileSystem API 연동

## 2. 구조 및 기능 명세

### 2.1 Figma Layer

- **상태 확인**: Figma Desktop 앱 설치 상태 및 MCP 연결 상태 조회
- **설정 관리**: MCP 연결에 필요한 설정값 조회 및 변경 UI 제공
- **API 목록**: MCP 연결 후 사용 가능한 API 메서드 리스트 출력
- **데이터 입력**: Figma Desktop 앱 가이드북에서 추출한 MCP 데이터를 붙여넣을 수 있는 입력창 제공
- **파서(Parser)**: 입력받은 MCP 데이터에서 `fileid`와 `nodeid` 추출
- **데이터 활용**: 입력받은 MCP 데이터를 Fetch하여 화면에 출력 및 복사 기능 제공
- **스크린샷 뷰어**: 입력받은 MCP 데이터를 통해 스크린샷 출력 (크게 보기 / 에디터에서 보기 / 로컬 저장 기능 포함)

### 2.2 Agent Layer

- **Agent 선택**: Gemini, Claude (예정), Codex (예정) 등 사용자가 원하는 AI Agent 선택 창 제공
- **바로가기 제공**: (Gemini 선택 시) Google AI Studio 웹페이지로 이동할 수 있는 버튼 제공
- **인증 관리**: 선택된 Agent API 인증에 필요한 인증 토큰 입력창 제공
- **모델 선택**: 선택된 Agent API가 제공하는 모델 리스트를 불러오고, 원하는 모델을 선택하는 기능 제공
- **모델 정보**: 선택된 모델의 상세 정보(Info)를 얻어와 화면에 출력

### 2.3 Prompt Layer

- **사용자 프롬프트**: 사용자가 원하는 프롬프트를 구성할 수 있도록 입력창 제공 (사용 여부 체크박스 포함)
- **MCP 데이터 활용**: Figma Desktop MCP에서 얻어온 데이터 활용 옵션 제공 (사용 여부 체크박스 포함)
- **토큰 계산기**: 사용자 프롬프트와 MCP 데이터의 전체 크기(KB) 및 예상 토큰 소비량을 화면에 출력
- **코드 생성 코어**: 프롬프트와 Figma MCP 데이터를 Agent에게 전송하여, Agent가 디자인을 바탕으로 GUI 레이아웃 코드 생성
- **포맷 선택 지원**: 생성된 결과물을 HTML, TSX, SCSS, Tailwind, Kotlin 등 다양한 포맷으로 선택하여 받을 수 있도록 지원
- **에디터 연동**: 생성된 결과물을 VSCode 활성 에디터에 코드로 삽입하거나 새 파일로 쓰기 지원

### 2.4 Log Layer

- **로그 기록**: Figma, Agent, Prompt 레이어에서 수행되는 유의미한 동작 및 오류 발생에 대한 로그 기록
- **로그 UI**: 사용자 친화적인 형태로 로그를 출력
- **로그 관리**: 로그 클리어(초기화), 복사, 저장 버튼 추가

## 3. UI/UX 및 스타일링

- **VSCode 네이티브 스타일**: 범용적인 VSCode 확장 프로그램 스타일의 텍스트, UI, UX 규칙을 준수하여 이질감 없는 화면 구성
- **확장 프로그램 아이콘**: VSCode 스타일에 맞게 원형(Circle) 내부에 "Figma"와 "MCP" (2줄) 문구가 적혀있는 형태의 아이콘 디자인 및 적용

## 4. 코드 품질 및 표준

- **Linting**: 코드 작성 시 `eslint` 최신 스타일 규칙 적용
- **언어**: 안정적인 개발을 위해 TypeScript 사용 권장

## 5. 단계별 개발 계획 (제안)

- **Phase 1: 프로젝트 셋업 및 기본 UI 구성**
  - VSCode 확장 프로그램 프로젝트 초기화
  - `eslint` 및 TypeScript 환경 설정
  - 4개의 주요 레이어를 담을 Webview 도는 Sidebar UI 기본 골격 제작
- **Phase 2: Figma MCP 통합**
  - Figma Desktop 앱과의 접속 및 통신 프로토콜 구현
  - 데이터 파서, 데이터 Fetch, 스크린샷 로드 유틸리티 개발
- **Phase 3: Agent (Gemini) 연동**
  - Gemini API 연동 및 VSCode SecretStorage를 활용한 API 키 보안 관리
  - 모델 리스트 및 정보 가져오기 로직 구현
- **Phase 4: 프롬프트 엔지니어링 및 에디터 액션**
  - 프롬프트 구성 및 예상 토큰 계산 로직 구현
  - 코드 생성 요청 프로세스 통합
  - 활성 에디터 코드 삽입 및 파일 생성 (VSCode FileSystem API) 연동
- **Phase 5: 로깅, 스타일링 및 마무리**
  - 중앙 집중식 로깅 시스템 구축
  - VSCode 테마에 완벽히 호환되도록 CSS/스타일링 개선
  - 아이콘 제작 및 최종 테스트 (E2E)
