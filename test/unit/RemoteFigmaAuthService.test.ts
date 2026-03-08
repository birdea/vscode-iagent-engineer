import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { RemoteFigmaAuthService } from '../../src/figma/RemoteFigmaAuthService';

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
});
