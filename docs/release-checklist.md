# Release Checklist

Use this checklist before packaging or publishing a production release.

## Automated Gate

Run the full validation gate locally before creating a tag or triggering the release workflow.

```bash
npm run verify:coverage
```

This gate covers:

- extension build
- ESLint
- unit tests with coverage thresholds
- Cloudflare worker TypeScript typecheck

## Functional Smoke Tests

Confirm the core user flows in a fresh VS Code window.

- Setup view: connect to a local MCP endpoint and confirm the status changes to connected.
- Setup view: fetch design context from a valid Figma URL and verify the result appears in the viewer.
- Setup view: fetch metadata and variable definitions and confirm each result stays distinct.
- Setup view: toggle `iagent-engineer.openFetchedDataInEditor` off and confirm fetches no longer steal editor focus.
- Prompt view: generate code with a saved API key and confirm the result streams into the output area.
- Prompt view: open the generated result in the editor and in preview mode.
- Agent settings: clear saved API keys and confirm a subsequent generation attempt fails until a valid key is restored.
- Profiler: scan a representative session directory and confirm the overview populates without UI stalls.
- Profiler detail: open a scanned session, switch chart metrics, and jump from a raw event back to the source log.

## Remote Auth Validation

Run these checks before enabling or shipping remote OAuth changes.

- Start a remote auth flow and confirm the callback stores a session only when it matches the latest login attempt.
- Confirm replaying an old callback URL does not replace the stored session.
- Confirm a callback with a modified `state` value is rejected.
- Confirm a callback targeting a non-editor redirect URI is rejected by the worker.

## Packaging

- Run `npm run package` when you need a local VSIX artifact.
- Use the GitHub `Release` workflow for tagged marketplace builds so the automated gate runs first.
