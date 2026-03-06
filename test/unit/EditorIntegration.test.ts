import * as assert from 'assert';
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
    vscode.window.showSaveDialog.resolves({ fsPath: '/test/path.ts' });
    
    await integration.saveAsNewFile('code', 'test.ts');
    assert.ok(vscode.window.showInformationMessage.called);
  });
});
