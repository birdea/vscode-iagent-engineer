import * as assert from 'assert';
import * as sinon from 'sinon';
import { Logger } from '../../src/logger/Logger';
import { asOutputChannel, createOutputChannelStub, OutputChannelStub } from './helpers/vscode';

suite('Logger', () => {
  let sandbox: sinon.SinonSandbox;
  let mockOutputChannel: OutputChannelStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockOutputChannel = createOutputChannelStub(sandbox);
    Logger.initialize(asOutputChannel(mockOutputChannel));
    mockOutputChannel.appendLine.reset();
    mockOutputChannel.clear.reset();
    Logger.clear();
    mockOutputChannel.clear.reset(); // reset after the clear() call in setup
  });

  teardown(() => {
    sandbox.restore();
  });

  test('basic logging', () => {
    Logger.info('system', 'Hello World');
    const entries = Logger.getEntries();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].level, 'info');
    assert.strictEqual(entries[0].message, 'Hello World');
    assert.ok(mockOutputChannel.appendLine.calledOnce);
  });

  test('all log levels', () => {
    Logger.info('figma', 'info');
    Logger.warn('agent', 'warn');
    Logger.error('prompt', 'error');
    Logger.success('editor', 'success');
    assert.strictEqual(Logger.getEntries().length, 4);
    assert.strictEqual(mockOutputChannel.appendLine.callCount, 4);
  });

  test('logging with detail', () => {
    Logger.info('system', 'msg', 'detail');
    const entries = Logger.getEntries();
    assert.strictEqual(entries[0].detail, 'detail');
    assert.strictEqual(mockOutputChannel.appendLine.callCount, 2);
  });

  test('toText returns formatted string', () => {
    Logger.info('system', 'msg1');
    const text = Logger.toText();
    assert.ok(text.includes('[INFO] [system] msg1'));
  });

  test('toJson returns JSON string', () => {
    Logger.info('system', 'msg');
    const json = JSON.parse(Logger.toJson());
    assert.strictEqual(json[0].message, 'msg');
  });

  test('max entries limit', () => {
    for (let i = 0; i < 1100; i++) {
      Logger.info('system', `msg ${i}`);
    }
    const entries = Logger.getEntries();
    assert.ok(entries.length <= 500);
  });

  test('clear', () => {
    Logger.info('system', 'msg');
    Logger.clear();
    assert.strictEqual(Logger.getEntries().length, 0);
    assert.ok(mockOutputChannel.clear.calledOnce);
  });
});
