// Agent types
export type AgentType = 'gemini' | 'claude' | 'deepseek' | 'qwen' | 'openrouter';
export type ProfilerAgentType = 'claude' | 'codex' | 'gemini';
export type ConnectionMode = 'local' | 'remote';
export type OutputFormat = 'html' | 'tsx' | 'vue' | 'tailwind';
export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export type LayerType = 'figma' | 'agent' | 'prompt' | 'editor' | 'profiler' | 'system';
export type PreviewTarget = 'panel' | 'browser';
export type FigmaDataResultKind = 'designContext' | 'parsedInput' | 'metadata' | 'variableDefs';
export type PromptMcpDataKind = 'designContext' | 'metadata';
export type ProfilerStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ProfilerMetricType = 'tokens' | 'data' | 'latency';
export type ProfilerLiveStatus = 'idle' | 'connecting' | 'streaming' | 'stopped' | 'error';
export type SessionEventCategory =
  | 'conversation'
  | 'tool'
  | 'usage'
  | 'lifecycle'
  | 'reasoning'
  | 'checkpoint'
  | 'storage'
  | 'system'
  | 'other';

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

export interface SourceDataThumbnail {
  assetKey: string;
  url: string;
  suggestedName: string;
  thumbnailDataUrl: string;
}

// Prompt payload
export interface PromptPayload {
  userPrompt?: string;
  mcpData?: unknown;
  mcpDataKind?: PromptMcpDataKind | null;
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

export interface ProfilerAggregate {
  totalSessions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalTokens: number;
  totalFileSizeBytes: number;
}

export interface SessionSummary {
  id: string;
  agent: ProfilerAgentType;
  filePath: string;
  fileName: string;
  title?: string;
  modifiedAt: string;
  startedAt?: string;
  endedAt?: string;
  fileSizeBytes: number;
  model?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCachedTokens?: number;
  totalTokens?: number;
  requestCount?: number;
  parseStatus: 'ok' | 'partial' | 'unsupported' | 'error';
  warnings: string[];
}

export interface SessionRawEventRef {
  id: string;
  filePath: string;
  lineNumber: number;
  timestamp?: string;
  eventType: string;
  category: SessionEventCategory;
  summary: string;
  excerpt: string;
  messagePreview?: string;
  payloadKb?: number;
  payloadBytes?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  maxTokens?: number;
}

export interface SessionTimelinePoint {
  id: string;
  timestamp: string;
  endTimestamp?: string;
  chartTimestamp?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  chartInputTokens?: number;
  chartOutputTokens?: number;
  chartCachedTokens?: number;
  chartTotalTokens?: number;
  maxTokens?: number;
  payloadKb?: number;
  latencyMs?: number;
  latencyPhase?: 'response_received' | 'response_completed';
  eventType: string;
  label?: string;
  detail?: string;
  sourceEventId?: string;
}

export interface SessionEventBubble {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  category: SessionEventCategory;
  rawEventId: string;
}

export interface SessionInsightField {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'muted';
}

export interface SessionInsightSection {
  id: string;
  title: string;
  description?: string;
  fields: SessionInsightField[];
}

export interface SessionDetail {
  summary: SessionSummary;
  metadata: {
    agentLabel: string;
    vendorLabel: string;
    sessionId?: string;
    cwd?: string;
    provider?: string;
    sourceFormat: string;
    storageLabel: string;
    parserCoverage: string;
    summarySections: SessionInsightSection[];
    keyEventSections: SessionInsightSection[];
  };
  timeline: SessionTimelinePoint[];
  eventBubbles: SessionEventBubble[];
  rawEvents: SessionRawEventRef[];
}

export interface ProfilerLiveState {
  active: boolean;
  status: ProfilerLiveStatus;
  agent?: ProfilerAgentType;
  filePath?: string;
  fileName?: string;
  startedAt?: string;
  updatedAt?: string;
  messages: LogEntry[];
}

export interface ProfilerOverviewState {
  status: ProfilerStatus;
  message?: string;
  updatedAt?: string;
  selectedAgent: ProfilerAgentType;
  selectedSessionId?: string;
  aggregate: ProfilerAggregate;
  sessionsByAgent: Record<ProfilerAgentType, SessionSummary[]>;
}

export interface ProfilerDetailState {
  status: ProfilerStatus;
  message?: string;
  sessionId?: string;
  detail?: SessionDetail;
  live?: ProfilerLiveState;
}

export interface ProfilerArchiveResult {
  targetPath: string;
  fileCount: number;
}

export interface ProfilerSelectionSummary {
  agent: ProfilerAgentType;
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
}

// Webview → Host messages
export type WebviewToHostMessage =
  | { command: 'figma.connect'; mode?: ConnectionMode }
  | { command: 'figma.openSettings'; mode?: ConnectionMode }
  | { command: 'figma.openDesktopApp' }
  | { command: 'figma.fetchData'; mcpData: string }
  | { command: 'figma.fetchSourceData'; url: string }
  | { command: 'figma.openSourceDataAsset'; assetKey: string }
  | { command: 'figma.fetchMetadata'; mcpData: string }
  | { command: 'figma.fetchVariableDefs'; mcpData: string }
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
  | { command: 'editor.saveFile'; code: string; filename: string }
  | { command: 'profiler.getState' }
  | { command: 'profiler.scan' }
  | { command: 'profiler.refreshOverview'; agent?: ProfilerAgentType }
  | { command: 'profiler.selectAgent'; agent: ProfilerAgentType }
  | { command: 'profiler.startLiveData'; id?: string; agent?: ProfilerAgentType }
  | { command: 'profiler.stopLiveData' }
  | { command: 'profiler.selectSession'; id: string; agent: ProfilerAgentType }
  | { command: 'profiler.setRefreshPeriod'; refreshPeriodMs: number }
  | { command: 'profiler.reportSelectionState'; summary: ProfilerSelectionSummary }
  | { command: 'profiler.deleteSessions'; ids: string[]; agent: ProfilerAgentType }
  | { command: 'profiler.deleteAllSessions'; agent: ProfilerAgentType }
  | { command: 'profiler.archiveAll' }
  | { command: 'profiler.openSource'; filePath: string; lineNumber?: number }
  | { command: 'profiler.copyFilePath'; filePath: string }
  | { command: 'profiler.revealInFolder'; filePath: string }
  | { command: 'profiler.openInfoDoc'; kind: 'profiler' | 'summary' | 'key-events' };

// Host → Webview messages
export type HostToWebviewMessage =
  | { event: 'figma.status'; connected: boolean; methods: string[]; error?: string }
  | { event: 'figma.authStarted'; mode: ConnectionMode; authUrl: string }
  | { event: 'figma.connectRequested' }
  | { event: 'figma.dataResult'; data: unknown; kind: FigmaDataResultKind }
  | { event: 'figma.sourceDataResult'; count: number; images: SourceDataThumbnail[] }
  | { event: 'figma.sourceDataError'; message: string }
  | { event: 'figma.dataFetchError'; message: string; fallbackData: unknown }
  | { event: 'figma.screenshotResult'; base64: string }
  | { event: 'agent.state'; agent: AgentType; model: string; hasApiKey: boolean }
  | { event: 'agent.settingsSaved'; agent: AgentType; model: string; hasApiKey: boolean }
  | { event: 'agent.settingsCleared'; agent: AgentType }
  | { event: 'agent.modelsResult'; models: ModelInfo[] }
  | { event: 'prompt.generateRequested' }
  | { event: 'prompt.streaming'; progress: number; text?: string }
  | { event: 'prompt.previewOpened'; requested: PreviewTarget; opened: PreviewTarget }
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
  | { event: 'profiler.state'; state: ProfilerOverviewState }
  | { event: 'profiler.detailState'; state: ProfilerDetailState }
  | { event: 'profiler.settingsChanged'; refreshPeriodMs: number }
  | {
      event: 'profiler.performAction';
      action: 'refresh' | 'deleteSelected' | 'toggleSelectAll';
    }
  | { event: 'profiler.archiveResult'; result: ProfilerArchiveResult }
  | { event: 'error'; source: LayerType; message: string };
