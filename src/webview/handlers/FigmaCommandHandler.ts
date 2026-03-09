import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { McpClient } from '../../figma/McpClient';
import { RemoteFigmaApiClient } from '../../figma/RemoteFigmaApiClient';
import { RemoteFigmaAuthService } from '../../figma/RemoteFigmaAuthService';
import { parseMcpData } from '../../figma/McpParser';
import { ScreenshotService } from '../../figma/ScreenshotService';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { ConnectionMode, HostToWebviewMessage } from '../../types';
import { CONFIG_KEYS, DEFAULT_MCP_ENDPOINT } from '../../constants';
import { StateManager } from '../../state/StateManager';
import { UiLocale, t } from '../../i18n';
import { toErrorMessage } from '../../errors';

type DesktopLaunchAttempt = { command: string; args: string[] };
type DesktopAppLauncher = () => Promise<void>;

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function launchFigmaDesktopApp(
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const attempts: DesktopLaunchAttempt[] =
    platform === 'darwin'
      ? [{ command: 'open', args: ['-a', 'Figma'] }]
      : platform === 'win32'
        ? [{ command: 'cmd', args: ['/c', 'start', '', 'figma:'] }]
        : [
            { command: 'xdg-open', args: ['figma:'] },
            { command: 'figma', args: [] },
          ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      await spawnDetached(attempt.command, attempt.args);
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !/ENOENT/i.test(error.message)) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to launch Figma Desktop');
}

export class FigmaCommandHandler {
  private activeMode: ConnectionMode = 'local';

  constructor(
    private webview: vscode.Webview,
    private context: vscode.ExtensionContext,
    private mcpClient: McpClient,
    private remoteApiClient: RemoteFigmaApiClient,
    private remoteAuthService: RemoteFigmaAuthService,
    private screenshotService: ScreenshotService,
    private editorIntegration: EditorIntegration,
    private stateManager: StateManager,
    private locale: UiLocale,
    private readonly desktopAppLauncher: DesktopAppLauncher = () => launchFigmaDesktopApp(),
  ) {}

  private post(msg: HostToWebviewMessage) {
    this.webview.postMessage(msg);
  }

  async connect(mode: ConnectionMode = 'local') {
    this.activeMode = mode;
    if (mode === 'remote') {
      await this.connectRemote();
      return;
    }

    await this.connectLocal();
  }

  async openSettings(mode: ConnectionMode = 'local') {
    const targetKey =
      mode === 'remote' ? CONFIG_KEYS.REMOTE_MCP_AUTH_URL : CONFIG_KEYS.MCP_ENDPOINT;
    await vscode.commands.executeCommand('workbench.action.openSettings', targetKey);
  }

  async openDesktopApp() {
    try {
      await this.desktopAppLauncher();
      Logger.info('figma', 'Requested launch of Figma Desktop');
    } catch (e) {
      const errMessage = toErrorMessage(e);
      Logger.error('figma', `Failed to launch Figma Desktop: ${errMessage}`);
      this.post({
        event: 'error',
        source: 'figma',
        message: t(this.locale, 'host.figma.desktopAppOpenFailed'),
      });
    }
  }

  private async notifyRemoteComingSoon(
    kind: 'connect' | 'fetch' | 'screenshot',
    parsed?: ReturnType<typeof parseMcpData>,
  ) {
    const message = t(this.locale, 'host.figma.remoteComingSoon');
    Logger.info('figma', `Remote MCP ${kind} requested while the feature is disabled`);

    if (kind === 'connect') {
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: message,
      });
      return;
    }

    if (kind === 'fetch') {
      this.post({
        event: 'figma.dataFetchError',
        message,
        fallbackData: parsed,
      });
      return;
    }

    this.post({
      event: 'error',
      source: 'figma',
      message,
    });
  }

  private async connectLocal() {
    const config = vscode.workspace.getConfiguration();
    const endpoint = config.get<string>(CONFIG_KEYS.MCP_ENDPOINT) || DEFAULT_MCP_ENDPOINT;
    this.mcpClient.setEndpoint(endpoint);
    try {
      const connected = await this.mcpClient.initialize();
      const methods = connected ? await this.mcpClient.listTools() : [];

      if (!connected) {
        Logger.error('figma', `Failed to connect to MCP server at ${endpoint}`);
      } else {
        Logger.success('figma', `Connected to MCP server at ${endpoint}`);
      }

      this.post({
        event: 'figma.status',
        connected,
        methods,
        error: connected ? undefined : t(this.locale, 'host.figma.connectRefused', { endpoint }),
      });
    } catch (e) {
      const errMessage = toErrorMessage(e);
      Logger.error('figma', `MCP connection error at ${endpoint}: ${errMessage}`);
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: this.toFriendlyConnectionMessage(errMessage, endpoint),
      });
    }
  }

  private async connectRemote() {
    await this.notifyRemoteComingSoon('connect');
  }

  async fetchData(input: string) {
    const parsed = parseMcpData(input);
    this.stateManager.setLastMcpInput(input);
    this.stateManager.setLastMcpData(parsed.raw);

    if (this.activeMode === 'remote') {
      await this.fetchRemoteData(input, parsed);
      return;
    }

    if (this.mcpClient.isConnected() && parsed.fileId) {
      try {
        const data = await this.mcpClient.getDesignContext(parsed.fileId, parsed.nodeId);
        this.stateManager.setLastMcpData(data);
        await this.editorIntegration.openInEditor(
          JSON.stringify(data, null, 2),
          'json',
          'figma-design-data.json',
        );

        this.post({ event: 'figma.dataResult', data });
      } catch (e) {
        const errMessage = toErrorMessage(e);
        Logger.error(
          'figma',
          `MCP design context fetch failed for fileId=${parsed.fileId}, nodeId=${parsed.nodeId}: ${errMessage}`,
        );
        this.post({
          event: 'figma.dataFetchError',
          message: this.toFriendlyFetchMessage(errMessage),
          fallbackData: parsed,
        });
      }
    } else {
      Logger.info(
        'figma',
        'MCP not connected - returning local URL parse result only. Connect to MCP for full Figma data.',
      );
      await this.editorIntegration.openInEditor(
        JSON.stringify(parsed, null, 2),
        'json',
        'figma-design-data.json',
      );
      this.post({ event: 'figma.dataResult', data: parsed });
    }
  }

  async fetchScreenshot(input: string) {
    const parsed = parseMcpData(input);
    if (!parsed.fileId) {
      this.post({
        event: 'error',
        source: 'figma',
        message: t(this.locale, 'host.figma.fileIdMissing'),
      });
      return;
    }

    if (this.activeMode === 'remote') {
      await this.fetchRemoteScreenshot(input, parsed.fileId, parsed.nodeId);
      return;
    }

    try {
      const base64 = await this.screenshotService.fetchScreenshot(parsed.fileId, parsed.nodeId);
      await this.screenshotService.openInEditor(base64, parsed.fileId, parsed.nodeId);
      this.post({ event: 'figma.screenshotResult', base64 });
    } catch (e) {
      const errMessage = toErrorMessage(e);
      Logger.error(
        'figma',
        `Screenshot fetch failed for fileId=${parsed.fileId}, nodeId=${parsed.nodeId}`,
        errMessage,
      );
      this.post({
        event: 'error',
        source: 'figma',
        message: t(this.locale, 'host.figma.screenshotFailed'),
      });
    }
  }

  clearData() {
    this.stateManager.clearLastMcpInput();
    this.stateManager.clearLastMcpData();
  }

  private async fetchRemoteData(
    _input: string,
    parsed: ReturnType<typeof parseMcpData>,
  ): Promise<void> {
    await this.notifyRemoteComingSoon('fetch', parsed);
  }

  private async fetchRemoteScreenshot(
    _input: string,
    _fileId: string,
    _nodeId: string,
  ): Promise<void> {
    await this.notifyRemoteComingSoon('screenshot');
  }

  private toFriendlyConnectionMessage(message: string, endpoint: string): string {
    if (message.toLowerCase().includes('cancelled')) {
      return t(this.locale, 'host.figma.connectCancelled', { endpoint });
    }
    if (message.includes('ECONNREFUSED')) {
      return t(this.locale, 'host.figma.connectRefused', { endpoint });
    }
    if (message.toLowerCase().includes('timeout')) {
      return t(this.locale, 'host.figma.connectTimeout', { endpoint });
    }
    return t(this.locale, 'host.figma.connectGeneric', { endpoint });
  }

  private toFriendlyFetchMessage(message: string): string {
    if (message.includes('ECONNREFUSED')) {
      return t(this.locale, 'host.figma.fetchRefused');
    }
    if (message.toLowerCase().includes('timeout')) {
      return t(this.locale, 'host.figma.fetchTimeout');
    }
    return t(this.locale, 'host.figma.fetchGeneric');
  }
}
