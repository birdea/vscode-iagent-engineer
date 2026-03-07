import * as assert from 'assert';
import * as sinon from 'sinon';
import { ScreenshotService } from '../../src/figma/ScreenshotService';
import { Logger } from '../../src/logger/Logger';

suite('ScreenshotService', () => {
  let service: ScreenshotService;
  let mockMcpClient: any;

  setup(() => {
    mockMcpClient = {
      getImage: sinon.stub().resolves('base64data'),
      isConnected: sinon.stub().returns(true),
    };
    service = new ScreenshotService(mockMcpClient as any);
    const vscode = require('vscode');
    vscode.workspace.fs.writeFile.resetHistory();
    vscode.window.showSaveDialog.resetHistory();
    vscode.window.showInformationMessage.resetHistory();
    vscode.commands.executeCommand.resetHistory();
  });


  test('fetchScreenshot calls mcpClient', async () => {
    const res = await service.fetchScreenshot('file-id', 'node-id');
    assert.strictEqual(res, 'base64data');
    assert.ok(mockMcpClient.getImage.calledWith('file-id', 'node-id'));
  });

  test('fetchScreenshot handles error', async () => {
    mockMcpClient.getImage.rejects(new Error('Fetch failed'));
    try {
      await service.fetchScreenshot('file-id', 'node-id');
      assert.fail('Should throw');
    } catch (e: any) {
      assert.strictEqual(e.message, 'Fetch failed');
    }
  });

  test('openInEditor shows information message', async () => {
     const vscode = require('vscode');
     await service.openInEditor('base64', 'file');
     // writeFile and executeCommand should have been called
     assert.ok(vscode.workspace.fs.writeFile.called);
     assert.ok(vscode.commands.executeCommand.calledWith('vscode.open'));
  });

  test('saveToWorkspace success', async () => {
    const vscode = require('vscode');
    vscode.window.showSaveDialog.resolves({ fsPath: '/path/to/save.png' });
    
    await service.saveToWorkspace('base64', 'test.png');
    
    assert.ok(vscode.window.showSaveDialog.called);
    assert.ok(vscode.workspace.fs.writeFile.called);
    assert.ok(vscode.window.showInformationMessage.called);
  });

  test('saveToWorkspace cancel', async () => {
    const vscode = require('vscode');
    vscode.window.showSaveDialog.resolves(undefined);

    await service.saveToWorkspace('base64', 'test.png');

    assert.ok(vscode.window.showSaveDialog.called);
    assert.ok(vscode.workspace.fs.writeFile.notCalled);
  });

  test('cleanupTempFiles deletes temp files', async () => {
    const vscode = require('vscode');
    vscode.workspace.fs.delete = sinon.stub().resolves();
    await service.openInEditor('base64', 'file-id');
    await service.cleanupTempFiles();
    assert.ok(vscode.workspace.fs.delete.called);
  });

  test('cleanupTempFiles ignores delete errors', async () => {
    const vscode = require('vscode');
    vscode.workspace.fs.delete = sinon.stub().rejects(new Error('file gone'));
    await service.openInEditor('base64', 'file-id');
    await assert.doesNotReject(() => service.cleanupTempFiles());
  });

  test('saveToWorkspace without workspace folders uses undefined defaultUri', async () => {
    const vscode = require('vscode');
    vscode.workspace.workspaceFolders = undefined;
    vscode.window.showSaveDialog.resolves(undefined);
    await service.saveToWorkspace('base64');
    const args = vscode.window.showSaveDialog.lastCall.args[0];
    assert.strictEqual(args.defaultUri, undefined);
  });

  test('saveToWorkspace with workspace folders uses joinPath defaultUri', async () => {
    const vscode = require('vscode');
    vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file('/ws') }];
    vscode.window.showSaveDialog.resolves(undefined);
    await service.saveToWorkspace('base64', 'test.png');
    const args = vscode.window.showSaveDialog.lastCall.args[0];
    assert.ok(args.defaultUri !== undefined);
    vscode.workspace.workspaceFolders = undefined;
  });
});
