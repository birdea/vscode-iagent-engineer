import * as assert from 'assert';
import * as fs from 'fs';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ProfilerLiveMonitor } from '../../../src/profiler/ProfilerLiveMonitor';
import { ProfilerStateManager } from '../../../src/profiler/ProfilerStateManager';
import { ProfilerCommandHandler } from '../../../src/webview/handlers/ProfilerCommandHandler';

suite('ProfilerCommandHandler', () => {
  let sandbox: sinon.SinonSandbox;
  let profilerStateManager: ProfilerStateManager;
  let profilerService: any;
  let editorIntegration: any;
  let liveMonitor: ProfilerLiveMonitor;
  let overviewHandler: ProfilerCommandHandler;
  let detailHandler: ProfilerCommandHandler;

  const liveSummary = {
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

  const liveDetail = {
    summary: liveSummary,
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

  const manualDetail = {
    summary: {
      id: 'claude:manual',
      agent: 'claude' as const,
      filePath: '/tmp/manual-session.jsonl',
      fileName: 'manual-session.jsonl',
      modifiedAt: '2026-03-11T10:03:05.000Z',
      startedAt: '2026-03-11T10:02:00.000Z',
      fileSizeBytes: 2048,
      totalTokens: 220,
      requestCount: 1,
      parseStatus: 'ok' as const,
      warnings: [],
    },
    metadata: {
      sourceFormat: 'jsonl',
      provider: 'anthropic',
      cwd: '/tmp/manual-project',
    },
    timeline: [
      {
        id: 'request-1',
        timestamp: '2026-03-11T10:02:00.000Z',
        endTimestamp: '2026-03-11T10:03:05.000Z',
        totalTokens: 220,
        eventType: 'turn',
        label: 'R01',
        detail: 'Manual selection',
      },
    ],
    eventBubbles: [],
    rawEvents: [],
  };

  setup(() => {
    sandbox = sinon.createSandbox();
    profilerStateManager = new ProfilerStateManager();
    profilerService = {
      getLatestSessionSummary: sandbox.stub().resolves(liveSummary),
      refreshSessionDetail: sandbox.stub().resolves({
        summary: liveSummary,
        detail: liveDetail,
        stat: { size: 1024, mtimeMs: 10 },
      }),
      getDetail: sandbox.stub().resolves(manualDetail),
      scan: sandbox.stub(),
      archiveAll: sandbox.stub(),
    };
    editorIntegration = {
      openFileAtLine: sandbox.stub().resolves(),
    };
    liveMonitor = new ProfilerLiveMonitor(profilerStateManager, profilerService);
    overviewHandler = new ProfilerCommandHandler(
      { postMessage: sandbox.spy() } as any,
      profilerStateManager,
      profilerService,
      editorIntegration,
      liveMonitor,
    );
    detailHandler = new ProfilerCommandHandler(
      { postMessage: sandbox.spy() } as any,
      profilerStateManager,
      profilerService,
      editorIntegration,
      liveMonitor,
    );
    sandbox.stub(fs.promises, 'stat').resolves({ size: 1024, mtimeMs: 10 } as fs.Stats);
    (vscode.commands.executeCommand as sinon.SinonStub).resetHistory();
  });

  teardown(() => {
    liveMonitor.dispose();
    sandbox.restore();
  });

  test('stop from the detail pane stops live monitoring started in the overview pane', async () => {
    await overviewHandler.startLiveData();

    detailHandler.stopLiveData();

    const state = profilerStateManager.getDetailState();
    assert.strictEqual(state.detail?.summary.id, 'codex:live');
    assert.strictEqual(state.live?.active, false);
    assert.strictEqual(state.live?.status, 'stopped');
  });

  test('disposing the originating handler does not tear down shared live monitoring', async () => {
    await overviewHandler.startLiveData();

    overviewHandler.dispose();

    const state = profilerStateManager.getDetailState();
    assert.strictEqual(state.live?.active, true);
    assert.strictEqual(state.live?.status, 'streaming');
  });

  test('selecting a live-marked session keeps the detail pane in live polling mode', async () => {
    sandbox.useFakeTimers(new Date('2026-03-11T10:10:00.000Z').getTime());
    profilerStateManager.setOverviewState({
      status: 'ready',
      selectedAgent: 'codex',
      selectedSessionId: liveSummary.id,
      aggregate: {
        totalSessions: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCachedTokens: 0,
        totalTokens: 0,
        totalFileSizeBytes: liveSummary.fileSizeBytes,
      },
      sessionsByAgent: {
        claude: [],
        codex: [liveSummary],
        gemini: [],
      },
    });

    await detailHandler.selectSession(liveSummary.id, liveSummary.agent);

    const state = profilerStateManager.getDetailState();
    assert.strictEqual(state.sessionId, liveSummary.id);
    assert.strictEqual(state.detail?.summary.id, liveSummary.id);
    assert.strictEqual(state.live?.active, true);
    assert.strictEqual(state.live?.status, 'streaming');
    assert.strictEqual(profilerService.getDetail.called, false);
    assert.strictEqual(profilerService.refreshSessionDetail.called, true);
  });

  test('startLiveData reconnects the selected session when an id and agent are provided', async () => {
    profilerStateManager.setOverviewState({
      status: 'ready',
      selectedAgent: 'codex',
      selectedSessionId: liveSummary.id,
      aggregate: {
        totalSessions: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCachedTokens: 0,
        totalTokens: 0,
        totalFileSizeBytes: liveSummary.fileSizeBytes,
      },
      sessionsByAgent: {
        claude: [],
        codex: [liveSummary],
        gemini: [],
      },
    });

    await detailHandler.startLiveData(liveSummary.id, liveSummary.agent);

    const state = profilerStateManager.getDetailState();
    assert.strictEqual(state.sessionId, liveSummary.id);
    assert.strictEqual(state.live?.active, true);
    assert.strictEqual(state.live?.status, 'streaming');
    assert.strictEqual(profilerService.getLatestSessionSummary.called, false);
    assert.strictEqual(profilerService.refreshSessionDetail.called, true);
  });

  test('stale live refresh cannot overwrite a manually selected session', async () => {
    const clock = sandbox.useFakeTimers();
    let resolveRefresh: ((value: unknown) => void) | undefined;
    const pendingRefresh = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    (fs.promises.stat as sinon.SinonStub)
      .onFirstCall()
      .resolves({ size: 1024, mtimeMs: 10 } as fs.Stats)
      .onSecondCall()
      .resolves({ size: 2048, mtimeMs: 20 } as fs.Stats);
    profilerService.refreshSessionDetail = sandbox.stub();
    profilerService.refreshSessionDetail
      .onFirstCall()
      .resolves({ summary: liveSummary, detail: liveDetail, stat: { size: 1024, mtimeMs: 10 } })
      .onSecondCall()
      .returns(pendingRefresh);

    liveMonitor = new ProfilerLiveMonitor(profilerStateManager, profilerService);
    overviewHandler = new ProfilerCommandHandler(
      { postMessage: sandbox.spy() } as any,
      profilerStateManager,
      profilerService,
      editorIntegration,
      liveMonitor,
    );
    detailHandler = new ProfilerCommandHandler(
      { postMessage: sandbox.spy() } as any,
      profilerStateManager,
      profilerService,
      editorIntegration,
      liveMonitor,
    );

    await overviewHandler.startLiveData();
    await clock.tickAsync(1500);

    await detailHandler.selectSession('claude:manual', 'claude');
    resolveRefresh?.({
      summary: liveSummary,
      detail: liveDetail,
      stat: { size: 2048, mtimeMs: 20 },
    });
    await clock.tickAsync(0);

    const detailState = profilerStateManager.getDetailState();
    const overviewState = profilerStateManager.getOverviewState();
    assert.strictEqual(detailState.sessionId, 'claude:manual');
    assert.strictEqual(detailState.detail?.summary.id, 'claude:manual');
    assert.strictEqual(detailState.live?.active, false);
    assert.strictEqual(overviewState.selectedSessionId, 'claude:manual');
  });
});
