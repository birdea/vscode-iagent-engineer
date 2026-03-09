import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '../logger/Logger';
import { OutputFormat } from '../types';
import { BrowserPreviewService } from './BrowserPreviewService';
import { PreviewPanelService } from './PreviewPanelService';

export class EditorIntegration {
  private previewPanelService = new PreviewPanelService();
  private browserPreviewService: BrowserPreviewService;
  private generatedDocumentUri: vscode.Uri | null = null;
  private generatedOutputFormat: OutputFormat | undefined;
  private generatedLanguage = 'plaintext';

  constructor(context?: Pick<vscode.ExtensionContext, 'extensionUri'>) {
    const extensionPath = context?.extensionUri.fsPath ?? process.cwd();
    this.browserPreviewService = new BrowserPreviewService(extensionPath);
  }

  async openInEditor(code: string, language = 'plaintext', suggestedName?: string): Promise<void> {
    const uri = await this.ensureGeneratedDocumentUri(language, suggestedName);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(code));
    const doc = await vscode.workspace.openTextDocument(uri);
    const typedDoc = await this.applyLanguageIfSupported(doc, language);
    await vscode.window.showTextDocument(typedDoc, { preview: false });
    this.generatedDocumentUri = uri;
    this.generatedLanguage = language;

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

  async openGeneratedInEditor() {
    const { document } = await this.getLatestGeneratedDocument();
    if (!document) {
      throw new Error('No generated result is available yet.');
    }

    await vscode.window.showTextDocument(document, { preview: false });
    Logger.success('editor', `Generated result focused in editor (${document.uri.fsPath})`);
  }

  async openPreviewPanel(code?: string, preferredFormat?: OutputFormat) {
    const resolved = await this.resolveGeneratedContent(code, preferredFormat);
    await this.previewPanelService.open(resolved.code, resolved.format);
    Logger.success('editor', `Preview opened in editor area (${resolved.code.length} chars)`);
  }

  async openBrowserPreview(code?: string, preferredFormat?: OutputFormat) {
    const resolved = await this.resolveGeneratedContent(code, preferredFormat);
    await this.browserPreviewService.open(resolved.code, resolved.format ?? 'tsx');
  }

  async syncBrowserPreviewIfActive(code?: string, preferredFormat?: OutputFormat) {
    const resolved = await this.resolveGeneratedContent(code, preferredFormat);
    await this.browserPreviewService.syncIfActive(resolved.code, resolved.format);
  }

  async dispose(): Promise<void> {
    await this.browserPreviewService.dispose();
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
        : language === 'vue'
          ? 'vue'
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

  private async ensureGeneratedDocumentUri(
    language: string,
    suggestedName?: string,
  ): Promise<vscode.Uri> {
    const filename = this.toUntitledName(suggestedName, language);
    const dir = path.join(os.tmpdir(), 'figma-mcp-helper-generated');
    await fs.promises.mkdir(dir, { recursive: true });
    return vscode.Uri.file(path.join(dir, filename));
  }

  private async resolveGeneratedContent(code?: string, format?: OutputFormat) {
    const latest = await this.getLatestGeneratedDocument();
    const latestCode = latest.document?.getText() ?? latest.diskText;
    if (latestCode && latestCode.trim()) {
      return {
        code: latestCode,
        format: format ?? this.generatedOutputFormat,
      };
    }

    if (!code?.trim()) {
      throw new Error('No generated result is available yet.');
    }

    return {
      code,
      format,
    };
  }

  private async getLatestGeneratedDocument(): Promise<{
    document: vscode.TextDocument | null;
    diskText: string;
  }> {
    if (!this.generatedDocumentUri) {
      return { document: null, diskText: '' };
    }

    const openDocument =
      vscode.workspace.textDocuments?.find(
        (doc) => doc.uri.toString() === this.generatedDocumentUri?.toString(),
      ) ?? null;
    if (openDocument) {
      return { document: openDocument, diskText: openDocument.getText() };
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(this.generatedDocumentUri);
      const diskText = new TextDecoder().decode(bytes);
      const reopened = await vscode.workspace.openTextDocument(this.generatedDocumentUri);
      const typedDoc = await this.applyLanguageIfSupported(reopened, this.generatedLanguage);
      return { document: typedDoc, diskText };
    } catch {
      return { document: null, diskText: '' };
    }
  }

  setGeneratedOutputFormat(format: OutputFormat | undefined) {
    this.generatedOutputFormat = format;
  }

  private async applyLanguageIfSupported<T extends vscode.TextDocument>(
    document: T,
    language: string,
  ): Promise<T> {
    if (document.languageId === language) {
      return document;
    }

    try {
      return (await vscode.languages.setTextDocumentLanguage(document, language)) as T;
    } catch (error) {
      Logger.warn(
        'editor',
        `Language switch skipped for ${language}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return document;
    }
  }
}
