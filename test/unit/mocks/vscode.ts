import * as sinon from 'sinon';

export const window = {
  showInformationMessage: sinon.stub(),
  showWarningMessage: sinon.stub(),
  showErrorMessage: sinon.stub(),
  showTextDocument: sinon.stub(),
  createWebviewPanel: sinon.stub(),
  showSaveDialog: sinon.stub(),
  activeTextEditor: undefined,
  createOutputChannel: sinon.stub().returns({
    appendLine: sinon.stub(),
    clear: sinon.stub(),
  }),
  registerWebviewViewProvider: sinon.stub(),
  clipboard: {
    writeText: sinon.stub().resolves(),
  }
};

export const workspace = {
  getConfiguration: sinon.stub().returns({
    get: sinon.stub(),
    update: sinon.stub(),
  }),
  openTextDocument: sinon.stub(),
  fs: {
    writeFile: sinon.stub().resolves(),
  },
};

export const commands = {
  executeCommand: sinon.stub().resolves(),
  registerCommand: sinon.stub(),
};

export const Uri = {
  parse: (val: string) => ({ path: val }),
  file: (val: string) => ({ fsPath: val, path: val }),
  joinPath: (uri: any, ...paths: string[]) => ({ 
    path: (uri.path || '') + '/' + paths.join('/'),
    fsPath: (uri.fsPath || '') + '/' + paths.join('/')
  }),
};

export const env = {
  openExternal: sinon.stub(),
  clipboard: {
    writeText: sinon.stub().resolves(),
  }
};

export const ViewColumn = {
  One: 1,
  Two: 2,
};

export class EventEmitter {
  event = sinon.stub();
  fire = sinon.stub();
}

export enum WebviewPanelSerializer {}

export const WebviewViewProvider = {};
