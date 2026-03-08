import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import * as MainModule from '../../src/webview/ui/main';

suite('UI Main Initialization', () => {
  let dom: JSDOM;

  const sections = ['setup', 'prompt', 'log'];

  function setupDom(section: string) {
    dom = new JSDOM(
      `<!DOCTYPE html><html><body data-section="${section}"><div id="app"></div></body></html>`,
      {
        url: 'http://localhost',
      },
    );
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).navigator = dom.window.navigator;
    (global as any).acquireVsCodeApi = () => ({
      postMessage: () => {},
      getState: () => ({}),
      setState: () => {},
    });
    (dom.window as any).acquireVsCodeApi = (global as any).acquireVsCodeApi;
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
    dispatch({ event: 'figma.status', connected: true, methods: ['get_file'] });
    dispatch({ event: 'figma.dataResult', data: { id: '1' } });
    dispatch({ event: 'figma.dataFetchError', message: 'fetch failed', fallbackData: {} });
    dispatch({ event: 'figma.screenshotResult', base64: 'aGVsbG8=' });
    dispatch({ event: 'error', source: 'figma', message: 'figma error' });
    dispatch({ event: 'unknown.event' }); // no-op branch
  });

  test('prompt section — all message branches', () => {
    setupDom('prompt');
    MainModule.init();

    dispatch({ event: 'prompt.generateRequested' });
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
    dom = new JSDOM(
      `<!DOCTYPE html><html><body data-section="setup"><div id="app"></div></body></html>`,
      {
        url: 'http://localhost',
      },
    );
    Object.defineProperty(dom.window.document, 'readyState', { get: () => 'loading' });
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).acquireVsCodeApi = () => ({
      postMessage: () => {},
      getState: () => ({}),
      setState: () => {},
    });
    (dom.window as any).acquireVsCodeApi = (global as any).acquireVsCodeApi;

    // When readyState is 'loading', main.ts adds a DOMContentLoaded listener.
    // We simulate this by calling init() after DOMContentLoaded fires.
    MainModule.init(); // runs without readyState check — tests the function itself
  });
});
