import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AgentCommandHandler } from '../../../src/webview/handlers/AgentCommandHandler';
import { AgentFactory } from '../../../src/agent/AgentFactory';
import { StateManager } from '../../../src/state/StateManager';

suite('AgentCommandHandler', () => {
  let sandbox: sinon.SinonSandbox;
  let webview: { postMessage: sinon.SinonSpy };
  let context: any;
  let stateManager: StateManager;
  let handler: AgentCommandHandler;

  setup(() => {
    sandbox = sinon.createSandbox();
    (vscode.env.openExternal as sinon.SinonStub).resetHistory();
    (vscode.workspace.openTextDocument as sinon.SinonStub).resetHistory();
    (vscode.window.showTextDocument as sinon.SinonStub).resetHistory();
    webview = { postMessage: sandbox.spy() };
    context = {
      globalState: {
        get: sandbox.stub(),
        update: sandbox.stub().resolves(),
      },
      secrets: {
        get: sandbox.stub().resolves('saved-secret'),
        store: sandbox.stub().resolves(),
        delete: sandbox.stub().resolves(),
      },
    };
    stateManager = new StateManager();
    handler = new AgentCommandHandler(webview as any, context, stateManager);
  });

  teardown(() => {
    sandbox.restore();
    AgentFactory.clear();
  });

  test('opens Gemini API key help URL', async () => {
    await handler.getApiKeyHelp('gemini');
    assert.ok((vscode.env.openExternal as sinon.SinonStub).calledOnce);
  });

  test('opens Claude API key help URL', async () => {
    await handler.getApiKeyHelp('claude');
    assert.ok((vscode.env.openExternal as sinon.SinonStub).calledOnce);
  });

  test('getApiKeyHelp ignores unknown agent values', async () => {
    await handler.getApiKeyHelp('unknown' as any);
    assert.ok((vscode.env.openExternal as sinon.SinonStub).notCalled);
  });

  test('getState loads persisted settings and API key status', async () => {
    context.globalState.get.withArgs('iagent-engineer.defaultAgent', 'gemini').returns('claude');
    context.globalState.get.withArgs('iagent-engineer.defaultModel', '').returns('claude-3');

    await handler.getState();

    assert.strictEqual(stateManager.getAgent(), 'claude');
    assert.strictEqual(stateManager.getModel(), 'claude-3');
    assert.ok(webview.postMessage.calledWithMatch({ event: 'agent.state', hasApiKey: true }));
  });

  test('getState reports missing API key', async () => {
    context.globalState.get.withArgs('iagent-engineer.defaultAgent', 'gemini').returns('gemini');
    context.globalState.get.withArgs('iagent-engineer.defaultModel', '').returns('');
    context.secrets.get.resolves(undefined);

    await handler.getState();

    assert.ok(webview.postMessage.calledWithMatch({ event: 'agent.state', hasApiKey: false }));
  });

  test('getState keeps the current in-memory selection after setup changes', async () => {
    context.globalState.get.withArgs('iagent-engineer.defaultAgent', 'gemini').returns('gemini');
    context.globalState.get.withArgs('iagent-engineer.defaultModel', '').returns('saved-model');
    stateManager.setAgent('claude');
    stateManager.setModel('claude-3');

    await handler.getState();

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'agent.state',
        agent: 'claude',
        model: 'claude-3',
      }),
    );
  });

  test('getModelInfoHelp applies saved key before loading model info', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      getModelInfo: sandbox.stub().resolves({ id: 'm1' }),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);
    (vscode.workspace.openTextDocument as sinon.SinonStub).resolves({});
    (vscode.window.showTextDocument as sinon.SinonStub).resolves();

    await handler.getModelInfoHelp('gemini', 'm1');

    assert.ok(agent.setApiKey.calledWith('saved-secret'));
    assert.ok(agent.getModelInfo.calledWith('m1'));
  });

  test('getModelInfoHelp skips setApiKey when no saved key exists', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      getModelInfo: sandbox.stub().resolves({ id: 'm1' }),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);
    context.secrets.get.resolves(undefined);
    (vscode.workspace.openTextDocument as sinon.SinonStub).resolves({});
    (vscode.window.showTextDocument as sinon.SinonStub).resolves();

    await handler.getModelInfoHelp('gemini', 'm1');

    assert.ok(agent.setApiKey.notCalled);
    assert.ok(agent.clearApiKey.calledOnce);
  });

  test('getModelInfoHelp writes JSON document and opens it', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      getModelInfo: sandbox.stub().resolves({
        id: 'model-a',
        description: 'demo',
        documentationUrl: 'https://example.com/model-a',
      }),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);
    (vscode.workspace.openTextDocument as sinon.SinonStub).resolves({ uri: 'doc' });
    (vscode.window.showTextDocument as sinon.SinonStub).resolves();

    await handler.getModelInfoHelp('gemini', 'model-a');

    assert.ok(
      (vscode.workspace.openTextDocument as sinon.SinonStub).calledWithMatch({
        language: 'json',
        content: sinon.match(/"requestedModelId": "model-a"/),
      }),
    );
    assert.ok(
      (vscode.workspace.openTextDocument as sinon.SinonStub).calledWithMatch({
        content: sinon.match(/"documentationUrl": "https:\/\/example.com\/model-a"/),
      }),
    );
    assert.ok((vscode.window.showTextDocument as sinon.SinonStub).calledOnce);
  });

  test('getModelInfoHelp swallows model info errors', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      getModelInfo: sandbox.stub().rejects(new Error('boom')),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.getModelInfoHelp('gemini', 'm1');

    assert.ok((vscode.workspace.openTextDocument as sinon.SinonStub).notCalled);
  });

  test('setApiKey stores secret and updates agent', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.setApiKey('gemini', 'AIzaSy123456789012345678901234567890123');

    assert.ok(
      context.secrets.store.calledWith(
        'iagent-engineer.geminiApiKey',
        'AIzaSy123456789012345678901234567890123',
      ),
    );
    assert.ok(agent.setApiKey.calledWith('AIzaSy123456789012345678901234567890123'));
  });

  test('saveSettings trims and persists provided API key', async () => {
    const setApiKeyStub = sandbox.stub(handler, 'setApiKey').resolves();
    context.secrets.get.resolves('persisted-key');

    await handler.saveSettings(
      'claude',
      'claude-opus',
      '  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  ',
    );

    assert.ok(setApiKeyStub.calledWith('claude', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'));
    assert.ok(context.globalState.update.calledWith('iagent-engineer.defaultAgent', 'claude'));
    assert.ok(
      webview.postMessage.calledWithMatch({ event: 'agent.settingsSaved', hasApiKey: true }),
    );
  });

  test('setApiKey rejects invalid key format', async () => {
    await assert.rejects(
      () => handler.setApiKey('gemini', 'not-a-real-key'),
      /Invalid API key format for Gemini/,
    );
    assert.ok(context.secrets.store.notCalled);
  });

  test('setApiKey rejects Claude keys without sk-ant- prefix', async () => {
    await assert.rejects(
      () => handler.setApiKey('claude', 'sk-test-abcdefghijklmnopqrstuvwxyz'),
      /Invalid API key format for Claude/,
    );
    assert.ok(context.secrets.store.notCalled);
  });

  test('setApiKey rejects too-short Claude keys even with sk-ant- prefix', async () => {
    await assert.rejects(
      () => handler.setApiKey('claude', 'sk-ant-short'),
      /Invalid API key format for Claude/,
    );
    assert.ok(context.secrets.store.notCalled);
  });

  test('saveSettings skips setApiKey when key is blank', async () => {
    const setApiKeyStub = sandbox.stub(handler, 'setApiKey').resolves();
    context.secrets.get.resolves(undefined);

    await handler.saveSettings('gemini', 'gemini-pro', '   ');

    assert.ok(setApiKeyStub.notCalled);
    assert.ok(
      webview.postMessage.calledWithMatch({ event: 'agent.settingsSaved', hasApiKey: false }),
    );
  });

  test('saveSettings updates state manager values', async () => {
    context.secrets.get.resolves('persisted-key');

    await handler.saveSettings('claude', 'sonnet');

    assert.strictEqual(stateManager.getAgent(), 'claude');
    assert.strictEqual(stateManager.getModel(), 'sonnet');
  });

  test('clearSettings removes secret and resets defaults', async () => {
    const agent = {
      clearApiKey: sandbox.stub().resolves(),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);
    stateManager.setAgent('claude');
    stateManager.setModel('model-x');

    await handler.clearSettings('claude');

    assert.ok(context.secrets.delete.calledWith('iagent-engineer.claudeApiKey'));
    assert.ok(agent.clearApiKey.calledOnce);
    assert.strictEqual(stateManager.getAgent(), 'gemini');
    assert.strictEqual(stateManager.getModel(), '');
    assert.ok(
      webview.postMessage.calledWithMatch({ event: 'agent.settingsCleared', agent: 'claude' }),
    );
  });

  test('listModels uses runtime key on an ephemeral agent when provided', async () => {
    const persistentAgent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      listModels: sandbox.stub().resolves([{ id: 'should-not-be-used' }]),
    };
    const ephemeralAgent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      listModels: sandbox.stub().resolves([{ id: 'm1' }]),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(persistentAgent as any);
    sandbox.stub(AgentFactory, 'createEphemeralAgent').returns(ephemeralAgent as any);

    await handler.listModels('gemini', ' temporary ');

    assert.ok(ephemeralAgent.setApiKey.calledWith('temporary'));
    assert.ok(persistentAgent.setApiKey.notCalled);
    assert.ok(
      webview.postMessage.calledWithMatch({ event: 'agent.modelsResult', models: [{ id: 'm1' }] }),
    );
  });

  test('listModels falls back to saved key when runtime key is missing', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      listModels: sandbox.stub().resolves([{ id: 'm2' }]),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);

    await handler.listModels('claude');

    assert.ok(agent.setApiKey.calledWith('saved-secret'));
  });

  test('listModels skips setApiKey when no keys are available', async () => {
    const agent = {
      setApiKey: sandbox.stub().resolves(),
      clearApiKey: sandbox.stub().resolves(),
      listModels: sandbox.stub().resolves([]),
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(agent as any);
    context.secrets.get.resolves(undefined);

    await handler.listModels('claude');

    assert.ok(agent.setApiKey.notCalled);
    assert.ok(agent.clearApiKey.calledOnce);
    assert.ok(webview.postMessage.calledWithMatch({ event: 'agent.modelsResult', models: [] }));
  });
});
