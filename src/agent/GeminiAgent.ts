import { GoogleGenerativeAI } from '@google/generative-ai';
import { PromptBuilder } from '../prompt/PromptBuilder';
import { AgentType, ModelInfo, PromptPayload } from '../types';
import { BaseAgent } from './BaseAgent';
import { Logger } from '../logger/Logger';
import * as https from 'https';
import { USER_CANCELLED_CODE_GENERATION } from '../i18n';
import { REQUEST_TIMEOUT_MS, GEMINI_MODELS_CACHE_TTL_MS } from '../constants';
import { UserCancelledError, toErrorMessage } from '../errors';

interface GeminiModelEntry {
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

export class GeminiAgent extends BaseAgent {
  readonly type: AgentType = 'gemini';
  private client: GoogleGenerativeAI | null = null;
  private modelsCache: ModelInfo[] | null = null;
  private modelsCacheExpiry = 0;

  async setApiKey(key: string): Promise<void> {
    await super.setApiKey(key);
    this.client = new GoogleGenerativeAI(key);
    this.modelsCache = null;
    this.modelsCacheExpiry = 0;
    Logger.info('agent', 'Gemini API key updated');
  }

  async listModels(): Promise<ModelInfo[]> {
    this.ensureApiKey();

    const now = Date.now();
    if (this.modelsCache && now < this.modelsCacheExpiry) {
      Logger.info('agent', `Gemini models served from cache (${this.modelsCache.length})`);
      return this.modelsCache;
    }

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
        .request(options, (res) => {
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
              const models: ModelInfo[] = (json as { models: GeminiModelEntry[] }).models
                .filter((m) => m.name && m.name.includes('gemini'))
                .map((m) => ({
                  id: m.name.replace('models/', ''),
                  name: m.displayName || m.name,
                  description: m.description,
                  inputTokenLimit: m.inputTokenLimit,
                  outputTokenLimit: m.outputTokenLimit,
                }))
                .sort((a, b) => b.id.localeCompare(a.id)); // sort descending by id (e.g., gemini-2.0 > gemini-1.5)

              this.modelsCache = models;
              this.modelsCacheExpiry = Date.now() + GEMINI_MODELS_CACHE_TTL_MS;
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

      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error('Gemini models API request timed out'));
      });
      req.end();
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
      const iterator = result.stream[Symbol.asyncIterator]();
      let streamClosed = false;
      const closeStream = async () => {
        if (streamClosed) return;
        streamClosed = true;
        const returnFn = iterator.return;
        if (typeof returnFn === 'function') {
          await returnFn.call(iterator, undefined);
        }
      };
      const onAbort = () => {
        void closeStream();
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        while (true) {
          if (signal?.aborted) {
            await closeStream();
            throw new UserCancelledError(USER_CANCELLED_CODE_GENERATION);
          }
          const { value: chunk, done } = await iterator.next();
          if (done) {
            break;
          }
          if (signal?.aborted) {
            await closeStream();
            throw new UserCancelledError(USER_CANCELLED_CODE_GENERATION);
          }
          const text = chunk.text();
          if (text) {
            yield text;
          }
        }
      } finally {
        signal?.removeEventListener('abort', onAbort);
        await closeStream();
      }
      Logger.success('agent', 'Gemini code generation complete');
    } catch (e) {
      Logger.error('agent', `Gemini generation failed: ${toErrorMessage(e)}`);
      throw e;
    }
  }
}
