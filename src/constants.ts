export const EXTENSION_ID = 'figmalab';

export const VIEW_IDS = {
  FIGMA: 'figmalab.figma',
  AGENT: 'figmalab.agent',
  PROMPT: 'figmalab.prompt',
  LOG: 'figmalab.log',
} as const;

export const COMMANDS = {
  CONNECT: 'figmalab.connect',
  GENERATE: 'figmalab.generate',
} as const;

export const CONFIG_KEYS = {
  DEFAULT_AGENT: 'figmalab.defaultAgent',
  DEFAULT_MODEL: 'figmalab.defaultModel',
} as const;

export const SECRET_KEYS = {
  GEMINI_API_KEY: 'figmalab.geminiApiKey',
  CLAUDE_API_KEY: 'figmalab.claudeApiKey',
  CODEX_API_KEY: 'figmalab.codexApiKey',
} as const;

export const DEFAULT_MCP_ENDPOINT = 'http://localhost:3845';

export const MAX_LOG_ENTRIES = 500;

export const TOKEN_ESTIMATE_DIVISOR = 4;

export const DEBOUNCE_MS = 300;
