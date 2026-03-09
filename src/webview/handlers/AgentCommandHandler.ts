import * as vscode from 'vscode';
import { AgentFactory } from '../../agent/AgentFactory';
import { Logger } from '../../logger/Logger';
import { AgentType, HostToWebviewMessage, ModelInfo } from '../../types';
import { CONFIG_KEYS, getSecretStorageKey } from '../../constants';
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
    else if (agent === 'deepseek') url = 'https://platform.deepseek.com/api_keys';
    else if (agent === 'qwen') url = 'https://dashscope.console.aliyun.com/apiKey';
    else if (agent === 'openrouter') url = 'https://openrouter.ai/keys';

    if (url) {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }

  async getState() {
    const savedAgent = this.context.globalState.get<AgentType>(CONFIG_KEYS.DEFAULT_AGENT, 'gemini');
    const savedModel = this.context.globalState.get<string>(CONFIG_KEYS.DEFAULT_MODEL, '');
    const key = await this.context.secrets.get(getSecretStorageKey(savedAgent));

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
      const key = await this.context.secrets.get(getSecretStorageKey(agent));
      if (key) {
        await AgentFactory.getAgent(agent).setApiKey(key);
      }

      const modelInfo = await AgentFactory.getAgent(agent).getModelInfo(modelId);
      const doc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(this.toModelInfoDocument(agent, modelId, modelInfo), null, 2),
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (e) {
      Logger.error('system', `Failed to open model info: ${toErrorMessage(e)}`);
    }
  }

  async setApiKey(agent: AgentType, key: string) {
    this.validateApiKey(agent, key);
    await this.context.secrets.store(getSecretStorageKey(agent), key);
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

    const storedKey = await this.context.secrets.get(getSecretStorageKey(agent));

    this.post({
      event: 'agent.settingsSaved',
      agent,
      model,
      hasApiKey: Boolean(storedKey),
    });
  }

  async clearSettings(agent: AgentType) {
    await this.context.secrets.delete(getSecretStorageKey(agent));

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
      const savedKey = await this.context.secrets.get(getSecretStorageKey(agent));
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

    if (agent === 'gemini') {
      if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
        throw new ValidationError(`Invalid API key format for Gemini`);
      }
    } else if (agent === 'claude') {
      if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
        throw new ValidationError(`Invalid API key format for Claude`);
      }
    } else {
      // For DeepSeek, Qwen, OpenRouter, we allow a more general sk- pattern or any non-empty string
      if (trimmed.length < 10) {
        throw new ValidationError(`API key for ${agent} seems too short`);
      }
    }
  }

  private toModelInfoDocument(agent: AgentType, modelId: string, modelInfo: ModelInfo) {
    let defaultDocUrl = 'https://ai.google.dev/api/models';
    if (agent === 'claude')
      defaultDocUrl = 'https://docs.anthropic.com/en/docs/about-claude/models/overview';
    else if (agent === 'deepseek') defaultDocUrl = 'https://api-docs.deepseek.com/';
    else if (agent === 'qwen')
      defaultDocUrl =
        'https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope';
    else if (agent === 'openrouter') defaultDocUrl = 'https://openrouter.ai/docs';

    return {
      requestedModelId: modelId,
      provider: agent,
      fetchedAt: new Date().toISOString(),
      documentationUrl: modelInfo.documentationUrl ?? defaultDocUrl,
      metadataSource: modelInfo.metadataSource ?? [],
      model: modelInfo,
    };
  }
}
