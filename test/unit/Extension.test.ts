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

    const clearLog = commands.find((c: any) => c[0] === 'figma-mcp-helper.log.clear')?.[1];
    assert.ok(clearLog);
    clearLog();
    
    const saveLog = commands.find((c: any) => c[0] === 'figma-mcp-helper.log.save')?.[1];
    assert.ok(saveLog);
    vscode.window.showSaveDialog.resolves({ fsPath: '/test.json' });
    await saveLog();
    assert.ok(vscode.workspace.fs.writeFile.called);
  });

  test('deactivate', () => {
    deactivate();
  });
});
