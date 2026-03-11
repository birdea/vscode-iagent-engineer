import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_KEYS } from '../constants';
import {
  ProfilerAggregate,
  ProfilerAgentType,
  ProfilerArchiveResult,
  ProfilerOverviewState,
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

    let detail: SessionDetail;
    switch (file.agent) {
      case 'codex':
        detail = await this.analyzeCodexSession(file, summary);
        break;
      case 'claude':
        detail = await this.analyzeClaudeSession(file, summary);
        break;
      case 'gemini':
        detail = await this.analyzeGenericSession(file, summary);
        break;
      default:
        throw new Error('Unsupported profiler session agent.');
    }

    this.detailCache.set(sessionId, detail);
    return detail;
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
        return this.summarizeGenericFile(file);
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

  private async summarizeGenericFile(file: DiscoveredSessionFile): Promise<SessionSummary> {
    const parsed = await this.parseFlexibleFile(file.filePath);
    const id = this.createSessionId(
      file.agent,
      parsed.sessionId ?? this.createFallbackId(file.agent, file.filePath),
      file.filePath,
    );
    this.fileCache.set(id, file);

    return {
      id,
      agent: file.agent,
      filePath: file.filePath,
      fileName: path.basename(file.filePath),
      title: parsed.title,
      modifiedAt: file.stat.mtime.toISOString(),
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      fileSizeBytes: file.stat.size,
      model: parsed.model,
      totalInputTokens: parsed.totalInputTokens,
      totalOutputTokens: parsed.totalOutputTokens,
      totalCachedTokens: parsed.totalCachedTokens,
      totalTokens: parsed.totalTokens,
      requestCount: parsed.requestCount,
      parseStatus: parsed.parseStatus,
      warnings: parsed.warnings,
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
      const excerpt = record.raw.length > 260 ? `${record.raw.slice(0, 260)}...` : record.raw;
      rawEvents.push({
        id: rawEventId,
        filePath: file.filePath,
        lineNumber: record.lineNumber,
        timestamp: record.timestamp,
        eventType: record.payloadType ?? record.recordType,
        summary: summaryLine.title,
        excerpt,
        payloadKb: record.payloadKb,
      });

      if (record.recordType === 'session_meta') {
        cwd = this.readString(record.data.payload, 'cwd') ?? cwd;
        provider = this.readString(record.data.payload, 'model_provider') ?? provider;
      }

      const payload = this.readRecord(record.data, 'payload');
      const timestamp = record.timestamp;
      const payloadType = record.payloadType ?? record.recordType;

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
        const usage = this.extractCodexUsage(record);
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
        sessionId: summary.id.replace(`${summary.agent}:`, ''),
        cwd: cwd || undefined,
        provider: provider || undefined,
        sourceFormat: 'jsonl',
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
      const excerpt = record.raw.length > 260 ? `${record.raw.slice(0, 260)}...` : record.raw;
      rawEvents.push({
        id: rawEventId,
        filePath: file.filePath,
        lineNumber: record.lineNumber,
        timestamp: record.timestamp,
        eventType: record.recordType,
        summary: summaryLine.title,
        excerpt,
        payloadKb: record.payloadKb,
      });

      cwd = this.readString(record.data, 'cwd') ?? cwd;

      if (this.isClaudeBubbleEvent(record.recordType)) {
        eventBubbles.push({
          id: rawEventId,
          timestamp: record.timestamp ?? summary.modifiedAt,
          title: summaryLine.title,
          detail: summaryLine.detail,
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
        sessionId: this.readString(parsed.records[0]?.data, 'sessionId') ?? undefined,
        cwd: cwd || undefined,
        provider: 'anthropic',
        sourceFormat: 'jsonl',
      },
      timeline,
      eventBubbles: eventBubbles.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      rawEvents: rawEvents.sort(
        (a, b) =>
          (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.lineNumber - b.lineNumber,
      ),
    };
  }

  private async analyzeGenericSession(
    file: DiscoveredSessionFile,
    summary: SessionSummary,
  ): Promise<SessionDetail> {
    return {
      summary,
      metadata: {
        sourceFormat: path.extname(file.filePath).replace('.', '') || 'unknown',
      },
      timeline: [],
      eventBubbles: [],
      rawEvents: [
        {
          id: `${summary.id}:1`,
          filePath: file.filePath,
          lineNumber: 1,
          summary: 'Generic session file',
          excerpt: 'Detailed parsing is not yet available for this agent format.',
          eventType: 'unsupported',
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
