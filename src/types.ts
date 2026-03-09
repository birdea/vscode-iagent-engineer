// Agent types
export type AgentType = 'gemini' | 'claude' | 'deepseek' | 'qwen' | 'openrouter';
export type ConnectionMode = 'local' | 'remote';
export type OutputFormat = 'html' | 'tsx' | 'vue' | 'tailwind';
export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export type LayerType = 'figma' | 'agent' | 'prompt' | 'editor' | 'system';

// Log entry
export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  layer: LayerType;
  message: string;
  detail?: string;
}

// Model info
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  provider?: AgentType;
  resourceName?: string;
  apiModelName?: string;
  baseModelId?: string;
  version?: string;
  displayName?: string;
  documentationUrl?: string;
  metadataSource?: string[];
  supportedGenerationMethods?: string[];
  thinking?: boolean;
  temperature?: number;
  maxTemperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  createdAt?: string;
  type?: string;
  pricing?: Record<string, string>;
  raw?: Record<string, unknown>;
}

export interface ScreenshotAsset {
  base64: string;
  mimeType: string;
}

// Prompt payload
export interface PromptPayload {
  userPrompt?: string;
  mcpData?: unknown;
  screenshotData?: ScreenshotAsset | null;
  outputFormat: OutputFormat;
  model?: string;
  agent?: AgentType;
  requestId?: string;
}

// MCP parsed data
export interface ParsedMcpData {
  fileId: string;
  nodeId: string;
  raw: unknown;
}

export interface RemoteAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

// Webview → Host messages
export type WebviewToHostMessage =
  | { command: 'figma.connect'; mode?: ConnectionMode }
  | { command: 'figma.openSettings'; mode?: ConnectionMode }
  | { command: 'figma.openDesktopApp' }
  | { command: 'figma.fetchData'; mcpData: string }
  | { command: 'figma.clearData' }
  | { command: 'figma.screenshot'; mcpData: string }
  | { command: 'agent.getState' }
  | { command: 'agent.getApiKeyHelp'; agent: AgentType }
  | { command: 'agent.getModelInfoHelp'; agent: AgentType; modelId: string }
  | { command: 'agent.setApiKey'; agent: AgentType; key: string }
  | { command: 'agent.saveSettings'; agent: AgentType; model: string; key?: string }
  | { command: 'agent.clearSettings'; agent: AgentType }
  | { command: 'agent.listModels'; agent: AgentType; key?: string }
  | { command: 'state.setAgent'; agent: AgentType }
  | { command: 'state.setModel'; model: string }
  | { command: 'prompt.generate'; payload: PromptPayload }
  | { command: 'prompt.cancel'; requestId?: string }
  | { command: 'prompt.estimate'; payload: PromptPayload }
  | { command: 'preview.openPanel'; code?: string; format?: OutputFormat }
  | { command: 'preview.openBrowser'; code?: string; format?: OutputFormat }
  | { command: 'editor.openGeneratedResult' }
  | { command: 'editor.open'; code: string; language?: string }
  | { command: 'editor.saveFile'; code: string; filename: string };

// Host → Webview messages
export type HostToWebviewMessage =
  | { event: 'figma.status'; connected: boolean; methods: string[]; error?: string }
  | { event: 'figma.authStarted'; mode: ConnectionMode; authUrl: string }
  | { event: 'figma.connectRequested' }
  | { event: 'figma.dataResult'; data: unknown }
  | { event: 'figma.dataFetchError'; message: string; fallbackData: unknown }
  | { event: 'figma.screenshotResult'; base64: string }
  | { event: 'agent.state'; agent: AgentType; model: string; hasApiKey: boolean }
  | { event: 'agent.settingsSaved'; agent: AgentType; model: string; hasApiKey: boolean }
  | { event: 'agent.settingsCleared'; agent: AgentType }
  | { event: 'agent.modelsResult'; models: ModelInfo[] }
  | { event: 'prompt.generateRequested' }
  | { event: 'prompt.streaming'; progress: number; text?: string }
  | { event: 'prompt.logAppend'; entry: LogEntry }
  | { event: 'prompt.logClear' }
  | {
      event: 'prompt.result';
      code: string;
      format: OutputFormat;
      complete?: boolean;
      message?: string;
      progress?: number;
    }
  | { event: 'prompt.estimateResult'; tokens: number; kb: number }
  | { event: 'prompt.error'; message: string; code?: 'cancelled' | 'failed' }
  | { event: 'log.append'; entry: LogEntry }
  | { event: 'log.clear' }
  | { event: 'error'; source: LayerType; message: string };
