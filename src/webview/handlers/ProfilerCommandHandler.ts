import * as vscode from 'vscode';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { ProfilerService } from '../../profiler/ProfilerService';
import { ProfilerStateManager } from '../../profiler/ProfilerStateManager';
import { HostToWebviewMessage, ProfilerAgentType } from '../../types';

export class ProfilerCommandHandler {
  private isScanning = false;
  private isArchiving = false;

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
}
