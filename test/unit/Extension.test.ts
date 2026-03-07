import * as assert from 'assert';
import * as sinon from 'sinon';
import { activate, deactivate } from '../../src/extension';
import { Logger } from '../../src/logger/Logger';

suite('Extension Comprehensive', () => {
  let mockContext: any;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockContext = {
      subscriptions: [],
      extensionUri: { path: '/test', fsPath: '/test' },
      secrets: { 
          get: sandbox.stub().resolves('test-key'),
          store: sandbox.stub().resolves(),
          delete: sandbox.stub().resolves()
      },
      globalState: { get: sandbox.stub().returns('gemini'), update: sandbox.stub().resolves() },
      extension: { packageJSON: { version: '1.0.0' } }
    };
    
    const vscode = require('vscode');
    vscode.window.createOutputChannel.returns({ appendLine: () => {}, clear: () => {}, show: () => {} });
    vscode.commands.registerCommand = sandbox.stub();
    vscode.window.registerWebviewViewProvider = sandbox.stub();
    vscode.commands.executeCommand = sandbox.stub();
    vscode.window.showSaveDialog = sandbox.stub();
    vscode.workspace.fs.writeFile = sandbox.stub().resolves();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('activate and commands', async () => {
    const vscode = require('vscode');
    await activate(mockContext);

    const commands = vscode.commands.registerCommand.args;

    const connect = commands.find((c: any) => c[0] === 'figma-mcp-helper.connect')?.[1];
    assert.ok(connect);
    await connect();
    assert.ok(vscode.commands.executeCommand.calledWith('workbench.view.extension.figma-mcp-helper'));

    const generate = commands.find((c: any) => c[0] === 'figma-mcp-helper.generate')?.[1];
    assert.ok(generate);
    generate();

    const agentSave = commands.find((c: any) => c[0] === 'figma-mcp-helper.agent.save')?.[1];
    assert.ok(agentSave);
    agentSave();

    const agentClear = commands.find((c: any) => c[0] === 'figma-mcp-helper.agent.clear')?.[1];
    assert.ok(agentClear);
    agentClear();

    const promptGenerate = commands.find((c: any) => c[0] === 'figma-mcp-helper.prompt.generate')?.[1];
    assert.ok(promptGenerate);
    promptGenerate();

    const logCopy = commands.find((c: any) => c[0] === 'figma-mcp-helper.log.copy')?.[1];
    assert.ok(logCopy);
    vscode.env.clipboard = { writeText: sandbox.stub().resolves() };
    vscode.window.showInformationMessage.resetHistory?.();
    await logCopy();

    const clearLog = commands.find((c: any) => c[0] === 'figma-mcp-helper.log.clear')?.[1];
    assert.ok(clearLog);
    clearLog();

    const saveLog = commands.find((c: any) => c[0] === 'figma-mcp-helper.log.save')?.[1];
    assert.ok(saveLog);

    // Test .json branch
    vscode.window.showSaveDialog.resolves({ fsPath: '/test.json' });
    await saveLog();
    assert.ok(vscode.workspace.fs.writeFile.called);

    // Test .txt branch
    vscode.workspace.fs.writeFile.resetHistory();
    vscode.window.showSaveDialog.resolves({ fsPath: '/test.txt' });
    await saveLog();
    assert.ok(vscode.workspace.fs.writeFile.called);

    // Test cancelled (uri = undefined)
    vscode.window.showSaveDialog.resolves(undefined);
    vscode.workspace.fs.writeFile.resetHistory();
    await saveLog();
    assert.ok(!vscode.workspace.fs.writeFile.called);
  });

  test('deactivate', () => {
    deactivate();
  });
});
