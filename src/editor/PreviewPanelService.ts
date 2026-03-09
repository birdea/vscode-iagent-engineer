import * as vscode from 'vscode';
import { OutputFormat } from '../types';
import { buildPreviewDocument, buildPreviewPanelHtml } from '../preview/PreviewRenderer';

export class PreviewPanelService {
  private panel: vscode.WebviewPanel | null = null;

  open(code: string, preferredFormat?: OutputFormat) {
    const column =
      vscode.window.activeTextEditor?.viewColumn === vscode.ViewColumn.One
        ? vscode.ViewColumn.Two
        : (vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Two);

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'figmaMcpHelper.preview',
        'Generated UI Preview',
        column,
        {
          enableScripts: false,
          retainContextWhenHidden: true,
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = null;
      });
    } else {
      this.panel.reveal(column, true);
    }

    const preview = buildPreviewDocument(code, preferredFormat);
    this.panel.webview.html = buildPreviewPanelHtml(preview, this.panel.webview.cspSource);
    this.panel.title = `Generated UI Preview · ${preview.title}`;
  }
}
