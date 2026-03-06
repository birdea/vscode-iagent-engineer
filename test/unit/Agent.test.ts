import * as assert from 'assert';
import { AgentFactory } from '../../src/agent/AgentFactory';
import { GeminiAgent } from '../../src/agent/GeminiAgent';
import { ClaudeAgent } from '../../src/agent/ClaudeAgent';
import { BaseAgent } from '../../src/agent/BaseAgent';

suite('Agent Management', () => {
  test('AgentFactory returns correct instances', () => {
    const gemini = AgentFactory.getAgent('gemini');
    assert.ok(gemini instanceof GeminiAgent);
    assert.strictEqual(gemini.type, 'gemini');

    const claude = AgentFactory.getAgent('claude');
    assert.ok(claude instanceof ClaudeAgent);
    assert.strictEqual(claude.type, 'claude');
  });

  test('AgentFactory returns singleton instances', () => {
    const g1 = AgentFactory.getAgent('gemini');
    const g2 = AgentFactory.getAgent('gemini');
    assert.strictEqual(g1, g2);
  });

  test('Unsupported agent type throws error', () => {
    assert.throws(() => {
      (AgentFactory as any).createAgent('unknown');
    }, /Unsupported agent type/);
  });

  test('BaseAgent setApiKey', async () => {
    class MockAgent extends BaseAgent {
      readonly type = 'gemini' as any;
      async listModels() { return []; }
      async getModelInfo() { return {} as any; }
      async *generateCode() { yield ''; }
      getApiKey() { return this.apiKey; }
      check() { this.ensureApiKey(); }
    }

    const agent = new MockAgent();
    assert.throws(() => agent.check(), /No API key set/);
    
    await agent.setApiKey('test-key');
    assert.strictEqual(agent.getApiKey(), 'test-key');
    assert.doesNotThrow(() => agent.check());
  });
});
