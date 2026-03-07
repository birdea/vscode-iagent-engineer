import * as vscode from 'vscode';
import { AgentFactory } from '../../agent/AgentFactory';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { PromptBuilder } from '../../prompt/PromptBuilder';
import { PromptPayload, HostToWebviewMessage } from '../../types';
import { SECRET_KEYS } from '../../constants';
import { StateManager } from '../../state/StateManager';

export class PromptCommandHandler {
  private isGenerating = false;

  constructor(
    private webview: vscode.Webview,
    private context: vscode.ExtensionContext,
    private editorIntegration: EditorIntegration,
    private stateManager: StateManager,
  ) {}

  private post(msg: HostToWebviewMessage) {
    this.webview.postMessage(msg);
  }

  async generate(payload: PromptPayload) {
    if (this.isGenerating) {
      this.post({ event: 'prompt.error', message: 'Generation already in progress' });
      return;
    }

    const agent = payload.agent ?? this.stateManager.getAgent();
    const model = payload.model ?? this.stateManager.getModel();

    const secretKey = SECRET_KEYS[`${agent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
    const key = await this.context.secrets.get(secretKey);
    if (key) {
      await AgentFactory.getAgent(agent).setApiKey(key);
    }

    const resolvedPayload = {
      ...payload,
      agent,
      model,
      mcpData: payload.mcpData === undefined ? this.stateManager.getLastMcpData() : payload.mcpData,
    };

    Logger.info('prompt', `Generating ${resolvedPayload.outputFormat} code with ${agent}:${model}`);
    this.post({ event: 'prompt.generating', progress: 0 });
    this.isGenerating = true;

    try {
      let fullCode = '';
      let progress = 5;
      this.post({ event: 'prompt.generating', progress });
      const gen = AgentFactory.getAgent(agent).generateCode(resolvedPayload);
      for await (const chunk of gen) {
        fullCode += chunk;
        progress = Math.min(95, progress + 5);
        this.post({ event: 'prompt.generating', progress });
        this.post({ event: 'prompt.chunk', text: chunk });
      }

      this.post({ event: 'prompt.generating', progress: 100 });
      this.post({ event: 'prompt.result', code: fullCode, format: resolvedPayload.outputFormat });
    } catch (e) {
      const err = e as Error;
      this.post({ event: 'prompt.error', message: err.message });
    } finally {
      this.isGenerating = false;
    }
  }

  estimate(payload: PromptPayload) {
    const builder = new PromptBuilder();
    const resolvedPayload = {
      ...payload,
      mcpData: payload.mcpData === undefined ? this.stateManager.getLastMcpData() : payload.mcpData,
    };
    const estimate = builder.estimate(resolvedPayload);
    this.post({ event: 'prompt.estimateResult', tokens: estimate.tokens, kb: estimate.kb });
  }

  async openEditor(code: string, language?: string) {
    await this.editorIntegration.openInEditor(code, language);
  }

  async saveFile(code: string, filename: string) {
    await this.editorIntegration.saveAsNewFile(code, filename);
  }

  getGeneratingState() {
    return this.isGenerating;
  }
}
