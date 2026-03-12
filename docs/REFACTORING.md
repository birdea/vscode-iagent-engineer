# Refactoring Backlog

This file tracks cleanup work that is larger than a safe one-pass edit. Items below were identified during a repository-wide review on 2026-03-08.

## Done in this pass

- Replaced repeated secret-key lookup logic with `getSecretStorageKey()` in host code.
- Removed unused host-to-webview message variants and dead UI branches.
- Replaced a couple of unnecessary `innerHTML` writes with safer DOM updates.
- Removed a stale `npm run compile` reference from `CONTRIBUTING.md`.
- Replaced webview `if / else if` message chains in `src/webview/ui/main.ts` with per-section event handler maps.
- Added typed test helper factories under `test/unit/helpers/` for VS Code doubles, DOM setup, and agent stubs.
- Rationalized review documents by keeping `docs/CODEREVIEW.md` as the current summary and moving historical reports into `docs/archive/`.
- Aligned `package.json` repository metadata with the canonical GitHub remote and updated README positioning to a consistent preview release message.
