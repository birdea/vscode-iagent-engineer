import * as sinon from 'sinon';
import type * as vscode from 'vscode';

export interface WebviewStub extends Partial<vscode.Webview> {
  postMessage: sinon.SinonStub;
  onDidReceiveMessage: sinon.SinonStub;
  asWebviewUri: (uri: vscode.Uri) => vscode.Uri;
  cspSource: string;
  html: string;
  options: vscode.WebviewOptions;
}

export interface WebviewViewStub extends Partial<vscode.WebviewView> {
  webview: WebviewStub;
  onDidDispose: sinon.SinonStub;
}

export interface ExtensionContextStub extends Partial<vscode.ExtensionContext> {
  globalState: Pick<vscode.Memento, 'get' | 'update'> & {
    get: sinon.SinonStub;
    update: sinon.SinonStub;
  };
  secrets: Pick<vscode.SecretStorage, 'get' | 'store' | 'delete'> & {
    get: sinon.SinonStub;
    store: sinon.SinonStub;
    delete: sinon.SinonStub;
  };
  extensionUri: vscode.Uri;
  extension: { id: string; packageJSON: { version: string } };
}

export interface OutputChannelStub extends Partial<vscode.OutputChannel> {
  appendLine: sinon.SinonStub;
  clear: sinon.SinonStub;
}

export function createOutputChannelStub(sandbox: sinon.SinonSandbox): OutputChannelStub {
  return {
    appendLine: sandbox.stub(),
    clear: sandbox.stub(),
  };
}

export function createWebviewStub(
  sandbox: sinon.SinonSandbox,
  overrides: Partial<WebviewStub> = {},
): WebviewStub {
  return {
    postMessage: sandbox.stub(),
    onDidReceiveMessage: sandbox.stub().returns({ dispose: sandbox.stub() }),
    asWebviewUri: (uri: vscode.Uri) => uri,
    cspSource: 'csp',
    html: '',
    options: {},
    ...overrides,
  };
}

export function createWebviewViewStub(
  sandbox: sinon.SinonSandbox,
  overrides: Partial<WebviewViewStub> = {},
): WebviewViewStub {
  const webview = overrides.webview ?? createWebviewStub(sandbox);
  return {
    webview,
    onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
    ...overrides,
  };
}

export function createExtensionContextStub(
  sandbox: sinon.SinonSandbox,
  overrides: Partial<ExtensionContextStub> = {},
): ExtensionContextStub {
  return {
    globalState: {
      get: sandbox.stub(),
      update: sandbox.stub().resolves(),
    },
    secrets: {
      get: sandbox.stub().resolves('key'),
      store: sandbox.stub().resolves(),
      delete: sandbox.stub().resolves(),
    },
    extensionUri: { path: '/test', fsPath: '/test' } as unknown as vscode.Uri,
    extension: { id: 'bd-creative.figma-mcp-helper', packageJSON: { version: '1.0.0' } },
    ...overrides,
  };
}

export function asWebview(stub: WebviewStub): vscode.Webview {
  return stub as vscode.Webview;
}

export function asWebviewView(stub: WebviewViewStub): vscode.WebviewView {
  return stub as vscode.WebviewView;
}

export function asExtensionContext(stub: ExtensionContextStub): vscode.ExtensionContext {
  return stub as vscode.ExtensionContext;
}

export function asOutputChannel(stub: OutputChannelStub): vscode.OutputChannel {
  return stub as vscode.OutputChannel;
}
