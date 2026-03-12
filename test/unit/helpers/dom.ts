import * as sinon from 'sinon';
import { JSDOM } from 'jsdom';

export interface VsCodeApiStub {
  postMessage: sinon.SinonStub;
  getState: sinon.SinonStub;
  setState: sinon.SinonStub;
}

interface InstallDomOptions {
  readyState?: DocumentReadyState;
}

interface GlobalDomScope {
  window: Window & typeof globalThis;
  document: Document;
  navigator: Navigator;
  acquireVsCodeApi: () => VsCodeApiStub;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
}

export function createVsCodeApiStub(sandbox?: sinon.SinonSandbox): VsCodeApiStub {
  return {
    postMessage: (sandbox ?? sinon).stub(),
    getState: (sandbox ?? sinon).stub().returns({}),
    setState: (sandbox ?? sinon).stub(),
  };
}

export function installDom(
  section: string,
  options: InstallDomOptions = {},
): { dom: JSDOM; vscodeApi: VsCodeApiStub } {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body data-section="${section}"><div id="app"></div></body></html>`,
    { url: 'http://localhost' },
  );
  if (options.readyState) {
    Object.defineProperty(dom.window.document, 'readyState', {
      configurable: true,
      get: () => options.readyState,
    });
  }

  const vscodeApi = createVsCodeApiStub();
  const globals = globalThis as typeof globalThis & Partial<GlobalDomScope>;
  const raf = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };

  globals.window = dom.window as unknown as Window & typeof globalThis;
  globals.document = dom.window.document;
  globals.navigator = dom.window.navigator;
  globals.acquireVsCodeApi = () => vscodeApi;
  globals.requestAnimationFrame = raf;

  (dom.window as Window & typeof globalThis & Partial<GlobalDomScope>).acquireVsCodeApi =
    globals.acquireVsCodeApi;
  dom.window.requestAnimationFrame = raf;

  return { dom, vscodeApi };
}
