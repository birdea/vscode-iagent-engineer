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
    (Logger as unknown as { subscribers: Set<(entry: unknown) => void> }).subscribers = new Set();
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

  test('onLog callback', () => {
    const callback = sinon.spy();
    const disposable = Logger.onLog(callback);
    Logger.info('system', 'test');
    assert.ok(callback.calledOnce);
    assert.strictEqual(callback.firstCall.args[0].message, 'test');
    disposable.dispose();
  });

  test('supports multiple log subscribers', () => {
    const cb1 = sinon.spy();
    const cb2 = sinon.spy();
    const d1 = Logger.onLog(cb1);
    Logger.onLog(cb2);

    Logger.info('system', 'fanout');
    assert.ok(cb1.calledOnce);
    assert.ok(cb2.calledOnce);

    d1.dispose();
    Logger.info('system', 'after-dispose');
    assert.ok(cb1.calledOnce);
    assert.strictEqual(cb2.callCount, 2);
  });

  test('max entries limit', () => {
    // Fill up enough to trigger shift
    for (let i = 0; i < 1100; i++) {
      Logger.info('system', `msg ${i}`);
    }
    const entries = Logger.getEntries();
    assert.ok(entries.length <= 1000);
  });

  test('clear', () => {
    Logger.info('system', 'msg');
    Logger.clear();
    assert.strictEqual(Logger.getEntries().length, 0);
    assert.ok(mockOutputChannel.clear.calledOnce);
  });
});
