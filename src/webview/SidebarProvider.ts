import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { WebviewMessageHandler } from './WebviewMessageHandler';
import { Logger } from '../logger/Logger';
import { DEFAULT_MCP_ENDPOINT, CONFIG_KEYS } from '../constants';
import { WebviewToHostMessage } from '../types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private handler?: WebviewMessageHandler;
  private logSubscription?: vscode.Disposable;

  constructor(
    private readonly viewId: string,
    private readonly section: string,
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
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

    this.handler = new WebviewMessageHandler(
      webviewView.webview,
      this.context,
      mcpEndpoint,
    );

    if (this.onLog) {
      this.logSubscription?.dispose();
      this.logSubscription = Logger.onLog(this.onLog);
      const entries = Logger.getEntries();
      entries.forEach((entry) => this.onLog?.(entry));
    }

    webviewView.onDidDispose(() => {
      this.logSubscription?.dispose();
      this.logSubscription = undefined;
      this.handler?.dispose();
    });

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      if (!this.handler) {
        Logger.error('system', `Handler not initialized for ${this.viewId}`);
        return;
      }
      await this.handler.handle(msg);
    });

    Logger.info('system', `Figma MCP Helper [${this.section}] view initialized`);
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
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource} data: blob:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Figma MCP Helper</title>
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body data-section="${this.section}">
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  postMessage(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }
}
