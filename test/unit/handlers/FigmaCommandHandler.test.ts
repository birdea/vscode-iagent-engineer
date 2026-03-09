import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { RemoteFigmaAuthService } from '../../../src/figma/RemoteFigmaAuthService';
import { FigmaCommandHandler } from '../../../src/webview/handlers/FigmaCommandHandler';
import { Logger } from '../../../src/logger/Logger';
import { StateManager } from '../../../src/state/StateManager';

suite('FigmaCommandHandler', () => {
  let sandbox: sinon.SinonSandbox;
  let webview: { postMessage: sinon.SinonSpy };
  let context: any;
  let mcpClient: any;
  let remoteApiClient: any;
  let remoteAuthService: RemoteFigmaAuthService;
  let screenshotService: any;
  let editorIntegration: any;
  let stateManager: StateManager;
  let handler: FigmaCommandHandler;
  let desktopAppLauncher: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    webview = { postMessage: sandbox.spy() };
    context = {
      extension: { id: 'bd-creative.figma-mcp-helper', packageJSON: { version: '1.0.0' } },
      secrets: {
        get: sandbox.stub().resolves(undefined),
        store: sandbox.stub().resolves(),
        delete: sandbox.stub().resolves(),
      },
    };
    mcpClient = {
      setEndpoint: sandbox.stub(),
      initialize: sandbox.stub().resolves(true),
      listTools: sandbox.stub().resolves(['get_file']),
      isConnected: sandbox.stub().returns(true),
      getDesignContext: sandbox.stub().resolves({ name: 'Frame' }),
      callTool: sandbox.stub().resolves({ name: 'Frame' }),
    };
    remoteApiClient = {
      checkStatus: sandbox.stub().resolves({ connected: true }),
      fetchDesignContext: sandbox.stub().resolves({ name: 'Remote Frame' }),
      fetchScreenshot: sandbox.stub().resolves({ data: 'remote-base64', mimeType: 'image/png' }),
    };
    remoteAuthService = new RemoteFigmaAuthService(context.secrets);
    screenshotService = {
      fetchScreenshot: sandbox.stub().resolves('base64-image'),
      openInEditor: sandbox.stub().resolves(),
    };
    editorIntegration = {
      openInEditor: sandbox.stub().resolves(),
    };
    desktopAppLauncher = sandbox.stub().resolves();
    stateManager = new StateManager();
    handler = new FigmaCommandHandler(
      webview as any,
      context,
      mcpClient,
      remoteApiClient,
      remoteAuthService,
      screenshotService,
      editorIntegration,
      stateManager,
      'ko',
      desktopAppLauncher,
    );
    (vscode.window.showInformationMessage as sinon.SinonStub).resetHistory();
    (vscode.env.openExternal as sinon.SinonStub).resetHistory();
    (vscode.workspace.getConfiguration as sinon.SinonStub).resetHistory();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('connect initializes MCP client and posts connected status', async () => {
    const getStub = sandbox.stub();
    getStub.withArgs('figma-mcp-helper.mcpEndpoint').returns('http://localhost:3845');
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({ get: getStub });

    await handler.connect();

    assert.ok(mcpClient.setEndpoint.calledWith('http://localhost:3845'));
    assert.ok(webview.postMessage.calledWithMatch({ event: 'figma.status', connected: true }));
  });

  test('connect in remote mode shows coming soon popup and keeps disconnected state', async () => {
    await handler.connect('remote');

    assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).notCalled);
    assert.ok((vscode.env.openExternal as sinon.SinonStub).notCalled);
    assert.ok(remoteApiClient.checkStatus.notCalled);
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.status',
        connected: false,
        error: sinon.match(/추후|future update/i),
      }),
    );
  });

  test('connect posts disconnected status when initialize returns false', async () => {
    mcpClient.initialize.resolves(false);
    const getStub = sandbox.stub().returns('http://localhost:3845');
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({ get: getStub });

    await handler.connect();

    assert.ok(webview.postMessage.calledWithMatch({ event: 'figma.status', connected: false }));
  });

  test('connect converts ECONNREFUSED to friendly message', async () => {
    mcpClient.initialize.rejects(new Error('ECONNREFUSED'));
    const getStub = sandbox.stub().returns('http://localhost:3845');
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({ get: getStub });

    await handler.connect();

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.status',
        error: sinon.match(/MCP 서버에 연결할 수 없습니다/),
      }),
    );
  });

  test('connect converts timeout to friendly message', async () => {
    mcpClient.initialize.rejects(new Error('request timeout exceeded'));
    const getStub = sandbox.stub().returns('http://localhost:3845');
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({ get: getStub });

    await handler.connect();

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.status',
        error: sinon.match(/응답이 지연/),
      }),
    );
  });

  test('connect falls back to generic message for unknown errors', async () => {
    mcpClient.initialize.rejects(new Error('unexpected failure'));
    const getStub = sandbox.stub().returns('http://localhost:3845');
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({ get: getStub });

    await handler.connect();

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.status',
        error: sinon.match(/문제가 발생/),
      }),
    );
  });

  test('connect maps cancelled non-local confirmation to a dedicated message', async () => {
    mcpClient.initialize.rejects(new Error('MCP connection cancelled for non-local endpoint'));
    const getStub = sandbox.stub().returns('https://example.com/mcp');
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({ get: getStub });

    await handler.connect();

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.status',
        error: sinon.match(/연결이 취소되었습니다/),
      }),
    );
  });

  test('openSettings forwards to VS Code command', async () => {
    await handler.openSettings();
    assert.ok(
      (vscode.commands.executeCommand as sinon.SinonStub).calledWith(
        'workbench.action.openSettings',
      ),
    );
  });

  test('openSettings in remote mode opens remote auth setting', async () => {
    await handler.openSettings('remote');
    assert.ok(
      (vscode.commands.executeCommand as sinon.SinonStub).calledWith(
        'workbench.action.openSettings',
        'figma-mcp-helper.remoteMcpAuthUrl',
      ),
    );
  });

  test('openDesktopApp launches Figma Desktop', async () => {
    await handler.openDesktopApp();

    assert.ok(desktopAppLauncher.calledOnce);
    assert.ok(webview.postMessage.notCalled);
  });

  test('openDesktopApp posts friendly error when launch fails', async () => {
    desktopAppLauncher.rejects(new Error('ENOENT'));

    await handler.openDesktopApp();

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'error',
        source: 'figma',
        message: sinon.match(/Figma Desktop 앱을 실행하지 못했습니다/),
      }),
    );
  });

  test('fetchData calls getDesignContext when connected and fileId exists', async () => {
    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.ok(mcpClient.getDesignContext.calledWith('ABCDE', '1:2'));
    assert.ok(editorIntegration.openInEditor.calledWith('{\n  "name": "Frame"\n}', 'json'));
    assert.ok(
      webview.postMessage.calledWithMatch({ event: 'figma.dataResult', data: { name: 'Frame' } }),
    );
  });

  test('fetchData always opens result in editor', async () => {
    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.ok(editorIntegration.openInEditor.calledOnce);
  });

  test('fetchData stores raw input before MCP request', async () => {
    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.deepStrictEqual(stateManager.getLastMcpData(), { name: 'Frame' });
    assert.strictEqual(
      stateManager.getLastMcpInput(),
      'https://figma.com/file/ABCDE/demo?node-id=1-2',
    );
  });

  test('clearData resets saved figma input and data', () => {
    stateManager.setLastMcpInput('abc');
    stateManager.setLastMcpData({ foo: 'bar' });

    handler.clearData();

    assert.strictEqual(stateManager.getLastMcpInput(), '');
    assert.strictEqual(stateManager.getLastMcpData(), null);
  });

  test('fetchData posts parse-only result when disconnected', async () => {
    mcpClient.isConnected.returns(false);

    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.ok(editorIntegration.openInEditor.calledWithMatch(sinon.match.string, 'json'));
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.dataResult',
        data: sinon.match({ fileId: 'ABCDE', nodeId: '1:2' }),
      }),
    );
  });

  test('fetchData in remote mode shows coming soon message', async () => {
    await handler.connect('remote');
    webview.postMessage.resetHistory();
    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.ok(remoteApiClient.fetchDesignContext.notCalled);
    assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).notCalled);
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.dataFetchError',
        message: sinon.match(/추후|future update/i),
        fallbackData: sinon.match({ fileId: 'ABCDE', nodeId: '1:2' }),
      }),
    );
  });

  test('fetchData posts parse-only result when fileId is missing', async () => {
    await handler.fetchData('not-a-figma-url');
    assert.ok(editorIntegration.openInEditor.calledWithMatch(sinon.match.string, 'json'));
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.dataResult',
        data: sinon.match({ fileId: '' }),
      }),
    );
  });

  test('fetchData maps ECONNREFUSED errors to friendly message', async () => {
    mcpClient.getDesignContext.rejects(new Error('ECONNREFUSED'));

    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.dataFetchError',
        message: sinon.match(/연결할 수 없어/),
      }),
    );
  });

  test('fetchData maps timeout errors to friendly message', async () => {
    mcpClient.getDesignContext.rejects(new Error('Request timeout exceeded'));

    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.dataFetchError',
        message: sinon.match(/응답 시간이 초과/),
      }),
    );
  });

  test('fetchData maps generic errors to fallback message', async () => {
    mcpClient.getDesignContext.rejects(new Error('boom'));

    await handler.fetchData('https://figma.com/file/ABCDE/demo?node-id=1-2');

    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.dataFetchError',
        message: sinon.match(/가져오지 못했습니다/),
      }),
    );
  });

  test('fetchScreenshot requires fileId', async () => {
    await handler.fetchScreenshot('invalid');
    assert.ok(webview.postMessage.calledWithMatch({ event: 'error', source: 'figma' }));
  });

  test('fetchScreenshot opens image in editor and posts result', async () => {
    await handler.fetchScreenshot('https://figma.com/file/ABCDE/demo?node-id=4-5');

    assert.ok(screenshotService.fetchScreenshot.calledWith('ABCDE', '4:5'));
    assert.ok(screenshotService.openInEditor.calledWith('base64-image', 'ABCDE', '4:5'));
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'figma.screenshotResult',
        base64: 'base64-image',
      }),
    );
  });

  test('fetchScreenshot in remote mode shows coming soon message', async () => {
    await handler.connect('remote');
    webview.postMessage.resetHistory();
    await handler.fetchScreenshot('https://figma.com/file/ABCDE/demo?node-id=4-5');

    assert.ok(remoteApiClient.fetchScreenshot.notCalled);
    assert.ok(screenshotService.openInEditor.notCalled);
    assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).notCalled);
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'error',
        source: 'figma',
        message: sinon.match(/추후|future update/i),
      }),
    );
  });

  test('fetchScreenshot reports generic failure when screenshot service throws', async () => {
    const loggerErrorStub = sandbox.stub(Logger, 'error');
    screenshotService.fetchScreenshot.rejects(new Error('broken'));

    await handler.fetchScreenshot('https://figma.com/file/ABCDE/demo?node-id=4-5');

    assert.ok(
      loggerErrorStub.calledWith(
        'figma',
        'Screenshot fetch failed for fileId=ABCDE, nodeId=4:5',
        'broken',
      ),
    );
    assert.ok(
      webview.postMessage.calledWithMatch({
        event: 'error',
        source: 'figma',
        message: sinon.match(/스크린샷을 가져오지 못했습니다/),
      }),
    );
  });
});
