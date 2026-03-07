import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { EditorIntegration } from '../../src/editor/EditorIntegration';

suite('EditorIntegration', () => {
  let integration: EditorIntegration;

  setup(() => {
    integration = new EditorIntegration();
  });

  test('openInEditor calls workspace.openTextDocument', async () => {
    const vscode = require('vscode');
    vscode.workspace.openTextDocument.resolves({ show: sinon.stub() });
    
    await integration.openInEditor('const x = 1;', 'javascript');
    assert.ok(vscode.workspace.openTextDocument.calledWithMatch({ language: 'javascript', content: 'const x = 1;' }));
  });

  test('saveAsNewFile calls showInformationMessage', async () => {
    const vscode = require('vscode');
    const saveDialogStub = vscode.window.showSaveDialog;
    vscode.window.showSaveDialog.resolves({ fsPath: '/test/path.ts' });

    await integration.saveAsNewFile('code', 'test.ts');
    const saveArgs = saveDialogStub.firstCall.args[0];
    if (saveArgs.defaultUri?.fsPath) {
      assert.strictEqual(saveArgs.defaultUri.fsPath, path.join(os.homedir(), 'Documents', 'test.ts'));
    }
    assert.ok(vscode.window.showInformationMessage.called);
  });

  test('saveAsNewFile cancelled by user does not write file', async () => {
    const vscode = require('vscode');
    vscode.window.showSaveDialog.resolves(undefined);
    vscode.workspace.fs.writeFile.resetHistory();

    await integration.saveAsNewFile('code', 'test.ts');
    assert.ok(!vscode.workspace.fs.writeFile.called);
  });

});
