import * as assert from 'assert';
import nock from 'nock';
import { McpClient } from '../../src/figma/McpClient';
import { Logger } from '../../src/logger/Logger';

suite('McpClient', () => {
  let client: McpClient;
  const endpoint = 'http://localhost:3845';

  setup(() => {
    client = new McpClient(endpoint);
    Logger.initialize({ appendLine: () => {}, clear: () => {} } as any);
    if (!nock.isActive()) nock.activate();
  });

  teardown(() => {
    nock.cleanAll();
  });

  test('initialize success', async () => {
    nock('http://localhost:3845')
      .post('/')
      .reply(200, { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });

    const success = await client.initialize();
    assert.strictEqual(success, true);
    assert.strictEqual(client.isConnected(), true);
  });

  test('initialize failure', async () => {
    nock('http://localhost:3845')
      .post('/')
      .reply(200, { jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Error' } });

    const success = await client.initialize();
    assert.strictEqual(success, false);
    assert.strictEqual(client.isConnected(), false);
  });

  test('listTools', async () => {
    nock('http://localhost:3845')
      .post('/')
      .reply(200, { 
        jsonrpc: '2.0', 
        id: 1, 
        result: { tools: [{ name: 'get_file' }] } 
      });
    const tools = await client.listTools();
    assert.deepStrictEqual(tools, ['get_file']);
  });

  test('callTool success', async () => {
    nock('http://localhost:3845')
      .post('/')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://localhost:3845')
      .post('/')
      .reply(200, { 
        jsonrpc: '2.0', 
        id: 2, 
        result: { data: 'ok' } 
      });
    const result = await client.callTool('get_file', { fileId: '123' });
    assert.deepStrictEqual(result, { data: 'ok' });
  });

  test('getImage', async () => {
    nock('http://localhost:3845')
      .post('/')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://localhost:3845')
      .post('/')
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result: { base64: 'imgdata' }
      });
    const img = await client.getImage('file', 'node');
    assert.strictEqual(img, 'imgdata');
  });

  test('request error handling', async () => {
    nock('http://localhost:3845')
      .post('/')
      .replyWithError('Network error');

    const success = await client.initialize();
    assert.strictEqual(success, false);
  });

  test('parse error handling', async () => {
    nock('http://localhost:3845')
      .post('/')
      .reply(200, 'invalid json');

    try {
      await client.initialize();
    } catch (e) {
      assert.ok(e);
    }
  });

  test('callTool throws if not initialized', async () => {
      const uninitClient = new McpClient('http://localhost:3845');
      try {
          await uninitClient.callTool('any');
          assert.fail('Should throw');
      } catch (e: any) {
          assert.strictEqual(e.message, 'MCP client not initialized');
      }
  });

  test('setEndpoint resets initialization', () => {
      client.setEndpoint('http://new:3000');
      assert.strictEqual(client.isConnected(), false);
  });
});
