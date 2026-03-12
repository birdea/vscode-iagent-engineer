import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { OpenAIAgent } from '../../src/agent/OpenAIAgent';
import { Logger } from '../../src/logger/Logger';

suite('OpenAIAgent', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    Logger.initialize({ appendLine: sandbox.stub(), clear: sandbox.stub() } as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('listModels returns configured valid entries', async () => {
    const agent = new OpenAIAgent('openrouter');
    const getStub = vscode.workspace.getConfiguration().get as sinon.SinonStub;
    getStub
      .withArgs('figma-mcp-helper.openrouterModels')
      .returns([{ id: 'model-a', name: 'Model A', outputTokenLimit: 2048 }, { id: '' }]);

    const models = await agent.listModels();

    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].id, 'model-a');
    assert.strictEqual(models[0].provider, 'openrouter');
  });

  test('listModels fills configured model defaults when optional fields are missing', async () => {
    const agent = new OpenAIAgent('openrouter');
    const getStub = vscode.workspace.getConfiguration().get as sinon.SinonStub;
    getStub.withArgs('figma-mcp-helper.openrouterModels').returns([{ id: 'model-a' }]);

    const models = await agent.listModels();

    assert.strictEqual(models[0].name, 'model-a');
    assert.strictEqual(models[0].documentationUrl, 'https://openrouter.ai/docs');
  });

  test('listModels returns fallback model when no api key is set', async () => {
    const agent = new OpenAIAgent('qwen');
    const getStub = vscode.workspace.getConfiguration().get as sinon.SinonStub;
    getStub.withArgs('figma-mcp-helper.qwenModels').returns(undefined);

    const models = await agent.listModels();

    assert.strictEqual(models[0].id, 'qwen-plus');
    assert.ok(models[0].metadataSource?.includes('qwen-static-fallback'));
  });

  test('listModels fetches model list from openai-compatible api', async () => {
    const agent = new OpenAIAgent('deepseek');
    await agent.setApiKey('test-key');
    const getStub = vscode.workspace.getConfiguration().get as sinon.SinonStub;
    getStub.withArgs('figma-mcp-helper.deepseekModels').returns(undefined);
    sandbox.stub(globalThis, 'fetch' as any).resolves({
      ok: true,
      json: async () => ({
        data: [{ id: 'deepseek-chat', object: 'model', created: 1, owned_by: 'deepseek' }],
      }),
    });

    const models = await agent.listModels();

    assert.strictEqual(models[0].id, 'deepseek-chat');
    assert.ok(models[0].metadataSource?.includes('deepseek-models-api'));
  });

  test('listModels falls back when api request fails', async () => {
    const agent = new OpenAIAgent('deepseek');
    await agent.setApiKey('test-key');
    const getStub = vscode.workspace.getConfiguration().get as sinon.SinonStub;
    getStub.withArgs('figma-mcp-helper.deepseekModels').returns(undefined);
    sandbox.stub(globalThis, 'fetch' as any).rejects(new Error('network failed'));

    const models = await agent.listModels();

    assert.strictEqual(models[0].id, 'deepseek-coder');
    assert.ok(models[0].metadataSource?.includes('deepseek-static-fallback'));
  });

  test('listModels falls back when model api returns non-ok status', async () => {
    const agent = new OpenAIAgent('deepseek');
    await agent.setApiKey('test-key');
    const getStub = vscode.workspace.getConfiguration().get as sinon.SinonStub;
    getStub.withArgs('figma-mcp-helper.deepseekModels').returns(undefined);
    sandbox.stub(globalThis, 'fetch' as any).resolves({
      ok: false,
      status: 503,
    });

    const models = await agent.listModels();

    assert.strictEqual(models[0].id, 'deepseek-coder');
  });

  test('getModelInfo returns fallback entry when model is missing', async () => {
    const agent = new OpenAIAgent('openrouter');
    sandbox.stub(agent, 'listModels').resolves([{ id: 'other-model', name: 'Other' } as any]);

    const info = await agent.getModelInfo('unknown-model');

    assert.strictEqual(info.id, 'unknown-model');
    assert.ok(info.metadataSource?.includes('openrouter-fallback'));
  });

  test('generateCode streams content and ignores malformed chunks', async () => {
    const agent = new OpenAIAgent('deepseek');
    await agent.setApiKey('test-key');
    const reader = {
      read: sandbox
        .stub()
        .onFirstCall()
        .resolves({
          done: false,
          value: new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Hello"}}]}\n' +
              'data: not-json\n' +
              'data: [DONE]\n',
          ),
        })
        .onSecondCall()
        .resolves({ done: true, value: undefined }),
      releaseLock: sandbox.stub(),
    };
    sandbox.stub(globalThis, 'fetch' as any).resolves({
      ok: true,
      body: { getReader: () => reader },
    });

    const chunks: string[] = [];
    for await (const chunk of agent.generateCode({ outputFormat: 'html' })) {
      chunks.push(chunk);
    }

    assert.deepStrictEqual(chunks, ['Hello']);
    assert.ok(reader.releaseLock.calledOnce);
  });

  test('generateCode throws when response body is null', async () => {
    const agent = new OpenAIAgent('deepseek');
    await agent.setApiKey('test-key');
    sandbox.stub(globalThis, 'fetch' as any).resolves({
      ok: true,
      body: null,
    });

    const gen = agent.generateCode({ outputFormat: 'html' });
    await assert.rejects(() => gen.next(), /Response body is null/);
  });

  test('generateCode throws provider api error when http response is not ok', async () => {
    const agent = new OpenAIAgent('qwen');
    await agent.setApiKey('test-key');
    sandbox.stub(globalThis, 'fetch' as any).resolves({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const gen = agent.generateCode({ outputFormat: 'html' });
    await assert.rejects(() => gen.next(), /qwen API error: 401/);
  });

  test('generateCode converts aborted stream errors to cancellation error', async () => {
    const agent = new OpenAIAgent('deepseek');
    await agent.setApiKey('test-key');
    const abortController = new AbortController();
    const reader = {
      read: sandbox.stub().callsFake(async () => {
        abortController.abort();
        throw new Error('stream failed');
      }),
      releaseLock: sandbox.stub(),
    };
    sandbox.stub(globalThis, 'fetch' as any).resolves({
      ok: true,
      body: { getReader: () => reader },
    });

    const gen = agent.generateCode({ outputFormat: 'html' }, abortController.signal);
    await assert.rejects(() => gen.next(), /USER_CANCELLED_CODE_GENERATION/);
    assert.ok(reader.releaseLock.calledOnce);
  });

  test('generateCode rethrows stream errors when request was not aborted', async () => {
    const agent = new OpenAIAgent('deepseek');
    await agent.setApiKey('test-key');
    const reader = {
      read: sandbox.stub().rejects(new Error('stream failed')),
      releaseLock: sandbox.stub(),
    };
    sandbox.stub(globalThis, 'fetch' as any).resolves({
      ok: true,
      body: { getReader: () => reader },
    });

    const gen = agent.generateCode({ outputFormat: 'html' });
    await assert.rejects(() => gen.next(), /stream failed/);
    assert.ok(reader.releaseLock.calledOnce);
  });

  test('unsupported provider type falls back to deepseek config', async () => {
    const agent = new OpenAIAgent('unsupported' as any);
    const models = await agent.listModels();

    assert.strictEqual(models[0].id, 'deepseek-coder');
  });
});
