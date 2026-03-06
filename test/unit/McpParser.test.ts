import * as assert from 'assert';
import { parseMcpData } from '../../src/figma/McpParser';

suite('McpParser Final', () => {
  test('Standard URL', () => {
    const res = parseMcpData('https://figma.com/file/F1/T?node-id=1:1');
    assert.strictEqual(res.fileId, 'F1');
    assert.strictEqual(res.nodeId, '1:1');
  });

  test('URL with hyphens in node-id', () => {
    const res = parseMcpData('https://figma.com/file/F2/T?node-id=2-2');
    assert.strictEqual(res.fileId, 'F2');
    assert.strictEqual(res.nodeId, '2:2');
  });

  test('JSON with fileId', () => {
    const res = parseMcpData('{"fileId": "J1"}');
    assert.strictEqual(res.fileId, 'J1');
  });

  test('JSON with URL string containing node-id', () => {
    const res = parseMcpData('{"url": "https://figma.com/file/J4?node-id=4-4"}');
    assert.strictEqual(res.fileId, 'J4');
    assert.strictEqual(res.nodeId, '4:4');
  });

  test('Plain text URL with node-id', () => {
    const res = parseMcpData('See https://figma.com/file/T1?node-id=5-5');
    assert.strictEqual(res.fileId, 'T1');
    assert.strictEqual(res.nodeId, '5:5');
  });

  test('JSON without valid keys but with URL', () => {
      const res = parseMcpData('{"other": "https://figma.com/design/D1"}');
      assert.strictEqual(res.fileId, 'D1');
  });

  test('Invalid JSON fallback', () => {
      const res = parseMcpData('not json but has https://figma.com/file/F7');
      assert.strictEqual(res.fileId, 'F7');
  });

  test('Empty', () => {
    assert.strictEqual(parseMcpData('').fileId, '');
  });
});
