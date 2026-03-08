import * as vscode from 'vscode';
import { McpClient } from '../../figma/McpClient';
import { parseMcpData } from '../../figma/McpParser';
import { ScreenshotService } from '../../figma/ScreenshotService';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { ConnectionMode, HostToWebviewMessage } from '../../types';
import { CONFIG_KEYS, DEFAULT_MCP_ENDPOINT, DEFAULT_REMOTE_MCP_AUTH_URL } from '../../constants';
import { StateManager } from '../../state/StateManager';
import { UiLocale, t } from '../../i18n';
import { toErrorMessage } from '../../errors';

export class FigmaCommandHandler {
  constructor(
    private webview: vscode.Webview,
    private mcpClient: McpClient,
    private screenshotService: ScreenshotService,
    private editorIntegration: EditorIntegration,
    private stateManager: StateManager,
    private locale: UiLocale,
  ) {}

  private post(msg: HostToWebviewMessage) {
    this.webview.postMessage(msg);
  }

  async connect(mode: ConnectionMode = 'local') {
    if (mode === 'remote') {
      await this.startRemoteAuthLogin();
      return;
    }

    await this.connectLocal();
  }

  async openSettings(mode: ConnectionMode = 'local') {
    const targetKey =
      mode === 'remote' ? CONFIG_KEYS.REMOTE_MCP_AUTH_URL : CONFIG_KEYS.MCP_ENDPOINT;
    await vscode.commands.executeCommand('workbench.action.openSettings', targetKey);
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

  private async startRemoteAuthLogin() {
    const config = vscode.workspace.getConfiguration();
    const authUrl = (
      config.get<string>(CONFIG_KEYS.REMOTE_MCP_AUTH_URL) || DEFAULT_REMOTE_MCP_AUTH_URL
    ).trim();

    if (!authUrl) {
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: t(this.locale, 'host.figma.remoteAuthUrlMissing'),
      });
      return;
    }

    try {
      const uri = vscode.Uri.parse(authUrl);
      await vscode.env.openExternal(uri);
      Logger.info('figma', `Started remote MCP auth flow: ${authUrl}`);
      this.post({ event: 'figma.authStarted', mode: 'remote', authUrl });
    } catch (e) {
      Logger.error('figma', `Invalid remote MCP auth URL: ${authUrl}`, toErrorMessage(e));
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: t(this.locale, 'host.figma.remoteAuthUrlInvalid'),
      });
    }
  }

  async fetchData(input: string) {
    const parsed = parseMcpData(input);
    this.stateManager.setLastMcpData(parsed.raw);

    if (this.mcpClient.isConnected() && parsed.fileId) {
      try {
        const data = await this.mcpClient.callTool('get_file', {
          fileId: parsed.fileId,
          nodeId: parsed.nodeId,
        });
        this.stateManager.setLastMcpData(data);

        const config = vscode.workspace.getConfiguration();
        const shouldOpenInEditor =
          config.get<boolean>(CONFIG_KEYS.OPEN_FETCH_RESULT_IN_EDITOR, false) ?? false;
        if (shouldOpenInEditor) {
          await this.editorIntegration.openInEditor(JSON.stringify(data, null, 2), 'json');
        }

        this.post({ event: 'figma.dataResult', data });
      } catch (e) {
        const errMessage = toErrorMessage(e);
        Logger.error(
          'figma',
          `MCP get_file failed for fileId=${parsed.fileId}, nodeId=${parsed.nodeId}: ${errMessage}`,
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
