import * as assert from 'assert';
import nock from 'nock';
import * as sinon from 'sinon';
import { GeminiAgent } from '../../src/agent/GeminiAgent';
import { ClaudeAgent } from '../../src/agent/ClaudeAgent';
import { OpenAIAgent } from '../../src/agent/OpenAIAgent';
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
        mcpData: { component: 'Button' },
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
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        });

      const models = await agent.listModels();
      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, 'gemini-2.0-flash');
      assert.strictEqual(models[0].name, 'Gemini 2.0 Flash');
      assert.deepStrictEqual(models[0].supportedGenerationMethods, ['generateContent']);
    });

    test('listModels failure', async () => {
      await agent.setApiKey('test-key');
      nock('https://generativelanguage.googleapis.com').get('/v1beta/models').reply(500, 'Error');

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
        .get('/v1beta/models/gemini-pro')
        .reply(200, {
          name: 'models/gemini-pro',
          displayName: 'Gemini Pro',
          description: 'Pro model',
          inputTokenLimit: 30720,
          outputTokenLimit: 2048,
          supportedGenerationMethods: ['generateContent', 'countTokens'],
          version: '001',
          baseModelId: 'gemini-pro',
          temperature: 1,
          topP: 0.95,
          topK: 40,
        });

      const info = await agent.getModelInfo('gemini-pro');
      assert.strictEqual(info.id, 'gemini-pro');
      assert.strictEqual(info.version, '001');
      assert.deepStrictEqual(info.supportedGenerationMethods, ['generateContent', 'countTokens']);
    });

    test('getModelInfo fallback when not found', async () => {
      await agent.setApiKey('test-key');
      nock('https://generativelanguage.googleapis.com')
        .get('/v1beta/models/unknown-model')
        .reply(404, 'Not found');
      nock('https://generativelanguage.googleapis.com')
        .get('/v1beta/models')
        .reply(200, { models: [] });

      const info = await agent.getModelInfo('unknown-model');
      assert.strictEqual(info.id, 'unknown-model');
      assert.strictEqual(info.provider, 'gemini');
    });

    test('generateCode handles errors', async () => {
      await agent.setApiKey('test-key');
      // Mock the SDK internal fetch or error during streaming
      nock('https://generativelanguage.googleapis.com').post(/.*/).reply(500, 'Error');

      try {
        const gen = agent.generateCode({ outputFormat: 'html' as any, userPrompt: 'test' });
        await gen.next();
        assert.fail('Should throw');
      } catch (e) {
        assert.ok(e);
      }
    });

    test('generateCode closes Gemini stream iterator when aborted', async () => {
      const returnStub = sinon.stub().resolves({ done: true });
      const iterator = {
        next: sinon.stub().resolves({ done: true, value: undefined }),
        return: returnStub,
      };
      (agent as any).apiKey = 'test-key';
      (agent as any).client = {
        getGenerativeModel: () => ({
          generateContentStream: async () => ({
            stream: {
              [Symbol.asyncIterator]: () => iterator,
            },
          }),
        }),
      };
      const abortController = new AbortController();
      abortController.abort();

      const gen = agent.generateCode(
        { outputFormat: 'html' as any, userPrompt: 'test' },
        abortController.signal,
      );
      await assert.rejects(() => gen.next(), /USER_CANCELLED_CODE_GENERATION/);
      assert.ok(returnStub.calledOnce);
    });

    test('generateCode sends screenshot data as Gemini inlineData parts', async () => {
      let capturedRequest: any;
      (agent as any).apiKey = 'test-key';
      (agent as any).client = {
        getGenerativeModel: (params: any) => {
          assert.strictEqual(params.systemInstruction, 'Visible edited prompt');
          return {
            generateContentStream: async (request: any) => {
              capturedRequest = request;
              return {
                stream: {
                  async *[Symbol.asyncIterator]() {
                    yield { text: () => 'ok' };
                  },
                },
              };
            },
          };
        },
      };

      const chunks: string[] = [];
      for await (const chunk of agent.generateCode({
        outputFormat: 'html' as any,
        userPrompt: 'Visible edited prompt',
        screenshotData: { base64: 'abc123', mimeType: 'image/png' },
      })) {
        chunks.push(chunk);
      }

      assert.strictEqual(chunks.join(''), 'ok');
      assert.strictEqual(capturedRequest[1].inlineData.data, 'abc123');
      assert.strictEqual(capturedRequest[1].inlineData.mimeType, 'image/png');
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
      assert.strictEqual(info.provider, 'claude');
    });

    test('default opus model exposes expanded output token limit', async () => {
      const info = await agent.getModelInfo('claude-opus-4-6');
      assert.strictEqual(info.outputTokenLimit, 32768);
      assert.strictEqual(
        info.documentationUrl,
        'https://docs.anthropic.com/en/docs/about-claude/models/overview',
      );
    });

    test('getModelInfo merges Anthropic API details when available', async () => {
      await agent.setApiKey('test-key');
      nock('https://api.anthropic.com').get('/v1/models/claude-sonnet-4-6').reply(200, {
        id: 'claude-sonnet-4-6',
        display_name: 'Claude Sonnet',
        created_at: '2025-10-01T00:00:00Z',
        type: 'model',
      });

      const info = await agent.getModelInfo('claude-sonnet-4-6');
      assert.strictEqual(info.name, 'Claude Sonnet');
      assert.strictEqual(info.createdAt, '2025-10-01T00:00:00Z');
      assert.strictEqual(info.type, 'model');
      assert.ok(info.metadataSource?.includes('claude-models-api'));
    });

    test('listModels uses configured catalog when provided', async () => {
      const vscode = require('vscode');
      const getStub = vscode.workspace.getConfiguration().get;
      getStub
        .withArgs('figma-mcp-helper.claudeModels')
        .returns([{ id: 'claude-custom', name: 'Claude Custom', outputTokenLimit: 4096 }]);

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
        { id: '' }, // empty id — invalid
        { not_a_model: true }, // wrong shape
      ]);

      const models = await agent.listModels();
      assert.ok(models.length > 0);
      assert.ok(models.some((m: any) => m.id.includes('claude')));
    });

    test('generateCode rejects when no API key set', async () => {
      const gen = agent.generateCode({ outputFormat: 'tsx' as any });
      await assert.rejects(() => gen.next(), /No API key set/);
    });

    test('generateCode uses selected model output token limit', async () => {
      const streamStub = sinon.stub().returns({
        async *[Symbol.asyncIterator]() {},
      });
      (agent as any).apiKey = 'test-key';
      (agent as any).client = { messages: { stream: streamStub } };

      const gen = agent.generateCode({ outputFormat: 'tsx' as any, model: 'claude-opus-4-6' });
      await gen.next();

      assert.strictEqual(streamStub.firstCall.args[0].max_tokens, 32768);
      assert.strictEqual(streamStub.firstCall.args[1]?.signal, undefined);
    });

    test('generateCode forwards AbortSignal to official SDK stream options', async () => {
      const streamStub = sinon.stub().returns({
        async *[Symbol.asyncIterator]() {
          throw new Error('aborted');
        },
      });
      const abortController = new AbortController();
      abortController.abort();
      (agent as any).apiKey = 'test-key';
      (agent as any).client = { messages: { stream: streamStub } };

      const gen = agent.generateCode(
        { outputFormat: 'tsx' as any, model: 'claude-opus-4-6' },
        abortController.signal,
      );

      await assert.rejects(() => gen.next(), /USER_CANCELLED_CODE_GENERATION/);
      assert.strictEqual(streamStub.firstCall.args[1]?.signal, abortController.signal);
    });

    test('generateCode sends screenshot data as Claude image content', async () => {
      const streamStub = sinon.stub().returns({
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } };
        },
      });
      (agent as any).apiKey = 'test-key';
      (agent as any).client = { messages: { stream: streamStub } };

      const chunks: string[] = [];
      for await (const chunk of agent.generateCode({
        outputFormat: 'html' as any,
        userPrompt: 'Claude edited prompt',
        screenshotData: { base64: 'img64', mimeType: 'image/png' },
      })) {
        chunks.push(chunk);
      }

      assert.strictEqual(chunks.join(''), 'ok');
      assert.strictEqual(streamStub.firstCall.args[0].system, 'Claude edited prompt');
      assert.strictEqual(streamStub.firstCall.args[0].messages[0].content[1].type, 'image');
      assert.strictEqual(streamStub.firstCall.args[0].messages[0].content[1].source.data, 'img64');
    });
  });

  suite('OpenAIAgent', () => {
    let agent: OpenAIAgent;

    setup(() => {
      agent = new OpenAIAgent('openrouter');
    });

    test('generateCode remaps deprecated OpenRouter DeepSeek Coder model ids', async () => {
      await agent.setApiKey('test-key');

      nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', (body) => {
          assert.strictEqual(body.model, 'deepseek/deepseek-chat');
          return true;
        })
        .reply(
          200,
          'data: {"choices":[{"delta":{"content":"const App = () => null;"}}]}\n\ndata: [DONE]\n',
          { 'Content-Type': 'text/event-stream' },
        );

      const chunks: string[] = [];
      for await (const chunk of agent.generateCode({
        outputFormat: 'tsx' as any,
        model: 'deepseek/deepseek-coder',
      })) {
        chunks.push(chunk);
      }

      assert.strictEqual(chunks.join(''), 'const App = () => null;');
    });

    test('generateCode includes upstream OpenRouter error details', async () => {
      await agent.setApiKey('test-key');

      nock('https://openrouter.ai')
        .post('/api/v1/chat/completions')
        .reply(400, {
          error: {
            message: 'No endpoints found for deepseek/deepseek-coder.',
          },
        });

      const gen = agent.generateCode({
        outputFormat: 'tsx' as any,
        model: 'deepseek/deepseek-coder',
      });

      await assert.rejects(
        () => gen.next(),
        /openrouter API error: 400 - No endpoints found for deepseek\/deepseek-coder\./,
      );
    });

    test('generateCode sends screenshot data as OpenRouter image_url content', async () => {
      await agent.setApiKey('test-key');

      nock('https://openrouter.ai')
        .post('/api/v1/chat/completions', (body) => {
          assert.strictEqual(body.messages[0].content, 'Visible edited prompt');
          assert.strictEqual(body.messages[1].content[1].type, 'image_url');
          assert.ok(
            body.messages[1].content[1].image_url.url.includes('data:image/png;base64,img64'),
          );
          return true;
        })
        .reply(200, 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n', {
          'Content-Type': 'text/event-stream',
        });

      const chunks: string[] = [];
      for await (const chunk of agent.generateCode({
        outputFormat: 'html' as any,
        userPrompt: 'Visible edited prompt',
        screenshotData: { base64: 'img64', mimeType: 'image/png' },
      })) {
        chunks.push(chunk);
      }

      assert.strictEqual(chunks.join(''), 'ok');
    });
  });
});
