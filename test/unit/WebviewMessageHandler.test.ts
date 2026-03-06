import * as assert from 'assert';
import * as sinon from 'sinon';
import { WebviewMessageHandler } from '../../src/webview/WebviewMessageHandler';
import { AgentFactory } from '../../src/agent/AgentFactory';
import { Logger } from '../../src/logger/Logger';

suite('WebviewMessageHandler Comprehensive', () => {
  let handler: WebviewMessageHandler;
  let mockWebview: any;
  let mockContext: any;
  let sandbox: sinon.SinonSandbox;
  let postMessageSpy: sinon.SinonSpy;

  setup(() => {
    sandbox = sinon.createSandbox();
    postMessageSpy = sandbox.spy();
    mockWebview = { postMessage: postMessageSpy };
    mockContext = {
      globalState: { get: sandbox.stub(), update: sandbox.stub().resolves() },
      secrets: { get: sandbox.stub().resolves('key'), store: sandbox.stub().resolves(), delete: sandbox.stub().resolves() },
      extensionUri: { path: '/test' },
    };
    handler = new WebviewMessageHandler(mockWebview, mockContext, 'http://localhost:3845');
    Logger.initialize({ appendLine: () => {}, clear: () => {} } as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('getSourceFromCommand logic', () => {
    assert.strictEqual((handler as any).getSourceFromCommand('figma.connect'), 'figma');
    assert.strictEqual((handler as any).getSourceFromCommand('agent.getState'), 'agent');
    assert.strictEqual((handler as any).getSourceFromCommand('prompt.generate'), 'prompt');
    assert.strictEqual((handler as any).getSourceFromCommand('editor.open'), 'prompt');
  });

  test('handle figma.connect', async () => {
    sandbox.stub((handler as any).mcpClient, 'initialize').resolves(true);
    sandbox.stub((handler as any).mcpClient, 'listTools').resolves(['t1']);
    await handler.handle({ command: 'figma.connect' });
    assert.ok(postMessageSpy.calledWithMatch({ event: 'figma.status', connected: true }));
  });

  test('handle agent.getState', async () => {
    mockContext.globalState.get.withArgs('figmalab.defaultAgent').returns('claude');
    await handler.handle({ command: 'agent.getState' });
    assert.ok(postMessageSpy.calledWithMatch({ event: 'agent.state', agent: 'claude' }));
  });

  test('handle agent.saveSettings', async () => {
    await handler.handle({ command: 'agent.saveSettings', agent: 'gemini', model: 'm1', key: 'k1' });
    assert.ok(mockContext.secrets.store.called);
    assert.ok(postMessageSpy.calledWithMatch({ event: 'agent.settingsSaved' }));
  });

  test('handle agent.clearSettings', async () => {
    await handler.handle({ command: 'agent.clearSettings', agent: 'gemini' });
    assert.ok(mockContext.secrets.delete.called);
    assert.ok(postMessageSpy.calledWithMatch({ event: 'agent.settingsCleared' }));
  });

  test('handle prompt.generate', async () => {
    const mockAgent = {
        setApiKey: sandbox.stub().resolves(),
        generateCode: async function*() { yield 'chunk'; }
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(mockAgent as any);
    await handler.handle({ command: 'prompt.generate', payload: { userPrompt: 'ok', outputFormat: 'html' } });
    assert.ok(postMessageSpy.calledWithMatch({ event: 'prompt.result' }));
  });

  test('handle editor.open', async () => {
    const vscode = require('vscode');
    vscode.workspace.openTextDocument.resolves({ show: sandbox.stub() });
    await handler.handle({ command: 'editor.open', code: 'code', language: 'js' });
    assert.ok(vscode.workspace.openTextDocument.called);
  });

  test('handle figma.screenshot', async () => {
      sandbox.stub((handler as any).screenshotService, 'fetchScreenshot').resolves('img');
      sandbox.stub((handler as any).screenshotService, 'openInEditor').resolves();
      
      await handler.handle({ command: 'figma.screenshot', mcpData: 'https://figma.com/file/ABCDE/test?node-id=1-1' });
      
      assert.ok(postMessageSpy.calledWithMatch({ event: 'figma.screenshotResult', base64: 'img' }));
  });

  test('handle agent.setApiKey', async () => {
      await handler.handle({ command: 'agent.setApiKey', agent: 'gemini', key: 'new-key' });
      assert.ok(mockContext.secrets.store.calledWith('figmalab.geminiApiKey', 'new-key'));
  });

  test('handle agent.listModels with key', async () => {
      const mockAgent = {
          setApiKey: sandbox.stub().resolves(),
          listModels: sandbox.stub().resolves([{ id: 'm1' }])
      };
      sandbox.stub(AgentFactory, 'getAgent').returns(mockAgent as any);
      await handler.handle({ command: 'agent.listModels', agent: 'gemini', key: 'temp-key' });
      assert.ok(mockAgent.setApiKey.calledWith('temp-key'));
      assert.ok(postMessageSpy.calledWithMatch({ event: 'agent.modelsResult' }));
  });

  test('handle agent.clearSettings', async () => {
      await handler.handle({ command: 'agent.clearSettings', agent: 'gemini' });
      assert.ok(mockContext.secrets.delete.calledWith('figmalab.geminiApiKey'));
      assert.ok(postMessageSpy.calledWithMatch({ event: 'agent.settingsCleared', agent: 'gemini' }));
  });

  test('handle agent.saveSettings', async () => {
      await handler.handle({ command: 'agent.saveSettings', agent: 'claude', model: 'opus', key: 'key' });
      assert.ok(mockContext.secrets.store.calledWith('figmalab.claudeApiKey', 'key'));
      assert.ok(postMessageSpy.calledWithMatch({ event: 'agent.settingsSaved', model: 'opus' }));
  });

  test('handle agent.getModelInfoHelp', async () => {
      const vscode = require('vscode');
      const mockAgent = { getModelInfo: sandbox.stub().resolves({ id: 'm', name: 'Name' }) };
      sandbox.stub(AgentFactory, 'getAgent').returns(mockAgent as any);
      
      await handler.handle({ command: 'agent.getModelInfoHelp', agent: 'gemini', modelId: 'm' });
      assert.ok(vscode.workspace.openTextDocument.called);
  });

  test('handle figma.fetchData failure', async () => {
      sandbox.stub((handler as any).mcpClient, 'isConnected').returns(true);
      sandbox.stub((handler as any).mcpClient, 'callTool').rejects(new Error('Fetch failed'));
      
      await handler.handle({ command: 'figma.fetchData', mcpData: 'https://figma.com/file/F' });
      assert.ok(postMessageSpy.calledWithMatch({ event: 'figma.dataResult' }));
  });

  test('handle prompt.generate failure', async () => {
      const mockAgent = {
          setApiKey: sandbox.stub().resolves(),
          generateCode: async function*() { throw new Error('Gen failed'); }
      };
      sandbox.stub(AgentFactory, 'getAgent').returns(mockAgent as any);
      
      try {
          await handler.handle({ command: 'prompt.generate', payload: { userPrompt: 'test', outputFormat: 'html' } });
      } catch (e) {
          assert.strictEqual((e as Error).message, 'Gen failed');
      }
      assert.ok(postMessageSpy.calledWithMatch({ event: 'prompt.error', message: 'Gen failed' }));
  });

  test('handle editor.saveFile', async () => {
      const saveSpy = sandbox.stub((handler as any).editorIntegration, 'saveAsNewFile').resolves();
      await handler.handle({ command: 'editor.saveFile', code: 'c', filename: 'f.ts' });
      assert.ok(saveSpy.calledWith('c', 'f.ts'));
  });
});
