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
    const uri = service.buildCallbackUri('bd-creative.figma-mcp-helper');
    assert.strictEqual(
      uri.toString(),
      `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/figma-remote-auth`,
    );
  });

  test('buildAuthUrl appends redirect and oauth helpers', async () => {
    const url = await service.buildAuthUrl(
      'https://example.com/oauth',
      'bd-creative.figma-mcp-helper',
    );
    const parsed = new URL(url);
    assert.strictEqual(
      parsed.searchParams.get('vscode_redirect_uri'),
      `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/figma-remote-auth`,
    );
  });

  test('buildAuthUrl preserves an existing redirect uri', async () => {
    const url = await service.buildAuthUrl(
      `https://example.com/oauth?vscode_redirect_uri=${encodeURIComponent('vscode://existing/callback')}`,
      'bd-creative.figma-mcp-helper',
    );
    const parsed = new URL(url);
    assert.strictEqual(
      parsed.searchParams.get('vscode_redirect_uri'),
      'vscode://existing/callback',
    );
  });

  test('handleCallbackUri stores session from query params', async () => {
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/figma-remote-auth?access_token=abc&refresh_token=ref&expires_in=60`,
    );

    const session = await service.handleCallbackUri(uri);

    assert.strictEqual(session.accessToken, 'abc');
    assert.strictEqual(session.refreshToken, 'ref');
    assert.ok(typeof session.expiresAt === 'number');
    assert.ok(secrets.store.calledOnce);
  });

  test('handleCallbackUri accepts fragment params and ignores invalid expiry', async () => {
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/figma-remote-auth#access_token=abc&refresh_token=ref&expires_in=abc`,
    );

    const session = await service.handleCallbackUri(uri);

    assert.strictEqual(session.accessToken, 'abc');
    assert.strictEqual(session.refreshToken, 'ref');
    assert.strictEqual(session.expiresAt, undefined);
  });

  test('handleCallbackUri rejects callbacks without an access token', async () => {
    const uri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://bd-creative.figma-mcp-helper/figma-remote-auth?refresh_token=ref`,
    );

    await assert.rejects(() => service.handleCallbackUri(uri), ValidationError);
    assert.ok(secrets.store.notCalled);
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
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH));
  });

  test('getSession clears saved payloads without an access token', async () => {
    secrets.get.resolves(JSON.stringify({ refreshToken: 'ref' }));

    const session = await service.getSession();

    assert.strictEqual(session, null);
    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH));
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

    assert.ok(secrets.delete.calledOnceWith(SECRET_KEYS.REMOTE_FIGMA_AUTH));
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
