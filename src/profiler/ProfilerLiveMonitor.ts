import * as fs from 'fs';
import * as vscode from 'vscode';
import { Logger } from '../logger/Logger';
import { ProfilerService } from './ProfilerService';
import { ProfilerStateManager } from './ProfilerStateManager';
import { LogEntry, ProfilerAgentType, ProfilerDetailState } from '../types';

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

export class ProfilerLiveMonitor {
  private pollTimer?: NodeJS.Timeout;
  private target?: LiveSessionTarget;
  private messages: LogEntry[] = [];
  private revision = 0;

  constructor(
    private readonly profilerStateManager: ProfilerStateManager,
    private readonly profilerService: ProfilerService,
  ) {}

  async start() {
    const revision = this.beginSession();

    await this.focusDetailPanel();

    this.appendMessage('info', 'Searching for the most recent live session file');
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
      if (!this.isCurrentRevision(revision)) {
        return;
      }
      if (!summary) {
        throw new Error('현재 진행 중인 세션 파일을 찾지 못했습니다.');
      }

      const target: LiveSessionTarget = {
        agent: summary.agent,
        filePath: summary.filePath,
        fileName: summary.fileName,
        sessionId: summary.id,
        startedAt: new Date().toISOString(),
      };
      this.target = target;

      this.profilerStateManager.setSelectedSession(summary.agent, summary.id);
      this.appendMessage(
        'success',
        'Live session attached',
        `${summary.agent.toUpperCase()} · ${summary.fileName}`,
      );

      const refreshed = await this.refreshLiveData(revision, target, true);
      if (!refreshed || !this.isCurrentTarget(revision, target)) {
        return;
      }

      this.pollTimer = setInterval(() => {
        void this.refreshLiveData(revision, target);
      }, LIVE_POLL_INTERVAL_MS);
    } catch (error) {
      if (!this.isCurrentRevision(revision)) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.appendMessage('error', 'Live session attach failed', message);
      this.profilerStateManager.setDetailState({
        status: 'error',
        message,
        live: this.getLiveState({
          active: false,
          status: 'error',
        }),
      });
      Logger.error('profiler', 'Failed to start live profiler data', message);
      this.stopTimer();
      this.target = undefined;
    }
  }

  stop(options?: { silent?: boolean; message?: string }) {
    const hadLive = Boolean(
      this.target ||
      this.pollTimer ||
      this.profilerStateManager.getDetailState().live?.active ||
      this.messages.length,
    );
    this.revision += 1;
    this.stopTimer();
    this.target = undefined;

    if (!hadLive) {
      this.messages = [];
      return;
    }

    const current = this.profilerStateManager.getDetailState();
    if (options?.silent) {
      this.messages = [];
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

    this.appendMessage('warn', 'Live session monitoring stopped');
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

  dispose() {
    this.stop({ silent: true });
  }

  private beginSession(): number {
    this.revision += 1;
    this.stopTimer();
    this.target = undefined;
    this.messages = [];
    return this.revision;
  }

  private async refreshLiveData(
    revision: number,
    expectedTarget: LiveSessionTarget,
    force = false,
  ): Promise<boolean> {
    if (!this.isCurrentTarget(revision, expectedTarget)) {
      return false;
    }

    try {
      const stat = await fs.promises.stat(expectedTarget.filePath);
      if (!this.isCurrentTarget(revision, expectedTarget)) {
        return false;
      }

      const currentTarget = this.target;
      const signature = `${stat.size}:${stat.mtimeMs}`;
      if (!currentTarget) {
        return false;
      }
      if (!force && currentTarget.lastSignature === signature) {
        return false;
      }

      const snapshot = await this.profilerService.refreshSessionDetail(
        expectedTarget.agent,
        expectedTarget.filePath,
      );
      if (!this.isCurrentTarget(revision, expectedTarget)) {
        return false;
      }

      this.target = {
        ...expectedTarget,
        sessionId: snapshot.summary.id,
        fileName: snapshot.summary.fileName,
        lastSignature: signature,
      };

      if (force) {
        this.appendMessage(
          'info',
          'Live chart initialized',
          `${snapshot.detail.timeline.length} timeline points loaded`,
        );
      } else {
        this.appendMessage(
          'info',
          'Live session updated',
          `${snapshot.detail.timeline.length} timeline points · ${snapshot.detail.rawEvents.length} events`,
        );
      }

      if (snapshot.summary.warnings.length > 0) {
        this.appendMessage('warn', 'Partial records detected', snapshot.summary.warnings[0]);
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
      return true;
    } catch (error) {
      if (!this.isCurrentTarget(revision, expectedTarget)) {
        return false;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.appendMessage('error', 'Live update failed', message);
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
      return false;
    }
  }

  private isCurrentRevision(revision: number): boolean {
    return this.revision === revision;
  }

  private isCurrentTarget(revision: number, expectedTarget: LiveSessionTarget): boolean {
    if (!this.isCurrentRevision(revision) || !this.target) {
      return false;
    }

    return (
      this.target.agent === expectedTarget.agent &&
      this.target.filePath === expectedTarget.filePath &&
      this.target.startedAt === expectedTarget.startedAt
    );
  }

  private appendMessage(level: LogEntry['level'], message: string, detail?: string) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      layer: 'profiler',
      message,
      detail,
    };
    this.messages = [...this.messages.slice(-(MAX_LIVE_MESSAGES - 1)), entry];
  }

  private getLiveState(
    overrides?: Partial<NonNullable<ProfilerDetailState['live']>>,
  ): NonNullable<ProfilerDetailState['live']> {
    return {
      active: Boolean(this.target),
      status: this.target ? 'streaming' : 'idle',
      agent: this.target?.agent,
      filePath: this.target?.filePath,
      fileName: this.target?.fileName,
      startedAt: this.target?.startedAt,
      updatedAt: overrides?.updatedAt ?? this.target?.startedAt,
      messages: this.messages,
      ...overrides,
    };
  }

  private stopTimer() {
    if (!this.pollTimer) {
      return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
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
}
