import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { EditorIntegration } from '../../src/editor/EditorIntegration';

suite('EditorIntegration', () => {
  let integration: EditorIntegration;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    integration = new EditorIntegration();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('openInEditor calls workspace.openTextDocument', async () => {
    const vscode = require('vscode');
    const editStub = sinon.stub().callsFake(async (callback: any) => {
      const builder = { insert: sinon.stub() };
      callback(builder);
      return true;
    });
    vscode.workspace.openTextDocument.resolves({ languageId: 'plaintext' });
    vscode.window.showTextDocument.resolves({ edit: editStub });

    await integration.openInEditor('const x = 1;', 'javascript', 'generated.ts');
    assert.ok(
      vscode.workspace.openTextDocument.calledWithMatch(sinon.match.has('scheme', 'untitled')),
    );
    assert.ok(vscode.languages.setTextDocumentLanguage.calledOnce);
    assert.ok(vscode.window.showTextDocument.calledOnce);
    assert.ok(editStub.calledOnce);
    assert.ok(!vscode.commands.executeCommand.calledWith('editor.action.formatDocument'));
  });

  test('openInEditor enables word wrap when editor setting is off', async () => {
    const vscode = require('vscode');
    const editStub = sinon.stub().resolves(true);
    const getStub = sinon.stub().withArgs('wordWrap').returns('off');
    vscode.workspace.openTextDocument.resolves({ languageId: 'json' });
    vscode.workspace.getConfiguration.returns({ get: getStub });
    vscode.window.showTextDocument.resolves({ edit: editStub });

    await integration.openInEditor('{"a":1}', 'json', 'data.json');

    assert.ok(vscode.commands.executeCommand.calledWith('editor.action.toggleWordWrap'));
  });

  test('openInEditor skips language switch and word wrap toggle when not needed', async () => {
    const vscode = require('vscode');
    const editStub = sinon.stub().resolves(true);
    const getStub = sinon.stub().withArgs('wordWrap').returns('on');
    vscode.workspace.openTextDocument.resolves({ languageId: 'json' });
    vscode.workspace.getConfiguration.returns({ get: getStub });
    vscode.window.showTextDocument.resolves({ edit: editStub });
    vscode.languages.setTextDocumentLanguage.resetHistory();
    vscode.commands.executeCommand.resetHistory();

    await integration.openInEditor('{"a":1}', 'json', 'data.json');

    assert.ok(vscode.languages.setTextDocumentLanguage.notCalled);
    assert.ok(!vscode.commands.executeCommand.calledWith('editor.action.toggleWordWrap'));
  });

  test('openInEditor generates file extensions when no suggested name is provided', async () => {
    const vscode = require('vscode');
    const editStub = sinon.stub().resolves(true);
    vscode.workspace.getConfiguration.returns({
      get: sinon.stub().withArgs('wordWrap').returns('on'),
    });
    vscode.workspace.openTextDocument.resolves({ languageId: 'plaintext' });
    vscode.window.showTextDocument.resolves({ edit: editStub });

    await integration.openInEditor('html', 'html');
    await integration.openInEditor('scss', 'scss');
    await integration.openInEditor('kotlin', 'kotlin');
    await integration.openInEditor('tsx', 'typescriptreact');

    const openedUris = vscode.workspace.openTextDocument
      .getCalls()
      .map((call: sinon.SinonSpyCall) => call.args[0].toString());
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.html')));
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.scss')));
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.kt')));
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.tsx')));
  });

  test('openInEditor generates json extension when no suggested name is provided', async () => {
    const vscode = require('vscode');
    const editStub = sinon.stub().resolves(true);
    vscode.workspace.getConfiguration.returns({
      get: sinon.stub().withArgs('wordWrap').returns('on'),
    });
    vscode.workspace.openTextDocument.resolves({ languageId: 'plaintext' });
    vscode.window.showTextDocument.resolves({ edit: editStub });

    await integration.openInEditor('{"a":1}', 'json');

    const openedUri = vscode.workspace.openTextDocument.lastCall.args[0].toString();
    assert.ok(openedUri.endsWith('.json'));
  });

  test('openInEditor falls back to txt extension for unknown languages', async () => {
    const vscode = require('vscode');
    const editStub = sinon.stub().resolves(true);
    vscode.workspace.getConfiguration.returns({
      get: sinon.stub().withArgs('wordWrap').returns('on'),
    });
    vscode.workspace.openTextDocument.resolves({ languageId: 'plaintext' });
    vscode.window.showTextDocument.resolves({ edit: editStub });

    await integration.openInEditor('plain text', 'plaintext');

    const openedUri = vscode.workspace.openTextDocument.lastCall.args[0].toString();
    assert.ok(openedUri.endsWith('.txt'));
  });

  test('openInEditor swallows word wrap lookup errors', async () => {
    const vscode = require('vscode');
    const editStub = sinon.stub().resolves(true);
    vscode.workspace.openTextDocument.resolves({ languageId: 'json' });
    vscode.workspace.getConfiguration.throws(new Error('config error'));
    vscode.window.showTextDocument.resolves({ edit: editStub });

    await assert.doesNotReject(() => integration.openInEditor('{"a":1}', 'json', 'data.json'));
  });

  test('saveAsNewFile calls showInformationMessage', async () => {
    const vscode = require('vscode');
    const saveDialogStub = vscode.window.showSaveDialog;
    vscode.window.showSaveDialog.resolves({ fsPath: '/test/path.ts' });

    await integration.saveAsNewFile('code', 'test.ts');
    const saveArgs = saveDialogStub.firstCall.args[0];
    if (saveArgs.defaultUri?.fsPath) {
      assert.strictEqual(
        saveArgs.defaultUri.fsPath,
        path.join(os.homedir(), 'Documents', 'test.ts'),
      );
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

  test('saveAsNewFile falls back to workspace folder when Documents directory is absent', async () => {
    const vscode = require('vscode');
    sandbox.stub(integration as any, 'hasDocumentsDir').returns(false);
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace', path: '/workspace' } }];
    vscode.Uri.joinPath.returns({ fsPath: '/workspace/test.ts', path: '/workspace/test.ts' });
    vscode.window.showSaveDialog.resolves(undefined);
    vscode.window.showSaveDialog.resetHistory();

    await integration.saveAsNewFile('code', 'test.ts');

    const saveArgs = vscode.window.showSaveDialog.lastCall.args[0];
    assert.strictEqual(saveArgs.defaultUri.fsPath, '/workspace/test.ts');
  });

  test('saveAsNewFile uses undefined defaultUri when Documents directory and workspace are absent', async () => {
    const vscode = require('vscode');
    sandbox.stub(integration as any, 'hasDocumentsDir').returns(false);
    vscode.workspace.workspaceFolders = undefined;
    vscode.window.showSaveDialog.resolves(undefined);
    vscode.window.showSaveDialog.resetHistory();

    await integration.saveAsNewFile('code', 'test.ts');

    const saveArgs = vscode.window.showSaveDialog.lastCall.args[0];
    assert.strictEqual(saveArgs.defaultUri, undefined);
  });

  test('openPreviewPanel creates and updates a preview webview panel', async () => {
    const vscode = require('vscode');
    const previewPanel = {
      webview: { cspSource: 'csp', html: '' },
      title: '',
      reveal: sandbox.stub(),
      onDidDispose: sandbox.stub(),
    };
    vscode.window.createWebviewPanel.returns(previewPanel);

    await integration.openPreviewPanel('<div>preview</div>', 'html');

    assert.ok(vscode.window.createWebviewPanel.calledOnce);
    assert.ok(previewPanel.title.includes('HTML Preview'));
    assert.ok(previewPanel.webview.html.includes('<iframe'));
    assert.ok(previewPanel.webview.html.includes('&lt;div&gt;preview&lt;/div&gt;'));
  });

  test('openPreviewPanel builds runtime preview for tsx input', async () => {
    const vscode = require('vscode');
    const previewPanel = {
      webview: { cspSource: 'csp', html: '' },
      title: '',
      reveal: sandbox.stub(),
      onDidDispose: sandbox.stub(),
    };
    vscode.window.createWebviewPanel.returns(previewPanel);

    await integration.openPreviewPanel(
      "import React from 'react'; export default function App(){ return <div className=\"bg-white\">preview</div>; }",
      'tsx',
    );

    assert.ok(previewPanel.title.includes('React / TSX Preview'));
    assert.ok(previewPanel.webview.html.includes('runtime-error'));
    assert.ok(previewPanel.webview.html.includes('preview'));
  });

  test('openPreviewPanel enables Tailwind CDN for tailwind-style previews', async () => {
    const vscode = require('vscode');
    const previewPanel = {
      webview: { cspSource: 'csp', html: '' },
      title: '',
      reveal: sandbox.stub(),
      onDidDispose: sandbox.stub(),
    };
    vscode.window.createWebviewPanel.returns(previewPanel);

    await integration.openPreviewPanel('<div class="bg-slate-900 text-white px-4">preview</div>', 'tailwind');

    assert.ok(previewPanel.title.includes('Tailwind Preview'));
    assert.ok(previewPanel.webview.html.includes('cdn.tailwindcss.com'));
    assert.ok(previewPanel.webview.html.includes('allow-scripts'));
  });
});
