import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { WebviewMessageHandler } from './WebviewMessageHandler';
import { Logger } from '../logger/Logger';
import { DEFAULT_MCP_ENDPOINT, CONFIG_KEYS, getSecretStorageKey } from '../constants';
import { RemoteFigmaAuthService } from '../figma/RemoteFigmaAuthService';
import { WebviewToHostMessage } from '../types';
import { StateManager } from '../state/StateManager';
import { ProfilerLiveMonitor } from '../profiler/ProfilerLiveMonitor';
import { ProfilerStateManager } from '../profiler/ProfilerStateManager';
import { ProfilerService } from '../profiler/ProfilerService';
import { resolveLocale } from '../i18n';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private handler?: WebviewMessageHandler;
  private stateSubscription?: vscode.Disposable;
  private profilerOverviewSubscription?: vscode.Disposable;
  private profilerDetailSubscription?: vscode.Disposable;
  private messageSubscription?: vscode.Disposable;
  private viewDisposeSubscription?: vscode.Disposable;

  constructor(
    private readonly viewId: string,
    private readonly section: string,
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly stateManager: StateManager,
    private readonly remoteAuthService: RemoteFigmaAuthService,
    private readonly profilerStateManager?: ProfilerStateManager,
    private readonly profilerService?: ProfilerService,
    private readonly profilerLiveMonitor?: ProfilerLiveMonitor,
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
      this.profilerStateManager,
      this.profilerService,
      this.profilerLiveMonitor,
    );

    if (this.section === 'prompt') {
      this.stateSubscription?.dispose();
      this.stateSubscription = this.stateManager.onAgentStateChange(({ agent, model }) => {
        void this.postAgentState(agent, model);
      });
      void this.postAgentState(this.stateManager.getAgent(), this.stateManager.getModel());
    }

    if (this.section === 'profiler' && this.profilerStateManager) {
      this.profilerOverviewSubscription?.dispose();
      this.profilerOverviewSubscription = this.profilerStateManager.onOverviewChange((state) => {
        this.postMessage({ event: 'profiler.state', state });
      });
      this.postMessage({
        event: 'profiler.state',
        state: this.profilerStateManager.getOverviewState(),
      });
    }

    if (this.section === 'profiler-detail' && this.profilerStateManager) {
      this.profilerDetailSubscription?.dispose();
      this.profilerDetailSubscription = this.profilerStateManager.onDetailChange((state) => {
        this.postMessage({ event: 'profiler.detailState', state });
      });
      this.postMessage({
        event: 'profiler.detailState',
        state: this.profilerStateManager.getDetailState(),
      });
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

    Logger.info('system', `iAgent Engineer [${this.section}] view initialized`);
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
  <title>iAgent Engineer</title>
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
    this.stateSubscription?.dispose();
    this.stateSubscription = undefined;

    this.profilerOverviewSubscription?.dispose();
    this.profilerOverviewSubscription = undefined;

    this.profilerDetailSubscription?.dispose();
    this.profilerDetailSubscription = undefined;

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
