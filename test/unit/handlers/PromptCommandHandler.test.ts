import * as assert from 'assert';
import * as sinon from 'sinon';
import { PromptCommandHandler } from '../../../src/webview/handlers/PromptCommandHandler';
import { AgentFactory } from '../../../src/agent/AgentFactory';
import { StateManager } from '../../../src/state/StateManager';

suite('PromptCommandHandler', () => {
  let sandbox: sinon.SinonSandbox;
  let webview: { postMessage: sinon.SinonSpy };
  let context: any;
  let editorIntegration: any;
  let stateManager: StateManager;
  let handler: PromptCommandHandler;

  setup(() => {
    sandbox = sinon.createSandbox();
    webview = { postMessage: sandbox.spy() };
    context = {
      secrets: {
        get: sandbox.stub().resolves('saved-api-key'),
      },
    };
    editorIntegration = {
      openInEditor: sandbox.stub().resolves(),
      openPreviewPanel: sandbox.stub(),
      saveAsNewFile: sandbox.stub().resolves(),
    };
    stateManager = new StateManager();
    stateManager.setAgent('claude');
    stateManager.setModel('claude-model');
    stateManager.setLastMcpData({ fileId: 'F1' });
    handler = new PromptCommandHandler(
      webview as any,
      context,
      editorIntegration,
      stateManager,
      'ko',
    );
  });

  teardown(() => {
    sandbox.restore();
    AgentFactory.clear();
  });

  test('generate rejects concurrent execution', async () => {
    (handler as any).isGenerating = true;

    await handler.generate({ outputFormat: 'html' });

    assert.ok(webview.postMessage.calledWithMatch({ event: 'prompt.error', code: 'failed' }));
  });

  test('generate uses state agent and model defaults', async () => {
    let capturedPayload: any;
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* (payload: any) {
        capturedPayload = payload;
        yield 'chunk';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html' });

    assert.strictEqual(capturedPayload.agent, 'claude');
    assert.strictEqual(capturedPayload.model, 'claude-model');
  });

  test('generate preserves requested output format and user prompt', async () => {
    let capturedPayload: any;
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* (payload: any) {
        capturedPayload = payload;
        yield 'chunk';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({
      outputFormat: 'tailwind',
      userPrompt: 'Use a two-column card layout with bold section titles.',
    });

    assert.strictEqual(capturedPayload.outputFormat, 'tailwind');
    assert.strictEqual(
      capturedPayload.userPrompt,
      'Use a two-column card layout with bold section titles.',
    );
  });

  test('generate loads saved API key before generation', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield 'chunk';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'tsx' });

    assert.ok(agent.setApiKey.calledWith('saved-api-key'));
  });

  test('generate skips setApiKey when no secret exists', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield 'chunk';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);
    context.secrets.get.resolves(undefined);

    await handler.generate({ outputFormat: 'tsx' });

    assert.ok(agent.setApiKey.notCalled);
  });

  test('generate uses state MCP data when payload does not include it', async () => {
    let capturedPayload: any;
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* (payload: any) {
        capturedPayload = payload;
        yield 'chunk';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html' });

    assert.deepStrictEqual(capturedPayload.mcpData, { fileId: 'F1' });
  });

  test('generate keeps explicit MCP data from payload', async () => {
    let capturedPayload: any;
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* (payload: any) {
        capturedPayload = payload;
        yield 'chunk';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html', mcpData: { fileId: 'override' } });

    assert.deepStrictEqual(capturedPayload.mcpData, { fileId: 'override' });
  });

  test('generate streams chunks and final result', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield 'hello ';
        yield 'world';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html' });

    assert.ok(webview.postMessage.calledWithMatch({ event: 'prompt.logClear' }));
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.logAppend',
        entry: sinon.match({ message: sinon.match(/Request sent to AI agent/) }),
      }),
    );
    assert.ok(editorIntegration.openInEditor.calledWith('hello world', 'html'));
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.streaming',
        progress: sinon.match.number,
        text: 'hello ',
      }),
    );
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.result',
        code: 'hello world',
        complete: true,
      }),
    );
  });

  test('generate posts progress updates from start to finish', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield 'a';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html' });

    assert.ok(webview.postMessage.calledWithMatch({ event: 'prompt.streaming', progress: 0 }));
    assert.ok(webview.postMessage.calledWithMatch({ event: 'prompt.streaming', progress: 100 }));
  });

  test('generate reports agent errors as failed', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        throw new Error('agent failed');
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html' });

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.logAppend',
        entry: sinon.match({ message: sinon.match(/Generation failed before any output/) }),
      }),
    );
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.error',
        code: 'failed',
        message: 'agent failed',
      }),
    );
  });

  test('cancel aborts active request', async () => {
    let capturedSignal: AbortSignal | undefined;
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* (_payload: any, signal?: AbortSignal) {
        capturedSignal = signal;
        yield 'partial';
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (signal?.aborted) {
          throw new Error('USER_CANCELLED_CODE_GENERATION');
        }
        yield 'never';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    const promise = handler.generate({ outputFormat: 'html', requestId: 'req-1' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    handler.cancel('req-1');
    await promise;

    assert.strictEqual(capturedSignal?.aborted, true);
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.result',
        code: 'partial',
        complete: false,
      }),
    );
  });

  test('generate keeps partial code visible when stream fails mid-flight', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield 'hello';
        throw new Error('stream broke');
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html' });

    assert.ok(editorIntegration.openInEditor.calledWith('hello', 'html'));
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.result',
        code: 'hello',
        complete: false,
        message: 'stream broke',
      }),
    );
  });

  test('cancel ignores mismatched request ids', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield 'done';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    const promise = handler.generate({ outputFormat: 'html', requestId: 'req-1' });
    handler.cancel('req-2');
    await promise;

    assert.ok(webview.postMessage.calledWithMatch({ event: 'prompt.result', code: 'done' }));
  });

  test('cancel is a no-op when generation is idle', () => {
    assert.doesNotThrow(() => handler.cancel('req-1'));
  });

  test('estimate uses state MCP data by default', () => {
    handler.estimate({ outputFormat: 'html' });
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.estimateResult',
        tokens: sinon.match.number,
      }),
    );
  });

  test('estimate keeps payload MCP data override', () => {
    handler.estimate({ outputFormat: 'html', mcpData: { fileId: 'explicit' } });
    assert.ok(webview.postMessage.calledOnce);
  });

  test('openEditor delegates to editor integration', async () => {
    await handler.openEditor('const x = 1;', 'typescript');
    assert.ok(editorIntegration.openInEditor.calledWith('const x = 1;', 'typescript'));
  });

  test('generate opens tailwind result in html editor mode', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield '<div class="px-4">Demo</div>';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'tailwind' });

    assert.ok(editorIntegration.openInEditor.calledWith('<div class="px-4">Demo</div>', 'html'));
  });

  test('generate logs partial editor open when stream breaks after output', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield 'hello';
        throw new Error('stream broke');
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.generate({ outputFormat: 'html' });

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'prompt.logAppend',
        entry: sinon.match({ message: sinon.match(/Partial output opened in editor/) }),
      }),
    );
  });

  test('saveFile delegates to editor integration', async () => {
    await handler.saveFile('body', 'demo.ts');
    assert.ok(editorIntegration.saveAsNewFile.calledWith('body', 'demo.ts'));
  });

  test('openPreviewPanel delegates to editor integration', async () => {
    await handler.openPreviewPanel('<div>preview</div>', 'html');
    assert.ok(editorIntegration.openPreviewPanel.calledWith('<div>preview</div>', 'html'));
  });

  test('getGeneratingState reflects lifecycle changes', async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        await wait;
        yield 'done';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    const run = handler.generate({ outputFormat: 'html' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.strictEqual(handler.getGeneratingState(), true);
    release();
    await run;
    assert.strictEqual(handler.getGeneratingState(), false);
  });
});
