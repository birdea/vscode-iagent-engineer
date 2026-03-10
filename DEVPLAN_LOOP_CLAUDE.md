# DEVPLAN: Iterative GUI Refinement Loop

> Figma MCP 데이터 + 스크린샷을 기반으로 AI 에이전트가 GUI 코드를 반복 생성하고,
> 렌더링 결과를 원본 Figma 스크린샷과 비교하여 목표 유사도(기본 90%)에 도달할 때까지
> 자동으로 코드를 정제하는 Iterative Refinement Loop 구현 설계안.
>
> **본 문서는 두 가지 구현 접근 방식을 모두 다룹니다.**
> - **Approach A**: Anthropic SDK 직접 호출 (기존 아키텍처 연장선)
> - **Approach B**: Claude Code CLI / Agent SDK 활용 (에이전트 자율 파일 편집)

---

## 1. 목표 및 범위

### 1.1 핵심 목표

1. 사용자가 "Loop 시작"을 누르면 자동으로 반복 코드 생성 루프를 실행
2. 각 반복마다 렌더링 결과와 Figma 원본 스크린샷을 비교
3. 유사도가 목표치(90%) 이상이 되거나 최대 반복 횟수에 도달하면 종료
4. 각 반복의 진행 상황을 실시간으로 UI에 표시
5. 최종 코드를 에디터에 자동으로 삽입

### 1.2 범위

- **Approach A**: 기존 `@anthropic-ai/sdk` 기반 코드 생성 파이프라인 확장
- **Approach B**: `@anthropic-ai/claude-agent-sdk` 또는 `claude` CLI를 통한 에이전트 자율 루프
- 원격 Vite 서버 기반 브라우저 미리보기에서의 스크린샷 → Phase 1에서는 Webview 패널 캡처만
- 멀티 에이전트 앙상블 → 단일 에이전트 루프
- 실시간 사용자 피드백 개입 → 자동 루프 (수동 중단만 가능)

---

## 2. 접근 방식 비교: API vs CLI vs Agent SDK

### 2.1 세 가지 선택지 개요

#### Approach A — Anthropic SDK 직접 호출 (기존 구조 연장)

`@anthropic-ai/sdk`의 `messages.stream()`으로 코드를 생성하고, Extension이 파일 쓰기·미리보기·캡처·비교를 모두 직접 조율합니다. 현재 `ClaudeAgent.ts`가 이 방식입니다.

#### Approach B-1 — Claude Code CLI (child_process)

VSCode Extension이 `child_process.spawn`으로 `claude` CLI를 호출합니다.
Claude Code가 파일을 직접 편집(Read/Write/Edit 툴)하고, Extension은 파일 시스템 변경을 감지해서 미리보기·캡처·비교를 수행합니다.

```bash
claude -p "Generate GUI from Figma design" \
  --output-format stream-json \
  --mcp-config .mcp.json \
  --allowedTools "Read,Write,Edit,Glob" \
  --append-system-prompt "Write code to src/generated.tsx" \
  --max-turns 3
```

#### Approach B-2 — Claude Agent SDK (임베디드)

`@anthropic-ai/claude-agent-sdk`를 Extension에 직접 임포트합니다.
CLI와 동일한 능력이지만 Node.js 라이브러리로서 TypeScript 타입 지원, AbortController 통합, 세밀한 이벤트 처리가 가능합니다.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "Generate GUI from Figma design",
  options: {
    workingDirectory: workspaceRoot,
    allowedTools: ["Read", "Write", "Edit", "Glob"],
    mcpServers: { figma: figmaMcpConfig },
    appendSystemPrompt: "Write code to src/generated.tsx",
    includePartialMessages: true,
    maxTurns: 3,
  }
})) { ... }
```

---

### 2.2 상세 기능 비교표

| 기능 | Approach A (Anthropic SDK) | Approach B-1 (CLI) | Approach B-2 (Agent SDK) |
|------|--------------------------|-------------------|------------------------|
| **외부 의존성** | 없음 (이미 사용 중) | `claude` CLI 설치 필요 | npm 패키지 추가 필요 |
| **파일 직접 편집** | Extension이 담당 | Claude Code가 자율 편집 | Claude Code가 자율 편집 |
| **Figma MCP 연동** | Extension이 MCP 데이터 사전 페치 후 주입 | `--mcp-config`로 Claude가 직접 호출 | `mcpServers` 옵션으로 직접 호출 |
| **반복 간 문맥 유지** | FeedbackPromptBuilder로 수동 구성 | `--resume session_id`로 자동 유지 | `resume: sessionId`로 자동 유지 |
| **스트리밍** | `messages.stream()` | `--output-format stream-json` stdout 파싱 | `includePartialMessages: true` |
| **이미지 입력** | base64 API content block | 임시 파일 경로를 프롬프트에 포함 | 임시 파일 경로를 프롬프트에 포함 |
| **Abort / 취소** | AbortController | `proc.kill('SIGINT')` | AbortController |
| **TypeScript 타입** | ✅ 완전 지원 | ❌ (stdout JSON 수동 파싱) | ✅ 완전 지원 |
| **비용 제어** | 토큰 추정치 기반 | `--max-budget-usd` 플래그 | `maxBudgetUsd` 옵션 |
| **System Prompt** | `system:` 파라미터 | `--append-system-prompt` 플래그 | `appendSystemPrompt` 옵션 |
| **작업 디렉토리** | 해당 없음 (API) | `cwd` 옵션 또는 `cd` 선행 | `workingDirectory` 옵션 |
| **툴 제한** | 해당 없음 (직접 API) | `--allowedTools` 플래그 | `allowedTools` 옵션 |
| **세션 포크** | 불가 | `--fork-session` | 해당 옵션 있음 |
| **오프라인 동작** | ❌ (API 필요) | ❌ (API 필요) | ❌ (API 필요) |
| **Extension 복잡도** | 높음 (모든 것 직접 관리) | 중간 (프로세스 관리) | 낮음 (SDK가 추상화) |
| **루프 내 MCP 재호출** | 매 반복 Extension이 직접 | Claude가 필요시 자율 호출 | Claude가 필요시 자율 호출 |

---

### 2.3 아키텍처 차이: 역할 분담

**Approach A (API 직접)**:

```
Extension이 모든 것을 오케스트레이션
   Extension → Anthropic API (코드 텍스트 생성)
   Extension → 파일 저장
   Extension → 미리보기 렌더링
   Extension → 스크린샷 캡처
   Extension → 유사도 평가 (Anthropic API 재호출)
   Extension → 다음 반복 프롬프트 조립
```

**Approach B (CLI / Agent SDK)**:

```
Extension은 루프 조율만 담당
   Extension → Agent SDK 호출 (1회 호출로 파일까지 편집 완료)
              └─ Claude Code → Figma MCP 호출 (자율)
              └─ Claude Code → 파일 Read/Write/Edit (자율)
              └─ Claude Code → 결과 반환
   Extension → 파일 변경 감지 (vscode.workspace.onDidChangeTextDocument)
   Extension → 미리보기 렌더링
   Extension → 스크린샷 캡처
   Extension → 유사도 평가
   Extension → Agent SDK 재호출 (resume session + 피드백)
```

**Approach B의 핵심 이점**: Claude Code가 Figma MCP를 자율 호출하고 파일을 직접 편집하므로, Extension은 "결과 감지 → 평가 → 재지시"라는 단순한 역할만 수행합니다. 컨텍스트(대화 이력, MCP 결과, 이전 코드)는 `session_id`를 통해 Claude Code 내부에 보존됩니다.

---

### 2.4 Approach 선택 가이드

| 상황 | 권장 Approach |
|------|-------------|
| Claude Code 미설치 환경 보장 필요 | **A** |
| 최소 의존성, 기존 코드베이스 유지 | **A** |
| Figma MCP를 Claude가 자율 탐색하길 원함 | **B-2** |
| 반복 간 대화 컨텍스트 자동 보존 원함 | **B-2** |
| Extension 코드를 최대한 단순하게 유지 | **B-2** |
| CLI 스크립트/자동화 파이프라인 통합 | **B-1** |
| CI/CD 환경에서 루프 실행 | **B-1** |

**결론**: 대화형 VSCode Extension에는 **Approach B-2 (Agent SDK)** 가 가장 강력하고 깔끔합니다. 단, `claude` CLI가 설치되어 있고 `@anthropic-ai/claude-agent-sdk`를 추가할 수 있다는 전제 조건이 있습니다. 이 조건을 보장할 수 없는 경우 **Approach A** 를 fallback으로 사용합니다.

---

## 3. Approach B: CLI / Agent SDK 기반 설계

### 3.1 전제 조건 및 설치

```bash
# Claude Code CLI 설치 (사용자 환경)
npm install -g @anthropic-ai/claude-code

# Agent SDK (Extension 의존성)
npm install @anthropic-ai/claude-agent-sdk
```

Extension 시작 시 `claude --version` 명령으로 CLI 설치 여부를 확인하고, 미설치 시 Approach A로 자동 전환합니다.

---

### 3.2 Approach B-2: Agent SDK 기반 루프 아키텍처

#### 3.2.1 전체 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│  User (Webview)                                                 │
│  [▶ Start Agent Loop] 클릭                                      │
└───────────────────┬─────────────────────────────────────────────┘
                    │ loop.start (mode: 'agent-sdk')
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  AgentLoopCommandHandler.start()                                │
│  - Workspace root 결정                                          │
│  - MCP config 파일 경로 결정 (.mcp.json 또는 생성)              │
│  - 출력 대상 파일 경로 결정 (src/generated.tsx 등)              │
│  - sessionId = undefined (첫 번째 실행)                         │
└───────────────────┬─────────────────────────────────────────────┘
                    │
          ┌─────────┴──────────────────────────────────────┐
          │  iteration 1..N                                │
          │                                                │
          │  ┌──────────────────────────────────────────┐  │
          │  │ 1. AgentRunner.run(prompt, sessionId)    │  │
          │  │    query({ prompt, options: {            │  │
          │  │      resume: sessionId,                  │  │
          │  │      workingDirectory: workspaceRoot,    │  │
          │  │      allowedTools: ['Read','Write',      │  │
          │  │                     'Edit','Glob'],      │  │
          │  │      mcpServers: figmaMcpConfig,         │  │
          │  │      appendSystemPrompt: refinementRules │  │
          │  │    }})                                   │  │
          │  │    → Claude Code가 자율적으로:            │  │
          │  │      - Figma MCP 호출 (필요시)            │  │
          │  │      - 코드 파일 Read/Write/Edit          │  │
          │  │    → sessionId 캡처 (system.init 메시지) │  │
          │  │    → 완료 후 result 메시지 수신           │  │
          │  │                                          │  │
          │  │ 2. 파일 변경 감지                        │  │
          │  │    vscode.workspace.onDidChangeTextDoc   │  │
          │  │    또는 fs.watch로 generated 파일 감지   │  │
          │  │                                          │  │
          │  │ 3. PreviewPanelService.openOrUpdate()   │  │
          │  │    렌더링 + 안정화 대기                  │  │
          │  │                                          │  │
          │  │ 4. WebviewScreenshotCapture.capture()   │  │
          │  │    html2canvas → base64 PNG              │  │
          │  │                                          │  │
          │  │ 5. SimilarityEvaluator.evaluate()       │  │
          │  │    원본 Figma 스크린샷 vs 렌더링 결과    │  │
          │  │                                          │  │
          │  │ 6. 종료 판단:                            │  │
          │  │    similarity >= threshold → 완료        │  │
          │  │    else → sessionId 유지, 다음 반복      │  │
          │  │           prompt = buildFeedback()       │  │
          │  └──────────────────────────────────────────┘  │
          └─────────────────────────────────────────────────┘
```

#### 3.2.2 AgentRunner 구현

**파일**: `src/loop/AgentRunner.ts`

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunOptions, AgentRunResult } from "./types";

export class AgentRunner {
  async run(
    prompt: string,
    options: AgentRunOptions,
    onEvent?: (msg: SDKMessage) => void,
  ): Promise<AgentRunResult> {
    let sessionId: string | undefined;
    let finalResult = "";
    let cost = 0;

    for await (const msg of query({
      prompt,
      options: {
        resume: options.sessionId,
        workingDirectory: options.workingDirectory,
        allowedTools: options.allowedTools ?? ["Read", "Write", "Edit", "Glob"],
        disallowedTools: ["Bash", "WebFetch", "WebSearch"],  // 보안: 외부 실행 차단
        mcpServers: options.mcpServers,
        appendSystemPrompt: options.appendSystemPrompt,
        includePartialMessages: true,
        maxTurns: options.maxTurns ?? 5,
        maxBudgetUsd: options.maxBudgetUsd,
      },
    })) {
      onEvent?.(msg);

      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
      }

      if (msg.type === "result") {
        finalResult = msg.result ?? "";
        cost = (msg.cost_usd ?? 0);
      }
    }

    return { sessionId, result: finalResult, costUsd: cost };
  }

  // AbortController를 통한 취소 지원
  // Agent SDK가 AbortController를 지원하는 경우 options에 signal 전달
}
```

**보안 설계 원칙**: `Bash`, `WebFetch`, `WebSearch`는 `disallowedTools`로 명시적 차단합니다. Claude Code가 임의의 셸 명령이나 외부 네트워크 요청을 실행하는 것을 방지합니다.

#### 3.2.3 Figma MCP 연동 전략

Agent SDK의 `mcpServers` 옵션에 Figma MCP 서버 설정을 직접 주입합니다.

```typescript
// AgentLoopCommandHandler에서 MCP 설정 구성
const figmaMcpConfig = {
  figma: {
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "figma-developer-mcp", "--stdio"],
    env: {
      FIGMA_API_TOKEN: figmaAccessToken,
    },
  }
};

// 또는 .mcp.json 파일 경로 사용 (CLI 방식)
// --mcp-config .mcp.json
```

**기존 McpClient와의 관계**: Approach B에서는 Extension의 `McpClient.ts`가 Figma MCP를 직접 호출할 필요가 없습니다. Claude Code Agent가 MCP 서버를 자율 관리합니다. 단, 최초 Figma URL/데이터 파싱(`McpParser.ts`)은 그대로 활용하여 nodeId 등을 프롬프트에 포함할 수 있습니다.

#### 3.2.4 피드백 프롬프트 (Agent SDK 방식)

세션이 유지되므로 이전 컨텍스트를 다시 전달할 필요가 없습니다. 피드백은 간결하게 구성합니다.

```typescript
// 첫 번째 반복 프롬프트
const initialPrompt = `
You are generating a GUI implementation from a Figma design.

Target file: ${outputFilePath}
Figma node: ${nodeId}
Output format: ${outputFormat} (${formatInstructions})

Use the Figma MCP tool to get the design context, then write the implementation
to ${outputFilePath}. Make it pixel-perfect.

${userPrompt ?? ""}
`.trim();

// 후속 반복 프롬프트 (session resume — 이전 컨텍스트 자동 유지)
const refinementPrompt = `
The previous implementation achieved ${similarity}% visual similarity.

Here is the rendered screenshot of your implementation: [image attached]
Here is the original Figma design for reference: [image attached]

Specific issues to fix:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

Score breakdown:
- Layout: ${breakdown.layout}% | Elements: ${breakdown.elements}%
- Typography: ${breakdown.typography}% | Colors: ${breakdown.colors}%

Please revise ${outputFilePath} to address all issues above.
`.trim();
```

**이미지 첨부 방식**: Agent SDK가 이미지 파일 경로를 프롬프트에서 참조하면 자동으로 처리합니다. 스크린샷을 임시 파일로 저장한 뒤 경로를 프롬프트에 포함합니다.

```typescript
// 스크린샷을 임시 파일로 저장
const tmpDir = os.tmpdir();
const originalPath = path.join(tmpDir, `figma-original-${Date.now()}.png`);
const renderedPath = path.join(tmpDir, `rendered-${iteration}-${Date.now()}.png`);

await fs.writeFile(originalPath, Buffer.from(originalScreenshot.base64, 'base64'));
await fs.writeFile(renderedPath, Buffer.from(renderedScreenshot.base64, 'base64'));

// 프롬프트에 경로 포함
const prompt = `... Here is the rendered result: ${renderedPath} ...`;
```

#### 3.2.5 System Prompt (appendSystemPrompt)

매 실행마다 공통 규칙을 주입합니다:

```typescript
const AGENT_SYSTEM_PROMPT = `
CRITICAL RULES:
1. Write ALL code changes directly to the target file using Write or Edit tools.
2. Do NOT output code in your response text — write it to the file only.
3. Do NOT install packages or run build commands.
4. Do NOT modify any file other than the designated target file.
5. After writing the file, respond with a brief summary of what changed.
`.trim();
```

#### 3.2.6 파일 변경 감지

Claude Code Agent가 파일을 편집한 시점을 Extension이 감지해야 합니다.

```typescript
// AgentLoopCommandHandler에서 파일 감시 설정
const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
  if (e.document.uri.fsPath === outputFilePath) {
    this.onGeneratedFileChanged(e.document.getText());
  }
});

// 또는 fs.watch (VSCode API 외부 파일의 경우)
const fsWatcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(workspaceRoot, "src/generated.*")
);
fsWatcher.onDidChange((uri) => { ... });
```

---

### 3.3 Approach B-1: CLI (child_process) 기반 루프

CLI 방식은 B-2와 동일한 루프 구조이지만, Agent SDK 대신 `child_process.spawn`으로 `claude` CLI를 실행합니다.

#### 3.3.1 CLI 실행 래퍼

**파일**: `src/loop/ClaudeCliRunner.ts`

```typescript
import { spawn, type ChildProcess } from "child_process";

export interface CliRunOptions {
  prompt: string;
  sessionId?: string;
  workingDirectory: string;
  mcpConfigPath?: string;
  allowedTools?: string[];
  appendSystemPrompt?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  onChunk?: (event: CliStreamEvent) => void;
}

export interface CliStreamEvent {
  type: string;
  subtype?: string;
  result?: string;
  session_id?: string;
  cost_usd?: number;
  // ... 기타 stream-json 필드
}

export class ClaudeCliRunner {
  private proc: ChildProcess | null = null;

  async run(options: CliRunOptions): Promise<{ sessionId: string; result: string; costUsd: number }> {
    const args = ["-p", options.prompt, "--output-format", "stream-json"];

    if (options.sessionId) {
      args.push("--resume", options.sessionId);
    }
    if (options.mcpConfigPath) {
      args.push("--mcp-config", options.mcpConfigPath);
    }
    if (options.allowedTools?.length) {
      args.push("--allowedTools", options.allowedTools.join(","));
    }
    if (options.appendSystemPrompt) {
      args.push("--append-system-prompt", options.appendSystemPrompt);
    }
    if (options.maxTurns) {
      args.push("--max-turns", String(options.maxTurns));
    }
    if (options.maxBudgetUsd) {
      args.push("--max-budget-usd", String(options.maxBudgetUsd));
    }

    return new Promise((resolve, reject) => {
      this.proc = spawn("claude", args, {
        cwd: options.workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      let sessionId = "";
      let result = "";
      let costUsd = 0;
      let stderrBuf = "";

      this.proc.stdout?.on("data", (chunk: Buffer) => {
        // stream-json: 줄바꿈으로 구분된 JSON 이벤트
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const event: CliStreamEvent = JSON.parse(line);
            options.onChunk?.(event);

            if (event.type === "system" && event.subtype === "init" && event.session_id) {
              sessionId = event.session_id;
            }
            if (event.type === "result") {
              result = event.result ?? "";
              costUsd = event.cost_usd ?? 0;
            }
          } catch {
            // 파싱 불가 라인 무시 (부분 청크)
          }
        }
      });

      this.proc.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
      });

      this.proc.on("close", (code) => {
        this.proc = null;
        if (code === 0 || result) {
          resolve({ sessionId, result, costUsd });
        } else {
          reject(new Error(`claude CLI exited with code ${code}: ${stderrBuf}`));
        }
      });

      this.proc.on("error", (err) => {
        reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
      });
    });
  }

  abort(): void {
    this.proc?.kill("SIGINT");
    this.proc = null;
  }
}
```

#### 3.3.2 MCP 설정 파일 관리

CLI 방식에서는 `--mcp-config` 플래그에 JSON 파일 경로를 전달합니다. Extension이 실행 시점에 임시 MCP 설정 파일을 생성합니다:

```typescript
// 런타임에 .mcp.json 생성 (figma 토큰 포함)
const mcpConfig = {
  mcpServers: {
    figma: {
      type: "stdio",
      command: "npx",
      args: ["-y", "figma-developer-mcp", "--stdio"],
      env: { FIGMA_API_TOKEN: figmaToken },
    },
  },
};

const mcpConfigPath = path.join(os.tmpdir(), `figma-mcp-${Date.now()}.json`);
await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
// 사용 후 삭제 (cleanup)
```

#### 3.3.3 CLI 가용성 검사

```typescript
export async function checkClaudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["--version"], { stdio: "pipe" });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
```

---

### 3.4 Approach B 공통: IterativeRefinementLoop (수정판)

Approach B에서는 루프 오케스트레이터가 코드 생성 대신 "Agent 실행 → 파일 감지 → 렌더링 → 평가"를 반복합니다. 기존 Approach A의 `IterativeRefinementLoop`와 인터페이스를 공유하되 내부 구현만 다릅니다.

```typescript
export class AgentSdkRefinementLoop implements IRefinementLoop {
  private sessionId: string | undefined;

  constructor(
    private readonly runner: AgentRunner | ClaudeCliRunner,
    private readonly captureService: IScreenshotCapture,
    private readonly evaluator: ISimilarityEvaluator,
    private readonly previewService: PreviewPanelService,
    private readonly outputFilePath: string,
  ) {}

  async run(config: LoopConfig): Promise<LoopResult> {
    const history = new IterationHistory();

    for (let i = 1; i <= config.maxIterations; i++) {
      config.onProgress({ type: "iteration_start", iteration: i, ... });

      // 1. 프롬프트 구성
      const prompt = i === 1
        ? buildInitialAgentPrompt(config, this.outputFilePath)
        : buildRefinementAgentPrompt(i, history.getLast()!, this.outputFilePath);

      // 2. Agent 실행 (파일까지 직접 편집)
      const runResult = await this.runner.run(prompt, {
        sessionId: this.sessionId,
        workingDirectory: config.workingDirectory,
        mcpServers: config.mcpServers,
        appendSystemPrompt: AGENT_SYSTEM_PROMPT,
        maxTurns: 5,
        onEvent: (msg) => config.onProgress({ type: "agent_event", msg }),
      });

      // 세션 ID 보존 (첫 번째 실행에서 획득)
      this.sessionId ??= runResult.sessionId;

      config.onProgress({ type: "generation_complete", iteration: i });

      // 3. 파일이 편집됐는지 확인 (최대 5초 대기)
      await this.waitForFileChange(this.outputFilePath, 5000);

      // 4. 미리보기 렌더링
      const code = await fs.readFile(this.outputFilePath, "utf8");
      await this.previewService.openOrUpdate(code);
      await sleep(LOOP_DEFAULTS.RENDER_SETTLE_DELAY_MS);

      config.onProgress({ type: "render_complete", iteration: i });

      // 5. 캡처 & 평가
      const rendered = await this.captureService.capture();
      const evalResult = await this.evaluator.evaluate(
        config.initialPayload.screenshotData!,
        rendered,
      );

      history.add({
        iteration: i, code,
        renderedScreenshot: rendered,
        similarity: evalResult.score,
        evaluationResult: evalResult,
        ...
      });

      config.onProgress({
        type: "evaluation_complete",
        iteration: i,
        similarity: evalResult.score,
        renderedScreenshot: rendered.base64,
      });

      // 6. 종료 판단
      if (evalResult.score >= config.targetSimilarity) {
        config.onProgress({ type: "loop_complete", finalIteration: true, ... });
        return { success: true, finalSimilarity: evalResult.score, iterations: i, ... };
      }

      if (history.isConverging()) {
        // 수렴 감지 → 조기 종료
        break;
      }
    }

    const best = history.getBest();
    return { success: false, finalSimilarity: best.similarity, note: "max_iterations_reached", ... };
  }

  private waitForFileChange(filePath: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(path.dirname(filePath), path.basename(filePath))
      );
      const timer = setTimeout(() => { watcher.dispose(); resolve(); }, timeoutMs);
      watcher.onDidChange(() => { clearTimeout(timer); watcher.dispose(); resolve(); });
    });
  }
}
```

---

### 3.5 Approach B 루프 설정 (LoopConfig 확장)

```typescript
export interface LoopConfig {
  // ... 기존 필드 유지 ...

  // Approach B 전용 필드
  mode?: 'api' | 'agent-sdk' | 'cli';    // 기본: 'api'
  workingDirectory?: string;              // Agent SDK / CLI 작업 디렉토리
  outputFilePath?: string;               // Agent가 편집할 대상 파일 경로
  mcpServers?: Record<string, MCPServerConfig>;  // Agent SDK MCP 서버 설정
  mcpConfigPath?: string;               // CLI --mcp-config 파일 경로
  maxAgentTurns?: number;               // Agent 1회 실행 내 최대 턴 수 (기본: 5)
  maxBudgetUsdPerIteration?: number;    // 반복당 비용 한도 ($)
}
```

---

### 3.6 비용 및 성능 추정 (Approach B)

**Approach B-2 (Agent SDK) 비용 추정 (5회 루프)**

| 항목 | 비고 | 비용 추정 |
|------|------|---------|
| Agent 실행 (Sonnet, 5회) | Figma MCP 호출 + 코드 생성 + 파일 편집, 컨텍스트 누적 | ~$0.35 |
| 유사도 평가 (Haiku, 5회) | 이미지 2장 + 평가 | ~$0.012 |
| **총 예상 비용** | | **~$0.36** |

**컨텍스트 누적 주의**: `resume`으로 세션을 이어가면 대화 이력이 누적됩니다. 5회 반복 시 컨텍스트가 상당히 커져서 토큰 비용이 증가합니다. `maxTurns`와 `maxBudgetUsd`로 제어합니다.

**소요 시간 추정 (Approach B, 1회 반복)**

| 단계 | 예상 시간 |
|------|---------|
| Agent 실행 (MCP 호출 + 코드 생성 + 파일 편집) | 10~25초 |
| 파일 변경 감지 대기 | ~즉시 |
| 렌더링 안정화 대기 | 1.5초 |
| 스크린샷 캡처 | 1~3초 |
| 유사도 평가 (Haiku) | 1~3초 |
| **1회 반복 합계** | **14~33초** |
| **5회 루프 합계** | **70초~2분45초** |

---

### 3.7 Approach A ↔ B 자동 전환 (Fallback 전략)

Extension은 시작 시 Claude Code CLI 가용성을 확인하고 적절한 루프 구현체를 선택합니다:

```typescript
// LoopCommandHandler.ts
async function createRefinementLoop(config: LoopConfig): Promise<IRefinementLoop> {
  if (config.mode === 'agent-sdk' || config.mode === 'cli') {
    const cliAvailable = await checkClaudeCliAvailable();
    if (!cliAvailable) {
      Logger.warn('loop', 'claude CLI not found, falling back to API mode');
      return new ApiRefinementLoop(...);
    }
    return config.mode === 'cli'
      ? new CliRefinementLoop(new ClaudeCliRunner(), ...)
      : new AgentSdkRefinementLoop(new AgentRunner(), ...);
  }
  return new ApiRefinementLoop(...);
}
```

---

## 4. 시스템 아키텍처 (Approach A: API 직접 호출)

### 2.1 전체 컴포넌트 구조

```
src/
├── loop/                              # 신규 디렉토리
│   ├── IterativeRefinementLoop.ts     # 루프 오케스트레이터 (핵심)
│   ├── LoopStateManager.ts            # 루프 전용 상태 관리
│   ├── IterationHistory.ts            # 반복 이력 관리
│   ├── similarity/
│   │   ├── ISimilarityEvaluator.ts    # 유사도 평가 인터페이스
│   │   ├── ClaudeVisionEvaluator.ts   # Claude Vision 기반 유사도
│   │   └── PixelDiffEvaluator.ts      # pixelmatch 기반 픽셀 비교
│   ├── capture/
│   │   ├── IScreenshotCapture.ts      # 캡처 인터페이스
│   │   └── WebviewScreenshotCapture.ts# Webview 패널 캡처
│   └── feedback/
│       └── FeedbackPromptBuilder.ts   # 반복 피드백 프롬프트 생성
│
├── webview/
│   └── handlers/
│       └── LoopCommandHandler.ts      # 신규: 루프 명령 핸들러
│
└── (기존 파일들 일부 수정)
    ├── types.ts                        # 루프 관련 타입 추가
    ├── constants.ts                    # 루프 설정값 추가
    └── webview/WebviewMessageHandler.ts# 루프 핸들러 등록
```

### 2.2 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│  User (Webview - prompt panel)                                  │
│  [Loop 시작] 버튼 클릭                                           │
└────────────────────┬────────────────────────────────────────────┘
                     │ loop.start (WebviewToHostMessage)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  LoopCommandHandler.start()                                     │
│  - StateManager에서 lastMcpData, lastScreenshot 로드            │
│  - LoopConfig 구성 (maxIterations, targetSimilarity 등)         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  IterativeRefinementLoop.run()                                  │
│                                                                 │
│  iteration 1..N:                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 1. FeedbackPromptBuilder.build()                          │ │
│  │    - 첫 번째: 기본 프롬프트 + MCP data + 원본 screenshot    │ │
│  │    - 이후: 기본 프롬프트 + MCP data + 원본 screenshot       │ │
│  │            + 이전 시도 결과 image + diff 설명              │ │
│  │                                                           │ │
│  │ 2. ClaudeAgent.generateCode(payload, signal)              │ │
│  │    AsyncGenerator<string> → 스트리밍                       │ │
│  │                                                           │ │
│  │ 3. EditorIntegration.openInEditor(code)                   │ │
│  │    - 임시 파일에 코드 저장                                  │ │
│  │                                                           │ │
│  │ 4. PreviewPanelService 또는 BrowserPreviewService 렌더링   │ │
│  │    - PreviewRuntimeBuilder.buildPreviewPanelContent()     │ │
│  │                                                           │ │
│  │ 5. WebviewScreenshotCapture.capture()                     │ │
│  │    - Webview에 capture 명령 전송                           │ │
│  │    - html2canvas 실행 → base64 PNG 수신                   │ │
│  │                                                           │ │
│  │ 6. ISimilarityEvaluator.evaluate(original, rendered)      │ │
│  │    → similarity: 0.0 ~ 1.0                               │ │
│  │                                                           │ │
│  │ 7. similarity >= threshold → 종료                         │ │
│  │    similarity <  threshold → IterationHistory에 기록,     │ │
│  │                              다음 반복으로                  │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────────┘
                     │ loop.progress / loop.complete / loop.error
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Webview UI - 실시간 진행 상황 표시                              │
│  - 현재 반복 횟수 / 최대 반복 횟수                               │
│  - 현재 유사도 (progress bar)                                   │
│  - 반복별 히스토리 (스크린샷 썸네일 + 유사도)                    │
│  - [중단] 버튼                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 핵심 컴포넌트 상세 설계

### 3.1 IterativeRefinementLoop (오케스트레이터)

**파일**: `src/loop/IterativeRefinementLoop.ts`

이 클래스가 전체 루프를 통제하는 핵심입니다.

```typescript
export interface LoopConfig {
  maxIterations: number;          // 기본: 5
  targetSimilarity: number;       // 기본: 0.90 (90%)
  similarityStrategy: 'claude-vision' | 'pixel-diff';
  outputFormat: OutputFormat;
  agent: AgentType;
  model: string;
  initialPayload: PromptPayload;  // 최초 생성에 사용할 기본 payload
  onProgress: (event: LoopProgressEvent) => void;
}

export interface LoopProgressEvent {
  type: 'iteration_start' | 'generation_complete' | 'render_complete'
      | 'evaluation_complete' | 'loop_complete' | 'loop_error' | 'loop_aborted';
  iteration: number;
  totalIterations: number;
  similarity?: number;
  targetSimilarity: number;
  renderedScreenshot?: string;    // base64
  generatedCode?: string;
  error?: string;
  finalIteration?: boolean;
}

export class IterativeRefinementLoop {
  private abortController: AbortController | null = null;
  private history: IterationHistory;

  constructor(
    private readonly agent: BaseAgent,
    private readonly captureService: IScreenshotCapture,
    private readonly similarityEvaluator: ISimilarityEvaluator,
    private readonly feedbackBuilder: FeedbackPromptBuilder,
    private readonly editorIntegration: EditorIntegration,
    private readonly previewService: PreviewPanelService,
  ) {
    this.history = new IterationHistory();
  }

  async run(config: LoopConfig): Promise<LoopResult> { ... }
  abort(): void { this.abortController?.abort(); }
  getHistory(): IterationRecord[] { return this.history.getAll(); }
}
```

**run() 의 상세 로직**:

```
run(config):
  abortController = new AbortController()

  FOR i = 1 TO config.maxIterations:
    emit progress(iteration_start, i)

    // 1. 프롬프트 구성
    payload = feedbackBuilder.build({
      iteration: i,
      basePayload: config.initialPayload,
      history: history.getAll(),
    })

    // 2. 코드 생성 (스트리밍)
    code = ""
    FOR chunk IN agent.generateCode(payload, abortController.signal):
      code += chunk
      emit partial_code(chunk)  // 실시간 스트리밍 UI 업데이트

    // abort 체크
    IF abortController.signal.aborted: break

    emit progress(generation_complete, i, code)

    // 3. 에디터 & 미리보기 업데이트
    await editorIntegration.openInEditor(code, format, suggestedName)
    await previewService.openOrUpdate(code)

    // 4. 렌더링 완료 대기 (Webview 렌더링 시간 고려)
    await sleep(RENDER_SETTLE_DELAY_MS)  // 기본 1500ms

    emit progress(render_complete, i)

    // 5. 렌더링 결과 캡처
    renderedScreenshot = await captureService.capture()

    // 6. 유사도 평가
    similarity = await similarityEvaluator.evaluate(
      config.initialPayload.screenshotData,
      renderedScreenshot
    )

    // 7. 이력 기록
    history.add({
      iteration: i,
      code,
      renderedScreenshot,
      similarity,
      timestamp: Date.now(),
    })

    emit progress(evaluation_complete, i, similarity, renderedScreenshot)

    // 8. 종료 조건
    IF similarity >= config.targetSimilarity:
      emit progress(loop_complete, i, similarity, finalIteration=true)
      RETURN { success: true, finalSimilarity: similarity, iterations: i }

  // 최대 반복 도달
  bestRecord = history.getBest()
  emit progress(loop_complete, maxIterations, bestRecord.similarity, finalIteration=true)
  RETURN {
    success: false,
    finalSimilarity: bestRecord.similarity,
    iterations: maxIterations,
    note: "max_iterations_reached"
  }
```

**중요한 설계 결정**: 최대 반복 도달 시 가장 유사도가 높은 iteration의 코드를 최종 결과로 채택합니다.

---

### 3.2 유사도 평가 전략

두 가지 구현을 제공하고 설정에서 선택 가능하게 합니다.

#### 3.2.1 ClaudeVisionEvaluator (권장 기본값)

**파일**: `src/loop/similarity/ClaudeVisionEvaluator.ts`

Claude Vision에 원본과 렌더링 결과 두 이미지를 보내서 유사도를 평가합니다.

**장점**:
- Semantic 유사도 (레이아웃, 색상, 폰트 크기, 간격 등을 종합 평가)
- 픽셀 완전 일치가 불가능한 웹 렌더링에서 훨씬 현실적인 점수 제공
- 어떤 부분이 다른지 자연어 설명도 받을 수 있어 다음 반복 피드백에 활용 가능

**단점**:
- API 비용 발생 (반복마다 추가 API 호출)
- 응답 속도가 느림 (1~3초)

**평가 프롬프트 설계**:

```
System: You are a UI similarity evaluator. Your task is to compare two UI screenshots
and provide a precise similarity score.

User: Compare these two UI screenshots:
- Image 1: The original Figma design (target)
- Image 2: The generated implementation (result)

Evaluate similarity across these dimensions:
1. Layout structure (element positions, proportions, spacing) - weight 30%
2. Visual elements (buttons, inputs, cards, icons) - weight 25%
3. Typography (font size relationships, text alignment) - weight 20%
4. Color scheme (primary colors, backgrounds, borders) - weight 15%
5. Overall visual impression - weight 10%

Respond with ONLY this JSON (no markdown, no explanation):
{
  "score": <0.00 to 1.00>,
  "breakdown": {
    "layout": <0.00-1.00>,
    "elements": <0.00-1.00>,
    "typography": <0.00-1.00>,
    "colors": <0.00-1.00>,
    "overall": <0.00-1.00>
  },
  "issues": ["<specific issue 1>", "<specific issue 2>", ...]
}
```

`issues` 배열은 다음 반복의 피드백 프롬프트에 직접 주입됩니다.

**비용 최적화**: 유사도 평가 전용으로 `claude-haiku-4-5-20251001` 사용 (코드 생성은 사용자 선택 모델 유지).

```typescript
export class ClaudeVisionEvaluator implements ISimilarityEvaluator {
  // 평가는 항상 Haiku로 (비용 절감)
  private readonly EVAL_MODEL = 'claude-haiku-4-5-20251001';

  async evaluate(
    original: ScreenshotAsset,
    rendered: ScreenshotAsset,
  ): Promise<SimilarityResult> {
    // Anthropic SDK로 직접 호출 (기존 ClaudeAgent 재사용 불가 - generateCode만 있음)
    // 별도로 client.messages.create() 사용
    const response = await this.client.messages.create({
      model: this.EVAL_MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: EVALUATION_PROMPT },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: original.base64 } },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: rendered.base64 } },
        ]
      }]
    });
    // JSON 파싱 → SimilarityResult 반환
  }
}
```

#### 3.2.2 PixelDiffEvaluator (오프라인 / 빠른 옵션)

**파일**: `src/loop/similarity/PixelDiffEvaluator.ts`

`pixelmatch` npm 패키지를 사용합니다. API 비용 없이 빠르게 픽셀 레벨 비교가 가능하지만 웹 렌더링의 특성상(서브픽셀 렌더링, 폰트 렌더링 차이) 점수가 낮게 나올 수 있어 임계값 조정이 필요합니다.

**주의사항**: 두 이미지의 크기가 다를 수 있으므로 비교 전 동일 크기로 리사이즈 필요. `sharp` 또는 Canvas API 사용.

```typescript
export class PixelDiffEvaluator implements ISimilarityEvaluator {
  async evaluate(
    original: ScreenshotAsset,
    rendered: ScreenshotAsset,
  ): Promise<SimilarityResult> {
    // 1. Base64 → Buffer
    // 2. Canvas API로 동일 크기 리사이즈 (original 크기 기준)
    // 3. pixelmatch(img1, img2, diff, width, height, { threshold: 0.1 })
    // 4. diffPixels / totalPixels → similarity
    // 5. pixel diff는 semantic 차이를 무시하므로 threshold 완화 필요
    //    PixelDiff 0.85 ≈ ClaudeVision 0.90 경험적 매핑
  }
}
```

**권장**: Phase 1은 `ClaudeVisionEvaluator`를 기본으로, `PixelDiffEvaluator`는 `figma-mcp-helper.loop.similarityStrategy: "pixel-diff"` 설정 시 활성화.

---

### 3.3 WebviewScreenshotCapture

**파일**: `src/loop/capture/WebviewScreenshotCapture.ts`

Preview 패널의 WebviewPanel에서 렌더링 결과를 이미지로 캡처합니다.

**캡처 메커니즘**:

VSCode Webview는 Node.js 환경이 아닌 브라우저(Electron renderer)에서 실행됩니다. 따라서 캡처는 Webview 내부의 JavaScript에서 수행하고 결과를 Extension Host로 전달해야 합니다.

```
Extension Host                     Webview (Preview Panel)
      │                                    │
      │──── postMessage({cmd:'capture'}) ──►│
      │                                    │ html2canvas(document.body)
      │                                    │   → canvas.toDataURL('image/png')
      │◄─── postMessage({cmd:'captured',   │
      │      data: base64PNG}) ────────────│
      │                                    │
```

**구현 전략**:

현재 Preview 패널(`PreviewPanelService.ts`)이 생성하는 Webview HTML에 캡처 지원 코드를 주입해야 합니다. `PreviewRuntimeBuilder.buildPreviewPanelContent()`가 반환하는 HTML에 아래 스크립트 블록을 추가합니다:

```javascript
// Preview HTML에 주입될 캡처 스크립트
const vscode = acquireVsCodeApi();
window.addEventListener('message', async (e) => {
  if (e.data?.command !== 'loop.capture') return;

  try {
    // html2canvas는 번들에 포함시키거나 CDN에서 로드
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      scale: window.devicePixelRatio || 1,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    vscode.postMessage({ command: 'loop.captured', requestId: e.data.requestId, data: base64 });
  } catch (err) {
    vscode.postMessage({ command: 'loop.captureError', requestId: e.data.requestId, error: String(err) });
  }
});
```

Extension Host 측에서는 `Promise + requestId` 패턴으로 비동기 대기:

```typescript
export class WebviewScreenshotCapture implements IScreenshotCapture {
  private pendingCaptures = new Map<string, { resolve: Function; reject: Function }>();

  constructor(private readonly panel: vscode.WebviewPanel) {
    // panel.webview.onDidReceiveMessage에서 loop.captured 처리
  }

  async capture(timeoutMs = 10000): Promise<ScreenshotAsset> {
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCaptures.delete(requestId);
        reject(new TimeoutError('Screenshot capture timed out'));
      }, timeoutMs);

      this.pendingCaptures.set(requestId, {
        resolve: (base64: string) => { clearTimeout(timer); resolve({ base64, mimeType: 'image/png' }); },
        reject: (err: Error) => { clearTimeout(timer); reject(err); },
      });

      this.panel.webview.postMessage({ command: 'loop.capture', requestId });
    });
  }
}
```

**html2canvas 번들링 전략**:

옵션 A: `html2canvas`를 extension dependencies에 추가하고 esbuild로 Preview HTML에 인라인 번들
옵션 B: Preview HTML에서 CDN 로드 (`https://html2canvas.hertzen.com/dist/html2canvas.min.js`)

→ **옵션 A 권장**: CSP(Content Security Policy) 문제 없이 안정적, 오프라인 환경 지원

---

### 3.4 FeedbackPromptBuilder

**파일**: `src/loop/feedback/FeedbackPromptBuilder.ts`

각 반복마다 다른 프롬프트를 생성합니다. 첫 번째 반복은 기존 PromptBuilder와 동일하지만, 이후 반복부터는 이전 시도의 실패 정보를 주입합니다.

```typescript
export interface FeedbackBuildInput {
  iteration: number;
  basePayload: PromptPayload;       // 최초 요청 payload
  history: IterationRecord[];       // 지금까지의 반복 이력
}

export class FeedbackPromptBuilder {
  build(input: FeedbackBuildInput): PromptPayload {
    if (input.iteration === 1) {
      // 첫 번째: 기존 payload 그대로 사용 (기존 PromptBuilder 활용)
      return input.basePayload;
    }

    const lastRecord = input.history[input.history.length - 1];
    const bestRecord = [...input.history].sort((a, b) => b.similarity - a.similarity)[0];

    // 이전 반복 결과를 포함한 강화 프롬프트
    return {
      ...input.basePayload,
      userPrompt: this.buildRefinementPrompt(input, lastRecord, bestRecord),
      // 원본 Figma 스크린샷은 항상 유지
      screenshotData: input.basePayload.screenshotData,
      // 이전 렌더링 결과를 추가 이미지로 제공 (Claude의 multi-image 지원 활용)
      previousRenderData: lastRecord.renderedScreenshot,
    };
  }

  private buildRefinementPrompt(
    input: FeedbackBuildInput,
    lastRecord: IterationRecord,
    bestRecord: IterationRecord,
  ): string {
    const issues = lastRecord.evaluationResult?.issues ?? [];
    const similarity = Math.round(lastRecord.similarity * 100);

    return `
[REFINEMENT TASK - Iteration ${input.iteration}/${input.totalIterations}]

The previous implementation achieved ${similarity}% visual similarity with the target design.
You are provided with TWO images:
- Image 1 (first): The TARGET Figma design (what you must match)
- Image 2 (second): The PREVIOUS RESULT (what was produced last time)

${issues.length > 0 ? `
Issues identified in the previous attempt that MUST be fixed:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}
` : ''}

${lastRecord.evaluationResult?.breakdown ? `
Score breakdown of the previous attempt:
- Layout structure: ${Math.round((lastRecord.evaluationResult.breakdown.layout ?? 0) * 100)}%
- Visual elements: ${Math.round((lastRecord.evaluationResult.breakdown.elements ?? 0) * 100)}%
- Typography: ${Math.round((lastRecord.evaluationResult.breakdown.typography ?? 0) * 100)}%
- Color scheme: ${Math.round((lastRecord.evaluationResult.breakdown.colors ?? 0) * 100)}%
` : ''}

Focus on improving the weakest areas. Generate a revised implementation that addresses
all identified issues while preserving what was already correct.

${input.basePayload.userPrompt ? `Original requirements:\n${input.basePayload.userPrompt}` : ''}
    `.trim();
  }
}
```

**핵심 포인트**: Claude는 단일 API 호출에서 여러 이미지를 받을 수 있습니다. messages 배열의 content에 이미지를 두 개 넣으면 됩니다 (Image 1 = 원본 Figma, Image 2 = 이전 렌더링 결과).

이를 위해 `ClaudeAgent.generateCode()`의 messages 구성 로직 수정이 필요합니다:

```typescript
// ClaudeAgent.ts 수정 필요 부분
content: [
  { type: 'text', text: prompt },
  // 원본 Figma 스크린샷
  ...(payload.screenshotData ? [{
    type: 'image' as const,
    source: { type: 'base64', media_type: screenshotMimeType, data: payload.screenshotData.base64 }
  }] : []),
  // 이전 렌더링 결과 (루프 시에만 존재)
  ...(payload.previousRenderData ? [{
    type: 'image' as const,
    source: { type: 'base64', media_type: 'image/png', data: payload.previousRenderData.base64 }
  }] : []),
]
```

---

### 3.5 IterationHistory

**파일**: `src/loop/IterationHistory.ts`

반복 이력을 메모리에 보관하고 분석 기능을 제공합니다.

```typescript
export interface IterationRecord {
  iteration: number;
  code: string;
  renderedScreenshot: ScreenshotAsset;
  similarity: number;
  evaluationResult?: SimilarityResult;
  generationTimeMs: number;
  evaluationTimeMs: number;
  timestamp: number;
}

export class IterationHistory {
  private records: IterationRecord[] = [];

  add(record: IterationRecord): void
  getAll(): IterationRecord[]
  getBest(): IterationRecord          // similarity 최고점
  getLast(): IterationRecord | null
  getSummary(): HistorySummary        // 통계 (평균 similarity, 총 시간 등)
  clear(): void

  // 수렴 감지: 연속 N번 유사도 개선이 0.01 미만이면 조기 종료 권장
  isConverging(windowSize = 3): boolean
}
```

**수렴 감지 로직**: 최근 3개 반복의 similarity 개선폭이 모두 1% 미만이면 더 이상 개선이 없다고 판단하여 조기 종료를 트리거합니다. 이는 불필요한 API 호출과 비용을 절감합니다.

---

### 3.6 LoopCommandHandler

**파일**: `src/webview/handlers/LoopCommandHandler.ts`

기존 WebviewMessageHandler에 등록되는 신규 핸들러입니다.

```typescript
export class LoopCommandHandler {
  private activeLoop: IterativeRefinementLoop | null = null;

  constructor(
    private readonly stateManager: StateManager,
    private readonly context: vscode.ExtensionContext,
  ) {}

  async start(msg: LoopStartMessage, postMessage: PostMessageFn): Promise<void> {
    // 1. 사전 조건 검증
    const mcpData = this.stateManager.getLastMcpData();
    const screenshot = this.stateManager.getLastScreenshot();
    if (!mcpData || !screenshot) {
      postMessage({ event: 'loop.error', error: 'Figma data and screenshot are required' });
      return;
    }

    // 2. API 키 로드 (기존 AgentCommandHandler 로직 재사용)
    const agent = AgentFactory.getAgent(msg.agent ?? 'claude');
    const apiKey = await this.context.secrets.get(getSecretStorageKey(msg.agent ?? 'claude'));
    if (!apiKey) { /* 에러 처리 */ return; }
    await agent.setApiKey(apiKey);

    // 3. 유사도 평가기 선택
    const evaluator = msg.similarityStrategy === 'pixel-diff'
      ? new PixelDiffEvaluator()
      : new ClaudeVisionEvaluator(apiKey);  // Haiku 사용

    // 4. 미리보기 패널 준비 및 캡처 서비스 연결
    const previewPanel = await previewPanelService.getOrCreatePanel();
    const captureService = new WebviewScreenshotCapture(previewPanel);

    // 5. 루프 생성 및 실행
    this.activeLoop = new IterativeRefinementLoop(
      agent, captureService, evaluator,
      new FeedbackPromptBuilder(),
      editorIntegration, previewPanelService,
    );

    const config: LoopConfig = {
      maxIterations: msg.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      targetSimilarity: msg.targetSimilarity ?? DEFAULT_TARGET_SIMILARITY,
      similarityStrategy: msg.similarityStrategy ?? 'claude-vision',
      outputFormat: msg.outputFormat,
      agent: msg.agent ?? 'claude',
      model: msg.model,
      initialPayload: {
        userPrompt: msg.userPrompt,
        mcpData, screenshotData: screenshot,
        outputFormat: msg.outputFormat,
        model: msg.model, agent: msg.agent,
      },
      onProgress: (event) => postMessage({ event: 'loop.progress', ...event }),
    };

    try {
      const result = await this.activeLoop.run(config);
      postMessage({ event: 'loop.complete', result });
    } catch (err) {
      postMessage({ event: 'loop.error', error: toErrorMessage(err) });
    } finally {
      this.activeLoop = null;
    }
  }

  abort(): void {
    this.activeLoop?.abort();
  }
}
```

---

## 4. 타입 시스템 확장 (types.ts)

기존 `types.ts`에 추가할 타입들:

```typescript
// LoopConfig 관련
export type SimilarityStrategy = 'claude-vision' | 'pixel-diff';

export interface SimilarityResult {
  score: number;            // 0.0 ~ 1.0
  breakdown?: {
    layout?: number;
    elements?: number;
    typography?: number;
    colors?: number;
    overall?: number;
  };
  issues?: string[];        // 개선이 필요한 구체적 문제점 목록
  rawResponse?: string;     // 디버깅용
}

export interface IterationRecord {
  iteration: number;
  code: string;
  renderedScreenshot: ScreenshotAsset;
  similarity: number;
  evaluationResult?: SimilarityResult;
  generationTimeMs: number;
  evaluationTimeMs: number;
  timestamp: number;
}

export interface LoopResult {
  success: boolean;
  finalSimilarity: number;
  iterations: number;
  bestIteration: number;
  finalCode: string;
  note?: 'max_iterations_reached' | 'converged' | 'user_aborted';
  history: IterationRecord[];
}

// PromptPayload 확장 (기존 인터페이스에 필드 추가)
// previousRenderData: 이전 반복의 렌더링 결과 이미지
export interface PromptPayload {
  // ... 기존 필드 유지 ...
  previousRenderData?: ScreenshotAsset | null;   // 신규
}

// Webview ↔ Host 메시지 추가
// Host → Webview
export type LoopProgressMessage = {
  event: 'loop.progress';
  type: LoopProgressEvent['type'];
  iteration: number;
  totalIterations: number;
  similarity?: number;
  targetSimilarity: number;
  renderedScreenshot?: string;
};
export type LoopCompleteMessage = { event: 'loop.complete'; result: LoopResult };
export type LoopErrorMessage   = { event: 'loop.error'; error: string };

// Webview → Host
export type LoopStartMessage = {
  command: 'loop.start';
  maxIterations?: number;
  targetSimilarity?: number;
  similarityStrategy?: SimilarityStrategy;
  outputFormat: OutputFormat;
  agent?: AgentType;
  model: string;
  userPrompt?: string;
};
export type LoopAbortMessage = { command: 'loop.abort' };
```

---

## 5. 설정값 (constants.ts 추가)

```typescript
// Loop 관련 상수
export const LOOP_DEFAULTS = {
  MAX_ITERATIONS: 5,
  TARGET_SIMILARITY: 0.90,
  RENDER_SETTLE_DELAY_MS: 1500,   // 렌더링 안정화 대기 시간
  CAPTURE_TIMEOUT_MS: 10000,      // 캡처 타임아웃
  EVAL_TIMEOUT_MS: 15000,         // 유사도 평가 타임아웃
  CONVERGENCE_WINDOW: 3,          // 수렴 감지 윈도우 크기
  CONVERGENCE_THRESHOLD: 0.01,    // 수렴 판단 최소 개선폭
  SIMILARITY_EVAL_MODEL: 'claude-haiku-4-5-20251001',
} as const;

// VSCode 설정 키 추가
export const CONFIG_KEYS = {
  // ... 기존 키 유지 ...
  LOOP_MAX_ITERATIONS:     'figma-mcp-helper.loop.maxIterations',
  LOOP_TARGET_SIMILARITY:  'figma-mcp-helper.loop.targetSimilarity',
  LOOP_STRATEGY:           'figma-mcp-helper.loop.similarityStrategy',
} as const;
```

---

## 6. UI 설계 (Webview - Prompt Panel 확장)

기존 Prompt Panel에 Loop 관련 UI를 추가합니다.

### 6.1 Loop 컨트롤 섹션

```
┌─────────────────────────────────────────────────────────┐
│  [Generate Code]  [▶ Start Loop]  [⚙ Loop Settings]    │
└─────────────────────────────────────────────────────────┘
```

"Start Loop" 클릭 시 Loop 진행 패널이 나타납니다:

```
┌─────────────────────────────────────────────────────────┐
│  Iterative Refinement Loop                   [■ Abort]  │
│                                                         │
│  Iteration: 2 / 5      Target: 90%                      │
│                                                         │
│  Current Similarity:                                    │
│  ████████████████████░░░░  76%                          │
│                                                         │
│  History:                                               │
│  ┌────────┬────────┬────────┐                          │
│  │ iter 1 │ iter 2 │ ...    │                          │
│  │  [img] │  [img] │        │                          │
│  │  62%   │  76%   │        │                          │
│  └────────┴────────┴────────┘                          │
│                                                         │
│  Status: Generating code... ●●●                         │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Loop Settings (접이식 패널)

```
┌─────────────────────────────────────────────────────────┐
│  Loop Settings                                    [▲]   │
│                                                         │
│  Mode:                                                  │
│  [● API (Anthropic SDK)]                                │
│  [○ Agent SDK  ⚡ claude CLI 필요]                      │
│  [○ CLI (child_process)  ⚡ claude CLI 필요]            │
│                                                         │
│  Max Iterations:    [5    ▲▼]                           │
│  Target Similarity: [90%  ▲▼]                           │
│  Similarity Check:  [● Claude Vision  ○ Pixel Diff]     │
│                                                         │
│  Agent SDK / CLI 전용 설정:                              │
│  Output File: [src/generated.tsx            ]           │
│  Max Agent Turns: [5  ▲▼]  Budget: [$0.50  ]           │
│                                                         │
│  Estimated cost per loop:                               │
│  API mode: ~$0.24  |  Agent SDK mode: ~$0.36           │
│                                                         │
│  ⚠ claude CLI: ✅ 설치됨 (v1.x.x)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Preview 패널 수정 사항

### 7.1 PreviewRuntimeBuilder.ts 수정

`buildPreviewPanelContent()` 또는 `buildPreviewPanelHtml()` 함수가 반환하는 HTML에 캡처 스크립트를 주입합니다.

**주의**: Preview 패널의 CSP(Content Security Policy)가 인라인 스크립트를 차단할 수 있습니다. `SidebarProvider.ts`에서 nonce를 사용하는 방식처럼 preview 패널에도 nonce 기반 스크립트 주입 필요.

```typescript
// PreviewRuntimeBuilder에서 캡처 스크립트 주입
function buildCaptureScript(nonce: string): string {
  return `
<script nonce="${nonce}">
(function() {
  // html2canvas 로직은 별도 번들 파일로 관리
  window.__figmaLoopCapture = async function(requestId) {
    // ... html2canvas 캡처 ...
  };

  window.addEventListener('message', async (e) => {
    if (e.data?.command !== 'loop.capture') return;
    await window.__figmaLoopCapture(e.data.requestId);
  });
})();
</script>`;
}
```

### 7.2 PreviewPanelService.ts 수정

캡처 결과 메시지를 Extension Host에서 수신하는 리스너를 노출해야 합니다:

```typescript
// PreviewPanelService에 추가
onCaptureMessage(handler: (data: { requestId: string; base64?: string; error?: string }) => void): vscode.Disposable {
  return this.panel.webview.onDidReceiveMessage((msg) => {
    if (msg.command === 'loop.captured' || msg.command === 'loop.captureError') {
      handler({ requestId: msg.requestId, base64: msg.data, error: msg.error });
    }
  });
}
```

---

## 8. html2canvas 번들링 전략

### 8.1 esbuild 번들에 포함

`package.json` dependency 추가:
```json
"html2canvas": "^1.4.1"
```

`esbuild.config.js`에서 Preview 번들 별도 생성:
```javascript
// preview-capture-bundle.js 별도 생성
await esbuild.build({
  entryPoints: ['src/loop/capture/captureBundle.ts'],
  bundle: true,
  platform: 'browser',
  outfile: 'dist/captureBundle.js',
  format: 'iife',
  globalName: 'FigmaCaptureLib',
});
```

Preview HTML에서 이 번들을 `<script src="${webview.asWebviewUri(captureBundle)}">` 형태로 주입합니다.

---

## 9. 에러 처리 및 엣지 케이스

### 9.1 에러 유형별 처리

| 에러 상황 | 처리 방법 |
|---------|---------|
| 코드 생성 실패 (API 오류) | 해당 반복 스킵, 다음 반복 시도. 3회 연속 실패 시 루프 중단 |
| 렌더링 실패 (구문 오류 코드) | PreviewRenderer의 기존 에러 처리 활용, 유사도 0으로 기록 |
| 캡처 타임아웃 | `capture_timeout` 에러로 해당 반복 실패 처리 |
| 유사도 평가 실패 (API 오류) | pixel-diff로 폴백, 실패 로깅 |
| 사용자 중단 (Abort) | AbortController로 즉시 중단, 최선의 결과 유지 |
| Preview 패널 닫힘 | 루프 일시 중단 후 재열기 시도 |
| MCP 데이터 없음 | 루프 시작 전 검증, 명확한 에러 메시지 |
| 메모리 부족 (큰 이미지) | 이미지 리사이즈 (최대 1920x1080) 후 처리 |

### 9.2 수렴 감지에 의한 조기 종료

```typescript
// IterationHistory.isConverging() 구현
isConverging(windowSize = 3): boolean {
  if (this.records.length < windowSize) return false;
  const recent = this.records.slice(-windowSize);
  const improvements = recent.slice(1).map((r, i) =>
    r.similarity - recent[i].similarity
  );
  return improvements.every(imp => imp < LOOP_DEFAULTS.CONVERGENCE_THRESHOLD);
}
```

루프 실행 중 매 반복마다 이 검사를 수행하고, 수렴 감지 시 `note: 'converged'`로 조기 종료합니다.

### 9.3 최대 반복 도달 시 최선 결과 채택

최대 반복 횟수에 도달하면 `IterationHistory.getBest()`로 가장 유사도가 높은 반복의 코드를 에디터에 적용합니다. UI에는 "목표에 도달하지 못했으나 최선의 결과 (X%)를 적용했습니다"라고 안내합니다.

---

## 10. 비용 및 성능 추정

### 10.1 API 비용 추정 (5회 루프, Claude Sonnet 코드 생성 + Haiku 평가)

| 항목 | 토큰 수 (추정) | 비용 (추정) |
|------|--------------|------------|
| 코드 생성 - 입력 (Sonnet, 5회) | ~5,000 × 5 = 25,000 | ~$0.075 |
| 코드 생성 - 출력 (Sonnet, 5회) | ~2,000 × 5 = 10,000 | ~$0.150 |
| 유사도 평가 - 입력 (Haiku, 5회) | ~1,000 + 이미지×5 | ~$0.010 |
| 유사도 평가 - 출력 (Haiku, 5회) | ~200 × 5 = 1,000 | ~$0.001 |
| **총 예상 비용** | | **~$0.24** |

이미지 토큰 비용: Claude는 이미지를 토큰으로 환산 (1568×1568 ≈ 1,601 tokens).

### 10.2 소요 시간 추정 (1회 반복)

| 단계 | 예상 시간 |
|------|---------|
| 코드 생성 (스트리밍) | 5~15초 |
| 렌더링 안정화 대기 | 1.5초 |
| 스크린샷 캡처 | 1~3초 |
| 유사도 평가 (Haiku) | 1~3초 |
| **1회 반복 합계** | **9~22초** |
| **5회 루프 합계** | **45초~1분50초** |

---

## 11. 구현 단계 (Phases)

### Phase 1: Approach A 기본 루프 (MVP)
- [ ] `src/loop/` 디렉토리 및 기본 파일 구조 생성
- [ ] `IterativeRefinementLoop` 오케스트레이터 구현 (API 기반)
- [ ] `IterationHistory` 구현
- [ ] `ClaudeVisionEvaluator` 구현
- [ ] `FeedbackPromptBuilder` 구현
- [ ] `WebviewScreenshotCapture` 구현 (html2canvas 번들 포함)
- [ ] `LoopCommandHandler` 구현
- [ ] `WebviewMessageHandler`에 루프 핸들러 등록
- [ ] `ClaudeAgent.generateCode()`에 `previousRenderData` 지원 추가
- [ ] `PromptPayload` 타입 확장
- [ ] Webview UI: 기본 Loop 시작/중단 버튼 및 진행 표시

### Phase 2: Approach B 추가 및 UX 고도화
- [ ] `checkClaudeCliAvailable()` 유틸리티 구현
- [ ] `ClaudeCliRunner` 구현 (`child_process` 기반, B-1)
- [ ] `AgentRunner` 구현 (`@anthropic-ai/claude-agent-sdk` 기반, B-2)
- [ ] `AgentSdkRefinementLoop` / `CliRefinementLoop` 구현
- [ ] Loop Settings에 `mode` 선택 (API / Agent SDK / CLI) 추가
- [ ] MCP 설정 파일 자동 생성 로직 추가
- [ ] `IRefinementLoop` 공통 인터페이스로 Approach A/B 추상화
- [ ] Approach 자동 감지 및 Fallback 전략 구현
- [ ] `PixelDiffEvaluator` 구현 (pixelmatch 연동)
- [ ] 반복 히스토리 UI (썸네일 + 유사도 차트)
- [ ] 수렴 감지 조기 종료
- [ ] 비용 추정 표시
- [ ] `package.json`에 새 설정 항목 등록

### Phase 3: 고급 기능
- [ ] Gemini / OpenAI 에이전트 루프 지원 (Approach A)
- [ ] Browser Preview(Vite) 기반 캡처 지원 (Puppeteer/Playwright)
- [ ] 루프 결과 내보내기 (JSON 리포트)
- [ ] 멀티모달 diff 시각화 (원본 vs 결과 side-by-side)
- [ ] Approach B에서 `--fork-session` 활용한 병렬 탐색 실험

---

## 12. 의존성 추가 목록

**Phase 1 (Approach A)**:
```json
{
  "dependencies": {
    "html2canvas": "^1.4.1"
  }
}
```

**Phase 2 (Approach B + 추가 기능)**:
```json
{
  "dependencies": {
    "html2canvas": "^1.4.1",
    "@anthropic-ai/claude-agent-sdk": "latest"
  },
  "devDependencies": {
    "pixelmatch": "^6.0.0",
    "@types/pixelmatch": "^5.2.6"
  }
}
```

**외부 런타임 의존성 (Approach B)**:
- `claude` CLI: `npm install -g @anthropic-ai/claude-code` (사용자 환경)
- Figma MCP Server: `npx figma-developer-mcp` (런타임 자동 설치)

**주의**: `@anthropic-ai/claude-agent-sdk`는 내부적으로 `claude` CLI를 실행합니다. CLI가 설치되어 있지 않으면 Agent SDK도 동작하지 않습니다. Extension은 항상 CLI 가용성을 확인하고 Approach A로 graceful fallback합니다.

---

## 13. 파일별 수정/신규 요약

### Phase 1 파일 (Approach A)

| 파일 | 변경 유형 | 변경 내용 |
|------|---------|---------|
| `src/loop/IRefinementLoop.ts` | 신규 | 루프 공통 인터페이스 |
| `src/loop/IterativeRefinementLoop.ts` | 신규 | Approach A 루프 오케스트레이터 |
| `src/loop/LoopStateManager.ts` | 신규 | 루프 전용 상태 |
| `src/loop/IterationHistory.ts` | 신규 | 반복 이력 + 수렴 감지 |
| `src/loop/similarity/ISimilarityEvaluator.ts` | 신규 | 유사도 평가 인터페이스 |
| `src/loop/similarity/ClaudeVisionEvaluator.ts` | 신규 | Claude Vision 평가기 |
| `src/loop/similarity/PixelDiffEvaluator.ts` | 신규 | 픽셀 비교 평가기 (Phase 2) |
| `src/loop/capture/IScreenshotCapture.ts` | 신규 | 캡처 인터페이스 |
| `src/loop/capture/WebviewScreenshotCapture.ts` | 신규 | Webview 캡처 구현 |
| `src/loop/capture/captureBundle.ts` | 신규 | html2canvas 브라우저 번들 진입점 |
| `src/loop/feedback/FeedbackPromptBuilder.ts` | 신규 | Approach A 피드백 프롬프트 생성기 |
| `src/webview/handlers/LoopCommandHandler.ts` | 신규 | 루프 명령 핸들러 |
| `src/types.ts` | 수정 | 루프 관련 타입 추가 |
| `src/constants.ts` | 수정 | LOOP_DEFAULTS, CONFIG_KEYS 추가 |
| `src/agent/ClaudeAgent.ts` | 수정 | previousRenderData 다중 이미지 지원 |
| `src/preview/PreviewRuntimeBuilder.ts` | 수정 | 캡처 스크립트 주입 |
| `src/editor/PreviewPanelService.ts` | 수정 | onCaptureMessage 노출 |
| `src/webview/WebviewMessageHandler.ts` | 수정 | LoopCommandHandler 등록 |
| `package.json` | 수정 | html2canvas 의존성, loop 설정 contribution points |
| `esbuild.config.js` | 수정 | captureBundle 빌드 타겟 추가 |

### Phase 2 추가 파일 (Approach B)

| 파일 | 변경 유형 | 변경 내용 |
|------|---------|---------|
| `src/loop/AgentRunner.ts` | 신규 | Agent SDK 래퍼 (B-2) |
| `src/loop/ClaudeCliRunner.ts` | 신규 | CLI child_process 래퍼 (B-1) |
| `src/loop/AgentSdkRefinementLoop.ts` | 신규 | Approach B 루프 오케스트레이터 |
| `src/loop/utils/cliDetector.ts` | 신규 | Claude CLI 가용성 검사 |
| `src/loop/utils/mcpConfigWriter.ts` | 신규 | 임시 MCP 설정 파일 생성/정리 |
| `src/loop/utils/tempFileManager.ts` | 신규 | 임시 스크린샷 파일 관리 |
| `src/webview/handlers/LoopCommandHandler.ts` | 수정 | Approach 선택 로직, fallback 추가 |
| `src/types.ts` | 수정 | LoopConfig에 mode/mcpServers 등 추가 |

---

## 14. 핵심 설계 결정 및 근거

### Approach A vs B: 언제 무엇을 선택하는가?

**Approach A가 적합한 경우**:
- 사용자 환경에 `claude` CLI 설치를 보장할 수 없을 때
- 기존 Gemini/OpenAI 에이전트에도 루프를 지원해야 할 때 (Approach B는 Claude Code 전용)
- Extension의 동작을 완전히 통제해야 할 때 (파일 경로, 프롬프트 형식 등)

**Approach B가 적합한 경우**:
- Figma MCP를 Claude가 자율 탐색하게 하고 싶을 때 (매 반복 MCP 데이터 재사용이 아닌 자율 쿼리)
- 반복 간 대화 컨텍스트 자동 보존이 중요할 때 (Claude Code session resume)
- Extension 코드를 단순하게 유지하고 싶을 때 (파일 I/O, 프롬프트 조립 부담 없음)
- "AI가 파일을 직접 수정하는" UX가 더 자연스러울 때

**결론**: 두 Approach를 모두 구현하고, 사용자 설정 및 환경에 따라 자동 선택합니다. Claude Code CLI가 설치되어 있으면 Approach B-2를 기본으로 사용하고, 아니면 Approach A로 fallback합니다.

---

### 왜 Claude Code VSCode Extension API는 사용하지 않는가?

Claude Code VSCode Extension은 `vscode.commands.executeCommand`로 호출 가능한 Programmatic API를 공개하지 않습니다. 채팅 UI를 여는 명령 등은 있지만, 코드 생성 결과를 Extension이 수신하거나 제어하는 방법이 없습니다. CLI / Agent SDK가 유일한 programmatic 인터페이스입니다.

---

### 왜 Claude Vision으로 유사도를 평가하는가?

1. **Semantic 이해**: 웹 렌더링은 폰트, 서브픽셀, OS 렌더러에 따라 픽셀이 달라짐. Pixel diff는 시각적으로 동일해도 낮은 점수를 줄 수 있음
2. **피드백 품질**: "버튼의 corner radius가 다릅니다"처럼 구체적인 피드백을 다음 반복에 주입 가능
3. **비용 대비 가치**: Haiku는 저렴하고 이미지 비교에 충분히 유능함

---

### 왜 html2canvas인가?

1. VSCode Webview는 Node.js API에 접근 불가 → Puppeteer 등 Node 도구 사용 불가
2. Webview 내부에서 직접 DOM을 캔버스로 렌더링 → 가장 정확한 시각적 캡처
3. Browser Preview(Vite) 는 별도 프로세스 → 별도 캡처 전략 필요 (Phase 3)

---

### Approach B에서 `disallowedTools: ["Bash"]`가 중요한 이유

Agent SDK가 Claude Code에게 Bash 툴을 허용하면 임의의 셸 명령 실행이 가능합니다. GUI 코드 생성 루프에서는 파일 읽기/쓰기 이상의 권한이 필요하지 않으므로 `Read`, `Write`, `Edit`, `Glob`만 허용하고 나머지를 차단합니다. `WebFetch`, `WebSearch`도 불필요한 외부 네트워크 접근을 막기 위해 차단합니다.

---

### 렌더링 안정화 대기 (1500ms)

React 렌더링, Tailwind 스타일 적용, 폰트 로딩 등이 완료되기를 기다립니다. 너무 짧으면 빈 화면이나 부분 렌더링을 캡처할 위험이 있습니다. 설정으로 조정 가능하게 합니다.

---

### CLI stream-json vs Agent SDK의 선택

| 항목 | CLI (stream-json) | Agent SDK |
|------|-------------------|-----------|
| stdout 줄바꿈 JSON 파싱 | 수동으로 구현 필요 | SDK가 처리 |
| TypeScript 타입 | 없음 | 완전 지원 |
| AbortController | `SIGINT` 전송으로 대체 | 표준 Web API |
| 부분 메시지 스트리밍 | `--verbose --include-partial-messages` | `includePartialMessages: true` |
| 설치 단계 | CLI만 필요 | CLI + npm 패키지 |

Extension 내부에서는 **Agent SDK (B-2)** 를 우선합니다. CLI (B-1) 는 외부 스크립트 연동이나 CI/CD 파이프라인을 위한 보완 옵션입니다.
