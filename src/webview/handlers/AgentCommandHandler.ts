import * as vscode from 'vscode';
import { AgentFactory } from '../../agent/AgentFactory';
import { Logger } from '../../logger/Logger';
import { AgentType, HostToWebviewMessage } from '../../types';
import { CONFIG_KEYS, SECRET_KEYS } from '../../constants';
import { StateManager } from '../../state/StateManager';
import { ValidationError, toErrorMessage } from '../../errors';

export class AgentCommandHandler {
  constructor(
    private webview: vscode.Webview,
    private context: vscode.ExtensionContext,
    private stateManager: StateManager,
  ) {}

  private post(msg: HostToWebviewMessage) {
    this.webview.postMessage(msg);
  }

  async getApiKeyHelp(agent: AgentType) {
    let url = '';
    if (agent === 'gemini') url = 'https://aistudio.google.com/app/apikey';
    else if (agent === 'claude') url = 'https://console.anthropic.com/settings/keys';

    if (url) {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }

  async getState() {
    const savedAgent = this.context.globalState.get<AgentType>(CONFIG_KEYS.DEFAULT_AGENT, 'gemini');
    const savedModel = this.context.globalState.get<string>(CONFIG_KEYS.DEFAULT_MODEL, '');
    const secretKey =
      SECRET_KEYS[`${savedAgent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
    const key = await this.context.secrets.get(secretKey);

    this.stateManager.setAgent(savedAgent);
    this.stateManager.setModel(savedModel);

    this.post({
      event: 'agent.state',
      agent: savedAgent,
      model: savedModel,
      hasApiKey: Boolean(key),
    });
  }

  async getModelInfoHelp(agent: AgentType, modelId: string) {
    try {
      const secretKey = SECRET_KEYS[`${agent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
      const key = await this.context.secrets.get(secretKey);
      if (key) {
        await AgentFactory.getAgent(agent).setApiKey(key);
      }

      const modelInfo = await AgentFactory.getAgent(agent).getModelInfo(modelId);
      const doc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(modelInfo, null, 2),
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (e) {
      Logger.error('system', `Failed to open model info: ${toErrorMessage(e)}`);
    }
  }

  async setApiKey(agent: AgentType, key: string) {
    this.validateApiKey(agent, key);
    const secretKey = SECRET_KEYS[`${agent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
    await this.context.secrets.store(secretKey, key);
    await AgentFactory.getAgent(agent).setApiKey(key);
    Logger.success('agent', `${agent} API key saved`);
  }

  async saveSettings(agent: AgentType, model: string, key?: string) {
    if (key && key.trim()) {
      await this.setApiKey(agent, key.trim());
    }

    this.stateManager.setAgent(agent);
    this.stateManager.setModel(model);
    await this.context.globalState.update(CONFIG_KEYS.DEFAULT_AGENT, agent);
    await this.context.globalState.update(CONFIG_KEYS.DEFAULT_MODEL, model);

    const secretKey = SECRET_KEYS[`${agent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
    const storedKey = await this.context.secrets.get(secretKey);

    this.post({
      event: 'agent.settingsSaved',
      agent,
      model,
      hasApiKey: Boolean(storedKey),
    });
  }

  async clearSettings(agent: AgentType) {
    const secretKey = SECRET_KEYS[`${agent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
    await this.context.secrets.delete(secretKey);

    this.stateManager.resetAgentState();
    await this.context.globalState.update(CONFIG_KEYS.DEFAULT_AGENT, 'gemini');
    await this.context.globalState.update(CONFIG_KEYS.DEFAULT_MODEL, '');

    this.post({ event: 'agent.settingsCleared', agent });
  }

  async listModels(agent: AgentType, key?: string) {
    const runtimeKey = key?.trim();
    if (runtimeKey) {
      await AgentFactory.getAgent(agent).setApiKey(runtimeKey);
    } else {
      const secretKey = SECRET_KEYS[`${agent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
      const savedKey = await this.context.secrets.get(secretKey);
      if (savedKey) {
        await AgentFactory.getAgent(agent).setApiKey(savedKey);
      }
    }
    const models = await AgentFactory.getAgent(agent).listModels();
    this.post({ event: 'agent.modelsResult', models });
  }

  private validateApiKey(agent: AgentType, key: string) {
    const trimmed = key.trim();
    if (!trimmed) {
      return;
    }

    const pattern =
      agent === 'gemini' ? /^AIza[0-9A-Za-z_-]{20,}$/ : /^sk-ant-[A-Za-z0-9_-]{10,}$/;
    if (!pattern.test(trimmed)) {
      throw new ValidationError(`Invalid API key format for ${agent}`);
    }
  }
}
