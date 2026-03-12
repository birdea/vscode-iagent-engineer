# iagent engineer

Turn Figma screens into implementation-ready code inside VS Code.

iagent engineer connects VS Code to a Figma Desktop MCP server, fetches design context from a Figma URL, and generates code with Gemini, Claude, DeepSeek, Qwen, or OpenRouter without leaving your editor.

`v0.7.0` highlights:

- Marketplace documentation now reflects the refreshed sidebar screenshot.
- The repository includes a dedicated [`CODE_REVIEW.md`](CODE_REVIEW.md) summary for follow-up engineering work.
- Release metadata has been aligned for the `v0.7.0` package update.

![iagent engineer screenshot](images/screenshot-3.png)

The screenshot above shows the current sidebar workflow for Setup, Prompt, and Log in a single VS Code session.

Demo video: [YouTube quick guide](https://www.youtube.com/watch?v=YmeUWzeAsxw)

Detailed review: [`CODE_REVIEW.md`](CODE_REVIEW.md)

## Why It Matters

- Fetch Figma design data and screenshots directly from the VS Code sidebar
- Generate `tsx`, `html`, `vue`, or `tailwind` output from the same workspace
- Open fetched data and generated code in the editor immediately
- Preview results inside VS Code and keep logs for troubleshooting
- Use either the Preview Panel or the browser preview workflow on macOS packaged installs

## Requirements

- VS Code 1.85+
- A running Figma Desktop MCP server
- At least one API key:
  - [Google AI Studio](https://aistudio.google.com)
  - [Anthropic Console](https://console.anthropic.com)
  - [DeepSeek Platform](https://platform.deepseek.com/api_keys)
  - [DashScope Console](https://dashscope.console.aliyun.com/apiKey)
  - [OpenRouter Keys](https://openrouter.ai/keys)

## Quick Start

1. Install the extension and open **iagent engineer** from the activity bar.
2. In **Setup**, select `local` and connect to your Figma Desktop MCP endpoint.
3. Paste a Figma URL and fetch the design data or screenshot.
4. In **Agent**, choose a provider, save your API key, and load a model.
5. In **Prompt**, select an output format and generate code.
6. Open the result in the editor, preview panel, or browser preview.

## Current Scope

- The production workflow is `local` mode through the Figma Desktop MCP server.
- `Remote` mode is visible in the UI, but not active yet.
- Marketplace installs on macOS can open generated results in either the VS Code preview panel or the browser preview workflow.
- API keys are stored in VS Code secret storage.
- The UI supports Korean and English.
