# iAgent Engineer

iAgent Engineer is a VS Code extension for turning Figma context into implementation-ready code, previews, and diagnostics without leaving the editor.

It combines four workflows in one extension:

- Figma MCP connection and design-data retrieval
- AI-assisted code generation across multiple providers
- Editor and preview handoff for generated output
- Session profiling for Claude, Codex, and Gemini activity logs

![iAgent Engineer screenshot](images/screenshot-3.png)

Demo video: [YouTube quick guide](https://www.youtube.com/watch?v=YmeUWzeAsxw)

## What It Does

- Connects to a local or remote MCP endpoint for Figma data access
- Fetches design context, metadata, variable definitions, screenshots, and source assets
- Generates `tsx`, `html`, `vue`, or `tailwind` output from a single prompt workflow
- Opens generated results in the editor, a VS Code preview panel, or a browser preview flow
- Stores API keys in VS Code secret storage
- Includes an Agent Session Profiler with both overview and detailed timeline analysis
- Supports Korean and English UI copy

## Main Views

### Setup

The Setup view is where you connect to MCP and prepare design input.

- Select `local` or `remote` connection mode
- Connect to your MCP endpoint
- Paste a Figma URL or JSON payload
- Fetch context, metadata, variable definitions, screenshots, or source assets
- Open fetched results directly in the editor when desired

### Prompt

The Prompt view is the generation workspace.

- Choose an agent and model
- Save and reuse provider API keys
- Select an output format
- Generate code from your prompt plus fetched MCP data
- Open the result in the editor or preview it immediately

### Log

The Log view keeps a running trace of extension activity for debugging and support.

- Inspect info, warning, success, and error events
- Clear the log
- Copy the full log output

### Profiler

The Profiler helps inspect historical AI-agent session files.

- Scan available session archives by agent
- Review aggregate token and size statistics
- Open a detailed timeline in the `iProfiler` panel
- Jump from chart/raw events back to source log lines

## Supported Providers

- Google Gemini
- Anthropic Claude
- DeepSeek
- Alibaba Qwen
- OpenRouter

## Requirements

- VS Code `1.85+`
- A reachable MCP endpoint
  - Local workflow: Figma Desktop MCP server
  - Remote workflow: configured remote endpoint and auth URL
- At least one model provider API key
  - [Google AI Studio](https://aistudio.google.com)
  - [Anthropic Console](https://console.anthropic.com)
  - [DeepSeek Platform](https://platform.deepseek.com/api_keys)
  - [DashScope Console](https://dashscope.console.aliyun.com/apiKey)
  - [OpenRouter Keys](https://openrouter.ai/keys)

## Quick Start

1. Install the extension and open **iAgent Engineer** in the VS Code activity bar.
2. In **Setup**, select your MCP mode and connect.
3. Paste a Figma URL or JSON payload and fetch context or screenshots.
4. In **Prompt**, choose an agent, save an API key, and load a model.
5. Select an output format and generate code.
6. Open the result in the editor or preview it directly inside VS Code.
7. Use **Profiler** and `iProfiler` when you want to inspect historical session logs.

## Key Settings

Common settings live under the `iagent-engineer.*` namespace.

- `iagent-engineer.defaultAgent`
- `iagent-engineer.defaultModel`
- `iagent-engineer.mcpConnectionMode`
- `iagent-engineer.mcpEndpoint`
- `iagent-engineer.remoteMcpEndpoint`
- `iagent-engineer.remoteMcpAuthUrl`
- `iagent-engineer.openFetchedDataInEditor`
- `iagent-engineer.claudeModels`
- `iagent-engineer.profiler.*`

## Development

```bash
npm ci
npm run verify
```

Useful scripts:

- `npm run watch`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run verify`
- `npm run verify:coverage`
- `npm run package`

Release checklist:

- [docs/release-checklist.md](docs/release-checklist.md)

## Repository

- Issues: https://github.com/birdea/vscode-iagent-engineer/issues
- Homepage: https://github.com/birdea/vscode-iagent-engineer#readme
