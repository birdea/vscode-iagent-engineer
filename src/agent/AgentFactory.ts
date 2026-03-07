import { AgentType } from '../types';
import { IAgent } from './BaseAgent';
import { GeminiAgent } from './GeminiAgent';
import { ClaudeAgent } from './ClaudeAgent';

export class AgentFactory {
  private static instances: Map<AgentType, IAgent> = new Map();

  static getAgent(type: AgentType): IAgent {
    const existing = this.instances.get(type);
    if (existing) {
      return existing;
    }

    const created = this.createAgent(type);
    this.instances.set(type, created);
    return created;
  }

  private static createAgent(type: AgentType): IAgent {
    switch (type) {
      case 'gemini':
        return new GeminiAgent();
      case 'claude':
        return new ClaudeAgent();
      default:
        throw new Error(`Unsupported agent type: ${type}`);
    }
  }

  static clear() {
    this.instances.clear();
  }
}
