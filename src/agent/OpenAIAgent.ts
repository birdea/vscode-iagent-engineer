import * as vscode from 'vscode';
import { PromptBuilder } from '../prompt/PromptBuilder';
import { AgentType, ModelInfo, PromptPayload } from '../types';
import { BaseAgent } from './BaseAgent';
import { Logger } from '../logger/Logger';
import { CONFIG_KEYS } from '../constants';
import { USER_CANCELLED_CODE_GENERATION } from '../i18n';
import { UserCancelledError, toErrorMessage } from '../errors';

interface OpenAIModelEntry {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface OpenAIModelsResponse {
  data: OpenAIModelEntry[];
}

interface ModelConfig {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  inputTokenLimit?: unknown;
  outputTokenLimit?: unknown;
  documentationUrl?: unknown;
}

const PROVIDER_CONFIGS: Record<
  string,
  { baseUrl: string; defaultModel: string; documentationUrl: string; configKey: string }
> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-coder',
    documentationUrl: 'https://api-docs.deepseek.com/',
    configKey: CONFIG_KEYS.DEEPSEEK_MODELS,
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    documentationUrl:
      'https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope',
    configKey: CONFIG_KEYS.QWEN_MODELS,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-001',
    documentationUrl: 'https://openrouter.ai/docs',
    configKey: CONFIG_KEYS.OPENROUTER_MODELS,
  },
};

export class OpenAIAgent extends BaseAgent {
  constructor(public readonly type: AgentType) {
    super();
  }

  private get config() {
    return PROVIDER_CONFIGS[this.type as string] || PROVIDER_CONFIGS.deepseek;
  }

  async listModels(): Promise<ModelInfo[]> {
    const configuredModels = vscode.workspace
      .getConfiguration()
      .get<unknown>(this.config.configKey);

    if (Array.isArray(configuredModels) && configuredModels.length > 0) {
      const validModels = configuredModels
        .map((entry): ModelInfo | null => {
          if (!entry || typeof entry !== 'object') return null;
          const model = entry as ModelConfig;
          if (typeof model.id !== 'string' || !model.id.trim()) return null;
          return {
            id: model.id.trim(),
            name:
              typeof model.name === 'string' && model.name.trim()
                ? model.name.trim()
                : model.id.trim(),
            provider: this.type,
            description: typeof model.description === 'string' ? model.description : undefined,
            inputTokenLimit:
              typeof model.inputTokenLimit === 'number' ? model.inputTokenLimit : undefined,
            outputTokenLimit:
              typeof model.outputTokenLimit === 'number' ? model.outputTokenLimit : undefined,
            documentationUrl:
              typeof model.documentationUrl === 'string'
                ? model.documentationUrl
                : this.config.documentationUrl,
            metadataSource: [`${this.type}-config`],
          };
        })
        .filter((model): model is ModelInfo => model !== null);

      if (validModels.length > 0) {
        return validModels;
      }
    }

    if (!this.apiKey) {
      return [
        {
          id: this.config.defaultModel,
          name: this.config.defaultModel,
          provider: this.type,
          documentationUrl: this.config.documentationUrl,
          metadataSource: [`${this.type}-static-fallback`],
        },
      ];
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`OpenAI-compatible API returned HTTP ${response.status}`);
      }

      const json = (await response.json()) as OpenAIModelsResponse;
      return json.data.map((m) => ({
        id: m.id,
        name: m.id,
        provider: this.type,
        documentationUrl: this.config.documentationUrl,
        metadataSource: [`${this.type}-models-api`],
      }));
    } catch (error) {
      Logger.warn('agent', `Failed to fetch models for ${this.type}: ${toErrorMessage(error)}`);
      return [
        {
          id: this.config.defaultModel,
          name: this.config.defaultModel,
          provider: this.type,
          documentationUrl: this.config.documentationUrl,
          metadataSource: [`${this.type}-static-fallback`],
        },
      ];
    }
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    const models = await this.listModels();
    return (
      models.find((m) => m.id === modelId) || {
        id: modelId,
        name: modelId,
        provider: this.type,
        documentationUrl: this.config.documentationUrl,
        metadataSource: [`${this.type}-fallback`],
      }
    );
  }

  async *generateCode(payload: PromptPayload, signal?: AbortSignal): AsyncGenerator<string> {
    this.ensureApiKey();

    const modelId = payload.model || this.config.defaultModel;
    const prompt = new PromptBuilder().build(payload);

    Logger.info('agent', `Generating with ${this.type}: ${modelId}`);

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: 'You are an expert UI developer. Generate code based on Figma design data.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error('agent', `${this.type} generation failed: ${response.status} ${errorText}`);
      throw new Error(`${this.type} API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is null');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              Logger.warn('agent', `Failed to parse SSE chunk: ${trimmedLine}`);
            }
          }
        }
      }
    } catch (e) {
      if (signal?.aborted) {
        throw new UserCancelledError(USER_CANCELLED_CODE_GENERATION);
      }
      throw e;
    } finally {
      reader.releaseLock();
    }
  }
}
