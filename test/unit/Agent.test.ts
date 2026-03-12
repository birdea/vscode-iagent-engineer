import * as assert from 'assert';
import nock from 'nock';
import { AgentFactory } from '../../src/agent/AgentFactory';
import { GeminiAgent } from '../../src/agent/GeminiAgent';
import { ClaudeAgent } from '../../src/agent/ClaudeAgent';
import { BaseAgent } from '../../src/agent/BaseAgent';
import { Logger } from '../../src/logger/Logger';

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

  test('AgentFactory.clear removes all cached instances', () => {
    const g1 = AgentFactory.getAgent('gemini');
    AgentFactory.clear();
    const g2 = AgentFactory.getAgent('gemini');
    assert.notStrictEqual(g1, g2);
  });

  test('AgentFactory.createEphemeralAgent returns a fresh instance', () => {
    const singleton = AgentFactory.getAgent('gemini');
    const ephemeral = AgentFactory.createEphemeralAgent('gemini');

    assert.ok(ephemeral instanceof GeminiAgent);
    assert.notStrictEqual(singleton, ephemeral);
  });

  test('BaseAgent setApiKey', async () => {
    class MockAgent extends BaseAgent {
      readonly type = 'gemini' as any;
      async listModels() {
        return [];
      }
      async getModelInfo() {
        return {} as any;
      }
      async *generateCode() {
        yield '';
      }
      getApiKey() {
        return this.apiKey;
      }
      check() {
        this.ensureApiKey();
      }
    }

    const agent = new MockAgent();
    assert.throws(() => agent.check(), /No API key set/);

    await agent.setApiKey('test-key');
    assert.strictEqual(agent.getApiKey(), 'test-key');
    assert.doesNotThrow(() => agent.check());

    await agent.clearApiKey();
    assert.strictEqual(agent.getApiKey(), '');
    assert.throws(() => agent.check(), /No API key set/);
  });
});

suite('GeminiAgent', () => {
  setup(() => {
    Logger.initialize({ appendLine: () => {}, clear: () => {} } as any);
    if (!nock.isActive()) nock.activate();
  });

  teardown(() => {
    nock.cleanAll();
  });

  test('listModels rejects on HTTP non-2xx', async () => {
    const agent = new GeminiAgent();
    await agent.setApiKey('test-key');

    nock('https://generativelanguage.googleapis.com')
      .get('/v1beta/models')
      .reply(403, '{"error":"forbidden"}');

    await assert.rejects(() => agent.listModels(), /Gemini models API returned HTTP 403/);
  });

  test('listModels rejects on unexpected response shape', async () => {
    const agent = new GeminiAgent();
    await agent.setApiKey('test-key');

    nock('https://generativelanguage.googleapis.com')
      .get('/v1beta/models')
      .reply(200, '{"notModels":[]}');

    await assert.rejects(() => agent.listModels(), /Unexpected response shape/);
  });

  test('listModels rejects when no API key set', async () => {
    const agent = new GeminiAgent();
    await assert.rejects(() => agent.listModels(), /No API key set/);
  });

  test('generateCode throws when no API key set', async () => {
    const agent = new GeminiAgent();
    const gen = agent.generateCode({ outputFormat: 'tsx' } as any);
    await assert.rejects(() => gen.next(), /No API key set/);
  });
});
