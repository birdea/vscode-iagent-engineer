import * as assert from 'assert';
import { buildPreviewDocument, buildPreviewPanelHtml } from '../../src/preview/PreviewRenderer';

suite('PreviewRenderer', () => {
  test('react preview prefers the default export component body', () => {
    const code = `
import React from 'react';

const imgProfile = "http://localhost:3845/assets/profile.png";

function Keyword() {
  return <div className="bg-black text-white">keyword</div>;
}

export default function AppLayout() {
  return (
    <div className="bg-white relative w-[1169px] h-[661px] overflow-hidden">
      <img src={imgProfile} className="w-[34px] h-[34px]" alt="profile" />
      <div className="absolute left-0 top-0 bg-[#f7f7f7] w-[57px] h-full"></div>
    </div>
  );
}
`;

    const preview = buildPreviewDocument(code, 'tsx');

    assert.strictEqual(preview.detectedFormat, 'react');
    assert.strictEqual(preview.renderable, true);
    assert.ok(preview.html.includes('width: 1169px'));
    assert.ok(preview.html.includes('height: 661px'));
    assert.ok(preview.html.includes('background-color: white'));
    assert.ok(preview.html.includes('http://localhost:3845/assets/profile.png'));
    assert.ok(!preview.html.includes('background-color: black'));
  });

  test('html preview respects fenced code blocks and html preferred format', () => {
    const code = ['```html', '<section><h1>Hello</h1><p>Preview</p></section>', '```'].join('\n');

    const preview = buildPreviewDocument(code, 'html');

    assert.strictEqual(preview.detectedFormat, 'html');
    assert.strictEqual(preview.renderable, true);
    assert.strictEqual(preview.title, 'HTML Preview');
    assert.ok(preview.html.includes('<section>'));
  });

  test('tailwind preview returns warning copy', () => {
    const preview = buildPreviewDocument('<div class="px-4 text-white">Demo</div>', 'tailwind');

    assert.strictEqual(preview.detectedFormat, 'html');
    assert.strictEqual(preview.title, 'Tailwind Preview');
    assert.ok(preview.warnings[0].includes('Tailwind runtime'));
  });

  test('vue preview falls back when template block is missing', () => {
    const preview = buildPreviewDocument('<script setup>const count = 1;</script>', 'vue');

    assert.strictEqual(preview.detectedFormat, 'vue');
    assert.strictEqual(preview.renderable, false);
    assert.ok(preview.description.includes('<template> block was not found'));
    assert.ok(preview.html.includes('Vue preview is unavailable'));
  });

  test('vue preview renders template and style blocks', () => {
    const preview = buildPreviewDocument(
      '<template><div class="card">Demo</div></template><style>.card { color: red; }</style>',
      'vue',
    );

    assert.strictEqual(preview.detectedFormat, 'vue');
    assert.strictEqual(preview.renderable, true);
    assert.ok(preview.html.includes('.card { color: red; }'));
    assert.ok(preview.warnings[0].includes('Vue script logic'));
  });

  test('preview falls back to unknown format when source cannot be classified', () => {
    const preview = buildPreviewDocument('const value = 1;', undefined);

    assert.strictEqual(preview.detectedFormat, 'unknown');
    assert.strictEqual(preview.renderable, false);
    assert.ok(preview.html.includes('could not be classified'));
  });

  test('buildPreviewPanelHtml covers warning and unsupported branches', () => {
    const unsupportedPreview = buildPreviewDocument('const value = 1;', undefined);
    const html = buildPreviewPanelHtml(unsupportedPreview, 'csp-source', 'Custom Heading');

    assert.ok(html.includes('Custom Heading'));
    assert.ok(html.includes('unsupported'));
    assert.ok(!html.includes('<ul class="warnings">'));
  });

  test('preferred tsx format still detects react when imports are absent', () => {
    const preview = buildPreviewDocument('export default App;', 'tsx');

    assert.strictEqual(preview.detectedFormat, 'react');
    assert.strictEqual(preview.renderable, false);
    assert.ok(preview.html.includes('React preview is unavailable'));
  });

  test('preferred vue format still detects vue without script setup markers', () => {
    const preview = buildPreviewDocument('plain text component stub', 'vue');

    assert.strictEqual(preview.detectedFormat, 'vue');
    assert.strictEqual(preview.renderable, false);
  });

  test('buildPreviewPanelHtml renders iframe and warnings for renderable previews', () => {
    const preview = buildPreviewDocument('<div class="px-4">Demo</div>', 'tailwind');
    const html = buildPreviewPanelHtml(preview, 'csp-source');

    assert.ok(html.includes('<iframe'));
    assert.ok(html.includes('<ul class="warnings">'));
  });

  test('react preview resolves exported identifier, const strings, and inline styles', () => {
    const code = `
const heroImage = "https://example.com/hero.png";

function Card() {
  return (
    <label htmlFor="email" className="flex items-center px-[12] text-white bg-[#101010]" style={{ lineHeight: '24px', fontSize: '16px' }}>
      <img src={heroImage} className="w-[48] h-[48]" alt="hero" />
      {'Ready'}
    </label>
  );
}

export default Card;
`;

    const preview = buildPreviewDocument(code, 'tsx');

    assert.strictEqual(preview.detectedFormat, 'react');
    assert.strictEqual(preview.renderable, true);
    assert.ok(preview.html.includes('for="email"'));
    assert.ok(preview.html.includes('https://example.com/hero.png'));
    assert.ok(preview.html.includes('display: flex'));
    assert.ok(preview.html.includes('font-size: 16px'));
    assert.ok(preview.html.includes('line-height: 24px'));
  });

  test('react preview falls back to the last return block and strips fragments/comments', () => {
    const code = `
const helper = () => {
  return (
    <>
      {/* hidden */}
      <main className="mx-auto opacity-50">Primary</main>
    </>
  );
};
`;

    const preview = buildPreviewDocument(code, 'tsx');

    assert.strictEqual(preview.detectedFormat, 'react');
    assert.strictEqual(preview.renderable, true);
    assert.ok(preview.html.includes('<main'));
    assert.ok(preview.html.includes('margin-left: auto'));
    assert.ok(preview.html.includes('opacity: 0.5'));
    assert.ok(!preview.html.includes('hidden'));
    assert.ok(!preview.html.includes('<>'));
  });

  test('react preview accepts top-level markup and preserves full html documents', () => {
    const htmlDocument = '<!DOCTYPE html><html><body><main>Standalone</main></body></html>';
    const reactLikeMarkup = '<section className="border border-black rounded-[8]">Body</section>';

    const htmlPreview = buildPreviewDocument(htmlDocument, 'html');
    const reactPreview = buildPreviewDocument(reactLikeMarkup, 'tsx');

    assert.strictEqual(htmlPreview.detectedFormat, 'html');
    assert.strictEqual(htmlPreview.html, htmlDocument);
    assert.strictEqual(reactPreview.detectedFormat, 'react');
    assert.strictEqual(reactPreview.renderable, true);
    assert.ok(reactPreview.html.includes('border-radius: 8px'));
    assert.ok(reactPreview.html.includes('border-color: #000'));
  });
});
