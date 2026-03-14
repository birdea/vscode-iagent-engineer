# Contributing to iAgent Engineer

This guide reflects the current `0.7.x` codebase and development workflow.

## Development Setup

### Prerequisites

- **Node.js** `20+`
- **npm** `10+` recommended
- **VS Code** `1.85+`

### Initial Setup

```bash
git clone https://github.com/birdea/vscode-iagent-engineer.git
cd vscode-iagent-engineer
npm ci
code .
```

Press `F5` to launch an Extension Development Host.

## Project Layout

```text
.
├── src/
│   ├── agent/          # Gemini, Claude, and OpenAI-compatible providers
│   ├── editor/         # Editor handoff and preview services
│   ├── figma/          # MCP client, parser, screenshots, source-data helpers
│   ├── logger/         # Output channel logging
│   ├── preview/        # Preview panel and browser-preview runtime builders
│   ├── profiler/       # Session discovery, parsing, live monitoring, state
│   ├── prompt/         # Prompt templates and token estimation
│   ├── state/          # Shared extension runtime state
│   ├── webview/        # Sidebar providers, handlers, and UI layers
│   ├── constants.ts
│   ├── extension.ts
│   ├── i18n.ts
│   └── types.ts
├── workers/            # Cloudflare Worker for the remote Figma prototype
├── test/unit/          # Unit tests
├── test/e2e/           # E2E workflow tests
├── docs/               # Product docs, profiler guides, historical notes
├── images/             # Marketplace screenshots
└── esbuild.config.js   # Host + webview bundling
```

## Build and Validation

| Command                     | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `npm run build`             | Production build into `dist/`                 |
| `npm run watch`             | Incremental development build                 |
| `npm run lint`              | ESLint for `src/`                             |
| `npm run test:unit`         | Unit tests                                    |
| `npm run test:e2e`          | E2E tests                                     |
| `npm run typecheck:workers` | Typecheck the Worker project                  |
| `npm run verify`            | Build + lint + unit tests + worker typecheck  |
| `npm run verify:coverage`   | Full validation gate with coverage thresholds |
| `npm run package`           | Build a local `.vsix`                         |

The release workflow builds platform-specific VSIX packages for `linux-x64`, `win32-x64`, `darwin-arm64`, and `darwin-x64`.

## Current Product Notes for Contributors

- The supported Figma workflow in the extension is currently `local` MCP mode.
- The remote Figma Worker remains in the repository, but remote auth/fetch flows are intentionally disabled in the shipped extension UI.
- The profiler sidebar currently targets `Claude` and `Codex` in the UI. Gemini parsing support exists in the service layer but is not exposed as an active tab.
- There is no dedicated Log webview. Runtime logs go to the `iAgent Engineer` output channel.

## Testing Notes

- Unit tests run against TypeScript source through `tsx`.
- The VS Code API is mocked in `test/unit/mocks/vscode.ts`.
- Coverage reports are written to `coverage/` when running `npm run test:coverage` or `npm run verify:coverage`.

## Code Style

- TypeScript strictness is expected throughout the extension.
- Use `i18n.ts` for user-facing webview/host strings and keep both `en` and `ko` translations in sync.
- Keep `package.nls.json` and `package.nls.ko.json` aligned when adding or renaming contribution labels.
- Add or update tests for behavior changes, especially in handlers, agents, preview services, and profiler parsing.

## Pull Request Guidelines

1. Keep each PR focused on one concern.
2. Include tests for new behavior or regressions.
3. Run `npm run verify` before requesting review.
4. Use conventional commits where practical.
5. Include screenshots when changing the webview UI.
6. Update the relevant markdown docs when user-facing behavior changes.

## Reporting Issues

Use the [GitHub Issues](https://github.com/birdea/vscode-iagent-engineer/issues) tracker and include:

- VS Code version
- Extension version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Relevant logs from the `iAgent Engineer` output channel
