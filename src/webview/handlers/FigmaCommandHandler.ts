import * as vscode from 'vscode';
import { McpClient } from '../../figma/McpClient';
import { parseMcpData } from '../../figma/McpParser';
import { ScreenshotService } from '../../figma/ScreenshotService';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { HostToWebviewMessage } from '../../types';
import { CONFIG_KEYS, DEFAULT_MCP_ENDPOINT } from '../../constants';
import { StateManager } from '../../state/StateManager';

export class FigmaCommandHandler {
  constructor(
    private webview: vscode.Webview,
    private mcpClient: McpClient,
    private screenshotService: ScreenshotService,
    private editorIntegration: EditorIntegration,
    private stateManager: StateManager,
  ) {}

  private post(msg: HostToWebviewMessage) {
    this.webview.postMessage(msg);
  }

  async connect() {
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
        error: connected ? undefined : `Connection failed. Please ensure the MCP server is running at ${endpoint}.`,
      });
    } catch (e) {
      const errMessage = (e as Error).message;
      Logger.error('figma', `MCP connection error at ${endpoint}: ${errMessage}`);
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: `Connection error: ${errMessage}`,
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
        const err = e as Error;
        Logger.error(
          'figma',
          `MCP get_file failed for fileId=${parsed.fileId}, nodeId=${parsed.nodeId}: ${err.message}`,
        );
        this.post({
          event: 'figma.dataFetchError',
          message: `MCP fetch failed: ${err.message}`,
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
        message: 'Figma URL 또는 JSON에서 fileId를 찾을 수 없습니다.',
      });
      return;
    }
    try {
      const base64 = await this.screenshotService.fetchScreenshot(parsed.fileId, parsed.nodeId);
      await this.screenshotService.openInEditor(base64, parsed.fileId);
      this.post({ event: 'figma.screenshotResult', base64 });
    } catch (e) {
      this.post({
        event: 'error',
        source: 'figma',
        message: `Screenshot fetch failed: ${(e as Error).message}`,
      });
    }
  }
}
