# Changelog

This project tracks release notes with `conventional-changelog`.

## [Unreleased]

- Renamed the extension package, namespace, and repository metadata from `figma-mcp-helper` to `iagent-engineer`.
- Updated user-facing documentation and worker identifiers to the new `iAgent Engineer` product naming.

## [0.6.1] - 2026-03-11

- Consolidated the Prompt metric area into a single board so selected-model stats read as one grouped layout.
- Compressed Prompt metric spacing and tuned the typography for denser one-line label/value presentation.
- Refreshed the README release highlights to match the `v0.6.1` sidebar metric polish.

## [0.6.0] - 2026-03-11

- Restored prompt progress visibility with a stable full-width progress bar and clearer inline status placement.
- Expanded prompt metrics with model-context details and toned the metric typography down to match the surrounding UI.
- Refined Figma action ordering and prompt labeling for a cleaner Setup and Prompt sidebar workflow.
- Hardened remote Figma auth session cleanup and added focused regression coverage around saved-session recovery.

## [0.5.5] - 2026-03-10

- Hardened the platform-specific release workflow so Windows packaging uses `bash` for release metadata generation.
- Kept the Marketplace distribution pipeline aligned across `darwin-arm64`, `darwin-x64`, `linux-x64`, and `win32-x64` VSIX outputs.
- Refreshed the README release highlights to match the latest cross-platform release automation changes.

## [0.5.4] - 2026-03-10

- Switched the release workflow to build, attach, and publish platform-specific VSIX packages for `darwin-arm64`, `darwin-x64`, `linux-x64`, and `win32-x64`.
- Updated the Marketplace release packaging so browser preview runtime dependencies can match the user's platform.
- Refreshed the README release highlights to describe the platform-specific distribution pipeline.

## [0.5.2] - 2026-03-10

- Packaged the browser preview runtime dependencies into the macOS VSIX so `Open In Browser` works after installation.
- Hardened preview panel runtime resolution against incorrect workspace-root and static script execution cases.
- Added explicit prompt-layer status updates when browser preview falls back to the Preview Panel.
- Added a Marketplace screenshot and refreshed the README / image documentation to match the current sidebar workflow.

## [0.5.1] - 2026-03-10

- Fixed the Marketplace package so the extension activates correctly after installation instead of failing on startup.
- Deferred the `esbuild` preview dependency to runtime only when the preview panel is opened, removing the packaged-install activation failure.

## [0.5.0] - 2026-03-09

- Added generated UI preview actions for both the VS Code preview panel and a hot-reloading browser preview workflow.
- Expanded AI provider support in the Agent panel to cover DeepSeek, Qwen, and OpenRouter alongside Gemini and Claude.
- Tightened prompt-format guidance and output handling for `tsx`, `html`, `vue`, and `tailwind` generation paths.
- Stripped stray markdown code fences from AI output before opening, previewing, or saving generated files.
- Added regression coverage around prompt UX, preview behavior, and provider-specific generation flows.

## [0.4.0] - 2026-03-09

- Updated the local Figma Desktop MCP integration for the current endpoint, header, SSE, and session handling requirements.
- Improved Setup and Agent panel UX, including inline remote-mode messaging, clearer status indicators, and direct launch actions for Figma and API key help.
- Opened fetched design data and generated output directly in the VS Code editor instead of the panel preview.
- Added a live Prompt log view for AI request and response progress during generation.
- Expanded model info output and strengthened prompt-format handling so requested output types are preserved more reliably.
- Temporarily excluded the unstable E2E suite from the default CI path so release validation can proceed on unit tests and coverage.

## [0.3.1] - 2026-03-08

- Fixed remote authentication recovery so the extension restarts the OAuth flow when a saved token is rejected.

## [0.3.0] - 2026-03-08

- Added `local / remote` connection mode selection in the Setup panel.
- Added remote Figma authentication backed by a dedicated OAuth worker.
- Added remote design data and screenshot fetching through the OAuth + REST flow.
- Added URI callback handling for remote auth completion inside VS Code.
- Added a bundled Cloudflare Worker project for Figma OAuth and REST proxy endpoints.
- Hardened remote URL validation and worker-side Figma URL parsing for CodeQL compliance.

## [0.2.1] - 2026-03-08

- Updated Marketplace listing content for the extension details page.
- Moved the mock MCP server into the E2E test helpers area.
- Tightened VSIX packaging exclusions so test and repository metadata stay out of releases.

## [0.2.0] - 2026-03-08

- Improved prompt streaming and cancellation handling to preserve partial output more reliably.
- Added API key format validation and stronger Claude/screenshot error handling.
- Tightened CI and release workflows, including dependency auditing and changed-file format checks.

## [0.1.4] - 2026-03-08

- Added CI/CD automation and security documentation.
- Expanded WebviewMessageHandler and E2E test coverage.

## [0.1.3] - 2026-03-08

- Fixed Phase 1 urgent issues identified in code review.
- Hardened MCP parsing and screenshot temp-file handling.
- Improved host-side error handling and localization coverage.
