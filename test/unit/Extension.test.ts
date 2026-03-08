import * as assert from 'assert';
import * as sinon from 'sinon';
import { activate, deactivate } from '../../src/extension';
import { Logger } from '../../src/logger/Logger';
import { SidebarProvider } from '../../src/webview/SidebarProvider';

suite('Extension Comprehensive', () => {
  let mockContext: any;
  let sandbox: sinon.SinonSandbox;
  let outputChannel: any;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockContext = {
      subscriptions: [],
      extensionUri: { path: '/test', fsPath: '/test' },
      secrets: {
        get: sandbox.stub().resolves('test-key'),
        store: sandbox.stub().resolves(),
        delete: sandbox.stub().resolves(),
      },
      globalState: { get: sandbox.stub().returns('gemini'), update: sandbox.stub().resolves() },
      extension: { id: 'bd-creative.figma-mcp-helper', packageJSON: { version: '1.0.0' } },
    };

    const vscode = require('vscode');
    outputChannel = {
      appendLine: () => {},
      clear: () => {},
      show: () => {},
      dispose: sandbox.stub(),
    };
    vscode.window.createOutputChannel.returns(outputChannel);
    vscode.window.registerUriHandler = sandbox.stub().returns({ dispose: sandbox.stub() });
    vscode.commands.registerCommand = sandbox.stub();
    vscode.window.registerWebviewViewProvider = sandbox.stub();
    vscode.commands.executeCommand = sandbox.stub();
    vscode.window.showSaveDialog = sandbox.stub();
    vscode.workspace.fs.writeFile = sandbox.stub().resolves();
    sandbox.stub(SidebarProvider.prototype, 'dispose').resolves();
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
    assert.ok(
      vscode.commands.executeCommand.calledWith('workbench.view.extension.figma-mcp-helper'),
    );

    const generate = commands.find((c: any) => c[0] === 'figma-mcp-helper.generate')?.[1];
    assert.ok(generate);
    generate();

    const promptGenerate = commands.find(
      (c: any) => c[0] === 'figma-mcp-helper.prompt.generate',
    )?.[1];
    assert.ok(promptGenerate);
    promptGenerate();

    const uriHandler = vscode.window.registerUriHandler.args[0][0];
    assert.ok(uriHandler);
    await uriHandler.handleUri(
      vscode.Uri.parse(
        `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/figma-remote-auth?access_token=test-token`,
      ),
    );
    assert.ok(mockContext.secrets.store.called);

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

  test('uri handler ignores non-remote-auth paths and reports callback failures', async () => {
    const vscode = require('vscode');
    await activate(mockContext);

    const uriHandler = vscode.window.registerUriHandler.args[0][0];
    assert.ok(uriHandler);

    await uriHandler.handleUri(
      vscode.Uri.parse(
        `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/not-figma-remote-auth?access_token=test-token`,
      ),
    );
    assert.ok(mockContext.secrets.store.notCalled);

    mockContext.secrets.store.rejects(new Error('store failed'));
    await uriHandler.handleUri(
      vscode.Uri.parse(
        `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/figma-remote-auth?access_token=test-token`,
      ),
    );

    assert.ok(vscode.window.showErrorMessage.calledOnce);
  });

  test('deactivate disposes providers and output channel', async () => {
    await activate(mockContext);
    await deactivate();

    assert.strictEqual((SidebarProvider.prototype.dispose as any).callCount, 3);
    assert.ok(outputChannel.dispose.calledOnce);
  });
});
