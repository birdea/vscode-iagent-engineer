import { AgentType } from './types';

export const EXTENSION_ID = 'figma-mcp-helper';

export const VIEW_IDS = {
  SETUP: 'figma-mcp-helper.setup',
  PROMPT: 'figma-mcp-helper.prompt',
  LOG: 'figma-mcp-helper.log',
} as const;

export const COMMANDS = {
  CONNECT: 'figma-mcp-helper.connect',
  GENERATE: 'figma-mcp-helper.generate',
} as const;

export const CONFIG_KEYS = {
  DEFAULT_AGENT: 'figma-mcp-helper.defaultAgent',
  DEFAULT_MODEL: 'figma-mcp-helper.defaultModel',
  MCP_CONNECTION_MODE: 'figma-mcp-helper.mcpConnectionMode',
  MCP_ENDPOINT: 'figma-mcp-helper.mcpEndpoint',
  REMOTE_MCP_ENDPOINT: 'figma-mcp-helper.remoteMcpEndpoint',
  REMOTE_MCP_AUTH_URL: 'figma-mcp-helper.remoteMcpAuthUrl',
  OPEN_FETCH_RESULT_IN_EDITOR: 'figma-mcp-helper.openFetchedDataInEditor',
  CLAUDE_MODELS: 'figma-mcp-helper.claudeModels',
} as const;

export const SECRET_KEYS = {
  GEMINI_API_KEY: 'figma-mcp-helper.geminiApiKey',
  CLAUDE_API_KEY: 'figma-mcp-helper.claudeApiKey',
} as const;

export function getSecretStorageKey(agent: AgentType): string {
  return agent === 'gemini' ? SECRET_KEYS.GEMINI_API_KEY : SECRET_KEYS.CLAUDE_API_KEY;
}

export const DEFAULT_MCP_ENDPOINT = 'http://localhost:3845';
export const DEFAULT_REMOTE_MCP_AUTH_URL = '';

export const MCP_DEFAULT_PORT = 3845;

export const REQUEST_TIMEOUT_MS = 10000;

export const PROGRESS_CAP = 95;

export const MAX_LOG_ENTRIES = 500;

// Approximate 1 token per 4 characters for mixed natural-language/code prompts.
export const TOKEN_ESTIMATE_DIVISOR = 4;

export const DEBOUNCE_MS = 300;

export const GEMINI_MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
