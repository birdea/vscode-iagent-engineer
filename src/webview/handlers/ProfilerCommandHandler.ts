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
    this.profilerLiveMonitor.stop({ silent: true });
    if (this.isScanning) {
      return;
    }

    const previousOverview = this.profilerStateManager.getOverviewState();
    const preferredAgent = this.normalizeSelectedAgent(
      options?.preferredAgent ?? previousOverview.selectedAgent,
    );
    const preferredSessionId = previousOverview.selectedSessionId;

    this.isScanning = true;
    this.profilerStateManager.setOverviewStatus('loading', '로딩중..');
    Logger.info('profiler', 'Profiler scan started');

    try {
      const overview = await this.profilerService.scan(preferredAgent);
      const nextOverview = {
        ...overview,
        selectedAgent: preferredAgent,
      };
      this.profilerStateManager.setOverviewState(nextOverview);
      if (options?.loadInitialSession) {
        const initialSession = this.pickInitialSession(nextOverview, preferredSessionId);
        if (initialSession) {
          await this.loadSession(initialSession.id, initialSession.agent, { focusPanel: false });
        } else {
          this.profilerStateManager.resetDetail('세션을 선택하면 상세 분석이 표시됩니다.');
        }
      } else {
        this.profilerStateManager.resetDetail('세션을 선택하면 상세 분석이 표시됩니다.');
      }
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

  async selectAgent(agent: ProfilerAgentType) {
    const selectedAgent = this.normalizeSelectedAgent(agent);
    this.profilerStateManager.setSelectedAgent(selectedAgent);
    await this.context.globalState.update(CONFIG_KEYS.PROFILER_SELECTED_TAB, selectedAgent);
  }

  async selectSession(id: string, agent: ProfilerAgentType) {
    await this.loadSession(id, agent);
  }

  async startLiveData(id?: string, agent?: ProfilerAgentType) {
    if (this.isScanning || this.isArchiving) {
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

  async openInfoDoc(kind: 'profiler' | 'summary' | 'key-events') {
    await this.editorIntegration.openProfilerInfoDocument(kind);
  }

  dispose() {}

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
    return agent === 'codex' ? 'codex' : 'claude';
  }

  private pickInitialSession(
    overview: ProfilerOverviewState,
    preferredSessionId?: string,
  ): SessionSummary | undefined {
    if (preferredSessionId) {
      for (const agent of ['claude', 'codex', 'gemini'] as const) {
        const matched = overview.sessionsByAgent[agent].find(
          (session) => session.id === preferredSessionId,
        );
        if (matched) {
          return matched;
        }
      }
    }

    const selectedSessions = overview.sessionsByAgent[overview.selectedAgent] ?? [];
    return selectedSessions[0];
  }
}
