# iProfiler Key Event Guide

Reviewed on 2026-03-12.

The Key Event area is a categorized layer on top of the raw session records. It does not invent new data. It groups important records so that a human can scan the session faster.

Current UI note:

- The profiler sidebar currently exposes `Claude` and `Codex` as active tabs.
- Gemini format support still exists in the parser layer and is documented here for completeness, but the Gemini tab is currently disabled in the shipped sidebar UI.

## Event Categories

- Lifecycle: session start/end, turn boundaries, and restore/checkpoint markers
- Conversation: user prompts, assistant replies, and message payloads
- Tooling: tool calls, command execution, MCP activity, and replayable actions
- Usage: token snapshots and other usage counters
- Reasoning: assistant thinking or reasoning-side events when the format exposes them
- System: queue/progress/warning/error records

## CODEX Mapping

Key Event groups come from Codex rollout JSONL records such as:

- `session_meta`
- `turn_context`
- `response_item`
- `event_msg`

Typical mapped events:

- Lifecycle: `task_started`, `task_complete`
- Conversation: `user_message`, `agent_message`
- Usage: `token_count`
- Tooling: `function_call`, `custom_tool_call`, `mcp_*`, `exec_command_*`, `web_search_*`, `image_generation_*`
- Reasoning/system: reasoning and plan delta style events if present in the rollout

Official references:

- https://github.com/openai/codex/blob/main/sdk/typescript/README.md
- https://github.com/openai/codex/blob/main/codex-rs/docs/protocol_v1.md
- https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/EventMsg.ts

## CLAUDE Mapping

Key Event groups come from Claude transcript JSONL records such as:

- `user`
- `assistant`
- `progress`
- `queue-operation`
- `file-history-snapshot`

Important mappings:

- Conversation: user prompts and assistant text replies
- Tooling: assistant `tool_use`
- Reasoning: assistant `thinking`
- System: progress and queue records
- Checkpoint/history: file history snapshots

Official references:

- https://platform.claude.com/docs/en/agent-sdk/sessions
- https://platform.claude.com/docs/en/agent-sdk/output-formats

## GEMINI Mapping

Gemini uses two major local file families that iProfiler currently distinguishes.

Chat JSON:

- Key events come from `ConversationRecord.messages`
- Conversation: `user`, `gemini`
- Tooling: `toolCalls`
- Reasoning: `thoughts`
- Usage: `tokens`
- System: `info`, `warning`, `error`

Checkpoint JSON:

- Key events are restore snapshots rather than full conversational turns
- Main fields: `toolCall`, `messageId`, `history`, `clientHistory`, `commitHash`

Official references:

- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/checkpointing.md
- https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts
- https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/checkpointUtils.ts

## How To Read The Panel

- The grouped event cards highlight meaningful records that actually appeared in the selected file.
- Raw Event is still the source of truth.
- Clicking an event row opens the original file at the linked source line.
