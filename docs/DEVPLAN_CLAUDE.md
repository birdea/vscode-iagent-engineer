# iFigmaLab: VSCode Plugin 개발 명세서 (DEVPLAN_CLAUDE)

> **작성자**: Claude (Anthropic)
> **참조**: INSTRUCTION.md, DEVPLAN_GEMINI.md (Google Antigravity)

---

## 0. DEVPLAN_GEMINI.md 비교 평가

### 잘 된 점

- 4개 레이어(Figma / Agent / Prompt / Log)를 INSTRUCTION.md 요구사항에 충실히 반영함
- 5단계 Phase 구조로 개발 순서를 논리적으로 제시함
- TypeScript 권장, ESLint 적용, SecretStorage 활용 등 VSCode 생태계에 맞는 기술 선택

### 보완이 필요한 부분

| 항목            | DEVPLAN_GEMINI의 한계                        | DEVPLAN_CLAUDE의 접근                         |
| --------------- | -------------------------------------------- | --------------------------------------------- |
| **아키텍처**    | Extension Host ↔ Webview 통신 구조 미명시    | Message Passing 프로토콜 명세 추가            |
| **MCP 연동**    | "접속 및 통신 프로토콜 구현"으로 추상화만 함 | Figma MCP stdio/HTTP 방식 및 포트 설정 구체화 |
| **상태 관리**   | 레이어 간 상태 공유 방법 미제시              | ExtensionContext 기반 상태 관리 전략 제시     |
| **보안**        | SecretStorage 언급만 있음                    | API Key 처리 흐름 및 Webview 보안 정책 명세   |
| **파일 구조**   | 디렉토리 구조 미제시                         | 구체적인 프로젝트 트리 제시                   |
| **에러 처리**   | 언급 없음                                    | 레이어별 에러 핸들링 전략 포함                |
| **테스트**      | 언급 없음                                    | Unit/E2E 테스트 전략 포함                     |
| **빌드/패키징** | 언급 없음                                    | esbuild 번들링 및 vsce 패키징 포함            |

---

## 1. 개요

- **앱 이름**: `vscode-figmalab`
- **목표**: VSCode 내에서 Figma MCP 데이터를 조회하고, AI Agent(Gemini/Claude/Codex)를 통해 코드를 생성하여 에디터에 직접 통합하는 확장 프로그램
- **언어**: TypeScript (Extension Host + Webview)
- **빌드**: esbuild (번들러), vsce (패키징)
- **Linting**: ESLint flat config (v9+) + @typescript-eslint

---

## 2. 프로젝트 구조

```
vscode-figmalab/
├── package.json               # Extension manifest (contributes, activationEvents)
├── tsconfig.json
├── esbuild.config.js
├── eslint.config.js           # ESLint flat config (v9+)
├── .vscodeignore
├── resources/
│   └── icon.png               # 원형 "Figma / MCP" 아이콘
├── src/
│   ├── extension.ts           # 진입점: activate / deactivate
│   ├── constants.ts           # 전역 상수 (Command IDs, Config Keys 등)
│   ├── types.ts               # 공유 타입 정의 (WebviewMessage, LayerState 등)
│   │
│   ├── figma/
│   │   ├── McpClient.ts       # Figma MCP 클라이언트 (stdio / HTTP)
│   │   ├── McpParser.ts       # MCP 데이터에서 fileId, nodeId 추출
│   │   └── ScreenshotService.ts # 스크린샷 fetch 및 저장
│   │
│   ├── agent/
│   │   ├── AgentFactory.ts    # Agent 인터페이스 팩토리
│   │   ├── GeminiAgent.ts     # Gemini API 연동
│   │   ├── ClaudeAgent.ts     # Claude API 연동 (TODO)
│   │   └── BaseAgent.ts       # 공통 인터페이스 정의
│   │
│   ├── prompt/
│   │   ├── PromptBuilder.ts   # prompt + MCP data 조합
│   │   └── TokenEstimator.ts  # 토큰/KB 계산 유틸
│   │
│   ├── editor/
│   │   └── EditorIntegration.ts # 활성 에디터 삽입 / 파일 저장
│   │
│   ├── logger/
│   │   └── Logger.ts          # 중앙 집중식 로거
│   │
│   └── webview/
│       ├── SidebarProvider.ts # WebviewViewProvider 구현체
│       ├── WebviewMessageHandler.ts # Host → View 메시지 라우터
│       └── ui/
│           ├── index.html     # Webview 진입 HTML
│           ├── main.ts        # Webview 진입 스크립트
│           ├── components/
│           │   ├── FigmaLayer.ts
│           │   ├── AgentLayer.ts
│           │   ├── PromptLayer.ts
│           │   └── LogLayer.ts
│           └── style.css      # VSCode CSS 변수 기반 스타일
└── test/
    ├── unit/
    │   ├── McpParser.test.ts
    │   └── TokenEstimator.test.ts
    └── e2e/
        └── extension.test.ts
```

---

## 3. 아키텍처: Extension Host ↔ Webview 통신

VSCode 확장의 핵심 제약: Extension Host(Node.js)와 Webview(브라우저 샌드박스)는 직접 함수 호출이 불가하며, **Message Passing** 방식으로만 통신한다.

```
┌─────────────────────────────────────────────┐
│              VSCode Extension Host           │
│  (Node.js, 파일시스템/API 접근 가능)         │
│                                              │
│  SidebarProvider                             │
│  ├── McpClient      (Figma MCP 통신)        │
│  ├── GeminiAgent    (Gemini API 호출)        │
│  ├── PromptBuilder  (프롬프트 조합)          │
│  ├── EditorInteg.   (에디터 삽입/저장)       │
│  └── Logger         (로그 관리)             │
│           │  postMessage / onDidReceiveMsg   │
└───────────┼─────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────┐
│               Webview (Browser Sandbox)      │
│  (DOM 접근 가능, Node.js API 불가)           │
│                                              │
│  FigmaLayer / AgentLayer                     │
│  PromptLayer / LogLayer                      │
└─────────────────────────────────────────────┘
```

### 메시지 타입 정의 (types.ts)

```typescript
// Webview → Host
type WebviewToHostMessage =
  | { command: 'figma.connect'; endpoint: string }
  | { command: 'figma.fetchData'; mcpData: string }
  | { command: 'figma.screenshot'; fileId: string; nodeId: string }
  | { command: 'agent.setApiKey'; agent: AgentType; key: string }
  | { command: 'agent.listModels'; agent: AgentType }
  | { command: 'prompt.generate'; payload: PromptPayload }
  | { command: 'editor.insert'; code: string }
  | { command: 'editor.saveFile'; code: string; filename: string }
  | { command: 'log.clear' }
  | { command: 'log.copy' }
  | { command: 'log.save' };

// Host → Webview
type HostToWebviewMessage =
  | { event: 'figma.status'; connected: boolean; methods: string[] }
  | { event: 'figma.dataResult'; data: unknown }
  | { event: 'figma.screenshotResult'; base64: string }
  | { event: 'agent.modelsResult'; models: ModelInfo[] }
  | { event: 'agent.modelInfo'; info: ModelInfo }
  | { event: 'prompt.generating'; progress: number }
  | { event: 'prompt.result'; code: string; format: OutputFormat }
  | { event: 'log.append'; entry: LogEntry }
  | { event: 'error'; source: LayerType; message: string };
```

---

## 4. 레이어별 상세 명세

### 4.1 Figma Layer

**MCP 연결 방식**

- Figma Desktop App은 로컬에 MCP 서버를 stdio 또는 HTTP(기본 포트 `3845`)로 노출함
- `McpClient.ts`: JSON-RPC 2.0 기반으로 `initialize`, `tools/list`, `tools/call` 메서드 구현
- 연결 상태는 `vscode.workspace.getConfiguration('figmalab')` 에 저장

**MCP 데이터 파서 (`McpParser.ts`)**

```typescript
interface ParsedMcpData {
  fileId: string;
  nodeId: string;
  raw: unknown;
}
function parseMcpData(input: string): ParsedMcpData;
```

- Figma URL 패턴(`figma.com/file/{fileId}/...?node-id={nodeId}`) 및 JSON 구조 양쪽 파싱 지원

**스크린샷 서비스**

- MCP `get_image` 도구 호출 → base64 → Webview 전달
- "에디터에서 보기": `vscode.commands.executeCommand('vscode.open', uri)`
- "저장하기": `vscode.workspace.fs.writeFile()`

### 4.2 Agent Layer

**추상 인터페이스 (`BaseAgent.ts`)**

```typescript
interface IAgent {
  readonly type: AgentType;
  setApiKey(key: string): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  getModelInfo(modelId: string): Promise<ModelInfo>;
  generateCode(payload: PromptPayload): AsyncGenerator<string>;
}
```

**API Key 보안 관리**

- `vscode.ExtensionContext.secrets` (SecretStorage) 사용 — 절대 `globalState`에 평문 저장 금지
- Webview에서 key 입력 후 Host로 전달 → SecretStorage 저장 → Webview에는 마스킹된 상태만 반환

**Gemini 연동 (`GeminiAgent.ts`)**

- SDK: `@google/generative-ai`
- 모델 목록: `GET https://generativelanguage.googleapis.com/v1beta/models`
- 코드 생성: streaming 방식으로 `generateContentStream()` 사용 → 실시간 Webview 출력

**향후 지원 예정**

- `ClaudeAgent.ts`: `@anthropic-ai/sdk` 활용
- `CodexAgent.ts`: OpenAI SDK 활용

### 4.3 Prompt Layer

**PromptBuilder.ts**

```typescript
interface PromptPayload {
  userPrompt?: string; // 사용자 입력 (체크박스 on/off)
  mcpData?: unknown; // Figma MCP 데이터 (체크박스 on/off)
  outputFormat: OutputFormat; // 'html' | 'tsx' | 'scss' | 'tailwind' | 'kotlin'
  model: string;
}
```

시스템 프롬프트 예시:

```
You are an expert UI developer. Based on the provided Figma design data,
generate {format} code that faithfully reproduces the layout.
Output ONLY valid code. No explanation.
```

**TokenEstimator.ts**

- 근사치 계산: `totalChars / 4` (GPT 기준 근사)
- KB 계산: `new TextEncoder().encode(text).length / 1024`
- Webview에 실시간 업데이트 (입력 디바운싱 300ms)

**에디터 연동 (`EditorIntegration.ts`)**

```typescript
// 활성 에디터에 커서 위치 삽입
async function insertAtCursor(code: string): Promise<void>;

// 새 파일로 저장 (파일명 입력 다이얼로그 포함)
async function saveAsNewFile(code: string, defaultName: string): Promise<void>;
```

### 4.4 Log Layer

**Logger.ts**

```typescript
type LogLevel = 'info' | 'warn' | 'error' | 'success';
type LayerType = 'figma' | 'agent' | 'prompt' | 'editor' | 'system';

interface LogEntry {
  id: string;
  timestamp: string; // ISO 8601
  level: LogLevel;
  layer: LayerType;
  message: string;
  detail?: string; // 확장 가능한 상세 정보
}
```

- 모든 레이어에서 `Logger.log(level, layer, message)` 단일 인터페이스 사용
- Host에서 로그 생성 → `postMessage({ event: 'log.append', entry })` → Webview 출력
- 최대 500개 유지 (FIFO), 초과 시 자동 trim
- **저장**: `vscode.workspace.fs.writeFile()` 으로 JSON 또는 텍스트 저장
- **복사**: `vscode.env.clipboard.writeText()`

---

## 5. UI/UX 가이드라인

### VSCode 네이티브 스타일 준수

- official icon 참고: https://www.figma.com/design/P4dgdcoFVEawbQd2lv5arU/Visual-Studio-Code-Icons--Community-?node-id=0-1&p=f&t=e8wJuW0XWZVCHJE3-0

```css
/* CSS 변수를 통한 테마 연동 (라이트/다크 자동 대응) */
body {
  color: var(--vscode-foreground);
  background-color: var(--vscode-sideBar-background);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

button.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

input,
textarea {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-input-foreground);
}
```

### Sidebar 구성 (Accordion 방식)

```
┌─────────────────────────────┐
│ [Figma MCP 아이콘] FigmaLab │  ← Activity Bar 아이콘
├─────────────────────────────┤
│ ▼ FIGMA                     │  ← Collapsible Section
│   연결 상태: [● 연결됨]     │
│   [MCP 데이터 입력]         │
│   [Fetch] [Screenshot]      │
├─────────────────────────────┤
│ ▼ AGENT                     │
│   [Gemini ▼] [AI Studio →] │
│   API Key: [••••••••] [저장]│
│   Model: [gemini-2.0-flash▼]│
├─────────────────────────────┤
│ ▼ PROMPT                    │
│   [x] 사용자 프롬프트       │
│   [textarea]                │
│   [x] MCP 데이터 포함       │
│   포맷: [TSX ▼]             │
│   크기: 12.3KB / ~3,100 tok │
│   [Generate]                │
├─────────────────────────────┤
│ ▼ LOG                       │
│   [Clear] [Copy] [Save]     │
│   [로그 출력 영역]          │
└─────────────────────────────┘
```

### 확장 프로그램 아이콘 (`resources/icon.png`)

- 크기: 128×128px
- 형태: 진한 배경의 원형(Circle)
- 텍스트: 2줄 — 상단 `Figma`, 하단 `MCP`
- 스타일: VSCode Marketplace 기준에 맞게 선명한 단색 처리

---

## 6. 보안 고려사항

| 항목         | 정책                                                         |
| ------------ | ------------------------------------------------------------ |
| API Key 저장 | `vscode.ExtensionContext.secrets` (OS Keychain 연동)         |
| Webview CSP  | `Content-Security-Policy` 헤더로 외부 스크립트 차단          |
| nonce        | 매 Webview 로드마다 고유 nonce 생성하여 인라인 스크립트 허용 |
| MCP 통신     | localhost 루프백만 허용, 외부 네트워크 노출 차단             |
| 생성된 코드  | Webview에서 직접 eval 금지, 에디터 삽입만 허용               |

---

## 7. 단계별 개발 계획 (Phase)

### Phase 1: 프로젝트 초기화 및 기본 구조 (1-2일)

- [ ] `yo code` 기반 TypeScript Extension 프로젝트 생성
- [ ] `eslint.config.js` (flat config v9), `tsconfig.json` 설정
- [ ] `esbuild` 번들러 설정 (Extension Host + Webview 분리 번들)
- [ ] `SidebarProvider` + 기본 Webview HTML 골격 구현
- [ ] 4개 섹션 Accordion UI 구현 (VSCode CSS 변수 적용)
- [ ] Message Passing 기본 통신 채널 구현

### Phase 2: Figma MCP 통합 (2-3일)

- [ ] `McpClient.ts`: JSON-RPC stdio/HTTP 클라이언트 구현
- [ ] 연결 상태 확인 및 설정 UI 연동
- [ ] `McpParser.ts`: fileId/nodeId 파서 구현 및 단위 테스트
- [ ] Fetch 결과 표시 및 복사 기능
- [ ] `ScreenshotService.ts`: 스크린샷 조회, 크게보기, 저장 기능

### Phase 3: Agent (Gemini) 연동 (2-3일)

- [ ] `BaseAgent.ts` 인터페이스 정의
- [ ] `GeminiAgent.ts`: API Key 관리, 모델 목록, 모델 정보
- [ ] SecretStorage 기반 API Key 보안 저장/로드
- [ ] 스트리밍 응답 Webview 실시간 출력

### Phase 4: Prompt 및 에디터 연동 (2-3일)

- [ ] `PromptBuilder.ts`: 프롬프트 + MCP 데이터 조합 로직
- [ ] `TokenEstimator.ts`: 크기/토큰 계산 및 실시간 표시
- [ ] 출력 포맷 선택 (HTML/TSX/SCSS/Tailwind/Kotlin)
- [ ] `EditorIntegration.ts`: 커서 삽입 및 파일 저장 구현

### Phase 5: 로깅, 아이콘, 마무리 (1-2일)

- [ ] `Logger.ts` 중앙 집중식 로거 구현 및 전 레이어 연동
- [ ] Log UI: 레벨별 색상, Clear/Copy/Save 버튼
- [ ] `resources/icon.png` 제작 (원형, "Figma/MCP" 2줄)
- [ ] `package.json` manifest: `contributes.viewsContainers`, `contributes.views`, `contributes.commands`
- [ ] `.vscodeignore` 설정 및 `vsce package` 빌드 검증
- [ ] 단위 테스트 및 수동 E2E 테스트

---

## 8. package.json 주요 설정

```jsonc
{
  "name": "vscode-figmalab",
  "displayName": "FigmaLab",
  "description": "Figma MCP + AI Agent code generation for VSCode",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": ["onView:figmalab.sidebar"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "figmalab",
          "title": "FigmaLab",
          "icon": "resources/icon.png",
        },
      ],
    },
    "views": {
      "figmalab": [
        {
          "type": "webview",
          "id": "figmalab.sidebar",
          "name": "FigmaLab",
        },
      ],
    },
    "configuration": {
      "title": "FigmaLab",
      "properties": {
        "figmalab.mcpEndpoint": {
          "type": "string",
          "default": "http://localhost:3845",
          "description": "Figma MCP server endpoint",
        },
        "figmalab.defaultAgent": {
          "type": "string",
          "enum": ["gemini", "claude", "codex"],
          "default": "gemini",
        },
      },
    },
  },
}
```

---

## 9. 기술 스택 요약

| 분류       | 기술                                                             |
| ---------- | ---------------------------------------------------------------- |
| 언어       | TypeScript 5.x                                                   |
| 런타임     | VSCode Extension Host (Node.js) + Webview (Browser)              |
| 번들러     | esbuild                                                          |
| Linting    | ESLint v9 flat config + @typescript-eslint                       |
| Figma 연동 | JSON-RPC 2.0 (MCP 표준 프로토콜)                                 |
| AI SDK     | @google/generative-ai (Gemini), @anthropic-ai/sdk (Claude, 예정) |
| 보안       | VSCode SecretStorage + Webview CSP + nonce                       |
| 패키징     | @vscode/vsce                                                     |
| 테스트     | @vscode/test-electron + mocha                                    |
