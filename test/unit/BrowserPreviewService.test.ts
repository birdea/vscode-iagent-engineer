import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { BrowserPreviewService } from '../../src/editor/BrowserPreviewService';
import { Logger } from '../../src/logger/Logger';

suite('BrowserPreviewService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: BrowserPreviewService;

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new BrowserPreviewService('/workspace');
    Logger.initialize({ appendLine: sandbox.stub(), clear: sandbox.stub() } as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('open syncs preview and opens browser', async () => {
    sandbox.stub(service, 'sync').resolves();
    const openExternalStub = vscode.env.openExternal as sinon.SinonStub;
    openExternalStub.resetHistory();
    openExternalStub.resolves(true);
    sandbox.stub(service as any, 'getServerUrl').returns('http://127.0.0.1:4173');

    await service.open('<div>preview</div>', 'html');

    assert.ok(openExternalStub.calledOnce);
  });

  test('syncIfActive is a no-op when preview is inactive', async () => {
    const syncStub = sandbox.stub(service, 'sync').resolves();

    await service.syncIfActive('<div>preview</div>', 'html');

    assert.ok(syncStub.notCalled);
  });

  test('syncIfActive refreshes preview when active', async () => {
    (service as any).active = true;
    const syncStub = sandbox.stub(service, 'sync').resolves();

    await service.syncIfActive('<div>preview</div>', 'html');

    assert.ok(syncStub.calledWith('<div>preview</div>', 'html'));
  });

  test('dispose returns early when no process exists', async () => {
    await assert.doesNotReject(() => service.dispose());
  });

  test('dispose terminates running process gracefully', async () => {
    const onceStub = sandbox.stub().callsFake((_event: string, callback: () => void) => {
      callback();
      return {} as any;
    });
    const killStub = sandbox.stub();
    (service as any).serverProcess = {
      once: onceStub,
      kill: killStub,
    };

    await service.dispose();

    assert.ok(killStub.calledWith('SIGTERM'));
  });

  test('getServerUrl throws when port is missing', () => {
    assert.throws(() => (service as any).getServerUrl(), /port is not initialized/);
  });

  test('ensureDependencyLink creates symlink when missing', async () => {
    const extensionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-ext-'));
    const nodeModulesDir = path.join(extensionDir, 'node_modules');
    await fs.mkdir(nodeModulesDir);
    service = new BrowserPreviewService(extensionDir);
    const previewDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-target-'));

    await (service as any).ensureDependencyLink(previewDir);
    const stat = await fs.lstat(path.join(previewDir, 'node_modules'));

    assert.ok(stat.isSymbolicLink());
  });

  test('ensureDependencyLink throws when source dependencies are missing', async () => {
    const extensionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-ext-missing-'));
    service = new BrowserPreviewService(extensionDir);
    const previewDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-target-missing-'));

    await assert.rejects(
      () => (service as any).ensureDependencyLink(previewDir),
      /Browser preview is unavailable in this packaged installation/,
    );
  });

  test('ensureDependencyLink returns early when link already exists', async () => {
    const extensionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-ext-existing-'));
    const nodeModulesDir = path.join(extensionDir, 'node_modules');
    await fs.mkdir(nodeModulesDir);
    service = new BrowserPreviewService(extensionDir);
    const previewDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-target-existing-'));
    await fs.symlink(nodeModulesDir, path.join(previewDir, 'node_modules'), 'dir');

    await assert.doesNotReject(() => (service as any).ensureDependencyLink(previewDir));
  });

  test('waitForServerReady fails when process stops before ready', async () => {
    (service as any).serverProcess = null;
    (service as any).serverPort = 4173;
    sandbox.stub(service as any, 'getServerUrl').returns('http://127.0.0.1:4173');

    await assert.rejects(
      () => (service as any).waitForServerReady(),
      /stopped before it became ready/,
    );
  });

  test('ensureServerRunning throws when preview directory is missing', async () => {
    await assert.rejects(
      () => (service as any).ensureServerRunning(),
      /directory is not initialized/,
    );
  });

  test('buildPreviewArtifacts covers static and runtime branches', () => {
    const htmlPreview = (service as any).buildPreviewArtifacts('<div>preview</div>', 'html');
    const tailwindPreview = (service as any).buildPreviewArtifacts(
      '<div class="px-4">preview</div>',
      'tailwind',
    );
    const vuePreview = (service as any).buildPreviewArtifacts(
      '<template><div>preview</div></template>',
      'vue',
    );
    const fallbackPreview = (service as any).buildPreviewArtifacts(
      "import Button from 'acme-ui'; export default function App(){ return <Button />; }",
      'tsx',
    );
    const runtimePreview = (service as any).buildPreviewArtifacts(
      "import React from 'react'; export default function App(){ return <div>preview</div>; }",
      'tsx',
    );

    assert.strictEqual(htmlPreview.mode, 'html-static');
    assert.strictEqual(tailwindPreview.mode, 'tailwind-static');
    assert.strictEqual(vuePreview.mode, 'vue-static');
    assert.strictEqual(fallbackPreview.mode, 'html-static');
    assert.ok(fallbackPreview.reason.includes('Unsupported imports'));
    assert.strictEqual(runtimePreview.mode, 'tsx-runtime');
  });

  test('helper template builders return expected content', () => {
    assert.ok((service as any).getIndexHtml().includes('main.tsx'));
    assert.ok((service as any).getViteConfig().includes('@vitejs/plugin-react'));
    assert.ok((service as any).getMainEntry().includes('previewReason'));
    assert.ok((service as any).getBaseCss().includes('font-family'));
    assert.ok(
      (service as any)
        .getGeneratedHtmlModule({ mode: 'html-static', html: '<div/>', reactCode: '' })
        .includes('previewMode'),
    );
    assert.ok((service as any).getReactStub().includes('PreviewPlaceholder'));
  });

  test('ensureServerRunning reuses existing ready promise', async () => {
    const readyPromise = Promise.resolve();
    (service as any).serverProcess = {};
    (service as any).serverReadyPromise = readyPromise;
    await (service as any).ensureServerRunning();
    assert.strictEqual((service as any).serverReadyPromise, readyPromise);
  });
});
