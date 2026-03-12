import Anthropic from '@anthropic-ai/sdk';
import * as https from 'https';
import * as vscode from 'vscode';
import { PromptBuilder } from '../prompt/PromptBuilder';
import { AgentType, ModelInfo, PromptPayload } from '../types';
import { BaseAgent } from './BaseAgent';
import { Logger } from '../logger/Logger';
import { CONFIG_KEYS } from '../constants';
import { USER_CANCELLED_CODE_GENERATION } from '../i18n';
import { toErrorMessage } from '../errors';

interface ModelConfig {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  inputTokenLimit?: unknown;
  outputTokenLimit?: unknown;
  documentationUrl?: unknown;
  contextWindow?: unknown;
  maxOutputTokens?: unknown;
  pricing?: unknown;
}

interface ClaudeApiModelResponse {
  id: string;
  display_name?: string;
  created_at?: string;
  type?: string;
}

type ClaudeImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const DEFAULT_CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    description: 'Most capable Claude',
    inputTokenLimit: 200000,
    outputTokenLimit: 32768,
    provider: 'claude',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
    metadataSource: ['claude-static-catalog'],
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'Latest Claude Sonnet',
    inputTokenLimit: 200000,
    outputTokenLimit: 8192,
    provider: 'claude',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
    metadataSource: ['claude-static-catalog'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast and efficient',
    inputTokenLimit: 200000,
    outputTokenLimit: 8192,
    provider: 'claude',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
    metadataSource: ['claude-static-catalog'],
  },
];

export class ClaudeAgent extends BaseAgent {
  readonly type: AgentType = 'claude';
  private client: Anthropic | null = null;

  async setApiKey(key: string): Promise<void> {
    await super.setApiKey(key);
    // The extension host uses the SDK from a VS Code webview/extension context rather than a
    // plain Node CLI environment, so Anthropic requires this flag to permit fetch usage here.
    this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    Logger.info('agent', 'Claude API key updated');
  }

  async clearApiKey(): Promise<void> {
    await super.clearApiKey();
    this.client = null;
    Logger.info('agent', 'Claude API key cleared');
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
        const model = entry as ModelConfig;
        if (typeof model.id !== 'string' || !model.id.trim()) return null;
        return {
          id: model.id.trim(),
          name:
            typeof model.name === 'string' && model.name.trim()
              ? model.name.trim()
              : model.id.trim(),
          provider: 'claude',
          description: typeof model.description === 'string' ? model.description : undefined,
          inputTokenLimit:
            typeof model.inputTokenLimit === 'number' ? model.inputTokenLimit : undefined,
          outputTokenLimit:
            typeof model.outputTokenLimit === 'number' ? model.outputTokenLimit : undefined,
          contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
          maxOutputTokens:
            typeof model.maxOutputTokens === 'number' ? model.maxOutputTokens : undefined,
          documentationUrl:
            typeof model.documentationUrl === 'string' ? model.documentationUrl : undefined,
          pricing:
            model.pricing && typeof model.pricing === 'object'
              ? (model.pricing as Record<string, string>)
              : undefined,
          metadataSource: ['claude-config'],
        };
      })
      .filter((model): model is ModelInfo => model !== null);

    if (validModels.length === 0) {
      Logger.warn('agent', 'Invalid iagent-engineer.claudeModels config, using defaults');
      return DEFAULT_CLAUDE_MODELS;
    }

    return validModels;
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    const models = await this.listModels();
    const catalogInfo = models.find((m) => m.id === modelId);

    if (!this.apiKey) {
      return catalogInfo ?? this.toFallbackModelInfo(modelId);
    }

    try {
      const remoteInfo = await this.requestModelInfo(modelId);
      return {
        ...(catalogInfo ?? this.toFallbackModelInfo(modelId)),
        id: remoteInfo.id,
        name: remoteInfo.display_name || catalogInfo?.name || remoteInfo.id,
        displayName: remoteInfo.display_name || undefined,
        createdAt: remoteInfo.created_at,
        type: remoteInfo.type,
        provider: 'claude',
        documentationUrl:
          catalogInfo?.documentationUrl ??
          'https://docs.anthropic.com/en/docs/about-claude/models/overview',
        metadataSource: [...new Set([...(catalogInfo?.metadataSource ?? []), 'claude-models-api'])],
        raw: remoteInfo as unknown as Record<string, unknown>,
      };
    } catch (error) {
      Logger.warn('agent', `Claude model detail fallback for ${modelId}: ${toErrorMessage(error)}`);
      return catalogInfo ?? this.toFallbackModelInfo(modelId);
    }
  }

  async *generateCode(payload: PromptPayload, signal?: AbortSignal): AsyncGenerator<string> {
    this.ensureApiKey();
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    const modelId = payload.model || 'claude-sonnet-4-6';
    const modelInfo = await this.getModelInfo(modelId);
    const builder = new PromptBuilder();
    const prompt = builder.buildUserPrompt(payload);
    const screenshotMimeType = payload.screenshotData
      ? this.normalizeImageMimeType(payload.screenshotData.mimeType)
      : null;
    Logger.info('agent', `Generating with Claude: ${modelId}`);

    try {
      const stream = this.client.messages.stream(
        {
          model: modelId,
          max_tokens: modelInfo.outputTokenLimit ?? 8192,
          system: builder.getSystemPrompt(payload),
          messages: [
            {
              role: 'user',
              content: payload.screenshotData
                ? [
                    { type: 'text', text: prompt },
                    {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: screenshotMimeType ?? 'image/png',
                        data: payload.screenshotData.base64,
                      },
                    },
                  ]
                : prompt,
            },
          ],
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
      Logger.success('agent', 'Claude code generation complete');
    } catch (e) {
      if (signal?.aborted) {
        throw new Error(USER_CANCELLED_CODE_GENERATION);
      }
      Logger.error('agent', `Claude generation failed: ${toErrorMessage(e)}`);
      throw e;
    }
  }

  private requestModelInfo(modelId: string): Promise<ClaudeApiModelResponse> {
    return new Promise((resolve, reject) => {
      const req = https
        .request(
          {
            hostname: 'api.anthropic.com',
            path: `/v1/models/${encodeURIComponent(modelId)}`,
            method: 'GET',
            headers: {
              'x-api-key': this.apiKey,
              'anthropic-version': '2023-06-01',
            },
          },
          (res) => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              res.resume();
              reject(new Error(`Anthropic models API returned HTTP ${res.statusCode}`));
              return;
            }
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                resolve(JSON.parse(data) as ClaudeApiModelResponse);
              } catch {
                reject(new Error(`Failed to parse Claude model info response: ${data}`));
              }
            });
          },
        )
        .on('error', reject);

      req.end();
    });
  }

  private toFallbackModelInfo(modelId: string): ModelInfo {
    return {
      id: modelId,
      name: modelId,
      provider: 'claude',
      documentationUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
      metadataSource: ['claude-fallback'],
    };
  }

  private normalizeImageMimeType(mimeType: string | undefined): ClaudeImageMimeType {
    switch (mimeType) {
      case 'image/jpeg':
      case 'image/gif':
      case 'image/webp':
      case 'image/png':
        return mimeType;
      default:
        Logger.warn(
          'agent',
          `Unsupported Claude image MIME type ${mimeType ?? 'undefined'}, falling back to image/png`,
        );
        return 'image/png';
    }
  }
}
