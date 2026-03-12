import * as assert from 'assert';
import nock from 'nock';
import { RemoteFigmaApiClient } from '../../src/figma/RemoteFigmaApiClient';

suite('RemoteFigmaApiClient', () => {
  const baseUrl = 'https://worker.example.com';
  let client: RemoteFigmaApiClient;

  setup(() => {
    client = new RemoteFigmaApiClient(1000);
  });

  teardown(() => {
    nock.cleanAll();
  });

  test('checkStatus returns remote connection state', async () => {
    nock(baseUrl)
      .get('/api/figma/mcp/status')
      .matchHeader('Authorization', 'Bearer token')
      .reply(200, { connected: true });

    const result = await client.checkStatus(baseUrl, 'token');
    assert.deepStrictEqual(result, { connected: true });
  });

  test('fetchDesignContext returns data payload', async () => {
    nock(baseUrl)
      .post('/api/figma/mcp/context', { fileKey: 'FILE1', nodeId: '1:2' })
      .matchHeader('Authorization', 'Bearer token')
      .reply(200, { data: { name: 'Frame' } });

    const result = await client.fetchDesignContext(baseUrl, 'token', {
      fileKey: 'FILE1',
      nodeId: '1:2',
    });
    assert.deepStrictEqual(result, { name: 'Frame' });
  });

  test('fetchScreenshot returns image payload', async () => {
    nock(baseUrl)
      .post('/api/figma/mcp/screenshot', { fileKey: 'FILE1', nodeId: '1:2' })
      .matchHeader('Authorization', 'Bearer token')
      .reply(200, { data: 'base64-image', mimeType: 'image/png' });

    const result = await client.fetchScreenshot(baseUrl, 'token', {
      fileKey: 'FILE1',
      nodeId: '1:2',
    });
    assert.deepStrictEqual(result, { data: 'base64-image', mimeType: 'image/png' });
  });
});
