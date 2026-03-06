import * as assert from 'assert';
import { PromptBuilder } from '../../src/prompt/PromptBuilder';
import { PromptPayload } from '../../src/types';

suite('PromptBuilder', () => {
  const builder = new PromptBuilder();

  test('build prompt with basic payload', () => {
    const payload: PromptPayload = {
      outputFormat: 'html',
      userPrompt: 'Make it beautiful',
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.includes('expert UI developer'));
    assert.ok(prompt.includes('HTML5 with inline CSS'));
    assert.ok(prompt.includes('Make it beautiful'));
    assert.ok(prompt.includes('=== Output Format: HTML ==='));
  });

  test('build prompt with MCP data as string', () => {
    const payload: PromptPayload = {
      outputFormat: 'tsx',
      mcpData: 'Figma JSON data here',
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.includes('React functional component'));
    assert.ok(prompt.includes('=== Figma Design Data (MCP) ==='));
    assert.ok(prompt.includes('Figma JSON data here'));
  });

  test('build prompt with MCP data as object', () => {
    const payload: PromptPayload = {
      outputFormat: 'tailwind',
      mcpData: { type: 'RECTANGLE', name: 'Button' },
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.includes('Tailwind CSS utility classes'));
    assert.ok(prompt.includes('"type": "RECTANGLE"'));
    assert.ok(prompt.includes('"name": "Button"'));
  });

  test('build prompt with multiple formats', () => {
    const scssPrompt = builder.build({ outputFormat: 'scss' });
    assert.ok(scssPrompt.includes('SCSS stylesheet'));

    const kotlinPrompt = builder.build({ outputFormat: 'kotlin' });
    assert.ok(kotlinPrompt.includes('Jetpack Compose UI code'));
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

  test('trims user prompt', () => {
    const payload: PromptPayload = {
      outputFormat: 'html',
      userPrompt: '   excessive spacing   ',
    };
    const prompt = builder.build(payload);
    assert.ok(prompt.includes('\n=== User Instruction ===\nexcessive spacing\n'));
  });

  test('handles null/undefined mcpData', () => {
    const payload1 = { outputFormat: 'html', mcpData: null } as any;
    const prompt1 = builder.build(payload1);
    assert.strictEqual(prompt1.includes('Figma Design Data'), false);

    const payload2 = { outputFormat: 'html', mcpData: undefined } as any;
    const prompt2 = builder.build(payload2);
    assert.strictEqual(prompt2.includes('Figma Design Data'), false);
  });
});
