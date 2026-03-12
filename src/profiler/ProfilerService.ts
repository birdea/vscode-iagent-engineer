import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_KEYS } from '../constants';
import { getProfilerAgentDescriptor } from './ProfilerCatalog';
import {
  ProfilerAggregate,
  ProfilerAgentType,
  ProfilerArchiveResult,
  ProfilerOverviewState,
  SessionEventCategory,
  SessionInsightSection,
  SessionDetail,
  SessionEventBubble,
  SessionRawEventRef,
  SessionSummary,
  SessionTimelinePoint,
} from '../types';

interface DiscoveredSessionFile {
  agent: ProfilerAgentType;
  filePath: string;
  stat: fs.Stats;
}

interface ParsedRecord {
  lineNumber: number;
  raw: string;
  data: Record<string, unknown>;
  timestamp?: string;
  recordType: string;
  payloadType?: string;
  payloadKb: number;
}

interface ParsedFileResult {
  records: ParsedRecord[];
  warnings: string[];
}

interface GeminiConversationMessage extends Record<string, unknown> {
  id?: string;
  timestamp?: string;
  type?: string;
  model?: string;
  content?: unknown;
  displayContent?: unknown;
  toolCalls?: Array<Record<string, unknown>>;
  thoughts?: Array<Record<string, unknown>>;
  tokens?: Record<string, unknown> | null;
}

interface GeminiConversationRecord extends Record<string, unknown> {
  sessionId?: string;
  projectHash?: string;
  startTime?: string;
  lastUpdated?: string;
  summary?: string;
  messages: GeminiConversationMessage[];
  directories?: string[];
  kind?: 'main' | 'subagent';
}

interface GeminiCheckpointRecord extends Record<string, unknown> {
  history?: unknown[];
  clientHistory?: unknown[];
  commitHash?: string;
  messageId?: string;
  toolCall?: Record<string, unknown>;
}

interface ParsedGeminiFile {
  kind: 'conversation' | 'checkpoint' | 'generic';
  sourceFormat: string;
  parseStatus: SessionSummary['parseStatus'];
  warnings: string[];
  conversation?: GeminiConversationRecord;
  checkpoint?: GeminiCheckpointRecord;
}

interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  maxTokens?: number;
}

interface CodexTurnDraft {
  turnId: string;
  startedAt?: string;
  firstResponseAt?: string;
  completedAt?: string;
  lastTimestamp?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  payloadKb: number;
  maxTokens?: number;
  prompt?: string;
  response?: string;
  eventType: string;
  sourceEventId?: string;
}

interface ClaudeRequestDraft {
  requestId: string;
  startedAt?: string;
  endedAt?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  payloadKb: number;
  model?: string;
  label?: string;
  detail?: string;
  sourceEventId?: string;
  eventType: string;
}

const DEFAULT_MAX_FILES_PER_AGENT = 500;
const DEFAULT_MAX_FILE_SIZE_MB = 20;
const SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'Cache',
  'Code Cache',
  'GPUCache',
  'IndexedDB',
  'Local Storage',
  'Session Storage',
  'Service Worker',
  'blob_storage',
  'antigravity-browser-profile',
  'code_tracker',
  'file-history',
  'telemetry',
]);

const EMPTY_AGGREGATE: ProfilerAggregate = {
  totalSessions: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCachedTokens: 0,
  totalTokens: 0,
  totalFileSizeBytes: 0,
};

export class ProfilerService {
  private summaryCache = new Map<string, SessionSummary>();
  private fileCache = new Map<string, DiscoveredSessionFile>();
  private detailCache = new Map<string, SessionDetail>();
  private codexThreadTitles?: Map<string, string>;

  async scan(): Promise<ProfilerOverviewState> {
    this.summaryCache.clear();
    this.fileCache.clear();
    this.detailCache.clear();

    const sessionsByAgent: Record<ProfilerAgentType, SessionSummary[]> = {
      claude: [],
      codex: [],
      gemini: [],
    };

    for (const agent of ['claude', 'codex', 'gemini'] as const) {
      const files = await this.discoverFiles(agent);
      const summaries = await Promise.all(files.map((file) => this.summarizeFile(file)));
      sessionsByAgent[agent] = summaries.sort((a, b) =>
        (b.startedAt ?? b.modifiedAt).localeCompare(a.startedAt ?? a.modifiedAt),
      );
      summaries.forEach((summary) => {
        this.summaryCache.set(summary.id, summary);
      });
    }

    const aggregate = this.buildAggregate(Object.values(sessionsByAgent).flat());
    const selectedAgent =
      (['codex', 'claude', 'gemini'] as const).find((agent) => sessionsByAgent[agent].length > 0) ??
      'codex';

    return {
      status: 'ready',
      selectedAgent,
      aggregate,
      sessionsByAgent,
      message:
        aggregate.totalSessions > 0
          ? `Found ${aggregate.totalSessions} session files`
          : 'No supported session files found',
    };
  }

  async getDetail(sessionId: string): Promise<SessionDetail> {
    const cached = this.detailCache.get(sessionId);
    if (cached) {
      return cached;
    }

    const file = this.fileCache.get(sessionId);
    const summary = this.summaryCache.get(sessionId);
    if (!file || !summary) {
      throw new Error('Selected session was not found in the current scan results.');
    }

    const detail = await this.analyzeSessionFile(file, summary);
    this.detailCache.set(sessionId, detail);
    return detail;
  }

  async getLatestSessionSummary(): Promise<SessionSummary | undefined> {
    let latestFile: DiscoveredSessionFile | undefined;

    for (const agent of ['claude', 'codex', 'gemini'] as const) {
      const [candidate] = await this.discoverFiles(agent);
      if (!candidate) {
        continue;
      }
      if (!latestFile || candidate.stat.mtimeMs > latestFile.stat.mtimeMs) {
        latestFile = candidate;
      }
    }

    if (!latestFile) {
      return undefined;
    }

    const summary = await this.summarizeFile(latestFile);
    this.summaryCache.set(summary.id, summary);
    return summary;
  }

  async refreshSessionDetail(
    agent: ProfilerAgentType,
    filePath: string,
  ): Promise<{ summary: SessionSummary; detail: SessionDetail; stat: fs.Stats }> {
    const stat = await fs.promises.stat(filePath);
    const file = {
      agent,
      filePath: path.normalize(filePath),
      stat,
    };
    const summary = await this.summarizeFile(file);
    this.summaryCache.set(summary.id, summary);
    const detail = await this.analyzeSessionFile(file, summary);
    this.detailCache.set(summary.id, detail);
    return { summary, detail, stat };
  }

  async archiveAll(targetRoot: string): Promise<ProfilerArchiveResult> {
    const summaries = [...this.summaryCache.values()];
    const preserveStructure = vscode.workspace
      .getConfiguration()
      .get<boolean>(CONFIG_KEYS.PROFILER_ARCHIVE_PRESERVE_STRUCTURE, true);

    const copiedFiles: Array<{
      id: string;
      sourcePath: string;
      targetPath: string;
      agent: ProfilerAgentType;
    }> = [];

    await fs.promises.mkdir(targetRoot, { recursive: true });

    for (const summary of summaries) {
      const date = new Date(summary.startedAt ?? summary.modifiedAt);
      const year = Number.isNaN(date.valueOf()) ? 'unknown-year' : String(date.getUTCFullYear());
      const month = Number.isNaN(date.valueOf())
        ? 'unknown-month'
        : String(date.getUTCMonth() + 1).padStart(2, '0');
      const fileName = path.basename(summary.filePath);
      const targetPath = preserveStructure
        ? path.join(targetRoot, summary.agent, year, month, fileName)
        : path.join(targetRoot, summary.agent, fileName);

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.copyFile(summary.filePath, targetPath);
      copiedFiles.push({
        id: summary.id,
        sourcePath: summary.filePath,
        targetPath,
        agent: summary.agent,
      });
    }

    await fs.promises.writeFile(
      path.join(targetRoot, 'manifest.json'),
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          totalFiles: copiedFiles.length,
          copiedFiles,
        },
        null,
        2,
      ),
      'utf8',
    );

    return {
      targetPath: targetRoot,
      fileCount: copiedFiles.length,
    };
  }

  private buildAggregate(summaries: SessionSummary[]): ProfilerAggregate {
    return summaries.reduce<ProfilerAggregate>(
      (aggregate, summary) => {
        aggregate.totalSessions += 1;
        aggregate.totalInputTokens += summary.totalInputTokens ?? 0;
        aggregate.totalOutputTokens += summary.totalOutputTokens ?? 0;
        aggregate.totalCachedTokens += summary.totalCachedTokens ?? 0;
        aggregate.totalTokens += summary.totalTokens ?? 0;
        aggregate.totalFileSizeBytes += summary.fileSizeBytes;
        return aggregate;
      },
      { ...EMPTY_AGGREGATE },
    );
  }

  private async discoverFiles(agent: ProfilerAgentType): Promise<DiscoveredSessionFile[]> {
    const maxFiles = vscode.workspace
      .getConfiguration()
      .get<number>(CONFIG_KEYS.PROFILER_MAX_FILES_PER_AGENT, DEFAULT_MAX_FILES_PER_AGENT);
    const maxFileSizeMb = vscode.workspace
      .getConfiguration()
      .get<number>(CONFIG_KEYS.PROFILER_MAX_FILE_SIZE_MB, DEFAULT_MAX_FILE_SIZE_MB);
    const maxFileSizeBytes = Math.max(1, maxFileSizeMb) * 1024 * 1024;

    const candidates = this.getSearchRoots(agent);
    const discovered: DiscoveredSessionFile[] = [];
    const visited = new Set<string>();

    for (const root of candidates) {
      const expandedRoot = this.expandHome(root);
      await this.walkDirectory(expandedRoot, async (filePath, stat) => {
        if (discovered.length >= maxFiles) {
          return true;
        }

        const normalized = path.normalize(filePath);
        if (visited.has(normalized) || stat.size > maxFileSizeBytes) {
          return false;
        }
        if (!this.isPotentialSessionFile(agent, normalized)) {
          return false;
        }

        visited.add(normalized);
        discovered.push({ agent, filePath: normalized, stat });
        return discovered.length >= maxFiles;
      });
    }

    return discovered.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  }

  private getSearchRoots(agent: ProfilerAgentType): string[] {
    const config = vscode.workspace.getConfiguration();
    const configured =
      config.get<string[]>(
        agent === 'claude'
          ? CONFIG_KEYS.PROFILER_CLAUDE_SEARCH_ROOTS
          : agent === 'codex'
            ? CONFIG_KEYS.PROFILER_CODEX_SEARCH_ROOTS
            : CONFIG_KEYS.PROFILER_GEMINI_SEARCH_ROOTS,
        [],
      ) ?? [];

    const defaults = this.getDefaultRoots(agent);
    return [...new Set([...configured, ...defaults])].filter(Boolean);
  }

  private getDefaultRoots(agent: ProfilerAgentType): string[] {
    switch (agent) {
      case 'codex':
        return ['~/.codex/sessions'];
      case 'claude':
        return ['~/.claude/projects', '~/.claude'];
      case 'gemini':
        return ['~/.gemini', '~/.config/gemini', '~/Library/Application Support/Gemini'];
      default:
        return [];
    }
  }

  private isPotentialSessionFile(agent: ProfilerAgentType, filePath: string): boolean {
    const lower = filePath.toLowerCase();
    if (agent === 'codex') {
      return lower.endsWith('.jsonl') && lower.includes(`${path.sep}sessions${path.sep}`);
    }

    if (agent === 'claude') {
      return lower.endsWith('.jsonl') && lower.includes(`${path.sep}.claude${path.sep}`);
    }

    if (!lower.endsWith('.json') && !lower.endsWith('.jsonl')) {
      return false;
    }

    if (lower.includes('browser-profile') || lower.includes(`${path.sep}extensions${path.sep}`)) {
      return false;
    }

    return (
      lower.includes('session') ||
      lower.includes('conversation') ||
      lower.includes('history') ||
      lower.includes('chat') ||
      lower.includes(agent)
    );
  }

  private async summarizeFile(file: DiscoveredSessionFile): Promise<SessionSummary> {
    this.fileCache.set(this.createFallbackId(file.agent, file.filePath), file);

    switch (file.agent) {
      case 'codex':
        return this.summarizeCodexFile(file);
      case 'claude':
        return this.summarizeClaudeFile(file);
      case 'gemini':
        return this.summarizeGeminiFile(file);
      default:
        throw new Error('Unsupported profiler session agent.');
    }
  }

  private async analyzeSessionFile(
    file: DiscoveredSessionFile,
    summary: SessionSummary,
  ): Promise<SessionDetail> {
    switch (file.agent) {
      case 'codex':
        return this.analyzeCodexSession(file, summary);
      case 'claude':
        return this.analyzeClaudeSession(file, summary);
      case 'gemini':
        return this.analyzeGeminiSession(file, summary);
      default:
        throw new Error('Unsupported profiler session agent.');
    }
  }

  private async summarizeCodexFile(file: DiscoveredSessionFile): Promise<SessionSummary> {
    const parsed = await this.parseJsonLinesFile(file.filePath);
    const sessionMeta = parsed.records.find((record) => record.recordType === 'session_meta');
    const sessionId =
      this.readString(sessionMeta?.data.payload, 'id') ??
      this.createFallbackId(file.agent, file.filePath);
    const titleMap = await this.loadCodexThreadTitles();
    const title = titleMap.get(sessionId);

    let model = '';
    let startedAt = '';
    let endedAt = '';
    let latestUsage: TokenUsageSnapshot | undefined;
    let requestCount = 0;

    for (const record of parsed.records) {
      if (record.timestamp && !startedAt) {
        startedAt = record.timestamp;
      }
      if (record.timestamp) {
        endedAt = record.timestamp;
      }

      if (record.recordType === 'turn_context') {
        model = this.readString(record.data.payload, 'model') ?? model;
      }

      if (record.payloadType === 'task_started') {
        requestCount += 1;
      }

      if (record.payloadType === 'token_count') {
        latestUsage = this.extractCodexUsage(record) ?? latestUsage;
      }
    }

    const id = this.createSessionId(file.agent, sessionId, file.filePath);
    this.fileCache.set(id, file);

    return {
      id,
      agent: file.agent,
      filePath: file.filePath,
      fileName: path.basename(file.filePath),
      title,
      modifiedAt: file.stat.mtime.toISOString(),
      startedAt: startedAt || undefined,
      endedAt: endedAt || undefined,
      fileSizeBytes: file.stat.size,
      model: model || undefined,
      totalInputTokens: latestUsage?.inputTokens ?? 0,
      totalOutputTokens: latestUsage?.outputTokens ?? 0,
      totalCachedTokens: latestUsage?.cachedTokens ?? 0,
      totalTokens: latestUsage?.totalTokens ?? 0,
      requestCount,
      parseStatus: parsed.warnings.length > 0 ? 'partial' : 'ok',
      warnings: parsed.warnings,
    };
  }

  private async summarizeClaudeFile(file: DiscoveredSessionFile): Promise<SessionSummary> {
    const parsed = await this.parseJsonLinesFile(file.filePath);
    const requests = new Map<string, TokenUsageSnapshot>();
    let sessionId = '';
    let title = '';
    let startedAt = '';
    let endedAt = '';
    let model = '';

    for (const record of parsed.records) {
      const timestamp = record.timestamp;
      if (timestamp && !startedAt) {
        startedAt = timestamp;
      }
      if (timestamp) {
        endedAt = timestamp;
      }

      sessionId = this.readString(record.data, 'sessionId') ?? sessionId;

      if (!title && record.recordType === 'user') {
        title = this.extractClaudeUserPrompt(record.data) ?? title;
      }

      if (record.recordType === 'assistant') {
        model = this.readString(record.data, 'message', 'model') ?? model;
        const usage = this.extractClaudeUsage(record.data);
        const requestId =
          this.readString(record.data, 'requestId') ??
          this.readString(record.data, 'message', 'id') ??
          this.readString(record.data, 'uuid') ??
          `${file.filePath}:${record.lineNumber}`;
        const current = requests.get(requestId);
        if (!current || usage.totalTokens >= current.totalTokens) {
          requests.set(requestId, usage);
        }
      }
    }

    const totals = [...requests.values()].reduce(
      (aggregate, usage) => {
        aggregate.input += usage.inputTokens;
        aggregate.output += usage.outputTokens;
        aggregate.cached += usage.cachedTokens;
        aggregate.total += usage.totalTokens;
        return aggregate;
      },
      { input: 0, output: 0, cached: 0, total: 0 },
    );

    const id = this.createSessionId(
      file.agent,
      sessionId || this.createFallbackId(file.agent, file.filePath),
      file.filePath,
    );
    this.fileCache.set(id, file);

    return {
      id,
      agent: file.agent,
      filePath: file.filePath,
      fileName: path.basename(file.filePath),
      title: title || undefined,
      modifiedAt: file.stat.mtime.toISOString(),
      startedAt: startedAt || undefined,
      endedAt: endedAt || undefined,
      fileSizeBytes: file.stat.size,
      model: model || undefined,
      totalInputTokens: totals.input,
      totalOutputTokens: totals.output,
      totalCachedTokens: totals.cached,
      totalTokens: totals.total,
      requestCount: requests.size,
      parseStatus: parsed.warnings.length > 0 ? 'partial' : 'ok',
      warnings: parsed.warnings,
    };
  }

  private async summarizeGeminiFile(file: DiscoveredSessionFile): Promise<SessionSummary> {
    const parsed = await this.parseGeminiFile(file.filePath);
    if (parsed.kind === 'conversation' && parsed.conversation) {
      const conversation = parsed.conversation;
      const totals = conversation.messages.reduce(
        (aggregate, message) => {
          const usage = this.extractGeminiUsage(message);
          aggregate.input += usage.inputTokens;
          aggregate.output += usage.outputTokens;
          aggregate.cached += usage.cachedTokens;
          aggregate.total += usage.totalTokens;
          return aggregate;
        },
        { input: 0, output: 0, cached: 0, total: 0 },
      );
      const model = [...conversation.messages]
        .reverse()
        .map((message) => (typeof message.model === 'string' ? message.model : undefined))
        .find(Boolean);
      const title =
        (typeof conversation.summary === 'string' ? conversation.summary : undefined) ??
        conversation.messages
          .filter((message) => message.type === 'user')
          .map((message) => this.extractGeminiMessagePreview(message))
          .find(Boolean);
      const id = this.createSessionId(
        file.agent,
        conversation.sessionId ?? this.createFallbackId(file.agent, file.filePath),
        file.filePath,
      );
      this.fileCache.set(id, file);

      return {
        id,
        agent: file.agent,
        filePath: file.filePath,
        fileName: path.basename(file.filePath),
        title,
        modifiedAt: file.stat.mtime.toISOString(),
        startedAt: conversation.startTime,
        endedAt: conversation.lastUpdated,
        fileSizeBytes: file.stat.size,
        model,
        totalInputTokens: totals.input,
        totalOutputTokens: totals.output,
        totalCachedTokens: totals.cached,
        totalTokens: totals.total,
        requestCount: conversation.messages.filter((message) => message.type === 'user').length,
        parseStatus: parsed.parseStatus,
        warnings: parsed.warnings,
      };
    }

    if (parsed.kind === 'checkpoint' && parsed.checkpoint) {
      const checkpoint = parsed.checkpoint;
      const toolCall = this.readRecord(checkpoint, 'toolCall');
      const id = this.createSessionId(
        file.agent,
        this.readString(checkpoint, 'messageId') ??
          this.createFallbackId(file.agent, file.filePath),
        file.filePath,
      );
      this.fileCache.set(id, file);

      return {
        id,
        agent: file.agent,
        filePath: file.filePath,
        fileName: path.basename(file.filePath),
        title:
          this.readString(toolCall, 'name') ??
          this.readString(checkpoint, 'messageId') ??
          path.basename(file.filePath),
        modifiedAt: file.stat.mtime.toISOString(),
        startedAt: file.stat.mtime.toISOString(),
        endedAt: file.stat.mtime.toISOString(),
        fileSizeBytes: file.stat.size,
        requestCount: 1,
        parseStatus: parsed.parseStatus,
        warnings: parsed.warnings,
      };
    }

    const fallback = await this.parseFlexibleFile(file.filePath);
    const id = this.createSessionId(
      file.agent,
      fallback.sessionId ?? this.createFallbackId(file.agent, file.filePath),
      file.filePath,
    );
    this.fileCache.set(id, file);

    return {
      id,
      agent: file.agent,
      filePath: file.filePath,
      fileName: path.basename(file.filePath),
      title: fallback.title,
      modifiedAt: file.stat.mtime.toISOString(),
      startedAt: fallback.startedAt,
      endedAt: fallback.endedAt,
      fileSizeBytes: file.stat.size,
      model: fallback.model,
      totalInputTokens: fallback.totalInputTokens,
      totalOutputTokens: fallback.totalOutputTokens,
      totalCachedTokens: fallback.totalCachedTokens,
      totalTokens: fallback.totalTokens,
      requestCount: fallback.requestCount,
      parseStatus: fallback.parseStatus,
      warnings: [...parsed.warnings, ...fallback.warnings],
    };
  }

  private async analyzeCodexSession(
    file: DiscoveredSessionFile,
    summary: SessionSummary,
  ): Promise<SessionDetail> {
    const parsed = await this.parseJsonLinesFile(file.filePath);
    const timeline: SessionTimelinePoint[] = [];
    const eventBubbles: SessionEventBubble[] = [];
    const rawEvents: SessionRawEventRef[] = [];
    const turns = new Map<string, CodexTurnDraft>();
    let activeTurnId: string | null = null;
    let lastUsage: TokenUsageSnapshot = {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
    };
    let cwd = '';
    let provider = '';

    for (const record of parsed.records) {
      const rawEventId = `${summary.id}:${record.lineNumber}`;
      const summaryLine = this.summarizeCodexRecord(record);
      const usage = this.extractCodexUsage(record);
      const payloadType = record.payloadType ?? record.recordType;
      const payload = this.readRecord(record.data, 'payload');
      const excerpt = record.raw.length > 260 ? `${record.raw.slice(0, 260)}...` : record.raw;
      rawEvents.push({
        id: rawEventId,
        filePath: file.filePath,
        lineNumber: record.lineNumber,
        timestamp: record.timestamp,
        eventType: payloadType,
        category: this.classifyCodexEvent(payloadType),
        summary: summaryLine.title,
        excerpt,
        payloadKb: record.payloadKb,
        payloadBytes: Buffer.byteLength(record.raw, 'utf8'),
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        cachedTokens: usage?.cachedTokens,
        totalTokens: usage?.totalTokens,
        messagePreview:
          this.readString(payload, 'message') ??
          this.readString(payload, 'last_agent_message') ??
          this.readString(payload, 'name') ??
          summaryLine.detail,
      });

      if (record.recordType === 'session_meta') {
        cwd = this.readString(record.data.payload, 'cwd') ?? cwd;
        provider = this.readString(record.data.payload, 'model_provider') ?? provider;
      }

      const timestamp = record.timestamp;

      if (payloadType === 'task_started') {
        const turnId = this.readString(payload, 'turn_id') ?? rawEventId;
        activeTurnId = turnId;
        const turn = this.getOrCreateCodexTurn(turns, turnId);
        turn.startedAt = turn.startedAt ?? timestamp ?? summary.startedAt ?? summary.modifiedAt;
        turn.lastTimestamp = timestamp ?? turn.lastTimestamp;
        turn.eventType = 'turn';
        turn.sourceEventId = rawEventId;
      }

      const turn = this.getActiveCodexTurn(turns, activeTurnId);
      if (turn && payloadType === 'user_message') {
        turn.prompt = this.truncate(this.readString(payload, 'message') ?? 'User prompt', 160);
        turn.lastTimestamp = timestamp ?? turn.lastTimestamp;
        turn.sourceEventId = rawEventId;
      }

      if (
        turn &&
        (payloadType === 'agent_message' ||
          payloadType === 'function_call' ||
          payloadType === 'custom_tool_call')
      ) {
        if (!turn.firstResponseAt && timestamp) {
          turn.firstResponseAt = timestamp;
        }
        turn.response =
          payloadType === 'agent_message'
            ? this.truncate(this.readString(payload, 'message') ?? 'Agent response', 160)
            : (this.readString(payload, 'name') ?? 'Tool call');
        turn.eventType = payloadType === 'agent_message' ? 'turn' : 'tool';
        turn.lastTimestamp = timestamp ?? turn.lastTimestamp;
      }

      if (payloadType === 'token_count') {
        if (usage && turn) {
          const delta = this.diffUsage(usage, lastUsage);
          turn.inputTokens += delta.inputTokens;
          turn.outputTokens += delta.outputTokens;
          turn.cachedTokens += delta.cachedTokens;
          turn.totalTokens += delta.totalTokens;
          turn.maxTokens = Math.max(turn.maxTokens ?? 0, usage.maxTokens ?? 0) || turn.maxTokens;
          turn.payloadKb += record.payloadKb;
          turn.lastTimestamp = timestamp ?? turn.lastTimestamp;
        }
        if (usage) {
          lastUsage = usage;
        }
      }

      if (payloadType === 'task_complete') {
        const turnId: string = this.readString(payload, 'turn_id') ?? activeTurnId ?? rawEventId;
        const completedTurn = turns.get(turnId);
        if (completedTurn) {
          completedTurn.completedAt = timestamp ?? completedTurn.completedAt;
          completedTurn.lastTimestamp = timestamp ?? completedTurn.lastTimestamp;
          completedTurn.response =
            completedTurn.response ??
            this.truncate(this.readString(payload, 'last_agent_message') ?? 'Task completed', 160);
          completedTurn.sourceEventId = rawEventId;
        }
        if (activeTurnId === turnId) {
          activeTurnId = null;
        }
      }

      if (this.isBubbleEvent(payloadType)) {
        eventBubbles.push({
          id: rawEventId,
          timestamp: timestamp ?? summary.modifiedAt,
          title: summaryLine.title,
          detail: summaryLine.detail,
          category: this.classifyCodexEvent(payloadType),
          rawEventId,
        });
      }
    }

    const orderedTurns = [...turns.values()]
      .filter((turn) => turn.startedAt || turn.lastTimestamp)
      .sort((a, b) =>
        (a.startedAt ?? a.lastTimestamp ?? summary.modifiedAt).localeCompare(
          b.startedAt ?? b.lastTimestamp ?? summary.modifiedAt,
        ),
      );

    orderedTurns.forEach((turn, index) => {
      const startedAt = turn.startedAt ?? turn.lastTimestamp ?? summary.modifiedAt;
      const endedAt = turn.completedAt ?? turn.lastTimestamp ?? startedAt;
      const completedLatency = this.diffMs(startedAt, turn.completedAt);
      const firstResponseLatency = this.diffMs(startedAt, turn.firstResponseAt);
      timeline.push({
        id: `${summary.id}:turn:${index + 1}`,
        timestamp: startedAt,
        endTimestamp: endedAt,
        inputTokens: this.positiveOrUndefined(turn.inputTokens),
        outputTokens: this.positiveOrUndefined(turn.outputTokens),
        cachedTokens: this.positiveOrUndefined(turn.cachedTokens),
        totalTokens: this.positiveOrUndefined(turn.totalTokens),
        maxTokens: turn.maxTokens,
        payloadKb: this.positiveOrUndefined(turn.payloadKb),
        latencyMs: completedLatency ?? firstResponseLatency ?? undefined,
        latencyPhase: completedLatency
          ? 'response_completed'
          : firstResponseLatency
            ? 'response_received'
            : undefined,
        eventType: turn.eventType,
        label: `T${String(index + 1).padStart(2, '0')}`,
        detail: turn.prompt ?? turn.response ?? 'Request',
        sourceEventId: turn.sourceEventId,
      });
    });

    return {
      summary,
      metadata: {
        agentLabel: getProfilerAgentDescriptor(summary.agent).label,
        vendorLabel: getProfilerAgentDescriptor(summary.agent).vendor,
        sessionId: summary.id.replace(`${summary.agent}:`, ''),
        cwd: cwd || undefined,
        provider: provider || undefined,
        sourceFormat: 'Rollout JSONL',
        storageLabel: '~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl',
        parserCoverage:
          'Deep parser: session_meta, turn_context, response_item, and event_msg entries.',
        summarySections: this.buildCodexSummarySections(
          summary,
          cwd || undefined,
          provider || undefined,
        ),
        keyEventSections: this.buildCodexKeyEventSections(),
      },
      timeline,
      eventBubbles: eventBubbles.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      rawEvents: rawEvents.sort(
        (a, b) =>
          (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.lineNumber - b.lineNumber,
      ),
    };
  }

  private async analyzeClaudeSession(
    file: DiscoveredSessionFile,
    summary: SessionSummary,
  ): Promise<SessionDetail> {
    const parsed = await this.parseJsonLinesFile(file.filePath);
    const timeline: SessionTimelinePoint[] = [];
    const eventBubbles: SessionEventBubble[] = [];
    const rawEvents: SessionRawEventRef[] = [];
    const recordsByUuid = new Map<string, ParsedRecord>();
    const requests = new Map<string, ClaudeRequestDraft>();
    let cwd = '';

    for (const record of parsed.records) {
      const uuid = this.readString(record.data, 'uuid');
      if (uuid) {
        recordsByUuid.set(uuid, record);
      }

      const rawEventId = `${summary.id}:${record.lineNumber}`;
      const summaryLine = this.summarizeClaudeRecord(record);
      const rawUsage =
        record.recordType === 'assistant' ? this.extractClaudeUsage(record.data) : undefined;
      const assistantSummary =
        record.recordType === 'assistant'
          ? this.extractClaudeAssistantSummary(record.data)
          : undefined;
      const excerpt = record.raw.length > 260 ? `${record.raw.slice(0, 260)}...` : record.raw;
      rawEvents.push({
        id: rawEventId,
        filePath: file.filePath,
        lineNumber: record.lineNumber,
        timestamp: record.timestamp,
        eventType: record.recordType,
        category: this.classifyClaudeEvent(record),
        summary: summaryLine.title,
        excerpt,
        payloadKb: record.payloadKb,
        payloadBytes: Buffer.byteLength(record.raw, 'utf8'),
        inputTokens: rawUsage?.inputTokens,
        outputTokens: rawUsage?.outputTokens,
        cachedTokens: rawUsage?.cachedTokens,
        totalTokens: rawUsage?.totalTokens,
        messagePreview:
          this.extractClaudeUserPrompt(record.data) ??
          assistantSummary?.detail ??
          summaryLine.detail,
      });

      cwd = this.readString(record.data, 'cwd') ?? cwd;

      if (this.isClaudeBubbleEvent(record.recordType)) {
        eventBubbles.push({
          id: rawEventId,
          timestamp: record.timestamp ?? summary.modifiedAt,
          title: summaryLine.title,
          detail: summaryLine.detail,
          category: this.classifyClaudeEvent(record),
          rawEventId,
        });
      }

      if (record.recordType !== 'assistant') {
        continue;
      }

      const requestId =
        this.readString(record.data, 'requestId') ??
        this.readString(record.data, 'message', 'id') ??
        rawEventId;
      const usage = this.extractClaudeUsage(record.data);
      const contentSummary = this.extractClaudeAssistantSummary(record.data);
      const parentUuid = this.readString(record.data, 'parentUuid');
      const parentTimestamp = parentUuid ? recordsByUuid.get(parentUuid)?.timestamp : undefined;

      const draft = requests.get(requestId) ?? {
        requestId,
        startedAt: parentTimestamp ?? record.timestamp ?? summary.modifiedAt,
        endedAt: record.timestamp ?? summary.modifiedAt,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        payloadKb: 0,
        eventType: contentSummary.eventType,
      };

      draft.startedAt =
        draft.startedAt ?? parentTimestamp ?? record.timestamp ?? summary.modifiedAt;
      draft.endedAt = record.timestamp ?? draft.endedAt;
      draft.inputTokens = Math.max(draft.inputTokens, usage.inputTokens);
      draft.outputTokens = Math.max(draft.outputTokens, usage.outputTokens);
      draft.cachedTokens = Math.max(draft.cachedTokens, usage.cachedTokens);
      draft.totalTokens = Math.max(draft.totalTokens, usage.totalTokens);
      draft.payloadKb += record.payloadKb;
      draft.model = this.readString(record.data, 'message', 'model') ?? draft.model;
      draft.label = contentSummary.label;
      draft.detail = contentSummary.detail;
      draft.sourceEventId = rawEventId;
      draft.eventType = contentSummary.eventType;
      requests.set(requestId, draft);
    }

    const orderedRequests = [...requests.values()].sort((a, b) =>
      (a.startedAt ?? summary.modifiedAt).localeCompare(b.startedAt ?? summary.modifiedAt),
    );

    orderedRequests.forEach((request, index) => {
      const startedAt = request.startedAt ?? summary.modifiedAt;
      const endedAt = request.endedAt ?? startedAt;
      timeline.push({
        id: `${summary.id}:request:${index + 1}`,
        timestamp: startedAt,
        endTimestamp: endedAt,
        inputTokens: this.positiveOrUndefined(request.inputTokens),
        outputTokens: this.positiveOrUndefined(request.outputTokens),
        cachedTokens: this.positiveOrUndefined(request.cachedTokens),
        totalTokens: this.positiveOrUndefined(request.totalTokens),
        payloadKb: this.positiveOrUndefined(request.payloadKb),
        latencyMs: this.diffMs(startedAt, endedAt) ?? undefined,
        latencyPhase: 'response_completed',
        eventType: request.eventType,
        label: `R${String(index + 1).padStart(2, '0')}`,
        detail: request.detail ?? request.label ?? 'Claude request',
        sourceEventId: request.sourceEventId,
      });
    });

    return {
      summary,
      metadata: {
        agentLabel: getProfilerAgentDescriptor(summary.agent).label,
        vendorLabel: getProfilerAgentDescriptor(summary.agent).vendor,
        sessionId: this.readString(parsed.records[0]?.data, 'sessionId') ?? undefined,
        cwd: cwd || undefined,
        provider: 'anthropic',
        sourceFormat: 'Session transcript JSONL',
        storageLabel: '~/.claude/.../*.jsonl',
        parserCoverage:
          'Deep parser for user/assistant records with progress, queue, tool_use, thinking, and usage blocks.',
        summarySections: this.buildClaudeSummarySections(summary, cwd || undefined),
        keyEventSections: this.buildClaudeKeyEventSections(),
      },
      timeline,
      eventBubbles: eventBubbles.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      rawEvents: rawEvents.sort(
        (a, b) =>
          (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.lineNumber - b.lineNumber,
      ),
    };
  }

  private async analyzeGeminiSession(
    file: DiscoveredSessionFile,
    summary: SessionSummary,
  ): Promise<SessionDetail> {
    const parsed = await this.parseGeminiFile(file.filePath);
    if (parsed.kind === 'conversation' && parsed.conversation) {
      return this.buildGeminiConversationDetail(file, summary, parsed);
    }
    if (parsed.kind === 'checkpoint' && parsed.checkpoint) {
      return this.buildGeminiCheckpointDetail(file, summary, parsed);
    }

    return {
      summary,
      metadata: {
        agentLabel: getProfilerAgentDescriptor(summary.agent).label,
        vendorLabel: getProfilerAgentDescriptor(summary.agent).vendor,
        sourceFormat: path.extname(file.filePath).replace('.', '') || 'unknown',
        storageLabel: '~/.gemini/tmp/<project_hash>/...',
        parserCoverage: 'Basic parser: generic JSON metadata only.',
        summarySections: this.buildGeminiFallbackSummarySections(summary),
        keyEventSections: this.buildGeminiFallbackKeyEventSections(),
      },
      timeline: [],
      eventBubbles: [],
      rawEvents: [
        {
          id: `${summary.id}:1`,
          filePath: file.filePath,
          lineNumber: 1,
          summary: 'Generic Gemini file',
          excerpt: 'Detailed parsing is not yet available for this Gemini file variant.',
          eventType: 'unsupported',
          category: 'other',
          messagePreview: 'Detailed parsing is not yet available for this Gemini file variant.',
        },
      ],
    };
  }

  private async parseJsonLinesFile(filePath: string): Promise<ParsedFileResult> {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const warnings: string[] = [];
    const records: ParsedRecord[] = [];

    content.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) {
        return;
      }

      try {
        const data = JSON.parse(line) as Record<string, unknown>;
        records.push({
          lineNumber: index + 1,
          raw: line,
          data,
          timestamp:
            (typeof data.timestamp === 'string' ? data.timestamp : undefined) ??
            this.readString(data.payload, 'timestamp') ??
            undefined,
          recordType: typeof data.type === 'string' ? data.type : 'unknown',
          payloadType: this.readString(data, 'payload', 'type') ?? undefined,
          payloadKb: Buffer.byteLength(line, 'utf8') / 1024,
        });
      } catch {
        warnings.push(`Line ${index + 1} could not be parsed as JSON.`);
      }
    });

    return {
      records,
      warnings,
    };
  }

  private async parseGeminiFile(filePath: string): Promise<ParsedGeminiFile> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const trimmed = content.trim();
      if (!trimmed) {
        return {
          kind: 'generic',
          sourceFormat: path.extname(filePath).replace('.', '') || 'unknown',
          parseStatus: 'unsupported',
          warnings: ['File is empty.'],
        };
      }

      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (this.isGeminiConversationRecord(parsed)) {
        return {
          kind: 'conversation',
          sourceFormat: 'ConversationRecord JSON',
          parseStatus: 'ok',
          warnings: [],
          conversation: parsed,
        };
      }

      if (this.isGeminiCheckpointRecord(parsed)) {
        return {
          kind: 'checkpoint',
          sourceFormat: 'Checkpoint JSON',
          parseStatus: 'partial',
          warnings: [],
          checkpoint: parsed,
        };
      }

      return {
        kind: 'generic',
        sourceFormat: path.extname(filePath).replace('.', '') || 'json',
        parseStatus: 'partial',
        warnings: ['Gemini file did not match a known chat or checkpoint schema.'],
      };
    } catch {
      return {
        kind: 'generic',
        sourceFormat: path.extname(filePath).replace('.', '') || 'unknown',
        parseStatus: 'unsupported',
        warnings: ['File format is not supported yet.'],
      };
    }
  }

  private isGeminiConversationRecord(value: unknown): value is GeminiConversationRecord {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof this.readString(value, 'sessionId') === 'string' &&
      Array.isArray(this.readUnknown(value, 'messages'))
    );
  }

  private isGeminiCheckpointRecord(value: unknown): value is GeminiCheckpointRecord {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !!this.readRecord(value, 'toolCall') &&
      typeof this.readString(value, 'messageId') === 'string'
    );
  }

  private buildGeminiConversationDetail(
    file: DiscoveredSessionFile,
    summary: SessionSummary,
    parsed: ParsedGeminiFile,
  ): SessionDetail {
    const conversation = parsed.conversation!;
    const timeline: SessionTimelinePoint[] = [];
    const eventBubbles: SessionEventBubble[] = [];
    const rawEvents: SessionRawEventRef[] = [];
    let turnIndex = 0;

    conversation.messages.forEach((message, index) => {
      const timestamp =
        (typeof message.timestamp === 'string' ? message.timestamp : undefined) ??
        summary.startedAt ??
        summary.modifiedAt;
      const preview =
        this.extractGeminiMessagePreview(message) ?? `${message.type ?? 'message'} event`;
      const usage = this.extractGeminiUsage(message);
      const category = this.classifyGeminiMessage(message);
      const rawEventId = `${summary.id}:${index + 1}`;
      const serialized = JSON.stringify(message);

      rawEvents.push({
        id: rawEventId,
        filePath: file.filePath,
        lineNumber: index + 1,
        timestamp,
        eventType: message.type ?? 'message',
        category,
        summary: this.getGeminiMessageTitle(message),
        excerpt: serialized.length > 260 ? `${serialized.slice(0, 260)}...` : serialized,
        messagePreview: preview,
        payloadBytes: Buffer.byteLength(serialized, 'utf8'),
        payloadKb: Buffer.byteLength(serialized, 'utf8') / 1024,
        inputTokens: usage.inputTokens || undefined,
        outputTokens: usage.outputTokens || undefined,
        cachedTokens: usage.cachedTokens || undefined,
        totalTokens: usage.totalTokens || undefined,
      });

      if (message.type === 'user' || message.type === 'gemini' || category === 'tool') {
        eventBubbles.push({
          id: rawEventId,
          timestamp,
          title: this.getGeminiMessageTitle(message),
          detail: preview,
          category,
          rawEventId,
        });
      }

      if (message.type === 'user' || message.type === 'gemini') {
        turnIndex += 1;
        const previous = conversation.messages[index - 1];
        timeline.push({
          id: `${summary.id}:message:${turnIndex}`,
          timestamp,
          endTimestamp: timestamp,
          inputTokens: usage.inputTokens || undefined,
          outputTokens: usage.outputTokens || undefined,
          cachedTokens: usage.cachedTokens || undefined,
          totalTokens: usage.totalTokens || undefined,
          latencyMs:
            message.type === 'gemini'
              ? this.diffMs(
                  typeof previous?.timestamp === 'string' ? previous.timestamp : undefined,
                  timestamp,
                )
              : undefined,
          latencyPhase: message.type === 'gemini' ? 'response_completed' : undefined,
          eventType: message.type ?? 'message',
          label: `M${String(turnIndex).padStart(2, '0')}`,
          detail: preview,
          sourceEventId: rawEventId,
        });
      }

      const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
      toolCalls.forEach((toolCall, toolIndex) => {
        const toolPreview =
          this.readString(toolCall, 'displayName') ??
          this.readString(toolCall, 'name') ??
          'Gemini tool call';
        const toolRawEventId = `${summary.id}:${index + 1}:tool:${toolIndex + 1}`;
        const toolSerialized = JSON.stringify(toolCall);
        rawEvents.push({
          id: toolRawEventId,
          filePath: file.filePath,
          lineNumber: index + 1,
          timestamp: this.readString(toolCall, 'timestamp') ?? timestamp,
          eventType: 'tool_call',
          category: 'tool',
          summary: 'Tool call',
          excerpt:
            toolSerialized.length > 260 ? `${toolSerialized.slice(0, 260)}...` : toolSerialized,
          messagePreview: toolPreview,
          payloadBytes: Buffer.byteLength(toolSerialized, 'utf8'),
          payloadKb: Buffer.byteLength(toolSerialized, 'utf8') / 1024,
        });
        eventBubbles.push({
          id: toolRawEventId,
          timestamp: this.readString(toolCall, 'timestamp') ?? timestamp,
          title: 'Tool call',
          detail: toolPreview,
          category: 'tool',
          rawEventId: toolRawEventId,
        });
      });
    });

    return {
      summary,
      metadata: {
        agentLabel: getProfilerAgentDescriptor(summary.agent).label,
        vendorLabel: getProfilerAgentDescriptor(summary.agent).vendor,
        sessionId: conversation.sessionId,
        sourceFormat: parsed.sourceFormat,
        storageLabel: '~/.gemini/tmp/<project_hash>/chats/session-*.json',
        parserCoverage:
          'Deep parser for ConversationRecord JSON: messages, toolCalls, thoughts, tokens, directories, and session summary.',
        summarySections: this.buildGeminiConversationSummarySections(summary, conversation),
        keyEventSections: this.buildGeminiConversationKeyEventSections(),
      },
      timeline,
      eventBubbles: eventBubbles.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      rawEvents: rawEvents.sort(
        (a, b) =>
          (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.lineNumber - b.lineNumber,
      ),
    };
  }

  private buildGeminiCheckpointDetail(
    file: DiscoveredSessionFile,
    summary: SessionSummary,
    parsed: ParsedGeminiFile,
  ): SessionDetail {
    const checkpoint = parsed.checkpoint!;
    const toolCall = this.readRecord(checkpoint, 'toolCall');
    const toolName = this.readString(toolCall, 'name') ?? 'Checkpointed tool call';
    const messageId = this.readString(checkpoint, 'messageId');
    const historyCount = Array.isArray(this.readUnknown(checkpoint, 'history'))
      ? (this.readUnknown(checkpoint, 'history') as unknown[]).length
      : 0;
    const clientHistoryCount = Array.isArray(this.readUnknown(checkpoint, 'clientHistory'))
      ? (this.readUnknown(checkpoint, 'clientHistory') as unknown[]).length
      : 0;
    const excerpt = JSON.stringify(checkpoint, null, 2);
    const timestamp = summary.startedAt ?? summary.modifiedAt;

    return {
      summary,
      metadata: {
        agentLabel: getProfilerAgentDescriptor(summary.agent).label,
        vendorLabel: getProfilerAgentDescriptor(summary.agent).vendor,
        sessionId: messageId,
        sourceFormat: parsed.sourceFormat,
        storageLabel: '~/.gemini/tmp/<project_hash>/checkpoints/*.json',
        parserCoverage:
          'Structured parser for checkpoint JSON: toolCall, messageId, history, clientHistory, and shadow Git snapshot metadata.',
        summarySections: this.buildGeminiCheckpointSummarySections(summary, checkpoint),
        keyEventSections: this.buildGeminiCheckpointKeyEventSections(),
      },
      timeline: [
        {
          id: `${summary.id}:checkpoint`,
          timestamp,
          endTimestamp: timestamp,
          eventType: 'checkpoint',
          label: 'C01',
          detail: toolName,
          sourceEventId: `${summary.id}:1`,
        },
      ],
      eventBubbles: [
        {
          id: `${summary.id}:1`,
          timestamp,
          title: 'Checkpoint saved',
          detail: toolName,
          category: 'checkpoint',
          rawEventId: `${summary.id}:1`,
        },
      ],
      rawEvents: [
        {
          id: `${summary.id}:1`,
          filePath: file.filePath,
          lineNumber: 1,
          timestamp,
          eventType: 'checkpoint',
          category: 'checkpoint',
          summary: 'Checkpoint snapshot',
          excerpt: excerpt.length > 320 ? `${excerpt.slice(0, 320)}...` : excerpt,
          messagePreview: `${toolName} · history ${historyCount} · client ${clientHistoryCount}`,
          payloadBytes: Buffer.byteLength(excerpt, 'utf8'),
          payloadKb: Buffer.byteLength(excerpt, 'utf8') / 1024,
        },
      ],
    };
  }

  private async parseFlexibleFile(filePath: string): Promise<{
    sessionId?: string;
    title?: string;
    startedAt?: string;
    endedAt?: string;
    model?: string;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    totalCachedTokens?: number;
    totalTokens?: number;
    requestCount?: number;
    parseStatus: 'ok' | 'partial' | 'unsupported' | 'error';
    warnings: string[];
  }> {
    try {
      if (filePath.endsWith('.jsonl')) {
        const parsedJsonl = await this.parseJsonLinesFile(filePath);
        const first = parsedJsonl.records[0];
        const last = parsedJsonl.records[parsedJsonl.records.length - 1];
        const model = parsedJsonl.records
          .map((record) => this.readString(record.data, 'model'))
          .find(Boolean);
        const title = parsedJsonl.records
          .map(
            (record) =>
              this.readString(record.data, 'title') ?? this.readString(record.data, 'thread_name'),
          )
          .find(Boolean);
        return {
          sessionId:
            this.readString(first?.data, 'id') ??
            this.readString(first?.data, 'sessionId') ??
            undefined,
          title: title ?? undefined,
          startedAt: first?.timestamp,
          endedAt: last?.timestamp,
          model: model ?? undefined,
          parseStatus: parsedJsonl.records.length > 0 ? 'partial' : 'unsupported',
          warnings:
            parsedJsonl.records.length > 0
              ? ['Detailed parser is not yet available for this agent format.']
              : ['File is empty.'],
        };
      }

      const content = await fs.promises.readFile(filePath, 'utf8');
      const trimmed = content.trim();
      if (!trimmed) {
        return {
          parseStatus: 'unsupported',
          warnings: ['File is empty.'],
        };
      }

      const parsed =
        trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(trimmed) : undefined;
      const source = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!source || typeof source !== 'object') {
        return {
          parseStatus: 'unsupported',
          warnings: ['No recognizable JSON structure found.'],
        };
      }

      return {
        sessionId:
          this.readString(source, 'id') ?? this.readString(source, 'sessionId') ?? undefined,
        title:
          this.readString(source, 'title') ?? this.readString(source, 'thread_name') ?? undefined,
        startedAt:
          this.readString(source, 'startedAt') ??
          this.readString(source, 'start_time') ??
          this.readString(source, 'timestamp') ??
          undefined,
        endedAt:
          this.readString(source, 'endedAt') ??
          this.readString(source, 'updatedAt') ??
          this.readString(source, 'updated_at') ??
          undefined,
        model: this.readString(source, 'model') ?? undefined,
        totalInputTokens:
          this.readNumber(source, 'input_tokens') ??
          this.readNumber(source, 'prompt_tokens') ??
          undefined,
        totalOutputTokens:
          this.readNumber(source, 'output_tokens') ??
          this.readNumber(source, 'completion_tokens') ??
          undefined,
        totalCachedTokens: this.readNumber(source, 'cached_input_tokens') ?? undefined,
        totalTokens: this.readNumber(source, 'total_tokens') ?? undefined,
        parseStatus: 'partial',
        warnings: ['Detailed parser is not yet available for this agent format.'],
      };
    } catch {
      return {
        parseStatus: 'unsupported',
        warnings: ['File format is not supported yet.'],
      };
    }
  }

  private buildCodexSummarySections(
    summary: SessionSummary,
    cwd?: string,
    provider?: string,
  ): SessionInsightSection[] {
    return [
      {
        id: 'source',
        title: 'Source profile',
        description:
          'Official OpenAI Codex SDK and protocol docs describe persisted threads and rollout events.',
        fields: [
          { label: 'Session file', value: summary.filePath },
          { label: 'Storage root', value: '~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl' },
          {
            label: 'Thread title',
            value: summary.title ?? 'Not recorded in this rollout',
            tone: 'muted',
          },
        ],
      },
      {
        id: 'format',
        title: 'Documented format fields',
        description:
          'Codex rollouts are newline-delimited JSON with session meta plus turn and event records.',
        fields: [
          { label: 'Core records', value: 'session_meta, turn_context, response_item, event_msg' },
          {
            label: 'Observable events',
            value:
              'task_started, task_complete, token_count, user_message, agent_message, tool events',
          },
          { label: 'Workspace', value: cwd ?? 'Unavailable', tone: cwd ? 'default' : 'muted' },
        ],
      },
      {
        id: 'extracted',
        title: 'Extracted now',
        description: 'These values come from the selected file after iProfiler normalization.',
        fields: [
          { label: 'Provider', value: provider ?? 'openai', tone: 'accent' },
          {
            label: 'Model',
            value: summary.model ?? 'Unavailable',
            tone: summary.model ? 'accent' : 'muted',
          },
          {
            label: 'Parse health',
            value: `${summary.parseStatus.toUpperCase()}${summary.warnings.length ? ` · ${summary.warnings.length} warning(s)` : ''}`,
            tone: summary.parseStatus === 'ok' ? 'accent' : 'default',
          },
        ],
      },
    ];
  }

  private buildCodexKeyEventSections(): SessionInsightSection[] {
    return [
      {
        id: 'lifecycle',
        title: 'Lifecycle',
        description: 'Turn boundaries and rollout state transitions.',
        fields: [
          {
            label: 'Events',
            value: 'session_meta, task_started, task_complete, session_configured',
          },
        ],
      },
      {
        id: 'conversation',
        title: 'Conversation',
        description: 'Prompt, assistant reply, and raw response payloads.',
        fields: [{ label: 'Events', value: 'response_item, user_message, agent_message' }],
      },
      {
        id: 'tooling',
        title: 'Tooling and usage',
        description: 'Tool execution, token snapshots, and reasoning-side instrumentation.',
        fields: [
          {
            label: 'Events',
            value:
              'function_call, custom_tool_call, mcp_*, exec_command_*, web_search_*, image_generation_*, token_count',
          },
        ],
      },
    ];
  }

  private buildClaudeSummarySections(
    summary: SessionSummary,
    cwd?: string,
  ): SessionInsightSection[] {
    return [
      {
        id: 'source',
        title: 'Source profile',
        description:
          'Anthropic session docs cover continue/resume/fork flows and structured JSON output families.',
        fields: [
          { label: 'Session file', value: summary.filePath },
          { label: 'Storage family', value: '~/.claude/.../*.jsonl' },
          { label: 'Workspace', value: cwd ?? 'Unavailable', tone: cwd ? 'default' : 'muted' },
        ],
      },
      {
        id: 'format',
        title: 'Documented format fields',
        description:
          'Claude messages can contain text, tool_use, thinking, errors, and usage counters. Local JSONL transcripts mirror those blocks with per-record metadata.',
        fields: [
          { label: 'Message blocks', value: 'text, tool_use, thinking, tool_result, error' },
          { label: 'Usage fields', value: 'input_tokens, output_tokens, cache_*_input_tokens' },
          {
            label: 'Local records',
            value: 'user, assistant, progress, queue-operation, file-history-snapshot',
          },
        ],
      },
      {
        id: 'extracted',
        title: 'Extracted now',
        description: 'Normalized request groups and token usage derived from assistant records.',
        fields: [
          {
            label: 'Model',
            value: summary.model ?? 'Unavailable',
            tone: summary.model ? 'accent' : 'muted',
          },
          {
            label: 'Requests',
            value: String(summary.requestCount ?? 0),
            tone: 'accent',
          },
          {
            label: 'Parse health',
            value: `${summary.parseStatus.toUpperCase()}${summary.warnings.length ? ` · ${summary.warnings.length} warning(s)` : ''}`,
            tone: summary.parseStatus === 'ok' ? 'accent' : 'default',
          },
        ],
      },
    ];
  }

  private buildClaudeKeyEventSections(): SessionInsightSection[] {
    return [
      {
        id: 'conversation',
        title: 'Conversation',
        description: 'User prompts, assistant replies, and tool results.',
        fields: [{ label: 'Records', value: 'user, assistant(text), tool_result' }],
      },
      {
        id: 'reasoning',
        title: 'Reasoning and tools',
        description: 'Thinking blocks and tool_use calls are separated from plain replies.',
        fields: [{ label: 'Records', value: 'assistant(thinking), assistant(tool_use)' }],
      },
      {
        id: 'system',
        title: 'System progress',
        description:
          'Queue and progress records explain what Claude Code was doing around the request.',
        fields: [{ label: 'Records', value: 'progress, queue-operation, file-history-snapshot' }],
      },
    ];
  }

  private buildGeminiConversationSummarySections(
    summary: SessionSummary,
    conversation: GeminiConversationRecord,
  ): SessionInsightSection[] {
    return [
      {
        id: 'source',
        title: 'Source profile',
        description:
          'Gemini CLI documents project-scoped chat JSON files stored under the temp chats directory.',
        fields: [
          { label: 'Session file', value: summary.filePath },
          { label: 'Storage root', value: '~/.gemini/tmp/<project_hash>/chats/session-*.json' },
          { label: 'Session kind', value: conversation.kind ?? 'main', tone: 'accent' },
        ],
      },
      {
        id: 'format',
        title: 'Documented format fields',
        description:
          'ConversationRecord JSON tracks session metadata, messages, directories, summaries, tool calls, thoughts, and tokens.',
        fields: [
          {
            label: 'Conversation fields',
            value:
              'sessionId, projectHash, startTime, lastUpdated, messages, summary, directories, kind',
          },
          {
            label: 'Message fields',
            value: 'type, content, displayContent, toolCalls, thoughts, tokens, model',
          },
          {
            label: 'Project hash',
            value: conversation.projectHash ?? 'Unavailable',
            tone: conversation.projectHash ? 'default' : 'muted',
          },
        ],
      },
      {
        id: 'extracted',
        title: 'Extracted now',
        description: 'iProfiler rolls message-level tokens and tool activity into one timeline.',
        fields: [
          {
            label: 'Summary',
            value: conversation.summary ?? 'Not generated',
            tone: conversation.summary ? 'accent' : 'muted',
          },
          {
            label: 'Directories',
            value: String(
              Array.isArray(conversation.directories) ? conversation.directories.length : 0,
            ),
          },
          {
            label: 'Parse health',
            value: `${summary.parseStatus.toUpperCase()}${summary.warnings.length ? ` · ${summary.warnings.length} warning(s)` : ''}`,
            tone: summary.parseStatus === 'ok' ? 'accent' : 'default',
          },
        ],
      },
    ];
  }

  private buildGeminiConversationKeyEventSections(): SessionInsightSection[] {
    return [
      {
        id: 'conversation',
        title: 'Conversation',
        description: 'User and Gemini message records stored in the session JSON.',
        fields: [{ label: 'Records', value: 'user, gemini, info, warning, error' }],
      },
      {
        id: 'tooling',
        title: 'Tooling and thoughts',
        description:
          'Gemini session records can embed toolCalls and assistant thought summaries per message.',
        fields: [{ label: 'Records', value: 'toolCalls, thoughts, displayContent' }],
      },
      {
        id: 'usage',
        title: 'Usage',
        description: 'Tokens are captured per message when usage metadata is present.',
        fields: [
          { label: 'Records', value: 'tokens.input, tokens.output, tokens.cached, tokens.total' },
        ],
      },
    ];
  }

  private buildGeminiCheckpointSummarySections(
    summary: SessionSummary,
    checkpoint: GeminiCheckpointRecord,
  ): SessionInsightSection[] {
    const toolCall = this.readRecord(checkpoint, 'toolCall');
    const historyCount = Array.isArray(this.readUnknown(checkpoint, 'history'))
      ? (this.readUnknown(checkpoint, 'history') as unknown[]).length
      : 0;
    const clientHistoryCount = Array.isArray(this.readUnknown(checkpoint, 'clientHistory'))
      ? (this.readUnknown(checkpoint, 'clientHistory') as unknown[]).length
      : 0;

    return [
      {
        id: 'source',
        title: 'Source profile',
        description:
          'Gemini checkpoint docs describe local restore points that combine Git snapshots with conversation state.',
        fields: [
          { label: 'Checkpoint file', value: summary.filePath },
          { label: 'Storage root', value: '~/.gemini/tmp/<project_hash>/checkpoints/*.json' },
          {
            label: 'Commit hash',
            value: this.readString(checkpoint, 'commitHash') ?? 'Unavailable',
            tone: this.readString(checkpoint, 'commitHash') ? 'accent' : 'muted',
          },
        ],
      },
      {
        id: 'format',
        title: 'Documented format fields',
        description:
          'Checkpoint JSON stores the tool call to replay plus saved client and task history.',
        fields: [
          { label: 'Tool call', value: this.readString(toolCall, 'name') ?? 'Unavailable' },
          { label: 'History size', value: `${historyCount} task item(s)` },
          { label: 'Client history', value: `${clientHistoryCount} content item(s)` },
        ],
      },
      {
        id: 'extracted',
        title: 'Extracted now',
        description:
          'Checkpoint files are not full chat transcripts, so iProfiler treats them as restore snapshots.',
        fields: [
          { label: 'Message id', value: this.readString(checkpoint, 'messageId') ?? 'Unavailable' },
          {
            label: 'Parse health',
            value: `${summary.parseStatus.toUpperCase()}${summary.warnings.length ? ` · ${summary.warnings.length} warning(s)` : ''}`,
            tone: 'default',
          },
        ],
      },
    ];
  }

  private buildGeminiCheckpointKeyEventSections(): SessionInsightSection[] {
    return [
      {
        id: 'checkpoint',
        title: 'Checkpoint snapshot',
        description: 'Represents a restore point before a file-changing tool call.',
        fields: [
          { label: 'Records', value: 'toolCall, history, clientHistory, commitHash, messageId' },
        ],
      },
    ];
  }

  private buildGeminiFallbackSummarySections(summary: SessionSummary): SessionInsightSection[] {
    return [
      {
        id: 'source',
        title: 'Source profile',
        description:
          'Gemini file matched the search roots but did not match a documented chat or checkpoint schema.',
        fields: [
          { label: 'File', value: summary.filePath },
          { label: 'Parse health', value: summary.parseStatus.toUpperCase() },
        ],
      },
    ];
  }

  private buildGeminiFallbackKeyEventSections(): SessionInsightSection[] {
    return [
      {
        id: 'other',
        title: 'Unclassified file',
        description:
          'This file can be opened as source, but iProfiler cannot safely extract structured key events yet.',
        fields: [{ label: 'Status', value: 'Basic metadata only' }],
      },
    ];
  }

  private classifyCodexEvent(payloadType: string): SessionEventCategory {
    if (
      ['session_meta', 'task_started', 'task_complete', 'session_configured'].includes(payloadType)
    ) {
      return 'lifecycle';
    }
    if (['user_message', 'agent_message', 'response_item'].includes(payloadType)) {
      return 'conversation';
    }
    if (
      [
        'function_call',
        'custom_tool_call',
        'mcp_tool_call_begin',
        'mcp_tool_call_end',
        'exec_command_begin',
        'exec_command_end',
        'view_image_tool_call',
        'web_search_begin',
        'web_search_end',
        'image_generation_begin',
        'image_generation_end',
      ].includes(payloadType)
    ) {
      return 'tool';
    }
    if (['token_count', 'turn_context'].includes(payloadType)) {
      return 'usage';
    }
    if (payloadType.includes('reasoning') || payloadType.startsWith('plan_')) {
      return 'reasoning';
    }
    if (payloadType === 'error' || payloadType === 'warning') {
      return 'system';
    }
    return 'other';
  }

  private classifyClaudeEvent(record: ParsedRecord): SessionEventCategory {
    if (record.recordType === 'progress' || record.recordType === 'queue-operation') {
      return 'system';
    }
    if (record.recordType === 'file-history-snapshot') {
      return 'checkpoint';
    }
    if (record.recordType === 'user') {
      return 'conversation';
    }
    if (record.recordType === 'assistant') {
      const summary = this.extractClaudeAssistantSummary(record.data);
      if (summary.eventType === 'tool') {
        return 'tool';
      }
      if (summary.eventType === 'thinking') {
        return 'reasoning';
      }
      if (summary.eventType === 'error') {
        return 'system';
      }
      return 'conversation';
    }
    return 'other';
  }

  private classifyGeminiMessage(message: GeminiConversationMessage): SessionEventCategory {
    if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
      return 'tool';
    }
    if (Array.isArray(message.thoughts) && message.thoughts.length > 0) {
      return 'reasoning';
    }
    if (message.type === 'warning' || message.type === 'error' || message.type === 'info') {
      return 'system';
    }
    return 'conversation';
  }

  private getGeminiMessageTitle(message: GeminiConversationMessage): string {
    if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
      return 'Tool activity';
    }
    switch (message.type) {
      case 'user':
        return 'User prompt';
      case 'gemini':
        return 'Gemini reply';
      case 'warning':
        return 'Warning';
      case 'error':
        return 'Error';
      case 'info':
        return 'Info';
      default:
        return 'Session message';
    }
  }

  private extractGeminiUsage(message: GeminiConversationMessage): TokenUsageSnapshot {
    const usage = this.readRecord(message, 'tokens');
    const inputTokens = this.readNumber(usage, 'input') ?? 0;
    const outputTokens = this.readNumber(usage, 'output') ?? 0;
    const cachedTokens = this.readNumber(usage, 'cached') ?? 0;
    const totalTokens =
      this.readNumber(usage, 'total') ?? inputTokens + outputTokens + cachedTokens;

    return {
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens,
    };
  }

  private extractGeminiMessagePreview(message: GeminiConversationMessage): string | undefined {
    const direct =
      this.extractTextSnippet(message.displayContent) ?? this.extractTextSnippet(message.content);
    if (direct) {
      return this.truncate(direct, 160);
    }

    const toolCall = Array.isArray(message.toolCalls) ? message.toolCalls[0] : undefined;
    const toolName =
      this.readString(toolCall, 'displayName') ??
      this.readString(toolCall, 'name') ??
      this.readString(toolCall, 'description');
    if (toolName) {
      return this.truncate(toolName, 160);
    }

    const thought = Array.isArray(message.thoughts) ? message.thoughts[0] : undefined;
    const thoughtText = this.extractTextSnippet(thought);
    if (thoughtText) {
      return this.truncate(thoughtText, 160);
    }

    return undefined;
  }

  private extractTextSnippet(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = this.extractTextSnippet(item);
        if (nested) {
          return nested;
        }
      }
      return undefined;
    }
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const directKeys = ['text', 'name', 'description', 'content', 'displayContent'];
    for (const key of directKeys) {
      const nested = this.extractTextSnippet(record[key]);
      if (nested) {
        return nested;
      }
    }

    const functionCall = this.readRecord(record, 'functionCall');
    const functionName = this.readString(functionCall, 'name');
    if (functionName) {
      return `Function call: ${functionName}`;
    }

    const functionResponse = this.readRecord(record, 'functionResponse');
    const responseName = this.readString(functionResponse, 'name');
    if (responseName) {
      return `Function response: ${responseName}`;
    }

    return undefined;
  }

  private async loadCodexThreadTitles(): Promise<Map<string, string>> {
    if (this.codexThreadTitles) {
      return this.codexThreadTitles;
    }

    const titleMap = new Map<string, string>();
    const indexPath = this.expandHome('~/.codex/session_index.jsonl');
    if (!fs.existsSync(indexPath)) {
      this.codexThreadTitles = titleMap;
      return titleMap;
    }

    const parsed = await this.parseJsonLinesFile(indexPath);
    parsed.records.forEach((record) => {
      const id = this.readString(record.data, 'id');
      const title = this.readString(record.data, 'thread_name');
      if (id && title) {
        titleMap.set(id, title);
      }
    });
    this.codexThreadTitles = titleMap;
    return titleMap;
  }

  private summarizeCodexRecord(record: ParsedRecord): { title: string; detail: string } {
    const payloadType = record.payloadType ?? record.recordType;
    const payload = this.readRecord(record.data, 'payload');

    switch (payloadType) {
      case 'user_message':
        return {
          title: 'User prompt',
          detail: this.truncate(this.readString(payload, 'message') ?? 'User prompt'),
        };
      case 'agent_message':
        return {
          title: 'Assistant reply',
          detail: this.truncate(this.readString(payload, 'message') ?? 'Assistant response'),
        };
      case 'task_started':
        return {
          title: 'Turn started',
          detail: this.readString(payload, 'turn_id') ?? 'A new task turn started',
        };
      case 'task_complete':
        return {
          title: 'Turn completed',
          detail: this.truncate(this.readString(payload, 'last_agent_message') ?? 'Task completed'),
        };
      case 'token_count':
        return {
          title: 'Token snapshot',
          detail: this.formatCodexTokenUsage(record),
        };
      case 'function_call':
      case 'custom_tool_call':
        return {
          title: 'Tool call',
          detail: this.readString(payload, 'name') ?? 'Tool call executed',
        };
      default:
        return {
          title: payloadType,
          detail: this.truncate(record.raw),
        };
    }
  }

  private summarizeClaudeRecord(record: ParsedRecord): { title: string; detail: string } {
    switch (record.recordType) {
      case 'user': {
        const detail = this.extractClaudeUserPrompt(record.data) ?? 'User message';
        const isToolResult = Array.isArray(this.readUnknown(record.data, 'message', 'content'));
        return {
          title: isToolResult ? 'Tool result' : 'User prompt',
          detail: this.truncate(detail, 160),
        };
      }
      case 'assistant': {
        const summary = this.extractClaudeAssistantSummary(record.data);
        return {
          title: summary.label,
          detail: this.truncate(summary.detail, 160),
        };
      }
      case 'progress':
        return {
          title: 'Progress',
          detail: this.truncate(
            this.readString(record.data, 'data', 'hookName') ?? 'Progress event',
          ),
        };
      case 'queue-operation':
        return {
          title: 'Queue',
          detail: this.readString(record.data, 'operation') ?? 'Queue event',
        };
      case 'file-history-snapshot':
        return {
          title: 'File snapshot',
          detail: 'Tracked file backup updated',
        };
      default:
        return {
          title: record.recordType,
          detail: this.truncate(record.raw),
        };
    }
  }

  private extractCodexUsage(record: ParsedRecord): TokenUsageSnapshot | undefined {
    const usage = this.readRecord(
      this.readRecord(record.data, 'payload'),
      'info',
      'total_token_usage',
    );
    if (!usage) {
      return undefined;
    }

    const inputTokens = this.readNumber(usage, 'input_tokens') ?? 0;
    const outputTokens = this.readNumber(usage, 'output_tokens') ?? 0;
    const cachedTokens = this.readNumber(usage, 'cached_input_tokens') ?? 0;
    const totalTokens =
      this.readNumber(usage, 'total_tokens') ?? inputTokens + outputTokens + cachedTokens;
    const info = this.readRecord(this.readRecord(record.data, 'payload'), 'info');

    return {
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens,
      maxTokens: this.readNumber(info, 'model_context_window') ?? undefined,
    };
  }

  private extractClaudeUsage(record: Record<string, unknown>): TokenUsageSnapshot {
    const usage = this.readRecord(record, 'message', 'usage');
    const inputTokens = this.readNumber(usage, 'input_tokens') ?? 0;
    const outputTokens = this.readNumber(usage, 'output_tokens') ?? 0;
    const cachedTokens =
      (this.readNumber(usage, 'cache_creation_input_tokens') ?? 0) +
      (this.readNumber(usage, 'cache_read_input_tokens') ?? 0);

    return {
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens + cachedTokens,
    };
  }

  private extractClaudeUserPrompt(record: Record<string, unknown>): string | undefined {
    const direct = this.readString(record, 'message', 'content');
    if (direct) {
      return direct;
    }

    const content = this.readUnknown(record, 'message', 'content');
    if (!Array.isArray(content)) {
      return undefined;
    }

    for (const item of content) {
      const type = this.readString(item, 'type');
      if (type === 'text') {
        return this.readString(item, 'text') ?? undefined;
      }
      if (type === 'tool_result') {
        const result = this.readUnknown(item, 'content');
        if (typeof result === 'string') {
          return result;
        }
      }
    }

    return undefined;
  }

  private extractClaudeAssistantSummary(record: Record<string, unknown>): {
    label: string;
    detail: string;
    eventType: string;
  } {
    if (this.readString(record, 'error')) {
      return {
        label: 'Assistant error',
        detail: this.readString(record, 'error') ?? 'Assistant error',
        eventType: 'error',
      };
    }

    const content = this.readUnknown(record, 'message', 'content');
    if (!Array.isArray(content) || content.length === 0) {
      return {
        label: 'Assistant reply',
        detail: 'Assistant response',
        eventType: 'assistant',
      };
    }

    for (const item of content) {
      const type = this.readString(item, 'type');
      if (type === 'tool_use') {
        return {
          label: 'Tool use',
          detail: this.readString(item, 'name') ?? 'Tool call',
          eventType: 'tool',
        };
      }
      if (type === 'text') {
        return {
          label: 'Assistant reply',
          detail: this.readString(item, 'text') ?? 'Assistant response',
          eventType: 'assistant',
        };
      }
      if (type === 'thinking') {
        return {
          label: 'Thinking',
          detail: this.readString(item, 'thinking') ?? 'Reasoning step',
          eventType: 'thinking',
        };
      }
    }

    return {
      label: 'Assistant reply',
      detail: 'Assistant response',
      eventType: 'assistant',
    };
  }

  private formatCodexTokenUsage(record: ParsedRecord): string {
    const usage = this.extractCodexUsage(record);
    if (!usage) {
      return 'Token usage updated';
    }

    return `in ${usage.inputTokens.toLocaleString()} / out ${usage.outputTokens.toLocaleString()} / total ${usage.totalTokens.toLocaleString()}`;
  }

  private isBubbleEvent(payloadType: string): boolean {
    return [
      'user_message',
      'agent_message',
      'task_started',
      'task_complete',
      'function_call',
      'custom_tool_call',
      'token_count',
      'error',
    ].includes(payloadType);
  }

  private isClaudeBubbleEvent(recordType: string): boolean {
    return ['user', 'assistant', 'progress', 'queue-operation'].includes(recordType);
  }

  private getOrCreateCodexTurn(turns: Map<string, CodexTurnDraft>, turnId: string): CodexTurnDraft {
    const existing = turns.get(turnId);
    if (existing) {
      return existing;
    }

    const next: CodexTurnDraft = {
      turnId,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      payloadKb: 0,
      eventType: 'turn',
    };
    turns.set(turnId, next);
    return next;
  }

  private getActiveCodexTurn(
    turns: Map<string, CodexTurnDraft>,
    activeTurnId: string | null,
  ): CodexTurnDraft | undefined {
    if (activeTurnId && turns.has(activeTurnId)) {
      return turns.get(activeTurnId);
    }

    const ordered = [...turns.values()];
    return ordered[ordered.length - 1];
  }

  private diffUsage(current: TokenUsageSnapshot, previous: TokenUsageSnapshot): TokenUsageSnapshot {
    return {
      inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
      outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
      cachedTokens: Math.max(0, current.cachedTokens - previous.cachedTokens),
      totalTokens: Math.max(0, current.totalTokens - previous.totalTokens),
      maxTokens: current.maxTokens,
    };
  }

  private diffMs(from?: string, to?: string): number | undefined {
    if (!from || !to) {
      return undefined;
    }

    const start = new Date(from).valueOf();
    const end = new Date(to).valueOf();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return undefined;
    }

    return Math.max(0, end - start);
  }

  private positiveOrUndefined(value?: number): number | undefined {
    return typeof value === 'number' && value > 0 ? value : undefined;
  }

  private createSessionId(agent: ProfilerAgentType, seed: string, filePath: string): string {
    const digest = crypto
      .createHash('sha1')
      .update(`${seed}:${filePath}`)
      .digest('hex')
      .slice(0, 12);
    return `${agent}:${digest}`;
  }

  private createFallbackId(agent: ProfilerAgentType, filePath: string): string {
    return this.createSessionId(agent, filePath, filePath);
  }

  private expandHome(targetPath: string): string {
    if (!targetPath.startsWith('~')) {
      return targetPath;
    }
    return path.join(os.homedir(), targetPath.slice(1));
  }

  private truncate(value: string, length = 120): string {
    return value.length > length ? `${value.slice(0, length)}...` : value;
  }

  private readString(value: unknown, ...keys: string[]): string | undefined {
    const result = this.readUnknown(value, ...keys);
    return typeof result === 'string' ? result : undefined;
  }

  private readNumber(value: unknown, ...keys: string[]): number | undefined {
    const result = this.readUnknown(value, ...keys);
    return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
  }

  private readRecord(value: unknown, ...keys: string[]): Record<string, unknown> | undefined {
    const result = this.readUnknown(value, ...keys);
    return result && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : undefined;
  }

  private readUnknown(value: unknown, ...keys: string[]): unknown {
    let cursor = value;
    for (const key of keys) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    return cursor;
  }

  private async walkDirectory(
    rootPath: string,
    onFile: (filePath: string, stat: fs.Stats) => Promise<boolean> | boolean,
  ): Promise<boolean> {
    if (!rootPath || !fs.existsSync(rootPath)) {
      return false;
    }

    const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && SKIP_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        const shouldStop = await this.walkDirectory(entryPath, onFile);
        if (shouldStop) {
          return true;
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stat = await fs.promises.stat(entryPath);
      const shouldStop = await onFile(entryPath, stat);
      if (shouldStop) {
        return true;
      }
    }

    return false;
  }
}
