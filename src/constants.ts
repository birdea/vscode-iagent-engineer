import { AgentType } from './types';

export const EXTENSION_ID = 'iagent-engineer';

export const VIEW_IDS = {
  SETUP: 'iagent-engineer.setup',
  PROMPT: 'iagent-engineer.prompt',
  PROFILER: 'iagent-engineer.profiler',
  PROFILER_DETAIL: 'iagent-engineer.profiler-detail',
} as const;

export const COMMANDS = {
  CONNECT: 'iagent-engineer.connect',
  GENERATE: 'iagent-engineer.generate',
  PROFILER_OPEN_SETTINGS: 'iagent-engineer.profiler.openSettings',
  PROFILER_REFRESH: 'iagent-engineer.profiler.refresh',
  PROFILER_DELETE_SELECTED: 'iagent-engineer.profiler.deleteSelected',
  PROFILER_SELECT_ALL: 'iagent-engineer.profiler.selectAll',
  PROFILER_DESELECT_ALL: 'iagent-engineer.profiler.deselectAll',
} as const;

export const CONFIG_KEYS = {
  DEFAULT_AGENT: 'iagent-engineer.defaultAgent',
  DEFAULT_MODEL: 'iagent-engineer.defaultModel',
  PROFILER_SELECTED_TAB: 'iagent-engineer.profiler.selectedTab',
  MCP_CONNECTION_MODE: 'iagent-engineer.mcpConnectionMode',
  MCP_ENDPOINT: 'iagent-engineer.mcpEndpoint',
  REMOTE_MCP_ENDPOINT: 'iagent-engineer.remoteMcpEndpoint',
  REMOTE_MCP_AUTH_URL: 'iagent-engineer.remoteMcpAuthUrl',
  OPEN_FETCH_RESULT_IN_EDITOR: 'iagent-engineer.openFetchedDataInEditor',
  CLAUDE_MODELS: 'iagent-engineer.claudeModels',
  DEEPSEEK_MODELS: 'iagent-engineer.deepseekModels',
  QWEN_MODELS: 'iagent-engineer.qwenModels',
  OPENROUTER_MODELS: 'iagent-engineer.openrouterModels',
  PROFILER_CLAUDE_SEARCH_ROOTS: 'iagent-engineer.profiler.claudeSearchRoots',
  PROFILER_CODEX_SEARCH_ROOTS: 'iagent-engineer.profiler.codexSearchRoots',
  PROFILER_GEMINI_SEARCH_ROOTS: 'iagent-engineer.profiler.geminiSearchRoots',
  PROFILER_MAX_FILES_PER_AGENT: 'iagent-engineer.profiler.maxFilesPerAgent',
  PROFILER_MAX_FILE_SIZE_MB: 'iagent-engineer.profiler.maxFileSizeMB',
  PROFILER_ARCHIVE_PRESERVE_STRUCTURE: 'iagent-engineer.profiler.archivePreserveStructure',
  PROFILER_REFRESH_PERIOD_MS: 'iagent-engineer.profiler.refreshPeriodMs',
} as const;

export const SECRET_KEYS = {
  GEMINI_API_KEY: 'iagent-engineer.geminiApiKey',
  CLAUDE_API_KEY: 'iagent-engineer.claudeApiKey',
  DEEPSEEK_API_KEY: 'iagent-engineer.deepseekApiKey',
  QWEN_API_KEY: 'iagent-engineer.qwenApiKey',
  OPENROUTER_API_KEY: 'iagent-engineer.openrouterApiKey',
  REMOTE_FIGMA_AUTH: 'iagent-engineer.remoteFigmaAuth',
  REMOTE_FIGMA_AUTH_PENDING: 'iagent-engineer.remoteFigmaAuthPending',
} as const;

export function getSecretStorageKey(agent: AgentType): string {
  switch (agent) {
    case 'gemini':
      return SECRET_KEYS.GEMINI_API_KEY;
    case 'claude':
      return SECRET_KEYS.CLAUDE_API_KEY;
    case 'deepseek':
      return SECRET_KEYS.DEEPSEEK_API_KEY;
    case 'qwen':
      return SECRET_KEYS.QWEN_API_KEY;
    case 'openrouter':
      return SECRET_KEYS.OPENROUTER_API_KEY;
    default:
      return SECRET_KEYS.GEMINI_API_KEY;
  }
}

export const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:3845/mcp';
export const DEFAULT_REMOTE_MCP_ENDPOINT =
  'https://vscode-iagent-engineer-workers.birdea.workers.dev';
export const DEFAULT_REMOTE_MCP_AUTH_URL =
  'https://vscode-iagent-engineer-workers.birdea.workers.dev/api/figma/oauth/start';

export const MCP_DEFAULT_PORT = 3845;

export const REQUEST_TIMEOUT_MS = 10000;

export const PROGRESS_CAP = 95;

export const MAX_LOG_ENTRIES = 500;

// Approximate 1 token per 4 characters for mixed natural-language/code prompts.
export const TOKEN_ESTIMATE_DIVISOR = 4;

export const DEBOUNCE_MS = 300;

export const GEMINI_MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
