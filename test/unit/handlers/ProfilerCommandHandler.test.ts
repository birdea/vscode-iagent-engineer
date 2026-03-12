import * as assert from 'assert';
import * as fs from 'fs';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ProfilerStateManager } from '../../../src/profiler/ProfilerStateManager';
import { ProfilerCommandHandler } from '../../../src/webview/handlers/ProfilerCommandHandler';

suite('ProfilerCommandHandler', () => {
  let sandbox: sinon.SinonSandbox;
  let webview: { postMessage: sinon.SinonSpy };
  let profilerStateManager: ProfilerStateManager;
  let profilerService: any;
  let editorIntegration: any;
  let handler: ProfilerCommandHandler;

  const summary = {
    id: 'codex:live',
    agent: 'codex' as const,
    filePath: '/tmp/live-session.jsonl',
    fileName: 'live-session.jsonl',
    modifiedAt: '2026-03-11T10:01:05.000Z',
    startedAt: '2026-03-11T10:00:00.000Z',
    fileSizeBytes: 1024,
    totalTokens: 160,
    requestCount: 1,
    parseStatus: 'ok' as const,
    warnings: [],
  };

  const detail = {
    summary,
    metadata: {
      sourceFormat: 'jsonl',
      provider: 'openai',
      cwd: '/tmp/project',
    },
    timeline: [
      {
        id: 'turn-1',
        timestamp: '2026-03-11T10:00:00.000Z',
        endTimestamp: '2026-03-11T10:01:05.000Z',
        totalTokens: 160,
        eventType: 'turn',
        label: 'T01',
        detail: 'Watch live data',
      },
    ],
    eventBubbles: [],
    rawEvents: [],
  };

  setup(() => {
    sandbox = sinon.createSandbox();
    webview = { postMessage: sandbox.spy() };
    profilerStateManager = new ProfilerStateManager();
    profilerService = {
      getLatestSessionSummary: sandbox.stub().resolves(summary),
      refreshSessionDetail: sandbox.stub().resolves({
        summary,
        detail,
        stat: { size: 1024, mtimeMs: 10 },
      }),
      getDetail: sandbox.stub().resolves(detail),
      scan: sandbox.stub(),
      archiveAll: sandbox.stub(),
    };
    editorIntegration = {
      openFileAtLine: sandbox.stub().resolves(),
    };
    handler = new ProfilerCommandHandler(
      webview as any,
      profilerStateManager,
      profilerService,
      editorIntegration,
    );
    sandbox.stub(fs.promises, 'stat').resolves({ size: 1024, mtimeMs: 10 } as fs.Stats);
    (vscode.commands.executeCommand as sinon.SinonStub).resetHistory();
  });

  teardown(() => {
    handler.dispose();
    sandbox.restore();
  });

  test('startLiveData attaches the latest session and updates detail state', async () => {
    await handler.startLiveData();

    const state = profilerStateManager.getDetailState();
    assert.strictEqual(state.status, 'ready');
    assert.strictEqual(state.detail?.summary.fileName, 'live-session.jsonl');
    assert.strictEqual(state.live?.active, true);
    assert.strictEqual(state.live?.status, 'streaming');
    assert.ok(state.live?.messages.some((entry) => entry.message === 'Live chart initialized'));
    assert.ok(
      (vscode.commands.executeCommand as sinon.SinonStub).calledWith(
        'workbench.view.extension.iagent-engineer-profiler-panel',
      ),
    );
  });

  test('live polling refreshes the chart when the session file changes', async () => {
    const clock = sandbox.useFakeTimers();
    (fs.promises.stat as sinon.SinonStub)
      .onFirstCall()
      .resolves({ size: 1024, mtimeMs: 10 } as fs.Stats)
      .onSecondCall()
      .resolves({ size: 2048, mtimeMs: 20 } as fs.Stats);

    await handler.startLiveData();
    await clock.tickAsync(1500);

    assert.strictEqual(profilerService.refreshSessionDetail.callCount, 2);
    assert.ok(
      profilerStateManager
        .getDetailState()
        .live?.messages.some((entry) => entry.message === 'Live session updated'),
    );
  });

  test('stopLiveData clears active live state and keeps the current detail visible', async () => {
    await handler.startLiveData();

    handler.stopLiveData();

    const state = profilerStateManager.getDetailState();
    assert.strictEqual(state.detail?.summary.id, 'codex:live');
    assert.strictEqual(state.live?.active, false);
    assert.strictEqual(state.live?.status, 'stopped');
  });
});
