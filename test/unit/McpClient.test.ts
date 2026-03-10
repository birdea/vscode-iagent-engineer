import * as assert from 'assert';
import nock from 'nock';
import * as sinon from 'sinon';
import { McpClient } from '../../src/figma/McpClient';
import { Logger } from '../../src/logger/Logger';
const packageJson = require('../../package.json') as { version: string };

suite('McpClient', () => {
  let client: McpClient;
  const endpoint = 'http://127.0.0.1:3845/mcp';

  setup(() => {
    client = new McpClient(endpoint);
    Logger.initialize({ appendLine: () => {}, clear: () => {} } as any);
    const vscode = require('vscode');
    vscode.window.showWarningMessage.resetHistory();
    vscode.window.showWarningMessage.resolves('Connect');
    if (!nock.isActive()) nock.activate();
  });

  teardown(() => {
    nock.cleanAll();
  });

  test('initialize success', async () => {
    nock('http://127.0.0.1:3845')
      .matchHeader(
        'accept',
        (value) =>
          typeof value === 'string' &&
          value.includes('application/json') &&
          value.includes('text/event-stream'),
      )
      .post('/mcp', (body) => {
        const initializeBody = body as { params?: { clientInfo?: { version?: string } } };
        return initializeBody.params?.clientInfo?.version === packageJson.version;
      })
      .reply(
        200,
        { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } },
        { 'mcp-session-id': 'session-1' },
      );

    const success = await client.initialize();
    assert.strictEqual(success, true);
    assert.strictEqual(client.isConnected(), true);
  });

  test('initialize failure', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Error' } });

    const success = await client.initialize();
    assert.strictEqual(success, false);
    assert.strictEqual(client.isConnected(), false);
  });

  test('listTools', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 'session-1' });

    await client.initialize();

    nock('http://127.0.0.1:3845')
      .matchHeader('mcp-session-id', 'session-1')
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [{ name: 'get_design_context' }] },
      });
    const tools = await client.listTools();
    assert.deepStrictEqual(tools, ['get_design_context']);
  });

  test('callTool success', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 'session-1' });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .matchHeader('mcp-session-id', 'session-1')
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result: { data: 'ok' },
      });
    const result = await client.callTool('get_file', { fileId: '123' });
    assert.deepStrictEqual(result, { data: 'ok' });
  });

  test('getDesignContext prefers modern MCP tool and normalizes nodeId', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 'session-1' });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .matchHeader('mcp-session-id', 'session-1')
      .post('/mcp', (body) => {
        const payload = body as {
          params?: { name?: string; arguments?: { fileKey?: string; nodeId?: string } };
        };
        return (
          payload.params?.name === 'get_design_context' &&
          payload.params?.arguments?.fileKey === 'FILE123' &&
          payload.params?.arguments?.nodeId === '4-5'
        );
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '{"name":"Modern Frame"}' }],
        },
      });

    const result = await client.getDesignContext('FILE123', '4:5');
    assert.deepStrictEqual(result, { name: 'Modern Frame' });
  });

  test('getImage', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 'session-1' });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .matchHeader('mcp-session-id', 'session-1')
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result: { content: [{ type: 'image', data: 'imgdata', mimeType: 'image/png' }] },
      });
    const img = await client.getImage('file', 'node');
    assert.strictEqual(img, 'imgdata');
  });

  test('getMetadata prefers get_metadata with normalized nodeId', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 'session-1' });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .matchHeader('mcp-session-id', 'session-1')
      .post('/mcp', (body) => {
        const payload = body as {
          params?: { name?: string; arguments?: { fileKey?: string; nodeId?: string } };
        };
        return (
          payload.params?.name === 'get_metadata' &&
          payload.params?.arguments?.fileKey === 'FILE123' &&
          payload.params?.arguments?.nodeId === '4-5'
        );
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '{"layers":[{"id":"1"}]}' }],
        },
      });

    const result = await client.getMetadata('FILE123', '4:5');
    assert.deepStrictEqual(result, { layers: [{ id: '1' }] });
  });

  test('getVariableDefs falls back from fileKey to fileId', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 'session-1' });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        error: { code: -32601, message: 'Method not found' },
      })
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 3,
        error: { code: -32601, message: 'Method not found' },
      })
      .post('/mcp', (body) => {
        const payload = body as {
          params?: { name?: string; arguments?: { fileId?: string; nodeId?: string } };
        };
        return (
          payload.params?.name === 'get_variable_defs' &&
          payload.params?.arguments?.fileId === 'FILE123' &&
          payload.params?.arguments?.nodeId === '4-5'
        );
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 4,
        result: {
          structuredContent: { variables: [{ name: 'color.primary' }] },
        },
      });

    const result = await client.getVariableDefs('FILE123', '4:5');
    assert.deepStrictEqual(result, { variables: [{ name: 'color.primary' }] });
  });

  test('request error handling', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').replyWithError('Network error');

    const success = await client.initialize();
    assert.strictEqual(success, false);
  });

  test('initialize failure on non-2xx HTTP status', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(500, { error: 'server failure' });

    const success = await client.initialize();
    assert.strictEqual(success, false);
    assert.strictEqual(client.isConnected(), false);
  });

  test('parse error handling', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, 'invalid json');

    const success = await client.initialize();
    assert.strictEqual(success, false);
    assert.strictEqual(client.isConnected(), false);
  });

  test('callTool throws if not initialized', async () => {
    const uninitClient = new McpClient('http://127.0.0.1:3845/mcp');
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

  test('initialize requests confirmation for non-local endpoints', async () => {
    client.setEndpoint('https://example.com/mcp');
    const vscode = require('vscode');

    nock('https://example.com')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });

    const success = await client.initialize();

    assert.strictEqual(success, true);
    assert.ok(
      vscode.window.showWarningMessage.calledWithMatch(
        sinon.match(/not local/),
        { modal: true },
        'Connect',
      ),
    );
  });

  test('initialize aborts when non-local endpoint is not confirmed', async () => {
    client.setEndpoint('https://example.com/mcp');
    const vscode = require('vscode');
    vscode.window.showWarningMessage.resolves(undefined);

    await assert.rejects(
      () => client.initialize(),
      /MCP connection cancelled for non-local endpoint/,
    );
    assert.strictEqual(client.isConnected(), false);
  });

  test('sendRequest retries transient failures up to success', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .replyWithError('temporary outage')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'get_design_context' }] } });

    const tools = await client.listTools();

    assert.deepStrictEqual(tools, ['get_design_context']);
  });

  test('callTool rejects JSON-RPC id mismatch', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 999,
        result: { data: 'bad-id' },
      });

    await assert.rejects(
      async () => client.callTool('get_file', { fileId: '123' }),
      /response id mismatch/,
    );
  });

  test('setEndpoint preserves path and query', async () => {
    client.setEndpoint('http://localhost:3845/mcp?channel=figma');

    nock('http://localhost:3845')
      .post('/mcp')
      .query({ channel: 'figma' })
      .reply(200, { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });

    const success = await client.initialize();
    assert.strictEqual(success, true);
    assert.strictEqual(client.isConnected(), true);
  });

  test('setEndpoint without port falls back to localhost default 3845', async () => {
    client.setEndpoint('http://localhost');

    nock('http://localhost:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } });

    const success = await client.initialize();
    assert.strictEqual(success, true);
    assert.strictEqual(client.isConnected(), true);
  });

  test('listTools returns empty array when tools is missing from response', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 1, result: {} });

    const tools = await client.listTools();
    assert.deepStrictEqual(tools, []);
  });

  test('listTools returns empty array when tools is null', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 1, result: { tools: null } });

    const tools = await client.listTools();
    assert.deepStrictEqual(tools, []);
  });

  test('callTool accepts string JSON-RPC id', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: '2', result: { data: 'ok' } });

    const result = await client.callTool('get_file', { fileId: '123' });
    assert.deepStrictEqual(result, { data: 'ok' });
  });

  test('getImage falls back to data field when base64 absent', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, { jsonrpc: '2.0', id: 2, result: { data: 'fallback' } });
    const img = await client.getImage('file', 'node');
    assert.strictEqual(img, 'fallback');
  });

  test('getImage falls back to legacy get_image when modern tool is unavailable', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        error: { code: -32601, message: 'Method not found' },
      })
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 3,
        result: { base64: 'legacy-image' },
      });

    const img = await client.getImage('file', '4:5');
    assert.strictEqual(img, 'legacy-image');
  });

  test('getDesignContext falls back to legacy get_file with hyphen nodeId', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        error: { code: -32601, message: 'Method not found' },
      })
      .post('/mcp')
      .reply(200, {
        jsonrpc: '2.0',
        id: 3,
        error: { code: -32601, message: 'Method not found' },
      })
      .post('/mcp', (body) => {
        const payload = body as {
          params?: { name?: string; arguments?: { fileKey?: string; nodeId?: string } };
        };
        return (
          payload.params?.name === 'get_file' &&
          payload.params?.arguments?.fileKey === 'FILE123' &&
          payload.params?.arguments?.nodeId === '4-5'
        );
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 4,
        result: { document: { name: 'Legacy Frame' } },
      });

    const result = await client.getDesignContext('FILE123', '4:5');
    assert.deepStrictEqual(result, { document: { name: 'Legacy Frame' } });
  });

  test('getImage throws when neither base64 nor data is present', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 1, result: {} });
    await client.initialize();

    nock('http://127.0.0.1:3845').post('/mcp').reply(200, { jsonrpc: '2.0', id: 2, result: {} });
    await assert.rejects(() => client.getImage('file', 'node'), /returned no image data/);
  });

  test('sendRequest does not retry validation failures', async () => {
    nock('http://127.0.0.1:3845').post('/mcp').reply(200, 'not-json');

    const success = await client.initialize();

    assert.strictEqual(success, false);
    assert.ok(nock.isDone());
  });

  test('constructor normalizes local root endpoint to /mcp', async () => {
    client = new McpClient('http://localhost:3845');

    nock('http://localhost:3845')
      .post('/mcp')
      .reply(
        200,
        { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05' } },
        { 'mcp-session-id': 'session-1' },
      );

    const success = await client.initialize();

    assert.strictEqual(success, true);
    assert.strictEqual(client.isConnected(), true);
  });

  test('initialize accepts SSE-wrapped JSON-RPC response', async () => {
    nock('http://127.0.0.1:3845')
      .post('/mcp')
      .reply(
        200,
        [
          'event: message',
          'data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05"}}',
          '',
        ].join('\n'),
        { 'Content-Type': 'text/event-stream', 'mcp-session-id': 'session-1' },
      );

    const success = await client.initialize();

    assert.strictEqual(success, true);
    assert.strictEqual(client.isConnected(), true);
  });
});
