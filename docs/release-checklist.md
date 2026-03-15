# Release Checklist

Use this checklist before packaging or publishing a production release.

## Automated Gate

Run the full validation gate locally before creating a tag or triggering the release workflow.

```bash
npm --prefix workers install
npm run verify:coverage
```

This gate covers:

- extension build
- ESLint
- unit tests with coverage thresholds
- Cloudflare Worker TypeScript typecheck

The repository-level install does not populate `workers/node_modules`, so run the dedicated worker install step first on a fresh checkout.

## Functional Smoke Tests

Confirm the core user flows in a fresh VS Code window.

- Setup view: connect to a local MCP endpoint and confirm the status changes to connected.
- Setup view: fetch design context from a valid Figma URL or MCP payload and confirm the JSON opens correctly.
- Setup view: fetch metadata and variable definitions and confirm each action produces the expected notice and editor output.
- Setup view: fetch a screenshot and confirm the image opens successfully.
- Setup view: fetch source data from one or more asset URLs and confirm the gallery thumbnails reopen the saved asset.
- Setup view: switch to `remote` mode and confirm the UI clearly reports that remote Figma is not currently available.
- Prompt view: generate code with a saved API key and confirm the result streams, opens in the editor, and strips markdown fences if present.
- Prompt view: open the generated result in the Preview Panel.
- Prompt view: open the browser preview and confirm it either launches correctly or falls back to the Preview Panel with a clear notice.
- Agent settings: save, clear, and reload provider settings for at least one supported provider.
- Profiler view: confirm startup scan loads the selected agent tab and populates session cards without UI stalls.
- Profiler view: confirm `Latest` / `Live` badges update correctly after a refresh or auto-refresh tick.
- Profiler detail: open a scanned session, inspect chart/event log output, and jump back to the source file.
- Profiler detail: verify title-bar controls refresh the overview cleanly and section headers fold/unfold on click.
- Profiler detail: use the `File` actions in the summary card to reveal the session file in Finder / Explorer and copy the file path.
- Profiler live mode: attach to a likely-live session and confirm the detail panel updates over time.
- Profiler fallback parsing: open a Claude `history.jsonl` style file and confirm the chart falls back to payload-based samples instead of staying empty.

## Optional Remote Prototype Validation

Run these checks only when changing the Worker or re-enabling remote Figma flows in the extension.

- Start a remote auth flow and confirm the callback stores a session only when it matches the latest login attempt.
- Confirm replaying an old callback URL does not replace the stored session.
- Confirm a callback with a modified `state` value is rejected.
- Confirm a callback targeting a non-editor redirect URI is rejected by the worker.
- Confirm the extension UI still handles disabled remote mode cleanly when the feature remains off.

## Packaging

- Run `npm run package` when you need a local VSIX artifact.
- Use the GitHub `Release` workflow for tagged marketplace builds so the automated gate runs first.
- Verify that all four platform-specific VSIX artifacts are produced: `linux-x64`, `win32-x64`, `darwin-arm64`, and `darwin-x64`.
