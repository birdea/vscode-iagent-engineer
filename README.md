# Figma MCP Helper

Turn Figma screens into implementation-ready code inside VS Code.

Figma MCP Helper connects to Figma from the VS Code sidebar, opens fetched design data and generated output in the VS Code editor, and generates implementation-ready code with Gemini or Claude without leaving your workspace.

![Figma MCP Helper screenshot](images/screenshot-1.png)

> `v0.4.0`: local Figma Desktop MCP is supported, fetched data and generated output open in the editor, and the remote mode UI remains visible while the workflow itself stays deferred.

## What It Does

- Supports a `local / remote` connection mode in the Setup sidebar
- Connects to a local Figma Desktop MCP server from VS Code
- Keeps the planned remote mode UI visible without enabling the unfinished workflow
- Fetches Figma file data from a shared Figma URL or MCP JSON payload
- Captures screenshots for the selected Figma node
- Generates code with Gemini or Claude
- Streams generation progress and supports cancellation
- Opens fetched design data and generated output directly in the VS Code editor
- Shows a live generation log inside the Prompt view
- Saves generated output as a new file when needed
- Keeps an in-extension activity log for troubleshooting

## Requirements

- VS Code 1.85 or later
- For local mode: a running Figma Desktop MCP server
- At least one AI API key:
  - Gemini: [Google AI Studio](https://aistudio.google.com)
  - Claude: [Anthropic Console](https://console.anthropic.com)

## Quick Start

1. Install the extension.
2. Open the **Figma MCP Helper** view from the activity bar.
3. In **Setup**, choose `local`.
4. Confirm the MCP endpoint and connect to your Desktop MCP server.
5. Paste a Figma URL, then fetch the design data or screenshot.
6. In **Agent**, choose Gemini or Claude, save your API key, and load a model.
7. In **Prompt**, choose an output format and generate code.

## Remote Mode

Remote mode is intentionally not active in the current release.

- The `Remote` toggle remains visible so the planned workflow is discoverable
- Clicking **Auth Login** shows an inline "planned for a future update" notice
- Remote fetch and screenshot actions are also blocked with the same notice
- The current production workflow is `local` mode through the Figma Desktop MCP server

## Sidebar Workflow

### Setup

The Setup view has two sections:

- **Figma**: choose a connection mode, connect to the local MCP server, paste a Figma URL or payload, fetch structured data, and capture screenshots
- **Agent**: choose the AI provider, save credentials, and load an available model

### Prompt

Use the Prompt view to generate output from the fetched Figma context.

- Output formats: `tsx`, `html`, `scss`, `tailwind`, `kotlin`
- Optional controls: include or exclude the free-form prompt and fetched MCP data
- Result actions: open the generated file in the editor, review the live prompt log, or save as a new file

### Log

The Log view shows extension activity and error details, and lets you clear, copy, or save logs.

## Settings

| Setting                                    | Default                                                                            | Description                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `figma-mcp-helper.defaultAgent`            | `gemini`                                                                           | Default AI provider used by the Agent panel                                             |
| `figma-mcp-helper.defaultModel`            | `""`                                                                               | Default model ID synced from the Agent panel                                            |
| `figma-mcp-helper.mcpConnectionMode`       | `local`                                                                            | Preferred Setup connection mode (`local` Desktop MCP or `remote` auth)                  |
| `figma-mcp-helper.mcpEndpoint`             | `http://127.0.0.1:3845/mcp`                                                        | Figma MCP server endpoint                                                               |
| `figma-mcp-helper.remoteMcpEndpoint`       | `https://vscode-figma-mcp-helper-workers.birdea.workers.dev`                       | Reserved for the planned remote mode workflow                                           |
| `figma-mcp-helper.remoteMcpAuthUrl`        | `https://vscode-figma-mcp-helper-workers.birdea.workers.dev/api/figma/oauth/start` | Reserved for the planned remote auth flow                                               |
| `figma-mcp-helper.openFetchedDataInEditor` | `false`                                                                            | Legacy compatibility setting; fetched MCP JSON currently opens in the editor by default |
| `figma-mcp-helper.claudeModels`            | built-in list                                                                      | Claude model catalog shown in the Agent panel                                           |

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
- Remote mode UI is visible, but the workflow itself is deferred for a future update.
- Output quality depends on the completeness of the MCP data, screenshot quality, prompt instructions, and selected AI model.
