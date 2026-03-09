import * as vscode from 'vscode';
import { WebviewToHostMessage, HostToWebviewMessage, LayerType } from '../types';
import { McpClient } from '../figma/McpClient';
import { RemoteFigmaApiClient } from '../figma/RemoteFigmaApiClient';
import { RemoteFigmaAuthService } from '../figma/RemoteFigmaAuthService';
import { ScreenshotService } from '../figma/ScreenshotService';
import { EditorIntegration } from '../editor/EditorIntegration';
import { Logger } from '../logger/Logger';
import { FigmaCommandHandler } from './handlers/FigmaCommandHandler';
import { AgentCommandHandler } from './handlers/AgentCommandHandler';
import { PromptCommandHandler } from './handlers/PromptCommandHandler';
import { StateManager } from '../state/StateManager';
import { UiLocale } from '../i18n';
import { toErrorMessage } from '../errors';

export class WebviewMessageHandler {
  private mcpClient: McpClient;
  private remoteApiClient: RemoteFigmaApiClient;
  private screenshotService: ScreenshotService;
  private editorIntegration: EditorIntegration;
  private figmaHandler: FigmaCommandHandler;
  private agentHandler: AgentCommandHandler;
  private promptHandler: PromptCommandHandler;

  constructor(
    private webview: vscode.Webview,
    context: vscode.ExtensionContext,
    remoteAuthService: RemoteFigmaAuthService,
    mcpEndpoint: string,
    private stateManager: StateManager,
    extensionVersion: string,
    locale: UiLocale,
  ) {
    this.mcpClient = new McpClient(mcpEndpoint, {
      name: 'vscode-figmalab',
      version: extensionVersion,
    });
    this.remoteApiClient = new RemoteFigmaApiClient();
    this.screenshotService = new ScreenshotService(this.mcpClient, locale);
    this.editorIntegration = new EditorIntegration();
    this.figmaHandler = new FigmaCommandHandler(
      webview,
      context,
      this.mcpClient,
      this.remoteApiClient,
      remoteAuthService,
      this.screenshotService,
      this.editorIntegration,
      stateManager,
      locale,
    );
    this.agentHandler = new AgentCommandHandler(webview, context, stateManager);
    this.promptHandler = new PromptCommandHandler(
      webview,
      context,
      this.editorIntegration,
      stateManager,
      locale,
    );
  }

  private post(msg: HostToWebviewMessage) {
    this.webview.postMessage(msg);
  }

  async handle(msg: WebviewToHostMessage) {
    const source = this.getSourceFromCommand(msg.command);
    try {
      switch (msg.command) {
        case 'figma.connect':
          await this.figmaHandler.connect(msg.mode);
          break;
        case 'figma.openSettings':
          await this.figmaHandler.openSettings(msg.mode);
          break;
        case 'figma.openDesktopApp':
          await this.figmaHandler.openDesktopApp();
          break;
        case 'figma.fetchData':
          await this.figmaHandler.fetchData(msg.mcpData);
          break;
        case 'figma.screenshot':
          await this.figmaHandler.fetchScreenshot(msg.mcpData);
          break;
        case 'agent.getState':
          await this.agentHandler.getState();
          break;
        case 'agent.getApiKeyHelp':
          await this.agentHandler.getApiKeyHelp(msg.agent);
          break;
        case 'agent.getModelInfoHelp':
          await this.agentHandler.getModelInfoHelp(msg.agent, msg.modelId);
          break;
        case 'agent.setApiKey':
          await this.agentHandler.setApiKey(msg.agent, msg.key);
          break;
        case 'agent.saveSettings':
          await this.agentHandler.saveSettings(msg.agent, msg.model, msg.key);
          break;
        case 'agent.clearSettings':
          await this.agentHandler.clearSettings(msg.agent);
          break;
        case 'agent.listModels':
          await this.agentHandler.listModels(msg.agent, msg.key);
          break;
        case 'state.setAgent':
          this.stateManager.setAgent(msg.agent);
          break;
        case 'state.setModel':
          this.stateManager.setModel(msg.model);
          break;
        case 'prompt.generate':
          await this.promptHandler.generate(msg.payload);
          break;
        case 'prompt.cancel':
          this.promptHandler.cancel(msg.requestId);
          break;
        case 'prompt.estimate':
          this.promptHandler.estimate(msg.payload);
          break;
        case 'preview.openPanel':
          this.promptHandler.openPreviewPanel(msg.code, msg.format);
          break;
        case 'editor.open':
          await this.promptHandler.openEditor(msg.code, msg.language);
          break;
        case 'editor.saveFile':
          await this.promptHandler.saveFile(msg.code, msg.filename);
          break;
      }
    } catch (e) {
      const message = toErrorMessage(e);
      this.post({ event: 'error', source, message });
      Logger.error('system', message);
    }
  }

  private getSourceFromCommand(command: WebviewToHostMessage['command']): LayerType {
    if (command.startsWith('figma.')) return 'figma';
    if (command.startsWith('agent.') || command.startsWith('state.')) return 'agent';
    if (command.startsWith('prompt.') || command.startsWith('preview.') || command.startsWith('editor.'))
      return 'prompt';
    return 'system';
  }

  async dispose(): Promise<void> {
    await this.screenshotService.cleanupTempFiles();
  }
}
