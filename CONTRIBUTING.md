# Contributing to iAgent Engineer

Thank you for your interest in contributing! This document covers how to set up the development environment, run tests, build the extension, and submit changes.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Building](#building)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Reporting Issues](#reporting-issues)

---

## Development Setup

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- **VS Code** 1.85 or later

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/birdea/vscode-iagent-engineer.git
   cd vscode-iagent-engineer
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Open in VS Code**

   ```bash
   code .
   ```

4. **Launch the Extension Development Host**

   Press `F5` (or select **Run > Start Debugging**). This opens a new VS Code window with the extension loaded from source.

---

## Project Structure

```
.
├── src/
│   ├── agent/          # AI agent implementations (Gemini, Claude)
│   ├── figma/          # MCP client and screenshot service
│   ├── logger/         # Output channel logger
│   ├── prompt/         # Prompt builder and token estimator
│   ├── state/          # Runtime state manager
│   ├── webview/        # Sidebar providers and message handlers
│   │   ├── handlers/   # Command handlers per feature area
│   │   └── ui/         # Webview-side TypeScript (compiled into the webview bundle)
│   ├── constants.ts    # Shared constants
│   ├── extension.ts    # Extension entry point
│   ├── i18n.ts         # Internationalisation (EN / KO)
│   └── types.ts        # Shared TypeScript types
├── test/unit/          # Mocha unit tests
├── resources/          # Extension icons
├── images/             # Marketplace screenshots
├── package.json        # Extension manifest
├── package.nls.json    # English NLS strings
├── package.nls.ko.json # Korean NLS strings
└── esbuild.config.js   # Build script
```

---

## Building

| Command           | Description                                    |
| ----------------- | ---------------------------------------------- |
| `npm run build`   | Production build (minified, output to `dist/`) |
| `npm run watch`   | Incremental watch build for development        |
| `npm run package` | Package as `.vsix` for manual installation     |

The build uses **esbuild** to bundle `src/extension.ts` (Node host) and `src/webview/ui/main.ts` (webview browser bundle) separately.

---

## Running Tests

### Unit Tests

```bash
npm test
```

Tests are written with **Mocha** (TDD UI) and run directly against TypeScript source via `tsx`. There is no VS Code runtime dependency in the unit test suite — the VS Code API is fully mocked in `test/unit/mocks/vscode.ts`.

### Coverage

```bash
npm run test:coverage
```

HTML coverage report is written to `coverage/`.

### Linting

```bash
npm run lint          # Report lint errors
npm run lint:fix      # Auto-fix where possible
```

### Formatting

```bash
npm run format:check  # Check formatting
npm run format        # Apply formatting (Prettier)
```

After `npm install`, a `pre-commit` hook is installed automatically and runs Prettier on staged files.

---

## Code Style

- **TypeScript strict mode** is enabled. All code must type-check without errors.
- **Prettier** is used for formatting (config in `package.json` / `.prettierrc` if present).
- **ESLint** enforces additional rules (see `eslint.config.js`).
- Keep functions small and focused. Prefer composition over inheritance.
- All user-visible strings must go through `i18n.ts` using the `t()` helper. Add both `en` and `ko` translations.
- NLS keys for `package.json` labels must be added to both `package.nls.json` and `package.nls.ko.json`.

---

## Pull Request Guidelines

1. **Branch naming**: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`

2. **One concern per PR**: Keep changes focused. Avoid mixing unrelated refactors with features.

3. **Tests required**: New features must include unit tests. Bug fixes should include a regression test.

4. **All checks must pass** before requesting review:
   - `npm run lint`
   - `npm test`
   - `npm run build`

5. **Commit messages**: Use the conventional commit format:

   ```
   feat: add screenshot caching
   fix: handle MCP timeout correctly
   chore: update dependencies
   ```

6. **PR description**: Explain _why_ the change is needed and summarise _what_ was changed. Include screenshots for UI changes.

---

## Reporting Issues

Please use the [GitHub Issues](https://github.com/birdea/vscode-iagent-engineer/issues) tracker. When reporting a bug, include:

- VS Code version
- Extension version
- Steps to reproduce
- Expected vs. actual behaviour
- Relevant logs from the **iAgent Engineer** output channel
