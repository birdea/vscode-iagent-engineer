# Figma MCP Helper

Convert Figma designs into code directly inside VS Code.

Paste a Figma URL, pick an AI model (Gemini or Claude), and generate production-ready code — without leaving your editor.

> This is an experimental prototype. Core features work, but some rough edges remain.

## Requirements

- VS Code 1.85+
- A running Figma MCP server
- At least one AI API key:
  - Gemini — [Google AI Studio](https://aistudio.google.com)
  - Claude — [Anthropic Console](https://console.anthropic.com)

## Quick Start

```bash
npm install
npm run build
```

Then in VS Code:

1. Open this repository
2. Run the **Run Extension** launch configuration
3. Click the **Figma MCP Helper** icon in the activity bar

## How to Use

The sidebar has three panels:

### Setup

| Section | What to do |
|---------|------------|
| **Figma** | Connect to your MCP server, then paste a Figma URL or JSON payload to fetch design data or a screenshot |
| **Agent** | Choose Gemini or Claude, save your API key, and load a model |

### Prompt

Choose an output format, add any instructions, and click **Generate**. Then open the result in the editor or save it as a file.

**Output formats:** `tsx` · `html` · `scss` · `tailwind` · `kotlin`

### Log

View extension activity and troubleshooting details.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `figma-mcp-helper.mcpEndpoint` | `http://localhost:3845` | Figma MCP server URL |
| `figma-mcp-helper.openFetchedDataInEditor` | `false` | Auto-open fetched JSON in the editor |
| `figma-mcp-helper.claudeModels` | — | Claude model list shown in the Agent panel |

## Language Support

The UI follows your VS Code display language automatically. Korean (`ko`) and English are supported; other languages fall back to English.
