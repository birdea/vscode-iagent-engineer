import * as assert from 'assert';
import * as sinon from 'sinon';
import { SourceDataService } from '../../src/figma/SourceDataService';

suite('SourceDataService', () => {
  let editorIntegration: {
    openInEditor: sinon.SinonStub;
    openBinaryInEditor: sinon.SinonStub;
  };

  setup(() => {
    editorIntegration = {
      openInEditor: sinon.stub().resolves(),
      openBinaryInEditor: sinon.stub().resolves(),
    };
  });

  test('fetch opens text responses in a text editor', async () => {
    const service = new SourceDataService(
      editorIntegration as any,
      'ko',
      sinon.stub().resolves({
        body: Buffer.from('hello'),
        headersRaw: 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n',
        httpCode: 200,
        stderr: '',
      }),
    );

    const result = await service.fetch('http://localhost:3845/assets/test.txt');

    assert.strictEqual(result.mode, 'text');
    assert.ok(editorIntegration.openInEditor.calledWith('hello', 'plaintext', 'test.txt'));
  });

  test('fetch opens image responses as binary assets', async () => {
    const service = new SourceDataService(
      editorIntegration as any,
      'ko',
      sinon.stub().resolves({
        body: Buffer.from([1, 2, 3]),
        headersRaw: 'HTTP/1.1 200 OK\r\nContent-Type: image/png\r\n',
        httpCode: 200,
        stderr: '',
      }),
    );

    const result = await service.fetch('http://localhost:3845/assets/test.png');

    assert.strictEqual(result.mode, 'image');
    assert.ok(result.thumbnailDataUrl?.startsWith('data:image/png;base64,'));
    assert.ok(
      editorIntegration.openBinaryInEditor.calledWithMatch(
        sinon.match.instanceOf(Buffer),
        'test.png',
      ),
    );
  });

  test('fetch rejects invalid URLs before running curl', async () => {
    const runCurl = sinon.stub().resolves();
    const service = new SourceDataService(editorIntegration as any, 'ko', runCurl as any);

    await assert.rejects(() => service.fetch('not-a-url'), /URL/);
    assert.ok(runCurl.notCalled);
  });

  test('fetch parses const assignment input and downloads the quoted URL', async () => {
    const runCurl = sinon.stub().resolves({
      body: Buffer.from([1, 2, 3]),
      headersRaw: 'HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml\r\n',
      httpCode: 200,
      stderr: '',
    });
    const service = new SourceDataService(editorIntegration as any, 'ko', runCurl);

    await service.fetch(
      'const imgShape = "http://localhost:3845/assets/2f7490d7d35be15248ac4e5527cf2bf2f900ae81.svg";',
    );

    assert.ok(
      runCurl.calledWith(
        'http://localhost:3845/assets/2f7490d7d35be15248ac4e5527cf2bf2f900ae81.svg',
      ),
    );
  });

  test('fetch parses quoted URL input with an optional trailing semicolon', async () => {
    const runCurl = sinon.stub().resolves({
      body: Buffer.from([1, 2, 3]),
      headersRaw: 'HTTP/1.1 200 OK\r\nContent-Type: image/png\r\n',
      httpCode: 200,
      stderr: '',
    });
    const service = new SourceDataService(editorIntegration as any, 'ko', runCurl);

    await service.fetch(
      '"http://localhost:3845/assets/0df81d5aafb5e86cfba280b95634bb0e3aae8dd4.png";',
    );

    assert.ok(
      runCurl.calledWith(
        'http://localhost:3845/assets/0df81d5aafb5e86cfba280b95634bb0e3aae8dd4.png',
      ),
    );
  });

  test('fetchAll parses multiple const assignments and processes them in order', async () => {
    const runCurl = sinon.stub();
    const delay = sinon.stub().resolves();
    runCurl.onCall(0).resolves({
      body: Buffer.from([1]),
      headersRaw: 'HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml\r\n',
      httpCode: 200,
      stderr: '',
    });
    runCurl.onCall(1).resolves({
      body: Buffer.from([2]),
      headersRaw: 'HTTP/1.1 200 OK\r\nContent-Type: image/png\r\n',
      httpCode: 200,
      stderr: '',
    });
    const service = new SourceDataService(editorIntegration as any, 'ko', runCurl, delay);

    const results = await service.fetchAll(`
const imgShape = "http://localhost:3845/assets/2f7490d7d35be15248ac4e5527cf2bf2f900ae81.svg";
const imgRectangle2147234812 = "http://localhost:3845/assets/0df81d5aafb5e86cfba280b95634bb0e3aae8dd4.png";
`);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(
      runCurl.firstCall.args[0],
      'http://localhost:3845/assets/2f7490d7d35be15248ac4e5527cf2bf2f900ae81.svg',
    );
    assert.strictEqual(
      runCurl.secondCall.args[0],
      'http://localhost:3845/assets/0df81d5aafb5e86cfba280b95634bb0e3aae8dd4.png',
    );
    assert.strictEqual(delay.callCount, 1);
    assert.strictEqual(delay.firstCall.args[0], 1000);
    assert.strictEqual(editorIntegration.openBinaryInEditor.callCount, 2);
  });
});
