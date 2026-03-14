# DEVPLAN: Iterative GUI Refinement Loop

This file is an archived design note for a future-looking idea, not a description of the current extension.

## Current Implementation Reality

As of `0.7.x`, the extension does **not** ship an autonomous iterative refinement loop.

What the extension does ship today:

- one-shot or manual-repeat UI generation from the `Prompt` view
- Figma design context and screenshot injection into prompts
- streaming generation with cancel support
- Preview Panel and browser preview for the generated result
- multi-provider support across Gemini, Claude, and OpenAI-compatible providers

What is **not** implemented in the shipped extension:

- similarity scoring against the original Figma screenshot
- automatic multi-iteration repair loops
- Claude Code CLI or Agent SDK orchestration inside the extension
- autonomous file-edit loops driven by an agent session

## How to Read This Document

Treat any remaining design ideas from this topic as exploration only. If the iterative loop project is revisited later, this file can serve as background context, but it should not be used as the current product spec.
