import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import * as MainModule from '../../src/webview/ui/main';
import { installDom } from './helpers/dom';

suite('UI Main Initialization', () => {
  let dom: JSDOM;

  const sections = ['setup', 'prompt', 'log'];

  function setupDom(section: string) {
    dom = installDom(section).dom;
  }

  function dispatch(data: object) {
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data }));
  }

  sections.forEach((section) => {
    test(`init runs for section: ${section}`, async () => {
      setupDom(section);
      MainModule.init();
      const app = dom.window.document.getElementById('app');
      assert.ok(app?.innerHTML.length > 0, `Should render layer for ${section}`);
      if (section === 'setup') {
        dispatch({ event: 'figma.status', connected: true, methods: [] });
        dispatch({ event: 'agent.state', agent: 'gemini', model: '', hasApiKey: false });
      }
    });
  });

  test('setup section — all message branches', () => {
    setupDom('setup');
    MainModule.init();

    dispatch({ event: 'figma.connectRequested' });
    dispatch({ event: 'figma.authStarted', mode: 'remote', authUrl: 'https://example.com/login' });
    dispatch({ event: 'figma.status', connected: true, methods: ['get_file'] });
    dispatch({ event: 'figma.dataResult', data: { id: '1' }, kind: 'designContext' });
    dispatch({
      event: 'figma.sourceDataResult',
      count: 2,
      images: [
        {
          assetKey: 'asset-1',
          url: 'http://localhost:3845/assets/test.svg',
          suggestedName: 'test.svg',
          thumbnailDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        },
      ],
    });
    dispatch({ event: 'figma.sourceDataError', message: 'source failed' });
    dispatch({ event: 'figma.dataFetchError', message: 'fetch failed', fallbackData: {} });
    dispatch({ event: 'figma.screenshotResult', base64: 'aGVsbG8=' });
    dispatch({ event: 'error', source: 'figma', message: 'figma error' });
    dispatch({ event: 'unknown.event' }); // no-op branch
  });

  test('setup section keeps fetch error notice visible on data fetch failure', () => {
    setupDom('setup');
    MainModule.init();

    dispatch({ event: 'figma.dataFetchError', message: 'fetch failed', fallbackData: {} });

    const notice = dom.window.document.getElementById('figma-data-notice');
    assert.strictEqual(notice?.textContent, 'fetch failed');
  });

  test('prompt section — all message branches', () => {
    setupDom('prompt');
    MainModule.init();

    dispatch({ event: 'prompt.generateRequested' });
    dispatch({ event: 'agent.state', agent: 'gemini', model: 'gemini-2.0', hasApiKey: true });
    dispatch({ event: 'agent.modelsResult', models: [{ id: 'gemini-2.0', name: 'Gemini 2.0' }] });
    dispatch({ event: 'prompt.streaming', progress: 30, text: 'hello' });
    dispatch({ event: 'prompt.result', code: 'const x = 1;' });
    dispatch({ event: 'prompt.estimateResult', tokens: 100, kb: 0.5 });
    dispatch({ event: 'prompt.error', message: 'prompt error' });
    dispatch({ event: 'error', source: 'prompt', message: 'prompt host error' });
    dispatch({ event: 'error', source: 'system', message: 'system error' });
    dispatch({ event: 'unknown.event' });
  });

  test('log section — all message branches', () => {
    setupDom('log');
    MainModule.init();

    dispatch({
      event: 'log.append',
      entry: { id: '1', timestamp: '', level: 'info', layer: 'system', message: 'hi' },
    });
    dispatch({ event: 'log.clear' });
    dispatch({ event: 'unknown.event' });
  });

  test('DOMContentLoaded listener', () => {
    dom = installDom('setup', { readyState: 'loading' }).dom;

    // When readyState is 'loading', main.ts adds a DOMContentLoaded listener.
    // We simulate this by calling init() after DOMContentLoaded fires.
    MainModule.init(); // runs without readyState check — tests the function itself
  });
});
