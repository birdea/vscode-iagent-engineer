# FigmaLab

FigmaLab is a VS Code extension prototype for turning Figma MCP context into working code inside the editor.

It connects to a Figma MCP server, pulls design data or screenshots, sends that context to an AI model, and lets you insert or save the generated result without leaving VS Code.

## Status

This repository is currently an experimental extension, not a finished product.

What works today:

- Connect to a Figma MCP endpoint over JSON-RPC
- Parse Figma URLs or JSON payloads into `fileId` / `nodeId`
- Fetch Figma file data and open the result as JSON in VS Code
- Fetch screenshots and open them in the editor
- Generate code with Gemini or Claude
- Save generated output to a new file or insert it at the current cursor
- View activity logs in a dedicated sidebar panel

Current gaps:

- Codex is not implemented
- `figmalab.defaultAgent` setting is declared in the extension manifest but runtime agent selection uses `globalState` (saved via the Agent panel), not the VS Code setting

## Main Workflow

FigmaLab is organized as four sidebar views:

- `Agent`: choose an AI provider, save an API key, and load available models
- `Figma`: connect to MCP, paste Figma URL/JSON, fetch design data or screenshots
- `Prompt`: choose output format, add instructions, generate code, insert or save the result
- `Log`: inspect extension activity and troubleshooting details

## Supported Output Formats

- `tsx`
- `html`
- `scss`
- `tailwind`
- `kotlin`

## Supported Agents

- Gemini
- Claude

## Requirements

- Node.js 18+
- VS Code 1.85+
- A running Figma MCP server
- At least one AI API key:
  - Gemini: Google AI Studio
  - Claude: Anthropic Console

## Quick Start

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Launch it in VS Code:

1. Open this repository in VS Code
2. Run the `Run Extension` launch configuration
3. In the Extension Development Host, open the `FigmaLab` activity bar view

Use the extension:

1. Open the `Agent` panel, choose a provider, and save an API key
2. Load a model
3. Open the `Figma` panel and connect to your MCP endpoint
4. Paste a Figma URL or MCP JSON payload
5. Fetch data or a screenshot
6. Open the `Prompt` panel and choose an output format
7. Generate code
8. Insert it into the active editor or save it as a file

## Configuration

Available extension settings:

- `figmalab.mcpEndpoint`
  - Default: `http://localhost:3845`
  - Figma MCP server endpoint
- `figmalab.defaultAgent`
  - Declared in the extension manifest. Runtime selection is managed via the Agent panel and stored in `globalState`; this setting is not read at runtime.
- `figmalab.claudeModels`
  - Array of Claude model definitions shown in the Agent panel. Editable to add or override available models.

## Local Development

Build once:

```bash
npm run build
```

Watch mode:

```bash
npm run watch
```

Lint:

```bash
npm run lint
npm run lint:fix
```

Format:

```bash
npm run format
npm run format:check
```

Run unit tests:

```bash
npm run test:unit
```

Run unit tests with coverage:

```bash
npm run test:coverage
```

Package the extension:

```bash
npm run package
```

## Mock MCP Server

The repository includes a simple mock server for local UI development.

Start it with:

```bash
node mock-mcp-server.js
```

Default endpoint:

```text
http://localhost:3845
```

Implemented mock methods:

- `initialize`
- `tools/list`
- `tools/call` for `get_file`
- `tools/call` for `get_image`

## Project Structure

```text
src/
  agent/      AI provider adapters and factory
  editor/     Editor insertion and file save integration
  figma/      MCP client, parser, and screenshot service
  logger/     Output channel and in-memory log store
  prompt/     Prompt building and token estimation helpers
  webview/    Sidebar providers, message handling, and UI
  constants.ts
  extension.ts
  types.ts
test/
  unit/       Unit tests for all source modules
```

## Notes

- This project is currently optimized for local experimentation and extension development.
- If you are evaluating the codebase, start with `src/extension.ts` and `src/webview/WebviewMessageHandler.ts`.
- Development plans and architectural notes are in the `docs/` directory.
