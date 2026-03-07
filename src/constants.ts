export const EXTENSION_ID = 'figma-mcp-helper';

export const VIEW_IDS = {
  FIGMA: 'figma-mcp-helper.figma',
  AGENT: 'figma-mcp-helper.agent',
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
  MCP_ENDPOINT: 'figma-mcp-helper.mcpEndpoint',
  OPEN_FETCH_RESULT_IN_EDITOR: 'figma-mcp-helper.openFetchedDataInEditor',
  CLAUDE_MODELS: 'figma-mcp-helper.claudeModels',
} as const;

export const SECRET_KEYS = {
  GEMINI_API_KEY: 'figma-mcp-helper.geminiApiKey',
  CLAUDE_API_KEY: 'figma-mcp-helper.claudeApiKey',
} as const;

export const DEFAULT_MCP_ENDPOINT = 'http://localhost:3845';

export const MAX_LOG_ENTRIES = 500;

export const TOKEN_ESTIMATE_DIVISOR = 4;

export const DEBOUNCE_MS = 300;
