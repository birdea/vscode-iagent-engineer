import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { WebviewMessageHandler } from './WebviewMessageHandler';
import { Logger } from '../logger/Logger';
import { DEFAULT_MCP_ENDPOINT, CONFIG_KEYS, getSecretStorageKey } from '../constants';
import { RemoteFigmaAuthService } from '../figma/RemoteFigmaAuthService';
import { WebviewToHostMessage } from '../types';
import { StateManager } from '../state/StateManager';
import { resolveLocale } from '../i18n';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private handler?: WebviewMessageHandler;
  private logSubscription?: vscode.Disposable;
  private stateSubscription?: vscode.Disposable;
  private messageSubscription?: vscode.Disposable;
  private viewDisposeSubscription?: vscode.Disposable;

  constructor(
    private readonly viewId: string,
    private readonly section: string,
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly stateManager: StateManager,
    private readonly remoteAuthService: RemoteFigmaAuthService,
    private readonly onLog?: (entry: import('../types').LogEntry) => void,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'resources'),
      ],
    };

    const config = vscode.workspace.getConfiguration();
    const mcpEndpoint = config.get<string>(CONFIG_KEYS.MCP_ENDPOINT) || DEFAULT_MCP_ENDPOINT;
    const locale = resolveLocale(vscode.env.language);

    this.handler = new WebviewMessageHandler(
      webviewView.webview,
      this.context,
      this.remoteAuthService,
      mcpEndpoint,
      this.stateManager,
      this.context.extension.packageJSON.version,
      locale,
    );

    if (this.onLog) {
      this.logSubscription?.dispose();
      this.logSubscription = Logger.onLog(this.onLog);
      const entries = Logger.getEntries();
      entries.forEach((entry) => this.onLog?.(entry));
    }

    if (this.section === 'prompt') {
      this.stateSubscription?.dispose();
      this.stateSubscription = this.stateManager.onAgentStateChange(({ agent, model }) => {
        void this.postAgentState(agent, model);
      });
      void this.postAgentState(this.stateManager.getAgent(), this.stateManager.getModel());
    }

    this.viewDisposeSubscription?.dispose();
    this.viewDisposeSubscription = webviewView.onDidDispose(() => {
      void this.dispose();
    });

    webviewView.webview.html = this.getHtml(webviewView.webview);

    this.messageSubscription?.dispose();
    this.messageSubscription = webviewView.webview.onDidReceiveMessage(
      async (msg: WebviewToHostMessage) => {
        if (!this.handler) {
          Logger.error('system', `Handler not initialized for ${this.viewId}`);
          return;
        }
        await this.handler.handle(msg);
      },
    );

    Logger.info('system', `iagent engineer [${this.section}] view initialized`);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'style.css'),
    );
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicon.css'),
    );

    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}'`,
      `style-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data: blob:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    const locale = resolveLocale(vscode.env.language);
    const config = vscode.workspace.getConfiguration();
    const connectionMode = config.get<string>(CONFIG_KEYS.MCP_CONNECTION_MODE, 'local');

    return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>iagent engineer</title>
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body data-section="${this.section}" data-locale="${locale}" data-mcp-mode="${connectionMode}">
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  postMessage(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  async dispose(): Promise<void> {
    this.logSubscription?.dispose();
    this.logSubscription = undefined;

    this.stateSubscription?.dispose();
    this.stateSubscription = undefined;

    this.messageSubscription?.dispose();
    this.messageSubscription = undefined;

    this.viewDisposeSubscription?.dispose();
    this.viewDisposeSubscription = undefined;

    const handler = this.handler;
    this.handler = undefined;
    this.view = undefined;

    if (handler) {
      await handler.dispose();
    }
  }

  private async postAgentState(agent: import('../types').AgentType, model: string) {
    const hasApiKey = Boolean(await this.context.secrets.get(getSecretStorageKey(agent)));
    this.postMessage({ event: 'agent.state', agent, model, hasApiKey });
  }
}
