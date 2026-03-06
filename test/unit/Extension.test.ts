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
    
    // Trigger figmalab.connect
    const connect = commands.find((c: any) => c[0] === 'figmalab.connect')[1];
    await connect();
    assert.ok(vscode.commands.executeCommand.calledWith('workbench.view.extension.figmalab'));

    // Trigger figmalab.log.clear
    const clearLog = commands.find((c: any) => c[0] === 'figmalab.log.clear')[1];
    clearLog();
    
    // Trigger figmalab.log.save
    const saveLog = commands.find((c: any) => c[0] === 'figmalab.log.save')[1];
    vscode.window.showSaveDialog.resolves({ fsPath: '/test.json' });
    await saveLog();
    assert.ok(vscode.workspace.fs.writeFile.called);
  });

  test('deactivate', () => {
    deactivate();
  });
});
