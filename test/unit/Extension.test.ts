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
      extension: { id: 'bd-creative.iagent-engineer', packageJSON: { version: '1.0.0' } },
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
    sandbox.stub(SidebarProvider.prototype, 'dispose').resolves();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('activate and commands', async () => {
    const vscode = require('vscode');
    await activate(mockContext);

    const commands = vscode.commands.registerCommand.args;

    const connect = commands.find((c: any) => c[0] === 'iagent-engineer.connect')?.[1];
    assert.ok(connect);
    await connect();
    assert.ok(
      vscode.commands.executeCommand.calledWith('workbench.view.extension.iagent-engineer'),
    );

    const generate = commands.find((c: any) => c[0] === 'iagent-engineer.generate')?.[1];
    assert.ok(generate);
    generate();

    const promptGenerate = commands.find(
      (c: any) => c[0] === 'iagent-engineer.prompt.generate',
    )?.[1];
    assert.ok(promptGenerate);
    promptGenerate();

    const uriHandler = vscode.window.registerUriHandler.args[0][0];
    assert.ok(uriHandler);
    await uriHandler.handleUri(
      vscode.Uri.parse(
        `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?access_token=test-token`,
      ),
    );
    assert.ok(mockContext.secrets.store.called);

    const logCopy = commands.find((c: any) => c[0] === 'iagent-engineer.log.copy')?.[1];
    assert.ok(logCopy);
    vscode.env.clipboard = { writeText: sandbox.stub().resolves() };
    vscode.window.showInformationMessage.resetHistory?.();
    await logCopy();

    const clearLog = commands.find((c: any) => c[0] === 'iagent-engineer.log.clear')?.[1];
    assert.ok(clearLog);
    clearLog();

    const saveLog = commands.find((c: any) => c[0] === 'iagent-engineer.log.save')?.[1];
    assert.strictEqual(saveLog, undefined);
  });

  test('uri handler ignores non-remote-auth paths and reports callback failures', async () => {
    const vscode = require('vscode');
    await activate(mockContext);

    const uriHandler = vscode.window.registerUriHandler.args[0][0];
    assert.ok(uriHandler);

    await uriHandler.handleUri(
      vscode.Uri.parse(
        `${vscode.env.uriScheme}://bd-creative.iagent-engineer/not-figma-remote-auth?access_token=test-token`,
      ),
    );
    assert.ok(mockContext.secrets.store.notCalled);

    mockContext.secrets.store.rejects(new Error('store failed'));
    await uriHandler.handleUri(
      vscode.Uri.parse(
        `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?access_token=test-token`,
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
