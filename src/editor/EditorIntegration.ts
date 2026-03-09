import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '../logger/Logger';
import { OutputFormat } from '../types';
import { PreviewPanelService } from './PreviewPanelService';

export class EditorIntegration {
  private previewPanelService = new PreviewPanelService();

  async openInEditor(code: string, language = 'plaintext', suggestedName?: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.parse(`untitled:${this.toUntitledName(suggestedName, language)}`),
    );
    const typedDoc =
      doc.languageId === language
        ? doc
        : await vscode.languages.setTextDocumentLanguage(doc, language);
    const editor = await vscode.window.showTextDocument(typedDoc, { preview: false });

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), code);
    });

    try {
      const wrapMode = vscode.workspace
        .getConfiguration('editor', typedDoc)
        .get<string>('wordWrap');
      if (wrapMode === 'off') {
        await vscode.commands.executeCommand('editor.action.toggleWordWrap');
      }
    } catch (error) {
      Logger.warn(
        'editor',
        `Word wrap update failed for ${language}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    Logger.success('editor', `Generated code opened in editor (${code.length} chars)`);
  }

  async saveAsNewFile(code: string, defaultName: string = 'generated'): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const documentsDir = path.join(os.homedir(), 'Documents');
    const defaultUri = this.hasDocumentsDir(documentsDir)
      ? vscode.Uri.file(path.join(documentsDir, defaultName))
      : workspaceFolders
        ? vscode.Uri.joinPath(workspaceFolders[0].uri, defaultName)
        : undefined;

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: {
        'All Files': ['*'],
        TypeScript: ['ts', 'tsx'],
        HTML: ['html'],
        SCSS: ['scss'],
        Kotlin: ['kt'],
      },
      saveLabel: 'Save Generated Code',
    });

    if (!saveUri) {
      Logger.info('editor', 'Save cancelled by user');
      return;
    }

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(saveUri, encoder.encode(code));
    await vscode.window.showTextDocument(saveUri);
    Logger.success('editor', `Code saved: ${saveUri.fsPath}`);
    vscode.window.showInformationMessage(`Saved: ${saveUri.fsPath}`);
  }

  async openPreviewPanel(code: string, preferredFormat?: OutputFormat) {
    await this.previewPanelService.open(code, preferredFormat);
    Logger.success('editor', `Preview opened in editor area (${code.length} chars)`);
  }

  private toUntitledName(suggestedName: string | undefined, language: string): string {
    if (suggestedName?.trim()) {
      return suggestedName.trim();
    }

    const extension =
      language === 'json'
        ? 'json'
        : language === 'typescriptreact'
          ? 'tsx'
        : language === 'html'
          ? 'html'
          : language === 'scss'
              ? 'scss'
              : 'txt';

    return `generated-${Date.now()}.${extension}`;
  }

  private hasDocumentsDir(documentsDir: string): boolean {
    return fs.existsSync(documentsDir);
  }
}
