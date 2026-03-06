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
    Logger.initialize({ appendLine: () => {}, clear: () => {} } as any);
  });

  test('fetchScreenshot calls mcpClient', async () => {
    const res = await service.fetchScreenshot('file-id', 'node-id');
    assert.strictEqual(res, 'base64data');
    assert.ok(mockMcpClient.getImage.calledWith('file-id', 'node-id'));
  });

  test('openInEditor shows information message', async () => {
     const vscode = require('vscode');
     await service.openInEditor('data', 'file');
     assert.ok(vscode.window.showInformationMessage.called);
  });
});
