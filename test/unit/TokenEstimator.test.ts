import * as assert from 'assert';
import { estimateTokens, formatEstimate } from '../../src/prompt/TokenEstimator';

suite('TokenEstimator', () => {
  test('empty string returns zeros', () => {
    const result = estimateTokens('');
    assert.strictEqual(result.tokens, 0);
    assert.strictEqual(result.kb, 0);
  });

  test('token count approximation', () => {
    const text = 'Hello World'; // 11 chars
    const result = estimateTokens(text);
    assert.strictEqual(result.tokens, Math.ceil(11 / 4)); // 3
  });

  test('kb calculation', () => {
    const text = 'a'.repeat(1024);
    const result = estimateTokens(text);
    assert.ok(result.kb >= 0.9 && result.kb <= 1.1);
  });

  test('formatEstimate returns correct string', () => {
    const estimate = { tokens: 3100, kb: 12.3 };
    const formatted = formatEstimate(estimate);
    assert.ok(formatted.includes('12.3KB'));
    assert.ok(formatted.includes('3,100 tok'));
  });
});
