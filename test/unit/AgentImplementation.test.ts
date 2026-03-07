import * as assert from 'assert';
import nock from 'nock';
import { GeminiAgent } from '../../src/agent/GeminiAgent';
import { ClaudeAgent } from '../../src/agent/ClaudeAgent';
import { Logger } from '../../src/logger/Logger';
import { PromptBuilder } from '../../src/prompt/PromptBuilder';

suite('Agent Implementations', () => {
  setup(() => {
    Logger.initialize({ appendLine: () => {}, clear: () => {} } as any);
  });

  teardown(() => {
    nock.cleanAll();
  });

  suite('GeminiAgent', () => {
    let agent: GeminiAgent;

    setup(() => {
      agent = new GeminiAgent();
    });

    test('PromptBuilder includes context for agent payload', () => {
      const payload = { 
        outputFormat: 'html' as any, 
        userPrompt: 'make it blue',
        mcpData: { component: 'Button' }
      };
      const prompt = new PromptBuilder().build(payload);
      assert.ok(prompt.toLowerCase().includes('html'));
      assert.ok(prompt.includes('make it blue'));
      assert.ok(prompt.includes('Button'));
    });

    test('listModels success', async () => {
      await agent.setApiKey('test-key');
      nock('https://generativelanguage.googleapis.com')
        .get('/v1beta/models')
        .reply(200, {
          models: [
            {
              name: 'models/gemini-2.0-flash',
              displayName: 'Gemini 2.0 Flash',
              description: 'Latest Gemini model',
              inputTokenLimit: 1000000,
              outputTokenLimit: 8192,
            },
          ],
        });

      const models = await agent.listModels();
      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, 'gemini-2.0-flash');
      assert.strictEqual(models[0].name, 'Gemini 2.0 Flash');
    });

    test('listModels failure', async () => {
      await agent.setApiKey('test-key');
      nock('https://generativelanguage.googleapis.com')
        .get('/v1beta/models')
        .reply(500, 'Error');

      try {
        await agent.listModels();
        assert.fail('Should throw');
      } catch (e) {
        assert.ok(e);
      }
    });

    test('getModelInfo returns specific model', async () => {
      await agent.setApiKey('test-key');
      nock('https://generativelanguage.googleapis.com')
        .get('/v1beta/models')
        .reply(200, {
          models: [{ name: 'models/gemini-pro', displayName: 'Gemini Pro' }],
        });

      const info = await agent.getModelInfo('gemini-pro');
      assert.strictEqual(info.id, 'gemini-pro');
    });

    test('getModelInfo fallback when not found', async () => {
      await agent.setApiKey('test-key');
      nock('https://generativelanguage.googleapis.com')
        .get('/v1beta/models')
        .reply(200, { models: [] });

      const info = await agent.getModelInfo('unknown-model');
      assert.strictEqual(info.id, 'unknown-model');
    });

    test('generateCode handles errors', async () => {
      await agent.setApiKey('test-key');
      // Mock the SDK internal fetch or error during streaming
      nock('https://generativelanguage.googleapis.com')
        .post(/.*/)
        .reply(500, 'Error');

      try {
        const gen = agent.generateCode({ outputFormat: 'html' as any, userPrompt: 'test' });
        await gen.next();
        assert.fail('Should throw');
      } catch (e) {
        assert.ok(e);
      }
    });
  });

  suite('ClaudeAgent', () => {
    let agent: ClaudeAgent;

    setup(() => {
      agent = new ClaudeAgent();
    });

    test('PromptBuilder includes context for agent payload', () => {
      const payload = { 
        outputFormat: 'tsx' as any, 
        userPrompt: 'dark mode',
      };
      const prompt = new PromptBuilder().build(payload);
      assert.ok(prompt.toLowerCase().includes('tsx'));
      assert.ok(prompt.includes('dark mode'));
    });

    test('getModelInfo returns correct model', async () => {
      const info = await agent.getModelInfo('claude-sonnet-4-6');
      assert.strictEqual(info.id, 'claude-sonnet-4-6');
    });

    test('listModels uses configured catalog when provided', async () => {
      const vscode = require('vscode');
      const getStub = vscode.workspace.getConfiguration().get;
      getStub.withArgs('figma-mcp-helper.claudeModels').returns([
        { id: 'claude-custom', name: 'Claude Custom', outputTokenLimit: 4096 },
      ]);

      const models = await agent.listModels();
      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, 'claude-custom');
      assert.strictEqual(models[0].name, 'Claude Custom');
    });

    test('generateCode handles errors', async () => {
      await agent.setApiKey('test-key');
      nock('https://api.anthropic.com')
        .post('/v1/messages')
        .reply(401, { error: { message: 'Invalid' } });

      try {
        const gen = agent.generateCode({ outputFormat: 'tsx' as any, userPrompt: 'test' });
        await gen.next();
        assert.fail('Should throw');
      } catch (e: any) {
        assert.ok(e.message);
      }
    });

    test('listModels returns defaults when all configured models are invalid', async () => {
      const vscode = require('vscode');
      const getStub = vscode.workspace.getConfiguration().get;
      getStub.withArgs('figma-mcp-helper.claudeModels').returns([
        { id: '' },              // empty id — invalid
        { not_a_model: true },   // wrong shape
      ]);

      const models = await agent.listModels();
      assert.ok(models.length > 0);
      assert.ok(models.some((m: any) => m.id.includes('claude')));
    });

    test('generateCode rejects when no API key set', async () => {
      const gen = agent.generateCode({ outputFormat: 'tsx' as any });
      await assert.rejects(() => gen.next(), /No API key set/);
    });
  });
});
