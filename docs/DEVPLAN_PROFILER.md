# AI Agent Session Profiler Development Plan

This file is now kept as a historical planning note.

## Current Status Snapshot

The profiler is no longer a proposal. In the current `0.7.x` implementation:

- the extension contributes a sidebar `Profiler` webview
- the extension contributes a bottom-panel `iProfiler` webview
- session discovery, detail parsing, chart rendering, and live monitoring are implemented
- the current sidebar UI actively targets `Claude` and `Codex`
- Gemini parsing support exists in the service layer, but the sidebar tab is intentionally disabled
- an archive flow exists in host code, but it is not currently exposed by a visible webview button

For the current user-facing behavior, use:

- `README.md`
- `docs/info-profiler.md`
- `docs/iprofiler-summary-data.md`
- `docs/iprofiler-key-events-data.md`

## What Landed from the Original Plan

- Separate sidebar overview and bottom-panel detail surfaces
- Session scanning from configured search roots
- Per-session summaries and detailed timeline analysis
- Source-log jumps back into the editor
- Live monitoring for likely-active session files

## What Did Not Land Exactly as Planned

- The old `Log` webview concept is gone; logging now lives in the VS Code output channel.
- The sidebar does not currently expose an archive button.
- Gemini is not a selectable profiler tab in the current UI even though parsing work exists below the surface.

## Why This File Still Exists

It records the original intent and scope decisions behind the profiler domain. It should not be treated as the authoritative description of the shipped UI.
