import { OutputFormat } from '../types';

export type DetectedPreviewFormat =
  | 'html'
  | 'react'
  | 'vue'
  | 'scss'
  | 'unknown';

export interface PreviewDocument {
  detectedFormat: DetectedPreviewFormat;
  renderable: boolean;
  title: string;
  description: string;
  warnings: string[];
  html: string;
}

export function buildPreviewDocument(code: string, preferredFormat?: OutputFormat): PreviewDocument {
  const source = inlineConstStringReferences(normalizeSource(code));
  const detectedFormat = detectPreviewFormat(source, preferredFormat);

  switch (detectedFormat) {
    case 'html':
      return {
        detectedFormat,
        renderable: true,
        title: preferredFormat === 'tailwind' ? 'Tailwind Preview' : 'HTML Preview',
        description:
          preferredFormat === 'tailwind'
            ? 'Tailwind utility classes are shown as raw class names unless matching CSS is included in the output.'
            : 'Rendered directly from the generated markup.',
        warnings:
          preferredFormat === 'tailwind'
            ? ['Tailwind runtime is not bundled, so utility classes require generated CSS to appear.']
            : [],
        html: wrapHtmlDocument(source),
      };
    case 'vue': {
      const template = extractVueTemplate(source);
      const styles = extractVueStyles(source);
      return {
        detectedFormat,
        renderable: Boolean(template),
        title: 'Vue SFC Preview',
        description: template
          ? 'The <template> and <style> blocks are rendered. Script logic is not executed.'
          : 'A Vue Single File Component was detected, but a <template> block was not found.',
        warnings: template ? ['Vue script logic is omitted in static preview mode.'] : [],
        html: template
          ? wrapHtmlDocument(`${styles}${template}`)
          : buildUnsupportedHtml(
              'Vue preview is unavailable because the component template could not be extracted.',
              source,
            ),
      };
    }
    case 'react': {
      const jsx = extractReactRenderableMarkup(source);
      return {
        detectedFormat,
        renderable: Boolean(jsx),
        title: 'React / TSX Preview',
        description: jsx
          ? 'A static JSX preview was extracted from the component output.'
          : 'A React-style component was detected, but static JSX could not be extracted safely.',
        warnings: jsx
          ? [
              'Dynamic expressions and custom component behavior are omitted in static preview mode.',
            ]
          : [],
        html: jsx
          ? wrapHtmlDocument(jsx)
          : buildUnsupportedHtml(
              'React preview is unavailable because the JSX structure could not be extracted.',
              source,
            ),
      };
    }
    case 'scss':
      return {
        detectedFormat,
        renderable: false,
        title: 'SCSS Preview Unavailable',
        description: 'Stylesheet-only output cannot be rendered by itself without companion markup.',
        warnings: [],
        html: buildUnsupportedHtml(
          'SCSS output needs HTML markup to produce a visual preview.',
          source,
        ),
      };
    default:
      return {
        detectedFormat,
        renderable: false,
        title: 'Preview Unavailable',
        description: 'The generated output format could not be identified confidently.',
        warnings: [],
        html: buildUnsupportedHtml(
          'The output could not be classified as HTML, React, Vue, or SCSS.',
          source,
        ),
      };
  }
}

export function buildPreviewPanelHtml(
  preview: PreviewDocument,
  cspSource: string,
  heading = 'Generated UI Preview',
): string {
  const warningItems = preview.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join('');
  const warningBlock = warningItems ? `<ul class="warnings">${warningItems}</ul>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data: blob:; font-src ${cspSource}; frame-src 'self' data:;"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(preview.title)}</title>
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
    .warnings {
      margin: 8px 0 0;
      padding-left: 18px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
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
      <h1>${escapeHtml(heading)} · ${escapeHtml(preview.title)}</h1>
      <p>${escapeHtml(preview.description)}</p>
      ${warningBlock}
    </div>
    ${
      preview.renderable
        ? `<iframe sandbox="allow-same-origin" srcdoc="${escapeAttribute(preview.html)}"></iframe>`
        : `<div class="unsupported">${preview.html}</div>`
    }
  </div>
</body>
</html>`;
}

function detectPreviewFormat(code: string, preferredFormat?: OutputFormat): DetectedPreviewFormat {
  const trimmed = code.trim();

  if (
    /<template[\s>]/i.test(trimmed) ||
    /<script setup[\s>]/i.test(trimmed) ||
    /defineComponent\s*\(/.test(trimmed)
  ) {
    return 'vue';
  }

  if (
    /from\s+['"]react['"]/.test(trimmed) ||
    /className\s*=/.test(trimmed) ||
    /useState\s*\(/.test(trimmed) ||
    /return\s*\(\s*</.test(trimmed)
  ) {
    return 'react';
  }

  if (looksLikeScss(trimmed)) {
    return 'scss';
  }

  if (
    /^<!doctype html>/i.test(trimmed) ||
    /<(html|body|main|section|div|article|header|footer)[\s>]/i.test(trimmed)
  ) {
    return 'html';
  }

  if (preferredFormat === 'vue') return 'vue';
  if (preferredFormat === 'tsx') return 'react';
  if (preferredFormat === 'scss') return 'scss';
  if (preferredFormat === 'html' || preferredFormat === 'tailwind') return 'html';

  return 'unknown';
}

function normalizeSource(code: string): string {
  const trimmed = code.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

function looksLikeScss(code: string): boolean {
  return (
    /\$[a-zA-Z_-][\w-]*\s*:/.test(code) ||
    /&:[\w-]+/.test(code) ||
    /@mixin\s+/.test(code) ||
    /@include\s+/.test(code)
  );
}

function extractVueTemplate(code: string): string {
  const match = code.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  return match?.[1]?.trim() ?? '';
}

function extractVueStyles(code: string): string {
  const matches = [...code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  if (!matches.length) {
    return '';
  }

  return matches.map((match) => `<style>${match[1].trim()}</style>`).join('\n');
}

function extractReactRenderableMarkup(code: string): string {
  const jsx = extractPrimaryReactMarkup(code) || extractTopLevelMarkup(code);
  if (!jsx) {
    return '';
  }

  return inlineUtilityStyles(sanitizeJsxToHtml(jsx));
}

function extractPrimaryReactMarkup(code: string): string {
  const exportFunctionMatch = code.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
  if (exportFunctionMatch?.[1]) {
    const body = extractNamedFunctionBody(code, exportFunctionMatch[1]);
    const jsx = extractReturnBlock(body);
    if (jsx) {
      return jsx;
    }
  }

  const exportIdentifierMatch = code.match(/export\s+default\s+([A-Za-z0-9_]+)\s*;?/);
  if (exportIdentifierMatch?.[1]) {
    const identifier = exportIdentifierMatch[1];
    const body = extractNamedFunctionBody(code, identifier) || extractConstArrowBody(code, identifier);
    const jsx = extractReturnBlock(body);
    if (jsx) {
      return jsx;
    }
  }

  const lastReturn = extractLastReturnBlock(code);
  if (lastReturn) {
    return lastReturn;
  }

  return extractReturnBlock(code);
}

function extractReturnBlock(code: string): string {
  if (!code) {
    return '';
  }

  const returnIndex = code.indexOf('return');
  if (returnIndex === -1) {
    return '';
  }

  const parenIndex = code.indexOf('(', returnIndex);
  if (parenIndex === -1) {
    return '';
  }

  let depth = 0;
  for (let i = parenIndex; i < code.length; i += 1) {
    const char = code[i];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return code.slice(parenIndex + 1, i).trim();
      }
    }
  }

  return '';
}

function extractLastReturnBlock(code: string): string {
  const matches = [...code.matchAll(/return\s*\(/g)];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i];
    const index = match.index ?? -1;
    if (index === -1) {
      continue;
    }
    const jsx = extractReturnBlock(code.slice(index));
    if (jsx) {
      return jsx;
    }
  }

  return '';
}

function extractNamedFunctionBody(code: string, name: string): string {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`export\\s+default\\s+function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(code);
    if (!match || match.index === undefined) {
      continue;
    }
    const braceIndex = code.indexOf('{', match.index);
    if (braceIndex === -1) {
      continue;
    }
    return extractBalancedBlock(code, braceIndex);
  }

  return '';
}

function extractConstArrowBody(code: string, name: string): string {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`);
  const match = pattern.exec(code);
  if (!match || match.index === undefined) {
    return '';
  }

  const braceIndex = code.indexOf('{', match.index);
  if (braceIndex === -1) {
    return '';
  }

  return extractBalancedBlock(code, braceIndex);
}

function extractBalancedBlock(code: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < code.length; i += 1) {
    const char = code[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return code.slice(openBraceIndex + 1, i);
      }
    }
  }

  return '';
}

function extractTopLevelMarkup(code: string): string {
  const match = code.match(/^\s*(<>|<div|<main|<section|<article|<header|<footer|<form)[\s\S]*$/);
  return match?.[0]?.trim() ?? '';
}

function sanitizeJsxToHtml(jsx: string): string {
  return jsx
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/className=/g, 'class=')
    .replace(/htmlFor=/g, 'for=')
    .replace(/<>/g, '')
    .replace(/<\/>/g, '')
    .replace(/style=\{\{([\s\S]*?)\}\}/g, (_match, styleBody) => {
      const style = styleBody
        .split(',')
        .map((part: string) => part.trim())
        .filter(Boolean)
        .map((part: string) => {
          const [rawKey, rawValue] = part.split(':').map((segment) => segment.trim());
          if (!rawKey || !rawValue) {
            return '';
          }
          const key = rawKey.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
          const value = rawValue.replace(/^['"]|['"]$/g, '');
          return `${key}: ${value}`;
        })
        .filter(Boolean)
        .join('; ');

      return style ? `style="${escapeAttribute(style)}"` : '';
    })
    .replace(/\{(['"`])([\s\S]*?)\1\}/g, '$2')
    .replace(/\{[^}]+\}/g, '')
    .trim();
}

function inlineConstStringReferences(code: string): string {
  const stringConsts = new Map<string, string>();
  for (const match of code.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])([\s\S]*?)\2\s*;/g,
  )) {
    stringConsts.set(match[1], match[3]);
  }

  let resolved = code;
  for (const [name, value] of stringConsts) {
    const escapedValue = value.replace(/"/g, '&quot;');
    const attributeReference = new RegExp(`=\\{\\s*${name}\\s*\\}`, 'g');
    const textReference = new RegExp(`\\{\\s*${name}\\s*\\}`, 'g');
    resolved = resolved
      .replace(attributeReference, `="${escapedValue}"`)
      .replace(textReference, escapeHtml(value));
  }

  return resolved;
}

function inlineUtilityStyles(markup: string): string {
  return markup.replace(/<([a-z][\w-]*)([^>]*?)\sclass="([^"]*)"([^>]*)>/gi, (_match, tag, before, classValue, after) => {
    const generatedStyle = classValue
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map(toInlineStyle)
      .filter(Boolean)
      .join('; ');

    if (!generatedStyle) {
      return `<${tag}${before} class="${classValue}"${after}>`;
    }

    const attrs = `${before}${after}`;
    const styleMatch = attrs.match(/\sstyle="([^"]*)"/i);
    if (styleMatch) {
      const mergedStyle = [styleMatch[1], generatedStyle].filter(Boolean).join('; ');
      return `<${tag}${attrs.replace(/\sstyle="([^"]*)"/i, ` style="${escapeAttribute(mergedStyle)}"`)} class="${classValue}">`;
    }

    return `<${tag}${before} class="${classValue}" style="${escapeAttribute(generatedStyle)}"${after}>`;
  });
}

function toInlineStyle(token: string): string {
  if (
    token.startsWith('hover:') ||
    token.startsWith('focus:') ||
    token.startsWith('active:') ||
    token.startsWith('group-') ||
    token === 'custom-scrollbar'
  ) {
    return '';
  }

  const spacing = parseSpacing(token);
  if (spacing) return spacing;

  const positioned = parsePosition(token);
  if (positioned) return positioned;

  const sized = parseSize(token);
  if (sized) return sized;

  const border = parseBorder(token);
  if (border) return border;

  const color = parseColor(token);
  if (color) return color;

  const typography = parseTypography(token);
  if (typography) return typography;

  const layoutMap: Record<string, string> = {
    block: 'display: block',
    flex: 'display: flex',
    'flex-col': 'flex-direction: column',
    'items-center': 'align-items: center',
    'justify-center': 'justify-content: center',
    'justify-between': 'justify-content: space-between',
    relative: 'position: relative',
    absolute: 'position: absolute',
    'overflow-hidden': 'overflow: hidden',
    'overflow-y-auto': 'overflow-y: auto',
    'overflow-x-auto': 'overflow-x: auto',
    'object-cover': 'object-fit: cover',
    'flex-grow': 'flex-grow: 1',
    'flex-shrink-0': 'flex-shrink: 0',
    'shrink-0': 'flex-shrink: 0',
    'mx-auto': 'margin-left: auto; margin-right: auto',
    'rounded-full': 'border-radius: 9999px',
    'whitespace-nowrap': 'white-space: nowrap',
    'text-center': 'text-align: center',
    transform: 'transform: translateZ(0)',
    'pointer-events-none': 'pointer-events: none',
    'line-clamp-2':
      'display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden',
  };

  if (layoutMap[token]) {
    return layoutMap[token];
  }

  if (/^z-\d+$/.test(token)) {
    return `z-index: ${token.slice(2)}`;
  }

  if (/^opacity-\d+$/.test(token)) {
    return `opacity: ${Number(token.slice(8)) / 100}`;
  }

  return '';
}

function parseSpacing(token: string): string {
  const match = token.match(/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap)-\[(.+)\]$/);
  if (!match) {
    return '';
  }

  const [, key, value] = match;
  const cssValue = normalizeCssValue(value);
  const map: Record<string, string> = {
    p: `padding: ${cssValue}`,
    px: `padding-left: ${cssValue}; padding-right: ${cssValue}`,
    py: `padding-top: ${cssValue}; padding-bottom: ${cssValue}`,
    pt: `padding-top: ${cssValue}`,
    pr: `padding-right: ${cssValue}`,
    pb: `padding-bottom: ${cssValue}`,
    pl: `padding-left: ${cssValue}`,
    m: `margin: ${cssValue}`,
    mx: `margin-left: ${cssValue}; margin-right: ${cssValue}`,
    my: `margin-top: ${cssValue}; margin-bottom: ${cssValue}`,
    mt: `margin-top: ${cssValue}`,
    mr: `margin-right: ${cssValue}`,
    mb: `margin-bottom: ${cssValue}`,
    ml: `margin-left: ${cssValue}`,
    gap: `gap: ${cssValue}`,
  };

  return map[key] ?? '';
}

function parsePosition(token: string): string {
  if (token === 'top-0') return 'top: 0';
  if (token === 'left-0') return 'left: 0';
  if (token === 'right-0') return 'right: 0';
  if (token === 'bottom-0') return 'bottom: 0';
  if (token === 'top-px') return 'top: 1px';
  if (token === 'left-1/2') return 'left: 50%';
  if (token === '-translate-x-1/2') return 'transform: translateX(-50%)';
  if (token === '-translate-x-full') return 'transform: translateX(-100%)';
  if (token === 'inset-0') return 'top: 0; right: 0; bottom: 0; left: 0';

  const match = token.match(/^(top|left|right|bottom)-\[(.+)\]$/);
  if (!match) {
    return '';
  }

  return `${match[1]}: ${normalizeCssValue(match[2])}`;
}

function parseSize(token: string): string {
  if (token === 'w-full') return 'width: 100%';
  if (token === 'h-full') return 'height: 100%';

  const match = token.match(/^([wh])-\[(.+)\]$/);
  if (!match) {
    return '';
  }

  return `${match[1] === 'w' ? 'width' : 'height'}: ${normalizeCssValue(match[2])}`;
}

function parseBorder(token: string): string {
  const map: Record<string, string> = {
    border: 'border-width: 1px; border-style: solid',
    'border-r': 'border-right-width: 1px; border-right-style: solid',
    'border-l': 'border-left-width: 1px; border-left-style: solid',
    'border-b': 'border-bottom-width: 1px; border-bottom-style: solid',
    'border-solid': 'border-style: solid',
    'border-dashed': 'border-style: dashed',
  };

  if (map[token]) {
    return map[token];
  }

  if (token === 'border-black') {
    return 'border-color: #000';
  }

  if (/^border-\[#([0-9a-fA-F]{3,8})\]$/.test(token)) {
    const color = token.match(/^border-\[(#.+)\]$/)?.[1];
    return color ? `border-color: ${color}` : '';
  }

  if (/^rounded-\[(.+)\]$/.test(token)) {
    const value = token.match(/^rounded-\[(.+)\]$/)?.[1];
    return value ? `border-radius: ${normalizeCssValue(value)}` : '';
  }

  return '';
}

function parseColor(token: string): string {
  if (token === 'bg-white') return 'background-color: white';
  if (token === 'text-white') return 'color: white';

  const match = token.match(/^(bg|text)-\[(#.+)\]$/);
  if (!match) {
    return '';
  }

  return `${match[1] === 'bg' ? 'background-color' : 'color'}: ${match[2]}`;
}

function parseTypography(token: string): string {
  const map: Record<string, string> = {
    'font-medium': 'font-weight: 500',
    'font-bold': 'font-weight: 700',
    'font-normal': 'font-weight: 400',
  };
  if (map[token]) {
    return map[token];
  }

  const textMatch = token.match(/^text-\[(.+)\]$/);
  if (textMatch) {
    return `font-size: ${normalizeCssValue(textMatch[1])}`;
  }

  const leadingMatch = token.match(/^leading-\[(.+)\]$/);
  if (leadingMatch) {
    return `line-height: ${normalizeCssValue(leadingMatch[1])}`;
  }

  return '';
}

function normalizeCssValue(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return `${value}px`;
  }
  return value;
}

function wrapHtmlDocument(markup: string): string {
  if (/<!doctype html>/i.test(markup) || /<html[\s>]/i.test(markup)) {
    return markup;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: white;
      color: #111;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
  </style>
</head>
<body>
${markup}
</body>
</html>`;
}

function buildUnsupportedHtml(message: string, source: string): string {
  return `<div style="padding: 16px; font-family: var(--vscode-font-family, sans-serif);">
  <p style="margin: 0 0 12px; font-size: 13px;">${escapeHtml(message)}</p>
  <pre style="white-space: pre-wrap; margin: 0; padding: 12px; background: rgba(127, 127, 127, 0.12); border-radius: 8px; overflow: auto;">${escapeHtml(source)}</pre>
</div>`;
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
