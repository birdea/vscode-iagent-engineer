import * as vscode from 'vscode';
import { McpClient } from '../../figma/McpClient';
import { RemoteFigmaApiClient } from '../../figma/RemoteFigmaApiClient';
import { RemoteFigmaAuthService } from '../../figma/RemoteFigmaAuthService';
import { parseMcpData } from '../../figma/McpParser';
import { ScreenshotService } from '../../figma/ScreenshotService';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { ConnectionMode, HostToWebviewMessage } from '../../types';
import {
  CONFIG_KEYS,
  DEFAULT_MCP_ENDPOINT,
  DEFAULT_REMOTE_MCP_AUTH_URL,
  DEFAULT_REMOTE_MCP_ENDPOINT,
} from '../../constants';
import { StateManager } from '../../state/StateManager';
import { UiLocale, t } from '../../i18n';
import { toErrorMessage } from '../../errors';

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
      const finalAuthUrl = await this.remoteAuthService.buildAuthUrl(
        authUrl,
        this.context.extension.id,
      );
      await vscode.env.openExternal(vscode.Uri.parse(finalAuthUrl));
      Logger.info('figma', `Started remote auth flow: ${finalAuthUrl}`);
      this.post({ event: 'figma.authStarted', mode: 'remote', authUrl: finalAuthUrl });
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

  private async connectRemote() {
    const config = vscode.workspace.getConfiguration();
    const baseUrl = (
      config.get<string>(CONFIG_KEYS.REMOTE_MCP_ENDPOINT) || DEFAULT_REMOTE_MCP_ENDPOINT
    ).trim();
    if (!baseUrl) {
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: t(this.locale, 'host.figma.remoteEndpointMissing'),
      });
      return;
    }

    const session = await this.remoteAuthService.getSession();
    if (!session?.accessToken) {
      await this.startRemoteAuthLogin();
      return;
    }

    try {
      const result = await this.remoteApiClient.checkStatus(baseUrl, session.accessToken);
      const connected = !!result.connected;
      this.post({
        event: 'figma.status',
        connected,
        methods: [],
        error: connected
          ? undefined
          : result.error || t(this.locale, 'host.figma.remoteAuthRequired'),
      });
    } catch (e) {
      const errMessage = toErrorMessage(e);
      Logger.error('figma', `Remote status check failed at ${baseUrl}: ${errMessage}`);
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: t(this.locale, 'host.figma.remoteConnectGeneric'),
      });
    }
  }

  async fetchData(input: string) {
    const parsed = parseMcpData(input);
    this.stateManager.setLastMcpData(parsed.raw);

    if (this.activeMode === 'remote') {
      await this.fetchRemoteData(input, parsed);
      return;
    }

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

  private async fetchRemoteData(
    input: string,
    parsed: ReturnType<typeof parseMcpData>,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const baseUrl = (
      config.get<string>(CONFIG_KEYS.REMOTE_MCP_ENDPOINT) || DEFAULT_REMOTE_MCP_ENDPOINT
    ).trim();
    const session = await this.remoteAuthService.getSession();

    if (!baseUrl || !session?.accessToken) {
      this.post({
        event: 'figma.dataFetchError',
        message: t(this.locale, 'host.figma.remoteAuthRequired'),
        fallbackData: parsed,
      });
      return;
    }

    try {
      const data = await this.remoteApiClient.fetchDesignContext(baseUrl, session.accessToken, {
        ...(typeof input === 'string' && input.includes('figma.com') ? { figmaUrl: input } : {}),
        fileKey: parsed.fileId || undefined,
        nodeId: parsed.nodeId || undefined,
      });
      this.stateManager.setLastMcpData(data);

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
        `Remote data fetch failed for fileId=${parsed.fileId}, nodeId=${parsed.nodeId}: ${errMessage}`,
      );
      this.post({
        event: 'figma.dataFetchError',
        message: t(this.locale, 'host.figma.remoteFetchGeneric'),
        fallbackData: parsed,
      });
    }
  }

  private async fetchRemoteScreenshot(
    input: string,
    fileId: string,
    nodeId: string,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const baseUrl = (
      config.get<string>(CONFIG_KEYS.REMOTE_MCP_ENDPOINT) || DEFAULT_REMOTE_MCP_ENDPOINT
    ).trim();
    const session = await this.remoteAuthService.getSession();

    if (!baseUrl || !session?.accessToken) {
      this.post({
        event: 'error',
        source: 'figma',
        message: t(this.locale, 'host.figma.remoteAuthRequired'),
      });
      return;
    }

    try {
      const result = await this.remoteApiClient.fetchScreenshot(baseUrl, session.accessToken, {
        ...(typeof input === 'string' && input.includes('figma.com') ? { figmaUrl: input } : {}),
        fileKey: fileId,
        nodeId: nodeId || undefined,
      });
      await this.screenshotService.openInEditor(result.data, fileId, nodeId);
      this.post({ event: 'figma.screenshotResult', base64: result.data });
    } catch (e) {
      const errMessage = toErrorMessage(e);
      Logger.error(
        'figma',
        `Remote screenshot fetch failed for fileId=${fileId}, nodeId=${nodeId}`,
        errMessage,
      );
      this.post({
        event: 'error',
        source: 'figma',
        message: t(this.locale, 'host.figma.remoteScreenshotFailed'),
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
