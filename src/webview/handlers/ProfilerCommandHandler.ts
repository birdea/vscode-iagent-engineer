import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_KEYS } from '../../constants';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { ProfilerLiveMonitor } from '../../profiler/ProfilerLiveMonitor';
import { ProfilerService } from '../../profiler/ProfilerService';
import { ProfilerStateManager } from '../../profiler/ProfilerStateManager';
import { isSessionLikelyLive } from '../../profiler/ProfilerLiveUtils';
import {
  HostToWebviewMessage,
  ProfilerAgentType,
  ProfilerOverviewState,
  SessionSummary,
} from '../../types';

export class ProfilerCommandHandler {
  private isScanning = false;
  private isArchiving = false;
  private isDeleting = false;
  private startupPromise?: Promise<void>;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly context: vscode.ExtensionContext,
    private readonly profilerStateManager: ProfilerStateManager,
    private readonly profilerService: ProfilerService,
    private readonly editorIntegration: EditorIntegration,
    private readonly profilerLiveMonitor: ProfilerLiveMonitor,
  ) {}

  private post(message: HostToWebviewMessage) {
    this.webview.postMessage(message);
  }

  async postCurrentState() {
    await this.ensureStartupState();
    this.post({ event: 'profiler.state', state: this.profilerStateManager.getOverviewState() });
    this.post({ event: 'profiler.detailState', state: this.profilerStateManager.getDetailState() });
  }

  async scan(options?: { preferredAgent?: ProfilerAgentType; loadInitialSession?: boolean }) {
    await this.runOverviewScan({
      preferredAgent: options?.preferredAgent,
      loadInitialSession: options?.loadInitialSession,
      stopLiveMonitoring: true,
      resetDetailWhenDone: true,
      showLoading: true,
      logLabel: 'Profiler scan',
    });
  }

  async refreshOverview(agent?: ProfilerAgentType) {
    await this.runOverviewScan({
      preferredAgent: agent,
      preserveDetail: true,
      stopLiveMonitoring: false,
      resetDetailWhenDone: false,
      showLoading: false,
      logLabel: 'Profiler refresh',
    });
  }

  async selectAgent(agent: ProfilerAgentType) {
    const selectedAgent = this.normalizeSelectedAgent(agent);
    this.profilerStateManager.setSelectedAgent(selectedAgent);
    await this.context.globalState.update(CONFIG_KEYS.PROFILER_SELECTED_TAB, selectedAgent);
  }

  async selectSession(id: string, agent: ProfilerAgentType) {
    await this.loadSession(id, agent);
  }

  async setRefreshPeriod(refreshPeriodMs: number) {
    const nextValue = Number.isFinite(refreshPeriodMs)
      ? Math.max(0, Math.trunc(refreshPeriodMs))
      : 0;
    await vscode.workspace
      .getConfiguration()
      .update(CONFIG_KEYS.PROFILER_REFRESH_PERIOD_MS, nextValue, vscode.ConfigurationTarget.Global);
  }

  async deleteSessions(ids: string[], agent: ProfilerAgentType) {
    await this.deleteSessionSet(ids, agent, 'selected');
  }

  async deleteAllSessions(agent: ProfilerAgentType) {
    const normalizedAgent = this.normalizeSelectedAgent(agent);
    const sessions =
      this.profilerStateManager.getOverviewState().sessionsByAgent[normalizedAgent] ?? [];
    await this.deleteSessionSet(
      sessions.map((session) => session.id),
      normalizedAgent,
      'agent',
    );
  }

  async startLiveData(id?: string, agent?: ProfilerAgentType) {
    if (this.isScanning || this.isArchiving || this.isDeleting) {
      return;
    }
    if (id && agent) {
      const sessions = this.profilerStateManager.getOverviewState().sessionsByAgent[agent] ?? [];
      const summary = sessions.find((session) => session.id === id);
      if (summary) {
        await this.profilerLiveMonitor.startSession(summary, { focusPanel: false });
        return;
      }
    }
    await this.profilerLiveMonitor.start();
  }

  stopLiveData(options?: { silent?: boolean; message?: string }) {
    this.profilerLiveMonitor.stop(options);
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

    const downloadsDir = path.join(os.homedir(), 'Downloads');
    const defaultUri = vscode.Uri.file(downloadsDir);
    const target = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Archive Sessions Here',
      defaultUri,
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

  async copyFilePath(filePath: string) {
    await this.editorIntegration.copyFilePath(filePath);
  }

  async revealInFolder(filePath: string) {
    await this.editorIntegration.revealFileInFolder(filePath);
  }

  async openInfoDoc(kind: 'profiler' | 'summary' | 'key-events') {
    await this.editorIntegration.openProfilerInfoDocument(kind);
  }

  dispose() {}

  private async deleteSessionSet(
    sessionIds: string[],
    agent: ProfilerAgentType,
    scope: 'selected' | 'agent',
  ) {
    if (this.isDeleting || this.isScanning || this.isArchiving) {
      return;
    }

    const selectedAgent = this.normalizeSelectedAgent(agent);
    const sessions =
      this.profilerStateManager.getOverviewState().sessionsByAgent[selectedAgent] ?? [];
    const availableIds = new Set(sessions.map((session) => session.id));
    const targetIds = [...new Set(sessionIds)].filter((id) => availableIds.has(id));

    if (targetIds.length === 0) {
      this.profilerStateManager.setOverviewStatus(
        'error',
        scope === 'selected' ? '삭제할 선택 세션이 없습니다.' : '현재 탭에 삭제할 세션이 없습니다.',
      );
      return;
    }

    const confirmed = await this.confirmDelete(scope, selectedAgent, targetIds.length);
    if (!confirmed) {
      return;
    }

    const currentDetail = this.profilerStateManager.getDetailState();
    const shouldResetDetail = Boolean(
      currentDetail.sessionId && targetIds.includes(currentDetail.sessionId),
    );

    if (shouldResetDetail) {
      this.profilerLiveMonitor.stop({ silent: true });
      this.profilerStateManager.resetDetail('세션을 선택하면 상세 분석이 표시됩니다.');
    }

    this.isDeleting = true;
    this.profilerStateManager.setOverviewStatus('loading', '로딩중..');

    try {
      const result = await this.profilerService.deleteSessions(targetIds);
      await this.runOverviewScan({
        preferredAgent: selectedAgent,
        preserveDetail: !shouldResetDetail,
        stopLiveMonitoring: false,
        resetDetailWhenDone: false,
        showLoading: false,
        logLabel: 'Profiler delete refresh',
      });

      const message = this.getDeleteResultMessage(
        scope,
        selectedAgent,
        result.deletedIds.length,
        result.failedIds.length,
      );
      this.profilerStateManager.setOverviewStatus(
        result.failedIds.length > 0 ? 'error' : 'ready',
        message,
      );

      if (result.failedIds.length > 0) {
        Logger.error('profiler', 'Profiler delete partially failed', message);
      } else {
        Logger.success('profiler', 'Profiler delete completed', message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.profilerStateManager.setOverviewStatus('error', message);
      Logger.error('profiler', 'Profiler delete failed', message);
    } finally {
      this.isDeleting = false;
    }
  }

  private async loadSession(
    id: string,
    agent: ProfilerAgentType,
    options?: { focusPanel?: boolean },
  ) {
    this.profilerLiveMonitor.stop({ silent: true });
    this.profilerStateManager.setSelectedSession(agent, id);
    Logger.info('profiler', 'Profiler session selected', `${agent}:${id}`);
    if (options?.focusPanel !== false) {
      try {
        await vscode.commands.executeCommand(
          'workbench.view.extension.iagent-engineer-profiler-panel',
        );
      } catch {
        // Ignore focus errors; detail updates are still pushed to the panel state.
      }
    }

    const sessions = this.profilerStateManager.getOverviewState().sessionsByAgent[agent] ?? [];
    const summary = sessions.find((session) => session.id === id);
    if (summary && isSessionLikelyLive(summary, sessions)) {
      await this.profilerLiveMonitor.startSession(summary, { focusPanel: false });
      return;
    }

    this.profilerStateManager.setDetailLoading(id, '로딩중..');
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

  private async ensureStartupState() {
    if (this.startupPromise) {
      await this.startupPromise;
      return;
    }

    this.startupPromise = this.initializeStartupState();
    await this.startupPromise;
  }

  private async initializeStartupState() {
    const overview = this.profilerStateManager.getOverviewState();
    if (overview.status !== 'idle' || overview.aggregate.totalSessions > 0) {
      return;
    }

    const selectedAgent = this.getStoredSelectedAgent();
    if (overview.selectedAgent !== selectedAgent) {
      this.profilerStateManager.setSelectedAgent(selectedAgent);
    }

    await this.scan({
      preferredAgent: selectedAgent,
      loadInitialSession: true,
    });
  }

  private getStoredSelectedAgent(): ProfilerAgentType {
    const storedAgent = this.context.globalState.get<ProfilerAgentType>(
      CONFIG_KEYS.PROFILER_SELECTED_TAB,
      'claude',
    );
    return this.normalizeSelectedAgent(storedAgent);
  }

  private normalizeSelectedAgent(agent?: ProfilerAgentType): ProfilerAgentType {
    if (agent === 'codex') return 'codex';
    if (agent === 'gemini') return 'gemini';
    return 'claude';
  }

  private async runOverviewScan(options: {
    preferredAgent?: ProfilerAgentType;
    loadInitialSession?: boolean;
    preserveDetail?: boolean;
    stopLiveMonitoring: boolean;
    resetDetailWhenDone: boolean;
    showLoading: boolean;
    logLabel: string;
  }) {
    if (options.stopLiveMonitoring) {
      this.profilerLiveMonitor.stop({ silent: true });
    }
    if (this.isScanning) {
      return;
    }

    const previousOverview = this.profilerStateManager.getOverviewState();
    const currentDetail = this.profilerStateManager.getDetailState();
    const preferredAgent = this.normalizeSelectedAgent(
      options.preferredAgent ?? previousOverview.selectedAgent,
    );
    const preferredSessionId = currentDetail.sessionId ?? previousOverview.selectedSessionId;

    this.isScanning = true;
    if (options.showLoading) {
      this.profilerStateManager.setOverviewStatus('loading', '로딩중..');
    }
    Logger.info('profiler', `${options.logLabel} started`);

    try {
      const overview = await this.profilerService.scan(preferredAgent);
      
      const latestOverview = this.profilerStateManager.getOverviewState();
      const finalAgent = latestOverview.selectedAgent !== previousOverview.selectedAgent
        ? latestOverview.selectedAgent
        : preferredAgent;

      const latestDetail = this.profilerStateManager.getDetailState();
      const targetSessionId = latestDetail.sessionId !== currentDetail.sessionId
        ? latestDetail.sessionId
        : preferredSessionId;

      const selectedSummary = this.findSessionById(overview, targetSessionId);
      const nextOverview = {
        ...overview,
        selectedAgent: finalAgent,
        selectedSessionId: selectedSummary?.id,
        updatedAt: new Date().toISOString(),
      };

      this.profilerStateManager.setOverviewState(nextOverview);

      if (options.loadInitialSession) {
        const initialSession = selectedSummary ?? this.pickInitialSession(nextOverview);
        if (initialSession) {
          await this.loadSession(initialSession.id, initialSession.agent, { focusPanel: false });
        } else {
          this.profilerStateManager.resetDetail('세션을 선택하면 상세 분석이 표시됩니다.');
        }
      } else if (options.resetDetailWhenDone) {
        this.profilerStateManager.resetDetail('세션을 선택하면 상세 분석이 표시됩니다.');
      } else if (
        !options.preserveDetail &&
        latestDetail.detail &&
        !this.findSessionById(nextOverview, latestDetail.detail.summary.id)
      ) {
        this.profilerStateManager.resetDetail('세션을 선택하면 상세 분석이 표시됩니다.');
      }

      Logger.success(
        'profiler',
        `${options.logLabel} completed`,
        `${overview.aggregate.totalSessions} sessions discovered`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.profilerStateManager.setOverviewStatus('error', message);
      Logger.error('profiler', `${options.logLabel} failed`, message);
    } finally {
      this.isScanning = false;
    }
  }

  private pickInitialSession(overview: ProfilerOverviewState): SessionSummary | undefined {
    const selectedSessions = overview.sessionsByAgent[overview.selectedAgent] ?? [];
    return selectedSessions[0];
  }

  private async confirmDelete(
    scope: 'selected' | 'agent',
    agent: ProfilerAgentType,
    fileCount: number,
  ): Promise<boolean> {
    const agentLabel = this.getAgentLabel(agent);
    const message =
      scope === 'selected'
        ? `선택한 ${fileCount}개 세션 파일을 휴지통으로 이동할까요?`
        : `현재 ${agentLabel} 탭의 세션 파일 ${fileCount}개 전체를 휴지통으로 이동할까요?`;
    const detail =
      scope === 'selected'
        ? `${agentLabel} 탭에서 선택한 파일만 삭제합니다.`
        : '이 작업은 현재 탭에 보이는 세션 파일 전체에 적용됩니다.';
    const confirmLabel = '휴지통으로 이동';
    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true, detail },
      confirmLabel,
    );
    return choice === confirmLabel;
  }

  private getDeleteResultMessage(
    scope: 'selected' | 'agent',
    agent: ProfilerAgentType,
    deletedCount: number,
    failedCount: number,
  ): string {
    const targetLabel = scope === 'selected' ? '선택 세션' : `${this.getAgentLabel(agent)} 탭 세션`;
    if (failedCount > 0) {
      return `${targetLabel} ${deletedCount}개 삭제, ${failedCount}개 실패`;
    }
    return `${targetLabel} ${deletedCount}개를 휴지통으로 이동했습니다.`;
  }

  private getAgentLabel(agent: ProfilerAgentType): string {
    return agent === 'codex' ? 'Codex' : agent === 'claude' ? 'Claude' : 'Gemini';
  }

  private findSessionById(
    overview: ProfilerOverviewState,
    sessionId?: string,
  ): SessionSummary | undefined {
    if (!sessionId) {
      return undefined;
    }

    for (const agent of ['claude', 'codex', 'gemini'] as const) {
      const matched = overview.sessionsByAgent[agent].find((session) => session.id === sessionId);
      if (matched) {
        return matched;
      }
    }

    return undefined;
  }
}
