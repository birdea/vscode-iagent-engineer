import * as sinon from 'sinon';
import { JSDOM } from 'jsdom';

// Setup Mock Environment for Browser
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost',
});
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).navigator = dom.window.navigator;
(global as any).Node = dom.window.Node;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).HTMLSelectElement = dom.window.HTMLSelectElement;
(global as any).HTMLInputElement = dom.window.HTMLInputElement;
(global as any).HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
(global as any).acquireVsCodeApi = () => ({
  postMessage: () => {},
  getState: () => ({}),
  setState: () => {},
});
(dom.window as any).acquireVsCodeApi = (global as any).acquireVsCodeApi;

// Mock vscode module for Node
const mockVscode = {
  window: {
    showInformationMessage: sinon.stub(),
    showErrorMessage: sinon.stub(),
    showTextDocument: sinon.stub(),
    createWebviewPanel: sinon.stub(),
  },
  workspace: {
    getConfiguration: sinon.stub().returns({
      get: sinon.stub(),
    }),
    openTextDocument: sinon.stub(),
  },
  Uri: {
    parse: sinon.stub().returns({}),
    file: sinon.stub().returns({}),
  },
  env: {
    openExternal: sinon.stub(),
  },
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  EventEmitter: class {
    event = sinon.stub();
    fire = sinon.stub();
  }
};

// This is a trick to mock 'vscode' which is usually provided by the host
// Since we are in a unit test environment, we can use a custom loader or just ensure it's in require.cache
// But with 'tsx', we might need to use 'mock-require' or similar if it's imported as ESM.
// For now, I'll rely on the fact that I'm mocking the globals that the extension uses.
