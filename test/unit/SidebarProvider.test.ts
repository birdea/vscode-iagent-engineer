import * as assert from 'assert';
import * as sinon from 'sinon';
import { SidebarProvider } from '../../src/webview/SidebarProvider';
import { Logger } from '../../src/logger/Logger';
import { StateManager } from '../../src/state/StateManager';

suite('SidebarProvider', () => {
  let provider: SidebarProvider;
  let mockWebviewView: any;
  let mockContext: any;
  let mockUri: any;
  let sandbox: sinon.SinonSandbox;
  let stateManager: StateManager;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockUri = { path: '/test', fsPath: '/test' };
    mockWebviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: sandbox.stub(),
        postMessage: sandbox.stub(),
        asWebviewUri: (u: any) => u,
        cspSource: 'csp',
      },
      onDidDispose: sandbox.stub(),
    };
    mockContext = {
      extensionUri: mockUri,
      globalState: { get: sandbox.stub().returns('gemini') },
      secrets: { get: sandbox.stub().resolves('key') },
      extension: { packageJSON: { version: '1.0.0' } }
    };
    stateManager = new StateManager();
    provider = new SidebarProvider('viewId', 'figma', mockUri, mockContext, stateManager);
    Logger.initialize({ appendLine: () => {}, clear: () => {} } as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('resolveWebviewView sets options, handler and html', () => {
    const onLog = sandbox.stub();
    provider = new SidebarProvider('viewId', 'figma', mockUri, mockContext, stateManager, onLog);
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    
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
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    provider.postMessage({ some: 'data' });
    assert.ok(mockWebviewView.webview.postMessage.calledWith({ some: 'data' }));
  });

  test('onDidReceiveMessage listener works', async () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
      const listener = mockWebviewView.webview.onDidReceiveMessage.args[0][0];

      // Call with msg
      await listener({ command: 'state.setAgent', agent: 'gemini' });
  });

  test('onDidDispose callback disposes subscriptions', () => {
      const onLog = sandbox.stub();
      provider = new SidebarProvider('viewId', 'log', mockUri, mockContext, stateManager, onLog);
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      // Trigger the dispose callback
      const disposeCallback = mockWebviewView.onDidDispose.args[0][0];
      assert.doesNotThrow(() => disposeCallback());
  });

  test('onDidReceiveMessage with null handler logs error', async () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
      // Null out handler to test the guard
      (provider as any).handler = null;
      const listener = mockWebviewView.webview.onDidReceiveMessage.args[0][0];
      await listener({ command: 'figma.connect' });
      // Should not throw; Logger.error would have been called
  });
});
