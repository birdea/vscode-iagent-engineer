# iProfiler Summary Data Guide

Reviewed on 2026-03-12.

This document explains what the Summary area in iProfiler is showing, and which parts come from official agent docs versus the local session files that iProfiler parsed.

## Summary Layout

- Agent identity: the selected agent family and vendor.
- Session headline: thread title, saved summary, session id, or file name depending on what the source file contains.
- Metric board: total tokens, turn count, session span, file size, peak token point, slowest response, and largest payload found in the selected file.
- Source profile cards: the storage family, source file path, and parser coverage for the selected format.
- Documented format cards: the fields that the official docs or official source code confirm can exist in that agent's local session format family.
- Extracted now cards: the values iProfiler actually found in the selected file.

## CODEX

Storage family:

- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`

What iProfiler can classify:

- Session metadata from `session_meta`
- Turn/runtime metadata from `turn_context`
- User and assistant flow from `response_item` and `event_msg`
- Turn lifecycle from `task_started` and `task_complete`
- Token usage snapshots from `token_count`
- Tooling/system activity from tool and exec event types

Official references:

- OpenAI Codex TypeScript SDK: persisted threads in `~/.codex/sessions`
  - https://github.com/openai/codex/blob/main/sdk/typescript/README.md
- Codex protocol notes for `task_started` / `task_complete`
  - https://github.com/openai/codex/blob/main/codex-rs/docs/protocol_v1.md
- Codex app server thread archive notes for rollout JSONL files
  - https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md

## CLAUDE

Storage family:

- Local Claude transcript JSONL files under `~/.claude/...`

What iProfiler can classify:

- Session/request ids and workspace path
- User prompts and assistant replies
- `tool_use` blocks
- `thinking` blocks
- Progress and queue records
- Token usage fields such as `input_tokens`, `output_tokens`, and cache token counters

Important note:

- Anthropic officially documents sessions and structured output families, but the exact local `.claude` transcript record names are inferred from the saved JSONL files that iProfiler parses.

Official references:

- Claude sessions: continue, resume, fork
  - https://platform.claude.com/docs/en/agent-sdk/sessions
- Claude structured output formats
  - https://platform.claude.com/docs/en/agent-sdk/output-formats

## GEMINI

Chat storage family:

- `~/.gemini/tmp/<project_hash>/chats/session-*.json`

Checkpoint storage family:

- `~/.gemini/tmp/<project_hash>/checkpoints/*.json`

What iProfiler can classify for chat JSON:

- `sessionId`, `projectHash`, `startTime`, `lastUpdated`
- `messages`
- `summary`
- `directories`
- `kind`
- Message-level `toolCalls`
- Message-level `thoughts`
- Message-level `tokens`
- Message-level `model`

What iProfiler can classify for checkpoint JSON:

- `toolCall`
- `messageId`
- `history`
- `clientHistory`
- `commitHash`

Official references:

- Gemini CLI session management
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md
- Gemini CLI checkpointing
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/checkpointing.md
- Gemini CLI chat recording schema
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts

## Parsing Policy

- If a value is shown in "Extracted now", it was present in the selected file.
- If a value is shown in "Documented format fields", it is part of the supported format family for that agent even if the current file did not contain it.
- If parser coverage says `Deep parser`, iProfiler is classifying turns/events from structured records.
- If parser coverage says `Basic parser`, iProfiler could only read high-level JSON metadata safely.
