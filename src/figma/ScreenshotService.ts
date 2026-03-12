import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { McpClient } from './McpClient';
import { Logger } from '../logger/Logger';
import { toErrorMessage } from '../errors';
import { t, UiLocale } from '../i18n';

export class ScreenshotService {
  private tmpFiles: vscode.Uri[] = [];

  constructor(
    private mcpClient: McpClient,
    private readonly locale: UiLocale = 'en',
  ) {}

  async fetchScreenshot(fileId: string, nodeId: string): Promise<string> {
    Logger.info('figma', `Fetching screenshot: fileId=${fileId}, nodeId=${nodeId}`);
    try {
      const base64 = await this.mcpClient.getImage(fileId, nodeId);
      Logger.success('figma', 'Screenshot fetched successfully');
      return base64;
    } catch (e) {
      Logger.error('figma', `Screenshot fetch failed: ${toErrorMessage(e)}`);
      throw e;
    }
  }

  async openInEditor(base64: string, fileId: string, nodeId?: string): Promise<void> {
    const buffer = Buffer.from(base64, 'base64');
    const safeFileId = this.sanitizePathSegment(fileId, 'file');
    const safeNodeId = nodeId ? this.sanitizePathSegment(nodeId, 'node') : '';
    const tmpPath = path.join(
      os.tmpdir(),
      `iagent-engineer-${safeFileId}${safeNodeId ? `-${safeNodeId}` : ''}-${Date.now()}.png`,
    );
    const uri = vscode.Uri.file(tmpPath);
    await vscode.workspace.fs.writeFile(uri, buffer);
    this.tmpFiles.push(uri);
    await vscode.commands.executeCommand('vscode.open', uri);
    Logger.info('figma', `Screenshot opened in editor: ${tmpPath}`);
  }

  async cleanupTempFiles(): Promise<void> {
    const toDelete = this.tmpFiles.splice(0);
    for (const uri of toDelete) {
      try {
        await vscode.workspace.fs.delete(uri, { useTrash: false });
        Logger.info('figma', `Deleted temp screenshot: ${uri.fsPath}`);
      } catch {
        // File may already be gone; ignore
      }
    }
  }

  async saveToWorkspace(base64: string, filename?: string): Promise<void> {
    const defaultName = filename || `figma-screenshot-${Date.now()}.png`;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: workspaceFolders
        ? vscode.Uri.joinPath(workspaceFolders[0].uri, defaultName)
        : undefined,
      filters: { Images: ['png'] },
      saveLabel: t(this.locale, 'system.saveScreenshot'),
    });

    if (saveUri) {
      const buffer = Buffer.from(base64, 'base64');
      await vscode.workspace.fs.writeFile(saveUri, buffer);
      Logger.success('figma', `Screenshot saved: ${saveUri.fsPath}`);
      vscode.window.showInformationMessage(
        t(this.locale, 'system.screenshotSaved', { path: saveUri.fsPath }),
      );
    }
  }

  private sanitizePathSegment(value: string, fallback: string): string {
    const sanitized = value
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);

    return sanitized || fallback;
  }
}
