import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { RemoteFigmaAuthService } from '../../src/figma/RemoteFigmaAuthService';
import { SECRET_KEYS } from '../../src/constants';
import { ValidationError } from '../../src/errors';

suite('RemoteFigmaAuthService', () => {
  let sandbox: sinon.SinonSandbox;
  let secrets: {
    get: sinon.SinonStub;
    store: sinon.SinonStub;
    delete: sinon.SinonStub;
  };
  let service: RemoteFigmaAuthService;

  setup(() => {
    sandbox = sinon.createSandbox();
    secrets = {
      get: sandbox.stub().resolves(undefined),
      store: sandbox.stub().resolves(),
      delete: sandbox.stub().resolves(),
    };
    service = new RemoteFigmaAuthService(secrets as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('buildCallbackUri uses extension id and vscode uri scheme', () => {
    const uri = service.buildCallbackUri('bd-creative.iagent-engineer');
    assert.strictEqual(
      uri.toString(),
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
    );
  });

  test('buildAuthUrl appends redirect and stores a pending auth state', async () => {
    sandbox.stub(Date, 'now').returns(123_456);
    const url = await service.buildAuthUrl(
      'https://example.com/oauth',
      'bd-creative.iagent-engineer',
    );
    const parsed = new URL(url);
    assert.strictEqual(
      parsed.searchParams.get('vscode_redirect_uri'),
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
    );
    assert.match(parsed.searchParams.get('state') || '', /^[a-f0-9]{32}$/);
    assert.ok(
      secrets.store.calledOnceWith(
        SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING,
        JSON.stringify({
          nonce: parsed.searchParams.get('state'),
          callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
          createdAt: 123_456,
        }),
      ),
    );
  });

  test('buildAuthUrl overrides any existing redirect uri with the extension callback', async () => {
    const url = await service.buildAuthUrl(
      `https://example.com/oauth?vscode_redirect_uri=${encodeURIComponent('vscode://existing/callback')}`,
      'bd-creative.iagent-engineer',
    );
    const parsed = new URL(url);
    assert.strictEqual(
      parsed.searchParams.get('vscode_redirect_uri'),
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
    );
    assert.ok(parsed.searchParams.get('state'));
  });

  test('handleCallbackUri stores session from query params after validating pending state', async () => {
    secrets.get.withArgs(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING).resolves(
      JSON.stringify({
        nonce: 'nonce-123',
        callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
        createdAt: Date.now(),
      }),
    );
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?state=nonce-123&access_token=abc&refresh_token=ref&expires_in=60`,
    );

    const session = await service.handleCallbackUri(uri, 'bd-creative.iagent-engineer');

    assert.strictEqual(session.accessToken, 'abc');
    assert.strictEqual(session.refreshToken, 'ref');
    assert.ok(typeof session.expiresAt === 'number');
    assert.ok(secrets.store.calledOnceWithMatch(SECRET_KEYS.REMOTE_FIGMA_AUTH, sinon.match.string));
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('handleCallbackUri accepts fragment params and ignores invalid expiry', async () => {
    secrets.get.withArgs(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING).resolves(
      JSON.stringify({
        nonce: 'nonce-123',
        callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
        createdAt: Date.now(),
      }),
    );
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth#state=nonce-123&access_token=abc&refresh_token=ref&expires_in=abc`,
    );

    const session = await service.handleCallbackUri(uri, 'bd-creative.iagent-engineer');

    assert.strictEqual(session.accessToken, 'abc');
    assert.strictEqual(session.refreshToken, 'ref');
    assert.strictEqual(session.expiresAt, undefined);
  });

  test('handleCallbackUri rejects callbacks without an active pending state', async () => {
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?state=nonce-123&access_token=abc`,
    );

    await assert.rejects(
      () => service.handleCallbackUri(uri, 'bd-creative.iagent-engineer'),
      /did not match an active login attempt/,
    );
    assert.ok(secrets.store.notCalled);
  });

  test('handleCallbackUri rejects callbacks with a mismatched state', async () => {
    secrets.get.withArgs(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING).resolves(
      JSON.stringify({
        nonce: 'expected-state',
        callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
        createdAt: Date.now(),
      }),
    );
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?state=wrong-state&access_token=abc`,
    );

    await assert.rejects(
      () => service.handleCallbackUri(uri, 'bd-creative.iagent-engineer'),
      ValidationError,
    );
    assert.ok(secrets.store.notCalled);
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('handleCallbackUri rejects callbacks for a different callback uri', async () => {
    secrets.get.withArgs(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING).resolves(
      JSON.stringify({
        nonce: 'nonce-123',
        callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
        createdAt: Date.now(),
      }),
    );
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://another-extension/figma-remote-auth?state=nonce-123&access_token=abc`,
    );

    await assert.rejects(
      () => service.handleCallbackUri(uri, 'bd-creative.iagent-engineer'),
      ValidationError,
    );
    assert.ok(secrets.store.notCalled);
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('handleCallbackUri clears expired pending auth states', async () => {
    sandbox.stub(Date, 'now').returns(1_000_000);
    secrets.get.withArgs(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING).resolves(
      JSON.stringify({
        nonce: 'nonce-123',
        callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
        createdAt: 1_000_000 - 601_000,
      }),
    );
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?state=nonce-123&access_token=abc`,
    );

    await assert.rejects(
      () => service.handleCallbackUri(uri, 'bd-creative.iagent-engineer'),
      /login attempt expired/,
    );
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
    assert.ok(secrets.store.notCalled);
  });

  test('handleCallbackUri rejects callbacks without an access token', async () => {
    secrets.get.withArgs(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING).resolves(
      JSON.stringify({
        nonce: 'nonce-123',
        callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
        createdAt: Date.now(),
      }),
    );
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?state=nonce-123&refresh_token=ref`,
    );

    await assert.rejects(
      () => service.handleCallbackUri(uri, 'bd-creative.iagent-engineer'),
      ValidationError,
    );
    assert.ok(secrets.store.notCalled);
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('handleCallbackUri rejects callbacks for the wrong extension id', async () => {
    secrets.get.withArgs(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING).resolves(
      JSON.stringify({
        nonce: 'nonce-123',
        callbackUri: `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth`,
        createdAt: Date.now(),
      }),
    );
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.iagent-engineer/figma-remote-auth?state=nonce-123&access_token=abc`,
    );

    await assert.rejects(
      () => service.handleCallbackUri(uri, 'wrong.extension-id'),
      ValidationError,
    );
    assert.ok(secrets.store.notCalled);
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('getSession returns null when secret is absent', async () => {
    secrets.get.resolves(undefined);

    const session = await service.getSession();

    assert.strictEqual(session, null);
  });

  test('getSession returns parsed saved session', async () => {
    secrets.get.resolves(
      JSON.stringify({ accessToken: 'abc', refreshToken: 'ref', expiresAt: 123456 }),
    );

    const session = await service.getSession();

    assert.deepStrictEqual(session, {
      accessToken: 'abc',
      refreshToken: 'ref',
      expiresAt: 123456,
    });
    assert.ok(secrets.delete.notCalled);
  });

  test('getSession clears invalid json payloads', async () => {
    secrets.get.resolves('{invalid json');

    const session = await service.getSession();

    assert.strictEqual(session, null);
    assert.ok(secrets.delete.calledWith(SECRET_KEYS.REMOTE_FIGMA_AUTH));
    assert.ok(secrets.delete.calledWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('getSession clears saved payloads without an access token', async () => {
    secrets.get.resolves(JSON.stringify({ refreshToken: 'ref' }));

    const session = await service.getSession();

    assert.strictEqual(session, null);
    assert.ok(secrets.delete.calledWith(SECRET_KEYS.REMOTE_FIGMA_AUTH));
    assert.ok(secrets.delete.calledWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('saveSession persists the serialized auth session', async () => {
    await service.saveSession({ accessToken: 'abc', refreshToken: 'ref', expiresAt: 123 });

    assert.ok(
      secrets.store.calledOnceWith(
        SECRET_KEYS.REMOTE_FIGMA_AUTH,
        JSON.stringify({ accessToken: 'abc', refreshToken: 'ref', expiresAt: 123 }),
      ),
    );
  });

  test('clearSession removes the stored auth session', async () => {
    await service.clearSession();

    assert.ok(secrets.delete.calledWith(SECRET_KEYS.REMOTE_FIGMA_AUTH));
    assert.ok(secrets.delete.calledWith(SECRET_KEYS.REMOTE_FIGMA_AUTH_PENDING));
  });

  test('hasUsableAccessToken returns false when no session is stored', async () => {
    secrets.get.resolves(undefined);

    const usable = await service.hasUsableAccessToken();

    assert.strictEqual(usable, false);
  });

  test('hasUsableAccessToken returns true for sessions without expiry', async () => {
    secrets.get.resolves(JSON.stringify({ accessToken: 'abc' }));

    const usable = await service.hasUsableAccessToken();

    assert.strictEqual(usable, true);
  });

  test('hasUsableAccessToken returns false for expired sessions', async () => {
    const nowStub = sandbox.stub(Date, 'now').returns(10_000);
    secrets.get.resolves(JSON.stringify({ accessToken: 'abc', expiresAt: 9_999 }));

    const usable = await service.hasUsableAccessToken();

    assert.strictEqual(usable, false);
    assert.ok(nowStub.calledOnce);
  });

  test('hasUsableAccessToken returns true for unexpired sessions', async () => {
    const nowStub = sandbox.stub(Date, 'now').returns(10_000);
    secrets.get.resolves(JSON.stringify({ accessToken: 'abc', expiresAt: 10_001 }));

    const usable = await service.hasUsableAccessToken();

    assert.strictEqual(usable, true);
    assert.ok(nowStub.calledOnce);
  });
});
