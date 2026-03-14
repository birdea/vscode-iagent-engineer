import { ProfilerAgentType } from '../types';

export interface ProfilerModelTokenSpec {
  canonicalId: string;
  contextWindow: number;
  maxOutputTokens?: number;
  documentationUrl: string;
  sourceLabel: string;
}

interface ProfilerModelTokenSpecEntry extends ProfilerModelTokenSpec {
  aliases: string[];
  prefixes?: string[];
}

// Verified against the official vendor model docs on 2026-03-14.
const PROFILER_MODEL_TOKEN_SPECS: Record<ProfilerAgentType, ProfilerModelTokenSpecEntry[]> = {
  codex: [
    {
      canonicalId: 'gpt-5-codex',
      aliases: ['gpt-5-codex'],
      prefixes: ['gpt-5-codex', 'gpt-5.1-codex', 'gpt-5.2-codex', 'gpt-5.3-codex'],
      contextWindow: 400000,
      maxOutputTokens: 128000,
      documentationUrl: 'https://platform.openai.com/docs/models/gpt-5-codex',
      sourceLabel: 'openai-model-docs',
    },
  ],
  claude: [
    {
      canonicalId: 'claude-opus-4-1',
      aliases: ['claude-opus-4-1'],
      prefixes: ['claude-opus-4'],
      contextWindow: 200000,
      maxOutputTokens: 32000,
      documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
      sourceLabel: 'anthropic-model-docs',
    },
    {
      canonicalId: 'claude-sonnet-4',
      aliases: ['claude-sonnet-4'],
      prefixes: ['claude-sonnet-4'],
      contextWindow: 200000,
      maxOutputTokens: 64000,
      documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
      sourceLabel: 'anthropic-model-docs',
    },
    {
      canonicalId: 'claude-haiku-3-5',
      aliases: ['claude-haiku-3-5'],
      prefixes: ['claude-haiku-3-5'],
      contextWindow: 200000,
      maxOutputTokens: 8000,
      documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
      sourceLabel: 'anthropic-model-docs',
    },
    {
      canonicalId: 'claude-haiku-4-5',
      aliases: ['claude-haiku-4-5', 'claude-haiku-4-5-20251001'],
      prefixes: ['claude-haiku-4-5'],
      contextWindow: 200000,
      maxOutputTokens: 8192,
      documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
      sourceLabel: 'anthropic-model-docs',
    },
  ],
  gemini: [
    {
      canonicalId: 'gemini-2.5-pro',
      aliases: ['gemini-2.5-pro'],
      prefixes: ['gemini-2.5-pro'],
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      documentationUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-2.5-pro',
      sourceLabel: 'google-model-docs',
    },
    {
      canonicalId: 'gemini-2.5-flash',
      aliases: ['gemini-2.5-flash'],
      prefixes: ['gemini-2.5-flash'],
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      documentationUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-2.5-flash',
      sourceLabel: 'google-model-docs',
    },
    {
      canonicalId: 'gemini-2.0-flash',
      aliases: ['gemini-2.0-flash', 'gemini-2.0-flash-001'],
      prefixes: ['gemini-2.0-flash'],
      contextWindow: 1048576,
      maxOutputTokens: 8192,
      documentationUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-2.0-flash',
      sourceLabel: 'google-model-docs',
    },
    {
      canonicalId: 'gemini-2.0-flash-lite',
      aliases: ['gemini-2.0-flash-lite', 'gemini-2.0-flash-lite-001'],
      prefixes: ['gemini-2.0-flash-lite'],
      contextWindow: 1048576,
      maxOutputTokens: 8192,
      documentationUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-2.0-flash-lite',
      sourceLabel: 'google-model-docs',
    },
  ],
};

function normalizeModelId(modelId: string): string {
  let normalized = modelId.trim().toLowerCase();
  if (normalized.startsWith('models/')) {
    normalized = normalized.slice('models/'.length);
  }
  return normalized;
}

export function getProfilerModelTokenSpec(
  agent: ProfilerAgentType,
  modelId?: string,
): ProfilerModelTokenSpec | undefined {
  if (!modelId) {
    return undefined;
  }

  const normalizedModelId = normalizeModelId(modelId);
  const entries = PROFILER_MODEL_TOKEN_SPECS[agent] ?? [];

  const exactMatch = entries.find((entry) =>
    entry.aliases.some((alias) => normalizeModelId(alias) === normalizedModelId),
  );
  if (exactMatch) {
    return exactMatch;
  }

  return entries.find((entry) =>
    (entry.prefixes ?? []).some((prefix) => normalizedModelId.startsWith(normalizeModelId(prefix))),
  );
}
