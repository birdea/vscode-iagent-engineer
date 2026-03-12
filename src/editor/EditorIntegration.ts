import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '../logger/Logger';
import { OutputFormat } from '../types';
import { BrowserPreviewService, isBrowserPreviewUnavailableError } from './BrowserPreviewService';
import { PreviewPanelService } from './PreviewPanelService';

export type PreviewOpenTarget = 'browser' | 'panel';

export class EditorIntegration {
  private previewPanelService = new PreviewPanelService();
  private browserPreviewService: BrowserPreviewService;
  private generatedDocumentUri: vscode.Uri | null = null;
  private generatedOutputFormat: OutputFormat | undefined;
  private generatedLanguage = 'plaintext';
  private tempBinaryUris: vscode.Uri[] = [];
  private binaryAssetUris = new Map<string, vscode.Uri>();

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

  async openPreviewPanel(
    code?: string,
    preferredFormat?: OutputFormat,
  ): Promise<PreviewOpenTarget> {
    const resolved = await this.resolveGeneratedContent(code, preferredFormat);
    await this.previewPanelService.open(resolved.code, resolved.format);
    Logger.success('editor', `Preview opened in editor area (${resolved.code.length} chars)`);
    return 'panel';
  }

  async openBrowserPreview(
    code?: string,
    preferredFormat?: OutputFormat,
  ): Promise<PreviewOpenTarget> {
    const resolved = await this.resolveGeneratedContent(code, preferredFormat);
    try {
      await this.browserPreviewService.open(resolved.code, resolved.format ?? 'tsx');
      return 'browser';
    } catch (error) {
      if (!isBrowserPreviewUnavailableError(error)) {
        throw error;
      }

      await this.previewPanelService.open(resolved.code, resolved.format);
      Logger.info(
        'editor',
        'Browser preview is unavailable in this packaged installation; opened the Preview Panel instead.',
      );
      return 'panel';
    }
  }

  async syncBrowserPreviewIfActive(code?: string, preferredFormat?: OutputFormat) {
    const resolved = await this.resolveGeneratedContent(code, preferredFormat);
    await this.browserPreviewService.syncIfActive(resolved.code, resolved.format);
  }

  async openBinaryInEditor(
    content: Uint8Array,
    suggestedName: string,
    assetKey: string = suggestedName,
  ): Promise<void> {
    const uri = await this.ensureBinaryDocumentUri(suggestedName);
    await vscode.workspace.fs.writeFile(uri, content);
    if (!this.tempBinaryUris.some((item) => item.toString() === uri.toString())) {
      this.tempBinaryUris.push(uri);
    }
    this.binaryAssetUris.set(assetKey, uri);
    await vscode.commands.executeCommand('vscode.open', uri);
    Logger.success('editor', `Binary asset opened in editor (${content.byteLength} bytes)`);
  }

  async openBinaryAsset(assetKey: string): Promise<void> {
    const uri = this.binaryAssetUris.get(assetKey);
    if (!uri) {
      throw new Error('No cached source asset is available yet.');
    }

    await vscode.commands.executeCommand('vscode.open', uri);
    Logger.success('editor', `Binary asset reopened in editor (${assetKey})`);
  }

  async dispose(): Promise<void> {
    await this.browserPreviewService.dispose();
    this.binaryAssetUris.clear();
    const tempUris = this.tempBinaryUris.splice(0);
    await Promise.all(
      tempUris.map(async (uri) => {
        try {
          await vscode.workspace.fs.delete(uri, { useTrash: false });
        } catch {
          // Temp file may already be deleted by the OS or the user.
        }
      }),
    );
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

  private async ensureBinaryDocumentUri(suggestedName: string): Promise<vscode.Uri> {
    const dir = path.join(os.tmpdir(), 'figma-mcp-helper-generated');
    await fs.promises.mkdir(dir, { recursive: true });
    const filename =
      path.basename(suggestedName).replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-') || 'asset.bin';
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
