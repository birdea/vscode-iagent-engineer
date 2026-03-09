const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: !isProduction,
  minify: isProduction,
  target: 'node20',
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/ui/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: !isProduction,
  minify: isProduction,
  target: 'es2020',
  logLevel: 'info',
};

function copyStyle() {
  if (!fs.existsSync('dist')) fs.mkdirSync('dist', { recursive: true });
  fs.copyFileSync('src/webview/ui/style.css', 'dist/style.css');
  const codiconsDir = path.join('node_modules', '@vscode', 'codicons', 'dist');
  const codiconCss = path.join(codiconsDir, 'codicon.css');
  const codiconFont = path.join(codiconsDir, 'codicon.ttf');

  if (fs.existsSync(codiconCss) && fs.existsSync(codiconFont)) {
    fs.copyFileSync(codiconCss, 'dist/codicon.css');
    fs.copyFileSync(codiconFont, 'dist/codicon.ttf');
    return;
  }

  // Allow the extension bundle to build even if codicon assets are unavailable locally.
  fs.writeFileSync('dist/codicon.css', '');
  console.warn(
    'Codicon assets not found in node_modules; building without bundled codicon styles.',
  );
}

function cleanupProductionArtifacts() {
  if (!isProduction || !fs.existsSync('dist')) return;
  for (const file of fs.readdirSync('dist')) {
    if (file.endsWith('.map')) {
      fs.unlinkSync(path.join('dist', file));
    }
  }
}

async function main() {
  cleanupProductionArtifacts();
  copyStyle();
  if (isWatch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
    console.log('Build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
