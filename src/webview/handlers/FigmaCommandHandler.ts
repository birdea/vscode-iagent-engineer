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
        error: connected
          ? undefined
          : `MCP 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요. (${endpoint})`,
      });
    } catch (e) {
      const errMessage = (e as Error).message;
      Logger.error('figma', `MCP connection error at ${endpoint}: ${errMessage}`);
      this.post({
        event: 'figma.status',
        connected: false,
        methods: [],
        error: this.toFriendlyConnectionMessage(errMessage, endpoint),
      });
    }
  }

  async openSettings() {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      CONFIG_KEYS.MCP_ENDPOINT,
    );
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
          message: this.toFriendlyFetchMessage(err.message),
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
        message: '스크린샷을 가져오지 못했습니다. MCP 연결과 입력한 Figma 데이터를 다시 확인하세요.',
      });
    }
  }

  private toFriendlyConnectionMessage(message: string, endpoint: string): string {
    if (message.includes('ECONNREFUSED')) {
      return `MCP 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요. (${endpoint})`;
    }
    if (message.toLowerCase().includes('timeout')) {
      return `MCP 서버 응답이 지연되고 있습니다. 서버 상태와 엔드포인트를 확인하세요. (${endpoint})`;
    }
    return `MCP 연결 중 문제가 발생했습니다. 설정과 서버 상태를 확인하세요. (${endpoint})`;
  }

  private toFriendlyFetchMessage(message: string): string {
    if (message.includes('ECONNREFUSED')) {
      return 'MCP 서버에 연결할 수 없어 데이터를 가져오지 못했습니다. 서버 실행 상태를 확인하세요.';
    }
    if (message.toLowerCase().includes('timeout')) {
      return 'MCP 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.';
    }
    return 'Figma 데이터를 가져오지 못했습니다. 입력한 URL/JSON과 MCP 서버 상태를 확인하세요.';
  }
}
