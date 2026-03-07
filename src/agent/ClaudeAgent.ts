import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { PromptBuilder } from '../prompt/PromptBuilder';
import { AgentType, ModelInfo, PromptPayload } from '../types';
import { BaseAgent } from './BaseAgent';
import { Logger } from '../logger/Logger';
import { CONFIG_KEYS } from '../constants';

const DEFAULT_CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    description: 'Most capable Claude',
    inputTokenLimit: 200000,
    outputTokenLimit: 8192,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'Latest Claude Sonnet',
    inputTokenLimit: 200000,
    outputTokenLimit: 8192,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast and efficient',
    inputTokenLimit: 200000,
    outputTokenLimit: 8192,
  },
];

export class ClaudeAgent extends BaseAgent {
  readonly type: AgentType = 'claude';
  private client: Anthropic | null = null;

  async setApiKey(key: string): Promise<void> {
    await super.setApiKey(key);
    this.client = new Anthropic({ apiKey: key });
    Logger.info('agent', 'Claude API key updated');
  }

  async listModels(): Promise<ModelInfo[]> {
    const configuredModels = vscode.workspace
      .getConfiguration()
      .get<unknown>(CONFIG_KEYS.CLAUDE_MODELS);

    if (!Array.isArray(configuredModels) || configuredModels.length === 0) {
      return DEFAULT_CLAUDE_MODELS;
    }

    const validModels = configuredModels
      .map((entry): ModelInfo | null => {
        if (!entry || typeof entry !== 'object') return null;
        const model = entry as Record<string, unknown>;
        if (typeof model.id !== 'string' || !model.id.trim()) return null;
        return {
          id: model.id.trim(),
          name: typeof model.name === 'string' && model.name.trim() ? model.name.trim() : model.id,
          description: typeof model.description === 'string' ? model.description : undefined,
          inputTokenLimit:
            typeof model.inputTokenLimit === 'number' ? model.inputTokenLimit : undefined,
          outputTokenLimit:
            typeof model.outputTokenLimit === 'number' ? model.outputTokenLimit : undefined,
        };
      })
      .filter((model): model is ModelInfo => model !== null);

    if (validModels.length === 0) {
      Logger.warn('agent', 'Invalid figmalab.claudeModels config, using defaults');
      return DEFAULT_CLAUDE_MODELS;
    }

    return validModels;
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    const models = await this.listModels();
    return models.find((m) => m.id === modelId) ?? { id: modelId, name: modelId };
  }

  async *generateCode(payload: PromptPayload, signal?: AbortSignal): AsyncGenerator<string> {
    this.ensureApiKey();
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    const prompt = new PromptBuilder().build(payload);
    Logger.info('agent', `Generating with Claude: ${payload.model}`);

    try {
      const stream = this.client.messages.stream({
        model: payload.model || 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: `You are an expert UI developer. Generate ${payload.outputFormat} code that faithfully reproduces the Figma design. Output ONLY valid code. No explanation.`,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of stream) {
        if (signal?.aborted) {
          const abort = (stream as { abort?: () => void }).abort;
          abort?.call(stream);
          throw new Error('사용자가 코드 생성을 취소했습니다.');
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
      Logger.success('agent', 'Claude code generation complete');
    } catch (e) {
      Logger.error('agent', `Claude generation failed: ${(e as Error).message}`);
      throw e;
    }
  }
}
