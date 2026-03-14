import * as assert from 'assert';
import * as fs from 'fs';
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
    const vscode = require('vscode');
    vscode.Uri.file.resetBehavior();
    vscode.Uri.file.callsFake((value: string) => ({
      scheme: 'file',
      authority: '',
      path: value,
      fsPath: value,
      toString: () => `file://${value}`,
    }));
  });

  teardown(() => {
    sandbox.restore();
  });

  test('openInEditor calls workspace.openTextDocument', async () => {
    const vscode = require('vscode');
    const uri = { fsPath: '/tmp/generated.ts', toString: () => 'file:///tmp/generated.ts' };
    vscode.Uri.file.returns(uri);
    vscode.workspace.openTextDocument.resolves({
      uri,
      languageId: 'plaintext',
      getText: () => 'const x = 1;',
    });
    vscode.window.showTextDocument.resolves({});

    await integration.openInEditor('const x = 1;', 'javascript', 'generated.ts');
    assert.ok(vscode.workspace.openTextDocument.calledWith(uri));
    assert.ok(vscode.workspace.fs.writeFile.calledOnce);
    assert.ok(vscode.languages.setTextDocumentLanguage.calledOnce);
    assert.ok(vscode.window.showTextDocument.calledOnce);
    assert.ok(!vscode.commands.executeCommand.calledWith('editor.action.formatDocument'));
  });

  test('openInEditor enables word wrap when editor setting is off', async () => {
    const vscode = require('vscode');
    const getStub = sinon.stub().withArgs('wordWrap').returns('off');
    vscode.workspace.openTextDocument.resolves({ languageId: 'json', getText: () => '{"a":1}' });
    vscode.workspace.getConfiguration.returns({ get: getStub });
    vscode.window.showTextDocument.resolves({});

    await integration.openInEditor('{"a":1}', 'json', 'data.json');

    assert.ok(vscode.commands.executeCommand.calledWith('editor.action.toggleWordWrap'));
  });

  test('openInEditor skips language switch and word wrap toggle when not needed', async () => {
    const vscode = require('vscode');
    const getStub = sinon.stub().withArgs('wordWrap').returns('on');
    vscode.workspace.openTextDocument.resolves({ languageId: 'json', getText: () => '{"a":1}' });
    vscode.workspace.getConfiguration.returns({ get: getStub });
    vscode.window.showTextDocument.resolves({});
    vscode.languages.setTextDocumentLanguage.resetHistory();
    vscode.commands.executeCommand.resetHistory();

    await integration.openInEditor('{"a":1}', 'json', 'data.json');

    assert.ok(vscode.languages.setTextDocumentLanguage.notCalled);
    assert.ok(!vscode.commands.executeCommand.calledWith('editor.action.toggleWordWrap'));
  });

  test('openInEditor generates file extensions when no suggested name is provided', async () => {
    const vscode = require('vscode');
    vscode.workspace.getConfiguration.returns({
      get: sinon.stub().withArgs('wordWrap').returns('on'),
    });
    vscode.workspace.openTextDocument.resolves({ languageId: 'plaintext', getText: () => '' });
    vscode.window.showTextDocument.resolves({});

    await integration.openInEditor('html', 'html');
    await integration.openInEditor('scss', 'scss');
    await integration.openInEditor('tsx', 'typescriptreact');
    await integration.openInEditor('<template />', 'vue');

    const openedUris = vscode.Uri.file
      .getCalls()
      .map((call: sinon.SinonSpyCall) => call.args[0] as string);
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.html')));
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.scss')));
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.tsx')));
    assert.ok(openedUris.some((uri: string) => uri.endsWith('.vue')));
  });

  test('openInEditor generates json extension when no suggested name is provided', async () => {
    const vscode = require('vscode');
    vscode.workspace.getConfiguration.returns({
      get: sinon.stub().withArgs('wordWrap').returns('on'),
    });
    vscode.workspace.openTextDocument.resolves({ languageId: 'plaintext', getText: () => '' });
    vscode.window.showTextDocument.resolves({});

    await integration.openInEditor('{"a":1}', 'json');

    const openedUri = vscode.Uri.file.lastCall.args[0];
    assert.ok(openedUri.endsWith('.json'));
  });

  test('openInEditor falls back to txt extension for unknown languages', async () => {
    const vscode = require('vscode');
    vscode.workspace.getConfiguration.returns({
      get: sinon.stub().withArgs('wordWrap').returns('on'),
    });
    vscode.workspace.openTextDocument.resolves({ languageId: 'plaintext', getText: () => '' });
    vscode.window.showTextDocument.resolves({});

    await integration.openInEditor('plain text', 'plaintext');

    const openedUri = vscode.Uri.file.lastCall.args[0];
    assert.ok(openedUri.endsWith('.txt'));
  });

  test('openInEditor swallows word wrap lookup errors', async () => {
    const vscode = require('vscode');
    vscode.workspace.openTextDocument.resolves({ languageId: 'json', getText: () => '{"a":1}' });
    vscode.workspace.getConfiguration.throws(new Error('config error'));
    vscode.window.showTextDocument.resolves({});

    await assert.doesNotReject(() => integration.openInEditor('{"a":1}', 'json', 'data.json'));
  });

  test('openInEditor falls back when requested language id is unsupported', async () => {
    const vscode = require('vscode');
    const uri = { fsPath: '/tmp/generated.vue', toString: () => 'file:///tmp/generated.vue' };
    vscode.Uri.file.returns(uri);
    vscode.window.showTextDocument.resetHistory();
    vscode.languages.setTextDocumentLanguage.resetHistory();
    vscode.workspace.getConfiguration.returns({
      get: sinon.stub().withArgs('wordWrap').returns('on'),
    });
    vscode.workspace.openTextDocument.resolves({
      uri,
      languageId: 'plaintext',
      getText: () => '<template></template>',
    });
    vscode.languages.setTextDocumentLanguage.rejects(new Error('Unknown language id: vue'));
    vscode.window.showTextDocument.resolves({});

    await assert.doesNotReject(() =>
      integration.openInEditor('<template></template>', 'vue', 'GeneratedUi.vue'),
    );

    assert.ok(vscode.window.showTextDocument.calledOnce);
  });

  test('openProfilerInfoDocument opens the Korean profiler guide section', async () => {
    const vscode = require('vscode');
    const guidePath = path.join(process.cwd(), 'docs', 'info-profiler.md');
    const lines = fs.readFileSync(guidePath, 'utf8').split(/\r?\n/);
    const expectedLine = lines.findIndex((line) => line.trim() === '## 한국어') + 1;
    const openStub = sandbox.stub(integration as any, 'openFileAtLine').resolves();
    vscode.window.showQuickPick.resolves({ locale: 'ko' });

    await integration.openProfilerInfoDocument('profiler');

    assert.ok(vscode.window.showQuickPick.calledOnce);
    assert.ok(
      openStub.calledWith(
        path.join(process.cwd(), 'docs', 'info-profiler.md'),
        expectedLine > 0 ? expectedLine : 1,
      ),
    );
  });

  test('openProfilerInfoDocument returns early when language selection is cancelled', async () => {
    const vscode = require('vscode');
    const openStub = sandbox.stub(integration as any, 'openFileAtLine').resolves();
    vscode.window.showQuickPick.resolves(undefined);

    await integration.openProfilerInfoDocument('profiler');

    assert.ok(openStub.notCalled);
  });

  test('openBinaryInEditor writes a file and opens it with vscode.open', async () => {
    const vscode = require('vscode');
    const uri = { fsPath: '/tmp/image.svg', toString: () => 'file:///tmp/image.svg' };
    vscode.Uri.file.returns(uri);
    vscode.commands.executeCommand.resetHistory();
    vscode.workspace.fs.writeFile.resetHistory();

    await integration.openBinaryInEditor(new Uint8Array([1, 2, 3]), 'image.svg');

    assert.ok(vscode.workspace.fs.writeFile.calledOnce);
    assert.strictEqual(vscode.commands.executeCommand.firstCall.args[0], 'vscode.open');
  });

  test('openBinaryAsset reopens a cached binary file', async () => {
    const vscode = require('vscode');
    const uri = { fsPath: '/tmp/image.svg', toString: () => 'file:///tmp/image.svg' };
    vscode.Uri.file.returns(uri);
    vscode.commands.executeCommand.resetHistory();

    await integration.openBinaryInEditor(new Uint8Array([1, 2, 3]), 'image.svg', 'asset-key');
    vscode.commands.executeCommand.resetHistory();

    await integration.openBinaryAsset('asset-key');

    assert.strictEqual(vscode.commands.executeCommand.firstCall.args[0], 'vscode.open');
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
      'import React from \'react\'; export default function App(){ return <div className="bg-white">preview</div>; }',
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

    await integration.openPreviewPanel(
      '<div class="bg-slate-900 text-white px-4">preview</div>',
      'tailwind',
    );

    assert.ok(previewPanel.title.includes('Tailwind Preview'));
    assert.ok(previewPanel.webview.html.includes('https://cdn.tailwindcss.com'));
    assert.ok(previewPanel.webview.html.includes('allow-scripts'));
  });

  test('openBrowserPreview delegates to browser preview service', async () => {
    const browserPreviewService = (integration as any).browserPreviewService;
    const openStub = sandbox.stub(browserPreviewService, 'open').resolves();
    sandbox
      .stub(integration as any, 'getLatestGeneratedDocument')
      .resolves({ document: { getText: () => '<div>preview</div>' }, diskText: '' });

    const opened = await integration.openBrowserPreview('<div>preview</div>', 'html');

    assert.ok(openStub.calledWith('<div>preview</div>', 'html'));
    assert.strictEqual(opened, 'browser');
  });

  test('openBrowserPreview falls back to preview panel in packaged installations', async () => {
    const browserPreviewService = (integration as any).browserPreviewService;
    sandbox
      .stub(browserPreviewService, 'open')
      .rejects(
        new Error(
          'Browser preview is unavailable in this packaged installation. Use the Preview Panel instead.',
        ),
      );
    const previewPanelService = (integration as any).previewPanelService;
    const openPanelStub = sandbox.stub(previewPanelService, 'open').resolves();
    sandbox
      .stub(integration as any, 'getLatestGeneratedDocument')
      .resolves({ document: { getText: () => '<div>preview</div>' }, diskText: '' });

    const opened = await integration.openBrowserPreview('<div>preview</div>', 'html');

    assert.ok(openPanelStub.calledWith('<div>preview</div>', 'html'));
    assert.strictEqual(opened, 'panel');
  });

  test('syncBrowserPreviewIfActive delegates to browser preview service', async () => {
    const browserPreviewService = (integration as any).browserPreviewService;
    const syncStub = sandbox.stub(browserPreviewService, 'syncIfActive').resolves();
    sandbox
      .stub(integration as any, 'getLatestGeneratedDocument')
      .resolves({ document: { getText: () => '<div>preview</div>' }, diskText: '' });

    await integration.syncBrowserPreviewIfActive('<div>preview</div>', 'html');

    assert.ok(syncStub.calledWith('<div>preview</div>', 'html'));
  });

  test('openPreviewPanel uses latest open editor text over stale payload', async () => {
    const vscode = require('vscode');
    const previewPanel = {
      webview: { cspSource: 'csp', html: '' },
      title: '',
      reveal: sandbox.stub(),
      onDidDispose: sandbox.stub(),
    };
    vscode.window.createWebviewPanel.returns(previewPanel);
    sandbox
      .stub(integration as any, 'getLatestGeneratedDocument')
      .resolves({ document: { getText: () => '<div>edited</div>' }, diskText: '' });

    await integration.openPreviewPanel('<div>stale</div>', 'html');

    assert.ok(previewPanel.webview.html.includes('&lt;div&gt;edited&lt;/div&gt;'));
  });

  test('openGeneratedInEditor focuses existing generated document', async () => {
    const vscode = require('vscode');
    const document = {
      uri: { fsPath: '/tmp/generated-ui.html', toString: () => 'file:///tmp/generated-ui.html' },
      getText: () => '<div>edited</div>',
    };
    sandbox
      .stub(integration as any, 'getLatestGeneratedDocument')
      .resolves({ document, diskText: '<div>edited</div>' });

    await integration.openGeneratedInEditor();

    assert.ok(vscode.window.showTextDocument.calledWith(document, { preview: false }));
  });
});
