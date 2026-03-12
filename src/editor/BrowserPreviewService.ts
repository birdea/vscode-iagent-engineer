import * as childProcess from 'child_process';
import * as fs from 'fs/promises';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from '../logger/Logger';
import { buildPreviewDocument } from '../preview/PreviewRenderer';
import { OutputFormat } from '../types';

const PREVIEW_HOST = '127.0.0.1';
export const BROWSER_PREVIEW_UNAVAILABLE_MESSAGE =
  'Browser preview is unavailable in this packaged installation. Use the Preview Panel instead.';

export function isBrowserPreviewUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(BROWSER_PREVIEW_UNAVAILABLE_MESSAGE);
}

type BrowserPreviewMode = 'tsx-runtime' | 'html-static' | 'tailwind-static' | 'vue-static';

interface BrowserPreviewArtifacts {
  mode: BrowserPreviewMode;
  html: string;
  reactCode: string;
  reason?: string;
}

export class BrowserPreviewService {
  private previewDir: string | null = null;
  private serverProcess: childProcess.ChildProcess | null = null;
  private serverPort: number | null = null;
  private serverReadyPromise: Promise<void> | null = null;
  private active = false;

  constructor(private readonly extensionPath: string) {}

  async open(code: string, format: OutputFormat = 'tsx'): Promise<void> {
    await this.sync(code, format);
    this.active = true;
    await vscode.env.openExternal(vscode.Uri.parse(this.getServerUrl()));
    Logger.success('editor', `Browser preview opened at ${this.getServerUrl()}`);
  }

  async sync(code: string, format: OutputFormat = 'tsx'): Promise<void> {
    await this.ensureProjectFiles(code, format);
    await this.ensureServerRunning();
  }

  async syncIfActive(code: string, format?: OutputFormat): Promise<void> {
    if (!this.active) {
      return;
    }

    await this.sync(code, format ?? 'tsx');
    Logger.info('editor', 'Browser preview source updated for HMR');
  }

  async dispose(): Promise<void> {
    this.active = false;
    this.serverReadyPromise = null;

    if (!this.serverProcess) {
      return;
    }

    const processToKill = this.serverProcess;
    this.serverProcess = null;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          processToKill.kill('SIGKILL');
        } catch {
          // Ignore cleanup failures during shutdown.
        }
        resolve();
      }, 1000);

      processToKill.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        processToKill.kill('SIGTERM');
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  private async ensureProjectFiles(code: string, format: OutputFormat): Promise<void> {
    if (!this.previewDir) {
      this.previewDir = await fs.mkdtemp(path.join(os.tmpdir(), 'figma-mcp-helper-preview-'));
      await fs.mkdir(path.join(this.previewDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(this.previewDir, 'index.html'), this.getIndexHtml(), 'utf8');
      await fs.writeFile(
        path.join(this.previewDir, 'vite.config.mjs'),
        this.getViteConfig(),
        'utf8',
      );
      await fs.writeFile(
        path.join(this.previewDir, 'src', 'main.tsx'),
        this.getMainEntry(),
        'utf8',
      );
      await fs.writeFile(path.join(this.previewDir, 'src', 'base.css'), this.getBaseCss(), 'utf8');
    }

    await this.ensureDependencyLink(this.previewDir);

    const preview = this.buildPreviewArtifacts(code, format);
    const srcDir = path.join(this.previewDir, 'src');
    await fs.writeFile(path.join(srcDir, 'generated-react.tsx'), preview.reactCode, 'utf8');
    await fs.writeFile(
      path.join(srcDir, 'generated-html.ts'),
      this.getGeneratedHtmlModule(preview),
      'utf8',
    );
  }

  private async ensureServerRunning(): Promise<void> {
    if (this.serverProcess && this.serverReadyPromise) {
      await this.serverReadyPromise;
      return;
    }

    if (!this.previewDir) {
      throw new Error('Browser preview directory is not initialized.');
    }

    if (!this.serverPort) {
      this.serverPort = await this.findAvailablePort();
    }

    const viteBin = this.getViteBinPath();
    const child = childProcess.spawn(
      process.execPath,
      [viteBin, '--host', PREVIEW_HOST, '--port', String(this.serverPort), '--strictPort'],
      {
        cwd: this.previewDir,
        env: { ...process.env, BROWSER: 'none', NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    this.serverProcess = child;
    this.serverReadyPromise = this.waitForServerReady();

    child.once('exit', (code, signal) => {
      Logger.warn(
        'editor',
        `Browser preview server exited (${code ?? 'null'} / ${signal ?? 'none'})`,
      );
      this.serverProcess = null;
      this.serverReadyPromise = null;
    });

    const logStream = (stream: NodeJS.ReadableStream | null, level: 'info' | 'warn' | 'error') => {
      if (!stream) {
        return;
      }
      stream.on('data', (chunk) => {
        const text = String(chunk).trim();
        if (!text) {
          return;
        }
        Logger[level]('editor', `Browser preview server: ${text}`);
      });
    };

    logStream(child.stdout, 'info');
    logStream(child.stderr, 'warn');

    await this.serverReadyPromise;
  }

  private async waitForServerReady(): Promise<void> {
    const url = this.getServerUrl();
    const startedAt = Date.now();
    const timeoutMs = 10000;

    while (Date.now() - startedAt < timeoutMs) {
      if (!this.serverProcess) {
        throw new Error('Browser preview server stopped before it became ready.');
      }

      const ready = await new Promise<boolean>((resolve) => {
        const request = net.connect({ host: PREVIEW_HOST, port: this.serverPort ?? 0 });
        request.once('connect', () => {
          request.end();
          resolve(true);
        });
        request.once('error', () => {
          resolve(false);
        });
      });

      if (ready) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error(`Timed out waiting for browser preview server at ${url}`);
  }

  private getServerUrl(): string {
    if (!this.serverPort) {
      throw new Error('Browser preview server port is not initialized.');
    }

    return `http://${PREVIEW_HOST}:${this.serverPort}`;
  }

  private async findAvailablePort(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, PREVIEW_HOST, () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close(() =>
            reject(new Error('Could not determine an open port for browser preview.')),
          );
          return;
        }
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(address.port);
        });
      });
    });
  }

  private getViteBinPath(): string {
    return path.join(this.extensionPath, 'node_modules', 'vite', 'bin', 'vite.js');
  }

  private async ensureDependencyLink(previewDir: string): Promise<void> {
    const sourceNodeModulesDir = path.join(this.extensionPath, 'node_modules');
    const targetNodeModulesDir = path.join(previewDir, 'node_modules');

    try {
      await fs.access(sourceNodeModulesDir);
    } catch {
      throw new Error(BROWSER_PREVIEW_UNAVAILABLE_MESSAGE);
    }

    try {
      await fs.lstat(targetNodeModulesDir);
      return;
    } catch {
      // The preview workspace is new, so create the dependency link now.
    }

    await fs.symlink(sourceNodeModulesDir, targetNodeModulesDir, 'dir');
  }

  private getIndexHtml(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Figma MCP Helper Browser Preview</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
  }

  private getViteConfig(): string {
    return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    hmr: {
      overlay: false,
    },
  },
});
`;
  }

  private getMainEntry(): string {
    return `import React from 'react';
import { createRoot } from 'react-dom/client';
import * as GeneratedReact from './generated-react';
import { generatedHtml, previewMode, previewReason } from './generated-html';
import './base.css';

const appElement = document.getElementById('app');

if (!appElement) {
  throw new Error('Preview root element was not found.');
}

const reactRoot = createRoot(appElement);
let tailwindLoader = null;

function clearInjectedHeadNodes() {
  document
    .querySelectorAll('[data-preview-head="true"]')
    .forEach((node) => node.parentNode?.removeChild(node));
}

async function ensureTailwindLoaded() {
  if (tailwindLoader) {
    await tailwindLoader;
    return;
  }

  tailwindLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-preview-tailwind="true"]');
    if (existing) {
      resolve(undefined);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.tailwindcss.com';
    script.dataset.previewTailwind = 'true';
    script.onload = () => resolve(undefined);
    script.onerror = () => reject(new Error('Failed to load the Tailwind CDN runtime.'));
    document.head.appendChild(script);
  });

  await tailwindLoader;
}

function applyHtmlMarkup(markup) {
  clearInjectedHeadNodes();
  const parser = new DOMParser();
  const parsed = parser.parseFromString(markup, 'text/html');
  document.title = parsed.title || 'Figma MCP Helper Browser Preview';

  Array.from(parsed.head.children).forEach((node) => {
    if (node.tagName === 'TITLE' || node.tagName === 'SCRIPT') {
      return;
    }
    const clone = node.cloneNode(true);
    clone.dataset.previewHead = 'true';
    document.head.appendChild(clone);
  });

  appElement.innerHTML = parsed.body?.innerHTML?.trim() ? parsed.body.innerHTML : markup;
}

function showRuntimeError(message) {
  clearInjectedHeadNodes();
  appElement.innerHTML = \`
    <div style="padding: 24px; font-family: Inter, system-ui, sans-serif; color: #111827;">
      <h1 style="margin: 0 0 12px; font-size: 18px;">Browser preview failed</h1>
      <p style="margin: 0 0 12px; color: #4b5563;">\${previewReason || 'The generated code could not be rendered in browser preview mode.'}</p>
      <pre style="white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px;">\${message}</pre>
    </div>
  \`;
}

function resolveReactExport() {
  if ('default' in GeneratedReact && GeneratedReact.default) {
    return GeneratedReact.default;
  }
  if ('App' in GeneratedReact && GeneratedReact.App) {
    return GeneratedReact.App;
  }
  throw new Error('The generated TSX file must export a default component or an App component.');
}

async function renderPreview() {
  if (previewMode === 'tailwind-static') {
    await ensureTailwindLoaded();
    applyHtmlMarkup(generatedHtml);
    return;
  }

  if (previewMode === 'html-static' || previewMode === 'vue-static') {
    applyHtmlMarkup(generatedHtml);
    return;
  }

  try {
    clearInjectedHeadNodes();
    appElement.innerHTML = '';
    const Component = resolveReactExport();
    const element = React.isValidElement(Component) ? Component : React.createElement(Component);
    reactRoot.render(element);
  } catch (error) {
    reactRoot.render(React.createElement(React.Fragment));
    showRuntimeError(error instanceof Error ? error.message : String(error));
  }
}

renderPreview();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    void renderPreview();
  });
}
`;
  }

  private getBaseCss(): string {
    return `:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #111827;
  background: #f3f4f6;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  min-height: 100%;
  margin: 0;
}

body {
  min-height: 100vh;
}
`;
  }

  private getGeneratedHtmlModule(preview: BrowserPreviewArtifacts): string {
    return `export const previewMode = ${JSON.stringify(preview.mode)};
export const generatedHtml = ${JSON.stringify(preview.html)};
export const previewReason = ${JSON.stringify(preview.reason ?? '')};
`;
  }

  private getReactStub(): string {
    return `export default function PreviewPlaceholder() {
  return null;
}
`;
  }

  private buildPreviewArtifacts(code: string, format: OutputFormat): BrowserPreviewArtifacts {
    if (format === 'html') {
      return {
        mode: 'html-static',
        html: code,
        reactCode: this.getReactStub(),
      };
    }

    if (format === 'tailwind') {
      return {
        mode: 'tailwind-static',
        html: code,
        reactCode: this.getReactStub(),
      };
    }

    if (format === 'vue') {
      const preview = buildPreviewDocument(code, format);
      return {
        mode: 'vue-static',
        html: preview.html,
        reactCode: this.getReactStub(),
        reason: preview.description,
      };
    }

    const runtimeSupport = this.analyzeRuntimeSupport(code);
    if (!runtimeSupport.supported) {
      const preview = buildPreviewDocument(code, format);
      return {
        mode: 'html-static',
        html: preview.html,
        reactCode: this.getReactStub(),
        reason: runtimeSupport.reason,
      };
    }

    return {
      mode: 'tsx-runtime',
      html: '',
      reactCode: code,
    };
  }

  private analyzeRuntimeSupport(code: string): { supported: boolean; reason: string } {
    const imports = [...code.matchAll(/import\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );
    const unsupportedImports = imports.filter(
      (specifier) =>
        !specifier.startsWith('./') &&
        !specifier.startsWith('../') &&
        !specifier.startsWith('@/') &&
        specifier !== 'react' &&
        specifier !== 'react-dom' &&
        specifier !== 'react-dom/client' &&
        specifier !== 'react/jsx-runtime',
    );

    if (!unsupportedImports.length) {
      return {
        supported: true,
        reason: '',
      };
    }

    return {
      supported: false,
      reason: `Browser preview runtime supports React with local imports only. Unsupported imports: ${unsupportedImports.join(', ')}`,
    };
  }
}
