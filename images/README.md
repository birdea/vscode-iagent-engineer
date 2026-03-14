# Screenshots

This directory contains marketplace screenshots for the iAgent Engineer extension.

## Current Marketplace Screenshot

| File               | Dimensions  | Description                                           |
| ------------------ | ----------- | ----------------------------------------------------- |
| `screenshot-4.png` | 1280×715 px | Main view showing the current Setup + Prompt workflow |

## Guidelines

- Use PNG format with a landscape crop that reads well in VS Code Marketplace.
- Capture the extension in a dark-themed VS Code window to match `galleryBanner.color: "#1e1e1e"`.
- Show the shipped workflow, centered on `Setup` and `Prompt`.
- If profiler UI is visible, keep it secondary to the generation flow.
- Keep the Prompt panel populated with generated output so the screenshot reflects the current product surface.
- This image is referenced by both `README.md` and the `package.json` Marketplace `screenshots` field.

## How to Capture

1. Open VS Code with the extension installed, or use an Extension Development Host via `F5`.
2. Arrange the iAgent Engineer sidebar so the current Setup and Prompt experience is clearly visible.
3. Take a screenshot of the full VS Code window.
4. Crop and resize to a marketplace-friendly landscape size.
5. Save as `images/screenshot-4.png`.
