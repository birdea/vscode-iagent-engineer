import * as assert from 'assert';
import * as path from 'path';
import { fork, ChildProcess } from 'child_process';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { RemoteFigmaAuthService } from '../../src/figma/RemoteFigmaAuthService';
import { WebviewMessageHandler } from '../../src/webview/WebviewMessageHandler';
import { StateManager } from '../../src/state/StateManager';
import { AgentFactory } from '../../src/agent/AgentFactory';

suite('Webview workflow E2E', function () {
  this.timeout(20000);

  const port = 3945;
  let server: ChildProcess | null = null;
  let sandbox: sinon.SinonSandbox;

  setup(async function () {
    sandbox = sinon.createSandbox();
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
      get: sandbox.stub().callsFake((key: string, defaultValue?: unknown) => {
        if (key === 'iagent-engineer.mcpEndpoint') {
          return `http://127.0.0.1:${port}`;
        }
        return defaultValue;
      }),
    });
    try {
      server = await startMockServer(port);
    } catch (error) {
      if (isPortBindingPermissionError(error)) {
        this.skip();
        return;
      }
      throw error;
    }
  });

  teardown(async () => {
    sandbox.restore();
    AgentFactory.clear();
    await stopMockServer(server);
    server = null;
  });

  test('connect, fetch data, fetch screenshot, and generate code', async () => {
    const postMessage = sandbox.spy();
    const webview = { postMessage };
    const context = {
      globalState: { get: sandbox.stub(), update: sandbox.stub().resolves() },
      secrets: { get: sandbox.stub().resolves('secret') },
      extensionUri: { path: '/test' },
      extension: { packageJSON: { version: '1.0.0' } },
    };
    const fakeAgent = {
      setApiKey: sandbox.stub().resolves(),
      generateCode: async function* () {
        yield '<div>mock</div>';
      },
    };
    sandbox.stub(AgentFactory, 'getAgent').returns(fakeAgent as any);

    const handler = new WebviewMessageHandler(
      webview as any,
      context as any,
      new RemoteFigmaAuthService(context.secrets as any),
      `http://127.0.0.1:${port}`,
      new StateManager(),
      '1.0.0',
      'en',
    );
    sandbox.stub((handler as any).editorIntegration, 'openInEditor').resolves();
    sandbox.stub((handler as any).screenshotService, 'openInEditor').resolves();

    await handler.handle({ command: 'figma.connect' });
    await handler.handle({
      command: 'figma.fetchData',
      mcpData: 'https://figma.com/file/FILE123/demo?node-id=5-7',
    });
    await handler.handle({
      command: 'figma.screenshot',
      mcpData: 'https://figma.com/file/FILE123/demo?node-id=5-7',
    });
    await handler.handle({
      command: 'prompt.generate',
      payload: { outputFormat: 'html', userPrompt: 'render the frame' },
    });

    assert.ok(postMessage.calledWithMatch({ event: 'figma.status', connected: true }));
    assert.ok(
      postMessage.calledWithMatch({
        event: 'figma.dataResult',
        data: sinon.match({ fileId: 'FILE123', name: 'Mock Figma Design' }),
      }),
    );
    assert.ok(
      postMessage.calledWithMatch({ event: 'figma.screenshotResult', base64: sinon.match.string }),
    );
    assert.ok(
      postMessage.calledWithMatch({
        event: 'prompt.result',
        code: '<div>mock</div>',
        complete: true,
      }),
    );
  });

  test('falls back to local parse result when MCP is not connected', async () => {
    const postMessage = sandbox.spy();
    const webview = { postMessage };
    const context = {
      globalState: { get: sandbox.stub(), update: sandbox.stub().resolves() },
      secrets: { get: sandbox.stub().resolves(undefined) },
      extensionUri: { path: '/test' },
      extension: { packageJSON: { version: '1.0.0' } },
    };

    const handler = new WebviewMessageHandler(
      webview as any,
      context as any,
      new RemoteFigmaAuthService(context.secrets as any),
      `http://127.0.0.1:${port}`,
      new StateManager(),
      '1.0.0',
      'en',
    );
    sandbox.stub((handler as any).editorIntegration, 'openInEditor').resolves();

    await handler.handle({
      command: 'figma.fetchData',
      mcpData: 'https://figma.com/file/FILE123/demo?node-id=2-3',
    });

    assert.ok(
      postMessage.calledWithMatch({
        event: 'figma.dataResult',
        data: sinon.match({ fileId: 'FILE123', nodeId: '2:3' }),
      }),
    );
  });
});

async function startMockServer(port: number): Promise<ChildProcess> {
  const serverPath = path.join(process.cwd(), 'test', 'e2e', 'helpers', 'mock-mcp-server.js');
  const child = fork(serverPath, [], {
    cwd: process.cwd(),
    env: { ...process.env, MOCK_MCP_PORT: String(port) },
    execArgv: [],
    silent: true,
  });

  await new Promise<void>((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => {
      reject(new Error('Mock MCP server did not start in time'));
    }, 5000);

    child.stdout?.on('data', (chunk) => {
      if (String(chunk).includes('Listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once('exit', (code) => {
      clearTimeout(timeout);
      const detail = stderr.trim();
      reject(
        new Error(
          detail
            ? `Mock MCP server exited early with code ${code}: ${detail}`
            : `Mock MCP server exited early with code ${code}`,
        ),
      );
    });
  });

  return child;
}

async function stopMockServer(server: ChildProcess | null): Promise<void> {
  if (!server || server.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.once('exit', () => resolve());
    server.kill();
  });
}

function isPortBindingPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /\bEPERM\b|\bEACCES\b/.test(error.message);
}
