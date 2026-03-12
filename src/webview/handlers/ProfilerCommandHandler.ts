import * as fs from 'fs';
import * as vscode from 'vscode';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { ProfilerService } from '../../profiler/ProfilerService';
import { ProfilerStateManager } from '../../profiler/ProfilerStateManager';
import {
  HostToWebviewMessage,
  LogEntry,
  ProfilerAgentType,
  ProfilerDetailState,
} from '../../types';

const LIVE_POLL_INTERVAL_MS = 1500;
const MAX_LIVE_MESSAGES = 40;

interface LiveSessionTarget {
  agent: ProfilerAgentType;
  filePath: string;
  fileName: string;
  sessionId?: string;
  startedAt: string;
  lastSignature?: string;
}

export class ProfilerCommandHandler {
  private isScanning = false;
  private isArchiving = false;
  private livePollTimer?: NodeJS.Timeout;
  private liveTarget?: LiveSessionTarget;
  private liveMessages: LogEntry[] = [];

  constructor(
    private readonly webview: vscode.Webview,
    private readonly profilerStateManager: ProfilerStateManager,
    private readonly profilerService: ProfilerService,
    private readonly editorIntegration: EditorIntegration,
  ) {}

  private post(message: HostToWebviewMessage) {
    this.webview.postMessage(message);
  }

  postCurrentState() {
    this.post({ event: 'profiler.state', state: this.profilerStateManager.getOverviewState() });
    this.post({ event: 'profiler.detailState', state: this.profilerStateManager.getDetailState() });
  }

  async scan() {
    this.stopLiveData({ silent: true });
    if (this.isScanning) {
      return;
    }

    this.isScanning = true;
    this.profilerStateManager.setOverviewStatus('loading', '로딩중..');
    Logger.info('profiler', 'Profiler scan started');

    try {
      const overview = await this.profilerService.scan();
      this.profilerStateManager.setOverviewState(overview);
      this.profilerStateManager.resetDetail('세션을 선택하면 상세 분석이 표시됩니다.');
      Logger.success(
        'profiler',
        'Profiler scan completed',
        `${overview.aggregate.totalSessions} sessions discovered`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.profilerStateManager.setOverviewStatus('error', message);
      Logger.error('profiler', 'Profiler scan failed', message);
    } finally {
      this.isScanning = false;
    }
  }

  async selectSession(id: string, agent: ProfilerAgentType) {
    this.stopLiveData({ silent: true });
    this.profilerStateManager.setSelectedSession(agent, id);
    this.profilerStateManager.setDetailLoading(id, '로딩중..');
    Logger.info('profiler', 'Profiler session selected', `${agent}:${id}`);
    try {
      await vscode.commands.executeCommand(
        'workbench.view.extension.iagent-engineer-profiler-panel',
      );
    } catch {
      // Ignore focus errors; detail updates are still pushed to the panel state.
    }

    try {
      const detail = await this.profilerService.getDetail(id);
      this.profilerStateManager.setDetail(detail);
      Logger.success('profiler', 'Profiler detail ready', detail.summary.fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.profilerStateManager.setDetailState({
        status: 'error',
        sessionId: id,
        message,
      });
      Logger.error('profiler', 'Failed to load profiler detail', message);
    }
  }

  async startLiveData() {
    if (this.isScanning || this.isArchiving) {
      return;
    }

    this.stopLiveData({ silent: true });
    this.liveMessages = [];

    await this.focusDetailPanel();

    this.appendLiveMessage('info', 'Searching for the most recent live session file');
    this.profilerStateManager.setDetailState({
      status: 'loading',
      message: '라이브 세션을 찾는 중입니다.',
      live: this.getLiveState({
        active: true,
        status: 'connecting',
      }),
    });

    try {
      const summary = await this.profilerService.getLatestSessionSummary();
      if (!summary) {
        throw new Error('현재 진행 중인 세션 파일을 찾지 못했습니다.');
      }

      this.liveTarget = {
        agent: summary.agent,
        filePath: summary.filePath,
        fileName: summary.fileName,
        sessionId: summary.id,
        startedAt: new Date().toISOString(),
      };

      this.profilerStateManager.setSelectedSession(summary.agent, summary.id);
      this.appendLiveMessage(
        'success',
        'Live session attached',
        `${summary.agent.toUpperCase()} · ${summary.fileName}`,
      );

      await this.refreshLiveData(true);
      this.livePollTimer = setInterval(() => {
        void this.refreshLiveData();
      }, LIVE_POLL_INTERVAL_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendLiveMessage('error', 'Live session attach failed', message);
      this.profilerStateManager.setDetailState({
        status: 'error',
        message,
        live: this.getLiveState({
          active: false,
          status: 'error',
        }),
      });
      Logger.error('profiler', 'Failed to start live profiler data', message);
      this.stopLiveTimer();
      this.liveTarget = undefined;
    }
  }

  stopLiveData(options?: { silent?: boolean; message?: string }) {
    const hadLive = Boolean(this.liveTarget || this.livePollTimer);
    this.stopLiveTimer();
    this.liveTarget = undefined;

    if (!hadLive) {
      this.liveMessages = [];
      return;
    }

    if (options?.silent) {
      this.liveMessages = [];
      const current = this.profilerStateManager.getDetailState();
      this.profilerStateManager.setDetailState({
        ...current,
        live: {
          active: false,
          status: 'idle',
          messages: [],
        },
      });
      return;
    }

    this.appendLiveMessage('warn', 'Live session monitoring stopped');
    const current = this.profilerStateManager.getDetailState();
    this.profilerStateManager.setDetailState({
      status: current.detail ? 'ready' : 'idle',
      sessionId: current.sessionId,
      detail: current.detail,
      message: options?.message ?? '라이브 데이터 모니터링을 중지했습니다.',
      live: this.getLiveState({
        active: false,
        status: 'stopped',
      }),
    });
  }

  async archiveAll() {
    if (this.isArchiving) {
      return;
    }

    const overview = this.profilerStateManager.getOverviewState();
    if (overview.aggregate.totalSessions === 0) {
      this.profilerStateManager.setOverviewStatus('error', '아카이브할 세션이 없습니다.');
      return;
    }

    const target = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Archive Sessions Here',
    });
    if (!target?.[0]) {
      return;
    }

    this.isArchiving = true;
    this.profilerStateManager.setOverviewStatus('loading', '로딩중..');
    try {
      const result = await this.profilerService.archiveAll(target[0].fsPath);
      this.profilerStateManager.setOverviewStatus(
        'ready',
        `${result.fileCount} files archived to ${result.targetPath}`,
      );
      this.post({ event: 'profiler.archiveResult', result });
      Logger.success(
        'profiler',
        'Profiler archive completed',
        `${result.fileCount} files -> ${result.targetPath}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.profilerStateManager.setOverviewStatus('error', message);
      Logger.error('profiler', 'Profiler archive failed', message);
    } finally {
      this.isArchiving = false;
    }
  }

  async openSource(filePath: string, lineNumber?: number) {
    await this.editorIntegration.openFileAtLine(filePath, lineNumber);
  }

  dispose() {
    this.stopLiveTimer();
    this.liveTarget = undefined;
    this.liveMessages = [];
  }

  private async refreshLiveData(force = false) {
    if (!this.liveTarget) {
      return;
    }

    try {
      const stat = await fs.promises.stat(this.liveTarget.filePath);
      const signature = `${stat.size}:${stat.mtimeMs}`;
      if (!force && this.liveTarget.lastSignature === signature) {
        return;
      }

      const snapshot = await this.profilerService.refreshSessionDetail(
        this.liveTarget.agent,
        this.liveTarget.filePath,
      );
      this.liveTarget = {
        ...this.liveTarget,
        sessionId: snapshot.summary.id,
        fileName: snapshot.summary.fileName,
        lastSignature: signature,
      };

      if (force) {
        this.appendLiveMessage(
          'info',
          'Live chart initialized',
          `${snapshot.detail.timeline.length} timeline points loaded`,
        );
      } else {
        this.appendLiveMessage(
          'info',
          'Live session updated',
          `${snapshot.detail.timeline.length} timeline points · ${snapshot.detail.rawEvents.length} events`,
        );
      }

      if (snapshot.summary.warnings.length > 0) {
        this.appendLiveMessage('warn', 'Partial records detected', snapshot.summary.warnings[0]);
      }

      this.profilerStateManager.setSelectedSession(snapshot.summary.agent, snapshot.summary.id);
      this.profilerStateManager.setDetailState({
        status: 'ready',
        sessionId: snapshot.summary.id,
        detail: snapshot.detail,
        message: `Live session: ${snapshot.summary.fileName}`,
        live: this.getLiveState({
          active: true,
          status: 'streaming',
          agent: snapshot.summary.agent,
          filePath: snapshot.summary.filePath,
          fileName: snapshot.summary.fileName,
          updatedAt: snapshot.summary.modifiedAt,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendLiveMessage('error', 'Live update failed', message);
      const current = this.profilerStateManager.getDetailState();
      this.profilerStateManager.setDetailState({
        status: current.detail ? 'ready' : 'error',
        sessionId: current.sessionId,
        detail: current.detail,
        message,
        live: this.getLiveState({
          active: true,
          status: 'error',
        }),
      });
      Logger.error('profiler', 'Live profiler refresh failed', message);
    }
  }

  private async focusDetailPanel() {
    try {
      await vscode.commands.executeCommand(
        'workbench.view.extension.iagent-engineer-profiler-panel',
      );
    } catch {
      // Ignore focus errors; detail state updates are still pushed to the panel.
    }
  }

  private appendLiveMessage(
    level: LogEntry['level'],
    message: string,
    detail?: string,
  ): ProfilerDetailState['live'] {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      layer: 'profiler',
      message,
      detail,
    };
    this.liveMessages = [...this.liveMessages.slice(-(MAX_LIVE_MESSAGES - 1)), entry];
    return this.getLiveState();
  }

  private getLiveState(
    overrides?: Partial<NonNullable<ProfilerDetailState['live']>>,
  ): NonNullable<ProfilerDetailState['live']> {
    return {
      active: Boolean(this.liveTarget),
      status: this.liveTarget ? 'streaming' : 'idle',
      agent: this.liveTarget?.agent,
      filePath: this.liveTarget?.filePath,
      fileName: this.liveTarget?.fileName,
      startedAt: this.liveTarget?.startedAt,
      updatedAt: overrides?.updatedAt ?? this.liveTarget?.startedAt,
      messages: this.liveMessages,
      ...overrides,
    };
  }

  private stopLiveTimer() {
    if (!this.livePollTimer) {
      return;
    }
    clearInterval(this.livePollTimer);
    this.livePollTimer = undefined;
  }
}
