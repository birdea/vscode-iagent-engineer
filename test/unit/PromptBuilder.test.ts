import * as assert from 'assert';
import {
  DEFAULT_PROMPT_TEXT,
  PromptBuilder,
  getFormatPromptPreview,
} from '../../src/prompt/PromptBuilder';
import { PromptPayload } from '../../src/types';

suite('PromptBuilder', () => {
  const builder = new PromptBuilder();

  test('build prompt with basic payload', () => {
    const payload: PromptPayload = {
      outputFormat: 'html',
      userPrompt: 'Make it beautiful',
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.startsWith('Make it beautiful'));
    assert.ok(prompt.includes('HTML5 with inline CSS'));
    assert.ok(prompt.includes('Do not use React, TSX, JSX'));
    assert.ok(prompt.includes('=== Output Format: HTML ==='));
  });

  test('build prompt with MCP data as string', () => {
    const payload: PromptPayload = {
      outputFormat: 'tsx',
      mcpData: 'Figma JSON data here',
      mcpDataKind: 'designContext',
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.includes('React functional component'));
    assert.ok(prompt.includes('=== Figma Design Context (MCP) ==='));
    assert.ok(prompt.includes('Figma JSON data here'));
  });

  test('build prompt with MCP data as object', () => {
    const payload: PromptPayload = {
      outputFormat: 'tailwind',
      mcpData: { type: 'RECTANGLE', name: 'Button' },
      mcpDataKind: 'designContext',
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.includes('Tailwind CSS utility classes'));
    assert.ok(prompt.includes('"type": "RECTANGLE"'));
    assert.ok(prompt.includes('"name": "Button"'));
  });

  test('buildUserPrompt includes format rules, MCP context, and final response rules', () => {
    const prompt = builder.buildUserPrompt({
      outputFormat: 'html',
      userPrompt: 'Use a newspaper-like serif headline',
      mcpData: { frame: 'hero' },
      mcpDataKind: 'designContext',
    });

    assert.ok(prompt.includes('=== Output Contract ==='));
    assert.ok(prompt.includes('=== Figma Design Context (MCP) ==='));
    assert.ok(prompt.includes('Return only HTML code.'));
  });

  test('buildUserPrompt labels metadata separately when requested', () => {
    const prompt = builder.buildUserPrompt({
      outputFormat: 'html',
      mcpData: { components: ['Button'] },
      mcpDataKind: 'metadata',
    });

    assert.ok(prompt.includes('=== Figma Metadata (MCP) ==='));
    assert.ok(prompt.includes('"components"'));
  });

  test('estimate tokens', () => {
    const payload: PromptPayload = {
      outputFormat: 'html',
      userPrompt: 'Test prompt',
    };
    const estimate = builder.estimate(payload);
    assert.strictEqual(typeof estimate.tokens, 'number');
    assert.strictEqual(typeof estimate.kb, 'number');
    assert.ok(estimate.tokens > 0);
  });

  test('uses the edited prompt text as the leading system prompt', () => {
    const payload: PromptPayload = {
      outputFormat: 'html',
      userPrompt: '   excessive spacing   ',
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.startsWith('excessive spacing'));
  });

  test('handles null/undefined mcpData', () => {
    const payload1 = { outputFormat: 'html', mcpData: null } as any;
    const prompt1 = builder.build(payload1);
    assert.strictEqual(prompt1.includes('Figma Design Context'), false);

    const payload2 = { outputFormat: 'html', mcpData: undefined } as any;
    const prompt2 = builder.build(payload2);
    assert.strictEqual(prompt2.includes('Figma Design Context'), false);
  });

  test('includes edited prompt override at the top of the composed prompt', () => {
    const prompt = builder.build({
      outputFormat: 'html',
      userPrompt: 'Custom prompt',
    });

    assert.ok(prompt.startsWith('Custom prompt'));
    assert.ok(!prompt.startsWith(DEFAULT_PROMPT_TEXT));
  });

  test('includes screenshot guidance when screenshot data is attached', () => {
    const prompt = builder.buildUserPrompt({
      outputFormat: 'html',
      screenshotData: { base64: 'abc', mimeType: 'image/png' },
    });

    assert.ok(prompt.includes('=== Figma Screenshot ==='));
    assert.ok(prompt.includes('attached separately as an image input'));
  });

  test('format prompt preview exposes the effective output-format rules', () => {
    const preview = getFormatPromptPreview('vue');

    assert.ok(preview.includes('Generate VUE code'));
    assert.ok(preview.includes('Vue 3 Single File Component'));
    assert.ok(preview.includes('=== Final Response Rules ==='));
  });
});
