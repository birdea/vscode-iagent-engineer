import { GoogleGenerativeAI } from '@google/generative-ai';
import { PromptBuilder } from '../prompt/PromptBuilder';
import { AgentType, ModelInfo, PromptPayload } from '../types';
import { BaseAgent } from './BaseAgent';
import { Logger } from '../logger/Logger';
import * as https from 'https';

export class GeminiAgent extends BaseAgent {
  readonly type: AgentType = 'gemini';
  private client: GoogleGenerativeAI | null = null;

  async setApiKey(key: string): Promise<void> {
    await super.setApiKey(key);
    this.client = new GoogleGenerativeAI(key);
    Logger.info('agent', 'Gemini API key updated');
  }

  async listModels(): Promise<ModelInfo[]> {
    this.ensureApiKey();
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: 'generativelanguage.googleapis.com',
        path: '/v1beta/models',
        method: 'GET',
        headers: {
          'x-goog-api-key': this.apiKey,
        },
      };

      const req = https
        .get(options, (res) => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            reject(new Error(`Gemini models API returned HTTP ${res.statusCode}`));
            return;
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data) as unknown;
              if (
                typeof json !== 'object' ||
                json === null ||
                !Array.isArray((json as Record<string, unknown>).models)
              ) {
                reject(new Error('Unexpected response shape from Gemini models API'));
                return;
              }
              const models: ModelInfo[] = (
                (json as { models: Array<{ name: string; displayName: string; description: string; inputTokenLimit: number; outputTokenLimit: number }> }).models
              )
                .filter((m) => m.name.includes('gemini'))
                .map((m) => ({
                  id: m.name.replace('models/', ''),
                  name: m.displayName || m.name,
                  description: m.description,
                  inputTokenLimit: m.inputTokenLimit,
                  outputTokenLimit: m.outputTokenLimit,
                }))
                .sort((a, b) => b.id.localeCompare(a.id)); // sort descending by id (e.g., gemini-2.0 > gemini-1.5)

              Logger.info('agent', `Gemini models loaded: ${models.length}`);
              resolve(models);
            } catch {
              reject(new Error(`Failed to parse models response: ${data}`));
            }
          });
        })
        .on('error', (e) => {
          Logger.error('agent', `Failed to list Gemini models: ${e.message}`);
          reject(e);
        });

      req.setTimeout(10000, () => {
        req.destroy(new Error('Gemini models API request timed out'));
      });
    });
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    const models = await this.listModels();
    const found = models.find((m) => m.id === modelId || m.id.includes(modelId));
    if (!found) {
      return { id: modelId, name: modelId };
    }
    return found;
  }

  async *generateCode(payload: PromptPayload, signal?: AbortSignal): AsyncGenerator<string> {
    this.ensureApiKey();
    if (!this.client) {
      throw new Error('Gemini client not initialized');
    }

    const model = this.client.getGenerativeModel({ model: payload.model || 'gemini-2.0-flash' });
    const prompt = new PromptBuilder().build(payload);

    Logger.info('agent', `Generating with Gemini: ${payload.model}`);

    try {
      const result = await model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        if (signal?.aborted) {
          throw new Error('사용자가 코드 생성을 취소했습니다.');
        }
        const text = chunk.text();
        if (text) {
          yield text;
        }
      }
      Logger.success('agent', 'Gemini code generation complete');
    } catch (e) {
      Logger.error('agent', `Gemini generation failed: ${(e as Error).message}`);
      throw e;
    }
  }
}
