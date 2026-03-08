import * as assert from 'assert';
import * as sinon from 'sinon';
import { SidebarProvider } from '../../src/webview/SidebarProvider';
import { RemoteFigmaAuthService } from '../../src/figma/RemoteFigmaAuthService';
import { Logger } from '../../src/logger/Logger';
import { StateManager } from '../../src/state/StateManager';
import {
  asExtensionContext,
  asOutputChannel,
  asWebviewView,
  createExtensionContextStub,
  createOutputChannelStub,
  createWebviewViewStub,
  ExtensionContextStub,
  WebviewViewStub,
} from './helpers/vscode';

suite('SidebarProvider', () => {
  let provider: SidebarProvider;
  let mockWebviewView: WebviewViewStub;
  let mockContext: ExtensionContextStub;
  let sandbox: sinon.SinonSandbox;
  let stateManager: StateManager;
  let remoteAuthService: RemoteFigmaAuthService;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockWebviewView = createWebviewViewStub(sandbox);
    mockContext = createExtensionContextStub(sandbox, {
      globalState: {
        get: sandbox.stub().returns('gemini'),
        update: sandbox.stub().resolves(),
      },
      secrets: {
        get: sandbox.stub().resolves('key'),
        store: sandbox.stub().resolves(),
        delete: sandbox.stub().resolves(),
      },
    });
    stateManager = new StateManager();
    remoteAuthService = new RemoteFigmaAuthService(mockContext.secrets as never);
    provider = new SidebarProvider(
      'viewId',
      'figma',
      mockContext.extensionUri,
      asExtensionContext(mockContext),
      stateManager,
      remoteAuthService,
    );
    Logger.initialize(asOutputChannel(createOutputChannelStub(sandbox)));
  });

  teardown(() => {
    sandbox.restore();
  });

  test('resolveWebviewView sets options, handler and html', () => {
    const onLog = sandbox.stub();
    provider = new SidebarProvider(
      'viewId',
      'figma',
      mockContext.extensionUri,
      asExtensionContext(mockContext),
      stateManager,
      remoteAuthService,
      onLog,
    );
    provider.resolveWebviewView(asWebviewView(mockWebviewView), {} as never, {} as never);

    assert.ok(mockWebviewView.webview.options.enableScripts);
    assert.ok(mockWebviewView.webview.html.includes('data-section="figma"'));
    assert.ok(mockWebviewView.webview.html.includes('csp'));
    assert.ok(!mockWebviewView.webview.html.includes("'unsafe-inline'"));
  });

  test('postMessage handles null view gracefully', () => {
    provider.postMessage({ some: 'data' });
    // Should not throw
  });

  test('postMessage calls webview.postMessage when view exists', () => {
    provider.resolveWebviewView(asWebviewView(mockWebviewView), {} as never, {} as never);
    provider.postMessage({ some: 'data' });
    assert.ok(mockWebviewView.webview.postMessage.calledWith({ some: 'data' }));
  });

  test('onDidReceiveMessage listener works', async () => {
    provider.resolveWebviewView(asWebviewView(mockWebviewView), {} as never, {} as never);
    const listener = mockWebviewView.webview.onDidReceiveMessage.args[0][0];

    // Call with msg
    await listener({ command: 'state.setAgent', agent: 'gemini' });
  });

  test('onDidDispose callback disposes subscriptions', () => {
    const onLog = sandbox.stub();
    provider = new SidebarProvider(
      'viewId',
      'log',
      mockContext.extensionUri,
      asExtensionContext(mockContext),
      stateManager,
      remoteAuthService,
      onLog,
    );
    provider.resolveWebviewView(asWebviewView(mockWebviewView), {} as never, {} as never);

    // Trigger the dispose callback
    const disposeCallback = mockWebviewView.onDidDispose.args[0][0];
    assert.doesNotThrow(() => disposeCallback());
  });

  test('onDidReceiveMessage with null handler logs error', async () => {
    provider.resolveWebviewView(asWebviewView(mockWebviewView), {} as never, {} as never);
    // Null out handler to test the guard
    (provider as unknown as { handler: null }).handler = null;
    const listener = mockWebviewView.webview.onDidReceiveMessage.args[0][0];
    await listener({ command: 'figma.connect' });
    // Should not throw; Logger.error would have been called
  });
});
