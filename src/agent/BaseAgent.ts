import { AgentType, ModelInfo, PromptPayload } from '../types';

export interface IAgent {
  readonly type: AgentType;
  setApiKey(key: string): Promise<void>;
  clearApiKey(): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  getModelInfo(modelId: string): Promise<ModelInfo>;
  generateCode(payload: PromptPayload, signal?: AbortSignal): AsyncGenerator<string>;
}

export abstract class BaseAgent implements IAgent {
  abstract readonly type: AgentType;
  protected apiKey: string = '';

  async setApiKey(key: string): Promise<void> {
    this.apiKey = key;
  }

  async clearApiKey(): Promise<void> {
    this.apiKey = '';
  }

  abstract listModels(): Promise<ModelInfo[]>;
  abstract getModelInfo(modelId: string): Promise<ModelInfo>;
  abstract generateCode(payload: PromptPayload, signal?: AbortSignal): AsyncGenerator<string>;

  protected ensureApiKey(): void {
    if (!this.apiKey) {
      throw new Error(`No API key set for ${this.type} agent`);
    }
  }
}
