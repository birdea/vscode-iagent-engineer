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
        'figmaMcpHelper.preview',
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
    );
    this.panel.webview.html = preview.html;
    this.panel.title = `Generated UI Preview · ${preview.title}`;
  }
}
