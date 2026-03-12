import * as assert from 'assert';
import * as sinon from 'sinon';
import { handleOAuthCallback, handleOAuthStart } from '../../workers/src/routes/oauth';

suite('OAuth worker routes', () => {
  let sandbox: sinon.SinonSandbox;
  const env = {
    FIGMA_CLIENT_ID: 'client-id',
    FIGMA_CLIENT_SECRET: 'client-secret',
    ALLOWED_ORIGINS: '',
  };

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('handleOAuthStart rejects requests without a state nonce', async () => {
    const request = new Request(
      'https://workers.example.com/api/figma/oauth/start?vscode_redirect_uri=vscode://bd-creative.iagent-engineer/figma-remote-auth',
    );

    const response = await handleOAuthStart(request, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Missing state');
  });

  test('handleOAuthStart rejects non-editor redirect uris', async () => {
    const request = new Request(
      'https://workers.example.com/api/figma/oauth/start?vscode_redirect_uri=https%3A%2F%2Fevil.example.com%2Fcallback&state=pendingstate123456',
    );

    const response = await handleOAuthStart(request, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid vscode_redirect_uri');
  });

  test('handleOAuthStart rejects malformed state nonces', async () => {
    const request = new Request(
      'https://workers.example.com/api/figma/oauth/start?vscode_redirect_uri=vscode%3A%2F%2Fbd-creative.iagent-engineer%2Ffigma-remote-auth&state=short',
    );

    const response = await handleOAuthStart(request, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid state');
  });

  test('handleOAuthCallback redirects token payload back to the original editor callback', async () => {
    sandbox.stub(Date, 'now').returns(500_000);
    const startRequest = new Request(
      'https://workers.example.com/api/figma/oauth/start?vscode_redirect_uri=vscode%3A%2F%2Fbd-creative.iagent-engineer%2Ffigma-remote-auth&state=pendingstate123456',
    );
    const startResponse = await handleOAuthStart(startRequest, env);
    const signedState = new URL(startResponse.headers.get('location') || '').searchParams.get(
      'state',
    );

    sandbox.stub(globalThis, 'fetch').resolves(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const callbackRequest = new Request(
      `https://workers.example.com/api/figma/oauth/callback?code=oauth-code&state=${encodeURIComponent(signedState || '')}`,
    );

    const response = await handleOAuthCallback(callbackRequest, env);
    const redirectLocation = response.headers.get('location') || '';
    const redirect = new URL(redirectLocation);

    assert.strictEqual(response.status, 302);
    assert.strictEqual(
      `${redirect.protocol}//${redirect.host}${redirect.pathname}`,
      'vscode://bd-creative.iagent-engineer/figma-remote-auth',
    );
    assert.strictEqual(redirect.searchParams.get('state'), 'pendingstate123456');
    assert.strictEqual(redirect.searchParams.get('access_token'), 'access-token');
    assert.strictEqual(redirect.searchParams.get('refresh_token'), 'refresh-token');
    assert.strictEqual(redirect.searchParams.get('expires_in'), '3600');
  });

  test('handleOAuthCallback rejects expired signed state payloads', async () => {
    sandbox.stub(Date, 'now').returns(1_000);
    const startRequest = new Request(
      'https://workers.example.com/api/figma/oauth/start?vscode_redirect_uri=vscode%3A%2F%2Fbd-creative.iagent-engineer%2Ffigma-remote-auth&state=pendingstate123456',
    );
    const startResponse = await handleOAuthStart(startRequest, env);
    const signedState = new URL(startResponse.headers.get('location') || '').searchParams.get(
      'state',
    );

    sandbox.restore();
    sandbox = sinon.createSandbox();
    sandbox.stub(Date, 'now').returns(1_000 + 10 * 60 * 1000 + 1);

    const request = new Request(
      `https://workers.example.com/api/figma/oauth/callback?code=oauth-code&state=${encodeURIComponent(signedState || '')}`,
    );

    const response = await handleOAuthCallback(request, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid OAuth callback payload');
  });

  test('handleOAuthCallback rejects tampered state payloads', async () => {
    const request = new Request(
      'https://workers.example.com/api/figma/oauth/callback?code=oauth-code&state=invalid.state',
    );

    const response = await handleOAuthCallback(request, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid OAuth callback payload');
  });
});
