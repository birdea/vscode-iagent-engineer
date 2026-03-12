import * as fs from 'fs';
import * as path from 'path';
import { OutputFormat } from '../types';
import { buildPreviewDocument } from './PreviewRenderer';

export interface PreviewPanelContent {
  title: string;
  html: string;
}

type PreviewIssueLevel = 'info' | 'warn' | 'error';

interface PreviewIssue {
  level: PreviewIssueLevel;
  label: string;
  detail: string;
}

export async function buildPreviewPanelContent(
  code: string,
  cspSource: string,
  preferredFormat?: OutputFormat,
  workspaceRoot = process.cwd(),
): Promise<PreviewPanelContent> {
  const tailwindEnabled = shouldEnableTailwindPreview(code, preferredFormat);
  const tailwindIssues = tailwindEnabled
    ? [
        createIssue(
          'info',
          'Tailwind Runtime',
          'Tailwind Play CDN is enabled for this preview. It requires network access in the webview.',
        ),
      ]
    : [];
  const runtimeSupport = analyzeRuntimeSupport(code, workspaceRoot);

  if (shouldUseRuntimePreview(code, preferredFormat)) {
    if (!runtimeSupport.supported) {
      const preview = buildPreviewDocument(code, preferredFormat);
      const issues = [
        createIssue('warn', 'Fallback Reason', runtimeSupport.reason),
        ...tailwindIssues,
        ...toIssues(preview.warnings, 'warn', 'Static Preview Note'),
      ];
      return {
        title: preview.title,
        html: buildStaticPanelHtml(
          preview.title,
          'Runtime preview is unavailable for this file, so a static fallback is shown.',
          issues,
          preview.html,
          cspSource,
          tailwindEnabled,
        ),
      };
    }

    try {
      return await buildRuntimePreviewContent(
        code,
        cspSource,
        tailwindEnabled,
        tailwindIssues,
        workspaceRoot,
      );
    } catch (error) {
      const preview = buildPreviewDocument(code, preferredFormat);
      const issues = [
        createIssue(
          'error',
          'Runtime Build Error',
          `Runtime preview failed and fell back to static rendering: ${toMessage(error)}`,
        ),
        ...tailwindIssues,
        ...toIssues(preview.warnings, 'warn', 'Static Preview Note'),
      ];
      return {
        title: preview.title,
        html: buildStaticPanelHtml(
          preview.title,
          preview.description,
          issues,
          preview.html,
          cspSource,
          tailwindEnabled,
        ),
      };
    }
  }

  const preview = buildPreviewDocument(code, preferredFormat);
  const issues = [...tailwindIssues, ...toIssues(preview.warnings, 'warn', 'Static Preview Note')];
  return {
    title: preview.title,
    html: buildStaticPanelHtml(
      preview.title,
      preview.description,
      issues,
      preview.html,
      cspSource,
      tailwindEnabled,
    ),
  };
}

interface RuntimeSupportResult {
  supported: boolean;
  reason: string;
  unsupportedImports: string[];
}

interface TsConfigData {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

interface PathAliasMapping {
  key: string;
  wildcard: boolean;
  prefix: string;
  suffix: string;
  targets: string[];
}

type EsbuildModule = typeof import('esbuild');

let esbuildModulePromise: Promise<EsbuildModule> | null = null;

async function loadEsbuild(): Promise<EsbuildModule> {
  if (!esbuildModulePromise) {
    esbuildModulePromise = Promise.resolve().then(() => {
      const dynamicRequire = new Function(
        'try { return require; } catch { return undefined; }',
      )() as NodeJS.Require | undefined;
      if (dynamicRequire) {
        return dynamicRequire('esbuild') as EsbuildModule;
      }

      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string,
      ) => Promise<EsbuildModule>;
      return dynamicImport('esbuild');
    });
  }

  return await esbuildModulePromise;
}

function shouldUseRuntimePreview(code: string, preferredFormat?: OutputFormat): boolean {
  if (preferredFormat === 'tsx') {
    return true;
  }

  return /from\s+['"]react['"]/.test(code) || /className\s*=/.test(code);
}

function analyzeRuntimeSupport(code: string, workspaceRoot: string): RuntimeSupportResult {
  const resolver = createPreviewResolver(workspaceRoot);
  const imports = [...code.matchAll(/import\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  const unsupportedImports = imports.filter(
    (specifier) =>
      !specifier.startsWith('./') &&
      !specifier.startsWith('../') &&
      !resolver.supportsAliasImport(specifier) &&
      specifier !== 'react' &&
      specifier !== 'react-dom' &&
      specifier !== 'react-dom/client' &&
      specifier !== 'react/jsx-runtime',
  );

  if (!unsupportedImports.length) {
    return {
      supported: true,
      reason: '',
      unsupportedImports: [],
    };
  }

  return {
    supported: false,
    reason: `Runtime preview currently supports React with local relative imports only. Unsupported imports: ${unsupportedImports.join(', ')}`,
    unsupportedImports,
  };
}

async function buildRuntimePreviewContent(
  code: string,
  cspSource: string,
  tailwindEnabled: boolean,
  tailwindIssues: PreviewIssue[],
  workspaceRoot: string,
): Promise<PreviewPanelContent> {
  const bundle = await buildReactPreviewBundle(code, workspaceRoot);
  return {
    title: 'React / TSX Preview',
    html: buildRuntimePanelHtml(
      'React / TSX Preview',
      'Rendered with a lightweight React runtime preview.',
      [
        createIssue(
          'info',
          'Runtime Status',
          'Single-file React output is executed directly inside the preview panel.',
        ),
        ...tailwindIssues,
      ],
      bundle,
      cspSource,
      tailwindEnabled,
    ),
  };
}

async function buildReactPreviewBundle(code: string, workspaceRoot: string): Promise<string> {
  const esbuild = await loadEsbuild();
  const resolver = createPreviewResolver(workspaceRoot);
  const buildResult = await esbuild.build({
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    plugins: [
      {
        name: 'preview-virtual-modules',
        setup(build) {
          build.onResolve({ filter: /^virtual:preview-app$/ }, () => ({
            path: 'virtual:preview-app',
            namespace: 'preview',
          }));

          build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
            const resolved = resolver.resolveImport(args.path, args.resolveDir);
            if (!resolved) {
              return {
                errors: [{ text: `Could not resolve relative import: ${args.path}` }],
              };
            }
            return { path: resolved.path, namespace: resolved.namespace };
          });

          build.onResolve({ filter: /^[^./].*|^@\// }, (args) => {
            if (!resolver.supportsAliasImport(args.path)) {
              return null;
            }

            const resolved = resolver.resolveAliasImport(args.path);
            if (!resolved) {
              return {
                errors: [{ text: `Could not resolve alias import: ${args.path}` }],
              };
            }
            return { path: resolved.path, namespace: resolved.namespace };
          });

          build.onLoad({ filter: /^virtual:preview-app$/, namespace: 'preview' }, () => ({
            contents: code,
            loader: 'tsx',
            resolveDir: workspaceRoot,
          }));

          build.onLoad({ filter: /\.(tsx|ts|jsx|js|json)$/, namespace: 'file' }, (args) => ({
            contents: fs.readFileSync(args.path, 'utf8'),
            loader: toEsbuildLoader(args.path),
            resolveDir: path.dirname(args.path),
          }));

          build.onLoad({ filter: /\.(css|scss|sass|less)$/, namespace: 'style-stub' }, () => ({
            contents: 'export default {};',
            loader: 'js',
          }));
        },
      },
    ],
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import * as PreviewModule from 'virtual:preview-app';

        const rootElement = document.getElementById('root');
        const errorElement = document.getElementById('runtime-error');

        function showError(message) {
          if (errorElement) {
            errorElement.innerHTML = '<strong>Runtime preview failed.</strong><br />' + message;
            errorElement.style.display = 'block';
          }
        }

        function resolveComponent(moduleValue) {
          const candidate =
            moduleValue?.default ??
            moduleValue?.AppLayout ??
            moduleValue?.App ??
            moduleValue;

          if (!candidate) {
            throw new Error('No previewable React component export was found.');
          }

          return candidate;
        }

        try {
          const AppComponent = resolveComponent(PreviewModule);
          if (!rootElement) {
            throw new Error('Preview root element was not found.');
          }

          const root = createRoot(rootElement);
          const element = React.isValidElement(AppComponent)
            ? AppComponent
            : React.createElement(AppComponent);
          root.render(element);
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        }
      `,
      loader: 'tsx',
      sourcefile: 'preview-entry.tsx',
      resolveDir: workspaceRoot,
    },
  });

  return buildResult.outputFiles[0]?.text ?? '';
}

function buildRuntimePanelHtml(
  title: string,
  description: string,
  issues: PreviewIssue[],
  bundle: string,
  cspSource: string,
  tailwindEnabled: boolean,
): string {
  const tailwindScript = tailwindEnabled
    ? '<script src="https://cdn.tailwindcss.com"></script>'
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://cdn.tailwindcss.com; script-src 'unsafe-inline' https://cdn.tailwindcss.com; img-src ${cspSource} data: blob: http://localhost:3845 https:; font-src ${cspSource}; connect-src http://localhost:3845 https:;"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
    .meta {
      padding: 12px 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent);
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 85%, transparent);
    }
    .meta h1 {
      margin: 0 0 4px;
      font-size: 13px;
    }
    .meta p {
      margin: 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .issues {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .issue {
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
      border: 1px solid transparent;
    }
    .issue strong {
      display: block;
      margin-bottom: 3px;
      font-size: 11px;
    }
    .issue.info {
      background: rgba(90, 140, 255, 0.12);
      border-color: rgba(90, 140, 255, 0.28);
      color: var(--vscode-foreground);
    }
    .issue.warn {
      background: rgba(255, 187, 0, 0.12);
      border-color: rgba(255, 187, 0, 0.28);
      color: var(--vscode-foreground);
    }
    .issue.error {
      background: rgba(255, 99, 71, 0.12);
      border-color: rgba(255, 99, 71, 0.28);
      color: var(--vscode-foreground);
    }
    #runtime-error {
      display: none;
      margin: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 99, 71, 0.45);
      background: rgba(255, 99, 71, 0.12);
      color: #ffb4a5;
      font-size: 12px;
    }
    #root {
      min-height: calc(100vh - 74px);
      overflow: auto;
      background: white;
    }
  </style>
  ${tailwindScript}
</head>
<body>
  <div class="meta">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    ${renderIssues(issues)}
  </div>
  <div id="runtime-error"></div>
  <div id="root"></div>
  <script>${bundle}</script>
</body>
</html>`;
}

function buildStaticPanelHtml(
  title: string,
  description: string,
  issues: PreviewIssue[],
  previewHtml: string,
  cspSource: string,
  tailwindEnabled: boolean,
): string {
  const preparedPreviewHtml = prepareStaticPreviewHtml(previewHtml, tailwindEnabled);
  const iframeSandbox = tailwindEnabled ? 'allow-same-origin allow-scripts' : 'allow-same-origin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data: blob: http://localhost:3845 https:; font-src ${cspSource}; frame-src 'self' data:;"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
    }
    .shell {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 100vh;
    }
    .meta {
      padding: 12px 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent);
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 85%, transparent);
    }
    .meta h1 {
      margin: 0 0 4px;
      font-size: 13px;
      font-weight: 600;
    }
    .meta p {
      margin: 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .issues {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .issue {
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
      border: 1px solid transparent;
    }
    .issue strong {
      display: block;
      margin-bottom: 3px;
      font-size: 11px;
    }
    .issue.info {
      background: rgba(90, 140, 255, 0.12);
      border-color: rgba(90, 140, 255, 0.28);
      color: var(--vscode-foreground);
    }
    .issue.warn {
      background: rgba(255, 187, 0, 0.12);
      border-color: rgba(255, 187, 0, 0.28);
      color: var(--vscode-foreground);
    }
    .issue.error {
      background: rgba(255, 99, 71, 0.12);
      border-color: rgba(255, 99, 71, 0.28);
      color: var(--vscode-foreground);
    }
    iframe {
      width: 100%;
      height: calc(100vh - 74px);
      border: 0;
      background: white;
    }
    .unsupported {
      padding: 20px 14px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="meta">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      ${renderIssues(issues)}
    </div>
    <iframe sandbox="${iframeSandbox}" srcdoc="${escapeAttribute(preparedPreviewHtml)}"></iframe>
  </div>
</body>
</html>`;
}

function prepareStaticPreviewHtml(previewHtml: string, tailwindEnabled: boolean): string {
  const sanitizedPreviewHtml = tailwindEnabled ? previewHtml : stripScriptTags(previewHtml);
  const scriptPolicy = tailwindEnabled ? ' script-src https://cdn.tailwindcss.com;' : '';
  const connectPolicy = tailwindEnabled ? ' connect-src http://localhost:3845 https:;' : '';
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.tailwindcss.com;${scriptPolicy} img-src data: blob: http://localhost:3845 https:; font-src https:;${connectPolicy}">`;
  const tailwindScript = tailwindEnabled
    ? '<script src="https://cdn.tailwindcss.com"></script>'
    : '';

  if (/<head[\s>]/i.test(sanitizedPreviewHtml)) {
    return sanitizedPreviewHtml.replace(
      /<head[^>]*>/i,
      (match) => `${match}${csp}${tailwindScript}`,
    );
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${csp}
  ${tailwindScript}
</head>
<body>
${sanitizedPreviewHtml}
</body>
</html>`;
}

function stripScriptTags(value: string): string {
  const lowerValue = value.toLowerCase();
  let cursor = 0;
  let sanitized = '';

  while (cursor < value.length) {
    const scriptStart = findScriptTagStart(lowerValue, cursor, false);
    if (scriptStart === -1) {
      sanitized += value.slice(cursor);
      break;
    }

    sanitized += value.slice(cursor, scriptStart);
    const openingTagEnd = lowerValue.indexOf('>', scriptStart + '<script'.length);
    if (openingTagEnd === -1) {
      break;
    }

    const closingTagStart = findScriptTagStart(lowerValue, openingTagEnd + 1, true);
    if (closingTagStart === -1) {
      break;
    }

    const closingTagEnd = lowerValue.indexOf('>', closingTagStart + '</script'.length);
    if (closingTagEnd === -1) {
      break;
    }

    cursor = closingTagEnd + 1;
  }

  return sanitized;
}

function findScriptTagStart(value: string, fromIndex: number, closing: boolean): number {
  const tagPrefix = closing ? '</script' : '<script';
  let cursor = fromIndex;

  while (cursor < value.length) {
    const candidate = value.indexOf(tagPrefix, cursor);
    if (candidate === -1) {
      return -1;
    }

    const nextCharacter = value[candidate + tagPrefix.length] ?? '';
    if (!nextCharacter || /[\s>/]/.test(nextCharacter)) {
      return candidate;
    }

    cursor = candidate + tagPrefix.length;
  }

  return -1;
}

function shouldEnableTailwindPreview(code: string, preferredFormat?: OutputFormat): boolean {
  if (preferredFormat === 'tailwind') {
    return true;
  }

  return (
    /\bclass(Name)?="[^"]*(bg-|text-|flex|grid|px-|py-|mx-|my-|rounded-|w-\[|h-\[)/.test(code) ||
    /\bclassName=\{[`'"][\s\S]*?(bg-|text-|flex|grid|px-|py-|mx-|my-|rounded-)/.test(code) ||
    /\bline-clamp-\d+\b/.test(code)
  );
}

function createIssue(level: PreviewIssueLevel, label: string, detail: string): PreviewIssue {
  return { level, label, detail };
}

function toIssues(
  messages: string[],
  level: PreviewIssueLevel,
  defaultLabel: string,
): PreviewIssue[] {
  return messages.map((message, index) =>
    createIssue(level, `${defaultLabel} ${index + 1}`, message),
  );
}

function renderIssues(issues: PreviewIssue[]): string {
  if (!issues.length) {
    return '';
  }

  const content = issues
    .map(
      (issue) =>
        `<div class="issue ${issue.level}"><strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.detail)}</span></div>`,
    )
    .join('');
  return `<div class="issues">${content}</div>`;
}

type PreviewResolvedModule = {
  path: string;
  namespace: 'file' | 'style-stub';
};

function createPreviewResolver(workspaceRoot: string) {
  const tsconfig = readTsConfig(workspaceRoot);
  const baseUrl = tsconfig?.compilerOptions?.baseUrl
    ? path.resolve(workspaceRoot, tsconfig.compilerOptions.baseUrl)
    : workspaceRoot;
  const pathAliases = buildPathAliasMappings(tsconfig);

  return {
    resolveImport(specifier: string, resolveDir: string): PreviewResolvedModule | null {
      return resolveFile(path.resolve(resolveDir, specifier));
    },
    supportsAliasImport(specifier: string): boolean {
      if (specifier.startsWith('@/')) {
        return true;
      }
      return matchPathAlias(specifier, pathAliases) !== null;
    },
    resolveAliasImport(specifier: string): PreviewResolvedModule | null {
      const candidates: string[] = [];
      const aliasMatch = matchPathAlias(specifier, pathAliases);
      if (aliasMatch) {
        candidates.push(...aliasMatch.targets.map((target) => path.resolve(baseUrl, target)));
      }

      if (specifier.startsWith('@/')) {
        const relative = specifier.slice(2);
        candidates.push(
          path.resolve(baseUrl, relative),
          path.resolve(workspaceRoot, 'src', relative),
        );
      }

      for (const candidate of candidates) {
        const resolved = resolveFile(candidate);
        if (resolved) {
          return resolved;
        }
      }
      return null;
    },
  };
}

function buildPathAliasMappings(tsconfig: TsConfigData | null): PathAliasMapping[] {
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  return Object.entries(paths)
    .map(([key, targets]) => {
      const wildcard = key.includes('*');
      const [prefix, suffix = ''] = key.split('*');
      return {
        key,
        wildcard,
        prefix,
        suffix,
        targets,
      };
    })
    .sort((left, right) => right.key.length - left.key.length);
}

function matchPathAlias(
  specifier: string,
  mappings: PathAliasMapping[],
): { targets: string[] } | null {
  for (const mapping of mappings) {
    if (!mapping.wildcard) {
      if (specifier !== mapping.key) {
        continue;
      }
      return { targets: mapping.targets };
    }

    if (!specifier.startsWith(mapping.prefix) || !specifier.endsWith(mapping.suffix)) {
      continue;
    }

    const wildcardValue = specifier.slice(
      mapping.prefix.length,
      specifier.length - mapping.suffix.length,
    );
    return {
      targets: mapping.targets.map((target) => target.replace(/\*/g, wildcardValue)),
    };
  }

  return null;
}

function readTsConfig(workspaceRoot: string): TsConfigData | null {
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveFile(basePath: string): PreviewResolvedModule | null {
  const direct = tryResolvePath(basePath);
  if (direct) {
    return direct;
  }

  const extensions = ['.tsx', '.ts', '.jsx', '.js', '.json', '.css', '.scss', '.sass', '.less'];
  for (const extension of extensions) {
    const candidate = tryResolvePath(`${basePath}${extension}`);
    if (candidate) {
      return candidate;
    }
  }

  for (const filename of ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.json']) {
    const candidate = tryResolvePath(path.join(basePath, filename));
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function tryResolvePath(candidate: string): PreviewResolvedModule | null {
  if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
    return null;
  }

  if (/\.(css|scss|sass|less)$/.test(candidate)) {
    return { path: candidate, namespace: 'style-stub' };
  }

  return { path: candidate, namespace: 'file' };
}

function toEsbuildLoader(filePath: string): import('esbuild').Loader {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.ts')) return 'ts';
  if (filePath.endsWith('.jsx')) return 'jsx';
  if (filePath.endsWith('.json')) return 'json';
  return 'js';
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, '&#10;');
}
