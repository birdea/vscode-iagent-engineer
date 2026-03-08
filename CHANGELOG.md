# Changelog

This project tracks release notes with `conventional-changelog`.

## [Unreleased]

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
