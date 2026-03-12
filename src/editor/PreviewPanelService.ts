import * as vscode from 'vscode';
import { OutputFormat } from '../types';
import { buildPreviewPanelContent } from '../preview/PreviewRuntimeBuilder';

export class PreviewPanelService {
  private panel: vscode.WebviewPanel | null = null;

  async open(code: string, preferredFormat?: OutputFormat) {
    const column =
      vscode.window.activeTextEditor?.viewColumn === vscode.ViewColumn.One
        ? vscode.ViewColumn.Two
        : (vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Two);

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'iagentEngineer.preview',
        'Generated UI Preview',
        column,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = null;
      });
    } else {
      this.panel.reveal(column, true);
    }

    const preview = await buildPreviewPanelContent(
      code,
      this.panel.webview.cspSource,
      preferredFormat,
      this.getWorkspaceRoot(),
    );
    this.panel.webview.html = preview.html;
    this.panel.title = `Generated UI Preview · ${preview.title}`;
  }

  private getWorkspaceRoot(): string {
    const activeDocumentUri = vscode.window.activeTextEditor?.document?.uri;
    if (activeDocumentUri) {
      const folder = vscode.workspace.getWorkspaceFolder?.(activeDocumentUri);
      if (folder?.uri.fsPath) {
        return folder.uri.fsPath;
      }
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  }
}
