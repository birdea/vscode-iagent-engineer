# Screenshots

This directory contains marketplace screenshots for the iagent engineer extension.

## Required Screenshots

| File               | Dimensions  | Description                                                          |
| ------------------ | ----------- | -------------------------------------------------------------------- |
| `screenshot-3.png` | 1280×715 px | Main view — Prompt workflow showing code generation and HTML preview |

## Guidelines

- Use PNG format, with a landscape screenshot sized appropriately for VS Code Marketplace
- Capture the extension in a dark-themed VS Code window to match `galleryBanner.color: "#1e1e1e"`
- Show the three panels: Setup, Prompt, and Log
- Keep the Prompt panel populated with generated output so the screenshot reflects the shipped workflow
- This image is referenced by both `README.md` and the `package.json` Marketplace `screenshots` field

## How to Capture

1. Open VS Code with the extension installed (or in Extension Development Host via `F5`)
2. Arrange the iagent engineer sidebar so all three views are visible
3. Take a screenshot of the full VS Code window
4. Crop and resize to a marketplace-friendly landscape size
5. Save as `images/screenshot-3.png`
