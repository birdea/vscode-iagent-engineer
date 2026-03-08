# Figma MCP Helper

Turn Figma screens into implementation-ready code inside VS Code.

Figma MCP Helper connects to Figma from the VS Code sidebar, lets you inspect fetched design data, and generates code with Gemini or Claude without leaving your editor.

![Figma MCP Helper screenshot](images/screenshot-1.png)

> Preview release: the core workflow is stable for regular use, but the extension is still evolving.

## What It Does

- Supports a `local / remote` connection mode in the Setup sidebar
- Connects to a local Figma Desktop MCP server from VS Code
- Fetches Figma file data from a shared Figma URL or MCP JSON payload
- Captures screenshots for the selected Figma node
- Generates code with Gemini or Claude
- Streams generation progress and supports cancellation
- Opens generated output in the editor or saves it as a new file
- Keeps an in-extension activity log for troubleshooting

## Requirements

- VS Code 1.85 or later
- For local mode: a running Figma Desktop MCP server
- For planned remote mode: a Figma OAuth flow and REST-backed remote integration
- At least one AI API key:
  - Gemini: [Google AI Studio](https://aistudio.google.com)
  - Claude: [Anthropic Console](https://console.anthropic.com)

## Quick Start

1. Install the extension.
2. Open the **Figma MCP Helper** view from the activity bar.
3. In **Setup**, choose `local` or `remote`.
4. For `local`, confirm the MCP endpoint and connect to your Desktop MCP server.
5. For `remote`, use **Auth Login** when the OAuth flow is configured.
6. Paste a Figma URL, then fetch the design data or screenshot.
7. In **Agent**, choose Gemini or Claude, save your API key, and load a model.
8. In **Prompt**, choose an output format and generate code.

## Sidebar Workflow

### Setup

The Setup view has two sections:

- **Figma**: choose a connection mode, connect or authenticate, paste a Figma URL or payload, fetch structured data, and capture screenshots
- **Agent**: choose the AI provider, save credentials, and load an available model

### Prompt

Use the Prompt view to generate output from the fetched Figma context.

- Output formats: `tsx`, `html`, `scss`, `tailwind`, `kotlin`
- Optional controls: include or exclude the free-form prompt and fetched MCP data
- Result actions: open in editor or save as a new file

### Log

The Log view shows extension activity and error details, and lets you clear, copy, or save logs.

## Settings

| Setting                                    | Default                 | Description                                                               |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `figma-mcp-helper.defaultAgent`            | `gemini`                | Default AI provider used by the Agent panel                               |
| `figma-mcp-helper.defaultModel`            | `""`                    | Default model ID synced from the Agent panel                              |
| `figma-mcp-helper.mcpConnectionMode`       | `local`                 | Preferred Setup connection mode (`local` Desktop MCP or `remote` auth)    |
| `figma-mcp-helper.mcpEndpoint`             | `http://localhost:3845` | Figma MCP server endpoint                                                 |
| `figma-mcp-helper.remoteMcpEndpoint`       | `""`                    | Remote endpoint reserved for the planned OAuth/REST remote mode           |
| `figma-mcp-helper.remoteMcpAuthUrl`        | `""`                    | Remote authentication URL used by the **Auth Login** action               |
| `figma-mcp-helper.openFetchedDataInEditor` | `false`                 | Automatically open fetched MCP JSON in an editor after a successful fetch |
| `figma-mcp-helper.claudeModels`            | built-in list           | Claude model catalog shown in the Agent panel                             |

## Commands

- `Figma MCP Helper: Generate Code`
- `Connect MCP`
- `Generate Code`
- `Clear Logs`
- `Copy Logs`
- `Save Logs`

## Notes

- API keys are stored through the VS Code secret storage API.
- The extension UI follows your VS Code display language automatically.
- Korean (`ko`) and English are supported. Other locales fall back to English.

## Known Scope

- Local mode depends on an external Figma Desktop MCP server; it does not bundle or host one.
- Remote mode is currently being developed as `Figma OAuth + REST parity` for the existing fetch/screenshot workflow, not as a full remote MCP transport implementation yet.
- Output quality depends on the completeness of the MCP data, screenshot quality, prompt instructions, and selected AI model.
