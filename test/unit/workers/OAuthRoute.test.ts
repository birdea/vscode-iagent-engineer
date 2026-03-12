import * as assert from 'assert';
import * as sinon from 'sinon';
import { handleOAuthCallback, handleOAuthStart } from '../../../workers/src/routes/oauth';

suite('OAuthRoute', () => {
  const env = {
    FIGMA_CLIENT_ID: 'figma-client-id',
    FIGMA_CLIENT_SECRET: 'figma-client-secret',
    ALLOWED_ORIGINS: '',
  };

  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('handleOAuthStart rejects unexpected redirect URIs', async () => {
    const request = new Request(
      'https://workers.example/api/figma/oauth/start?vscode_redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&state=pendingstate123456',
    );

    const response = await handleOAuthStart(request, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid vscode_redirect_uri');
  });

  test('handleOAuthStart rejects malformed state values', async () => {
    const request = new Request(
      'https://workers.example/api/figma/oauth/start?vscode_redirect_uri=vscode%3A%2F%2Fbd-creative.iagent-engineer%2Ffigma-remote-auth&state=short',
    );

    const response = await handleOAuthStart(request, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid state');
  });

  test('handleOAuthStart signs state for the Figma round-trip', async () => {
    const request = new Request(
      'https://workers.example/api/figma/oauth/start?vscode_redirect_uri=vscode%3A%2F%2Fbd-creative.iagent-engineer%2Ffigma-remote-auth&state=pendingstate123456',
    );

    const response = await handleOAuthStart(request, env);

    assert.strictEqual(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);

    const redirect = new URL(location!);
    assert.strictEqual(redirect.origin, 'https://www.figma.com');
    assert.strictEqual(
      redirect.searchParams.get('redirect_uri'),
      'https://workers.example/api/figma/oauth/callback',
    );
    assert.notStrictEqual(redirect.searchParams.get('state'), 'pendingstate123456');
  });

  test('handleOAuthCallback rejects expired signed state', async () => {
    sandbox.stub(Date, 'now').returns(1_000);
    const startRequest = new Request(
      'https://workers.example/api/figma/oauth/start?vscode_redirect_uri=vscode%3A%2F%2Fbd-creative.iagent-engineer%2Ffigma-remote-auth&state=pendingstate123456',
    );
    const startResponse = await handleOAuthStart(startRequest, env);
    const signedState = new URL(startResponse.headers.get('Location')!).searchParams.get('state');

    sandbox.restore();
    sandbox = sinon.createSandbox();
    sandbox.stub(Date, 'now').returns(1_000 + 10 * 60 * 1000 + 1);

    const callbackRequest = new Request(
      `https://workers.example/api/figma/oauth/callback?code=figma-code&state=${encodeURIComponent(signedState!)}`,
    );
    const response = await handleOAuthCallback(callbackRequest, env);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid OAuth callback payload');
  });

  test('handleOAuthCallback redirects tokens to the validated VS Code callback', async () => {
    const startRequest = new Request(
      'https://workers.example/api/figma/oauth/start?vscode_redirect_uri=vscode%3A%2F%2Fbd-creative.iagent-engineer%2Ffigma-remote-auth&state=pendingstate123456',
    );
    const startResponse = await handleOAuthStart(startRequest, env);
    const signedState = new URL(startResponse.headers.get('Location')!).searchParams.get('state');
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
      ) as unknown as Response,
    );

    const callbackRequest = new Request(
      `https://workers.example/api/figma/oauth/callback?code=figma-code&state=${encodeURIComponent(signedState!)}`,
    );
    const response = await handleOAuthCallback(callbackRequest, env);

    assert.strictEqual(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    assert.strictEqual(
      location,
      'vscode://bd-creative.iagent-engineer/figma-remote-auth?state=pendingstate123456&access_token=access-token&refresh_token=refresh-token&expires_in=3600',
    );
  });
});
