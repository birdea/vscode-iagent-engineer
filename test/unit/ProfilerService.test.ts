import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ProfilerService } from '../../src/profiler/ProfilerService';
import { CONFIG_KEYS } from '../../src/constants';

suite('ProfilerService', () => {
  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;

  setup(async () => {
    sandbox = sinon.createSandbox();
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'profiler-service-'));
    (vscode.workspace.getConfiguration as sinon.SinonStub).callsFake(() => ({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
    }));
  });

  teardown(async () => {
    (vscode.workspace.getConfiguration as sinon.SinonStub).resetBehavior();
    (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
      get: sinon.stub(),
    } as any);
    sandbox.restore();
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  test('aggregates codex turns into timeline points', async () => {
    const filePath = path.join(tempRoot, 'codex.jsonl');
    await fs.promises.writeFile(
      filePath,
      [
        '{"timestamp":"2026-03-11T12:00:00.000Z","type":"session_meta","payload":{"id":"sess-1","timestamp":"2026-03-11T12:00:00.000Z","cwd":"/tmp/project","model_provider":"openai"}}',
        '{"timestamp":"2026-03-11T12:00:01.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}}',
        '{"timestamp":"2026-03-11T12:00:02.000Z","type":"event_msg","payload":{"type":"user_message","message":"First prompt"}}',
        '{"timestamp":"2026-03-11T12:00:05.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":40,"total_tokens":160},"last_token_usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":40,"total_tokens":160},"model_context_window":200000}}}',
        '{"timestamp":"2026-03-11T12:00:08.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Reply one"}}',
        '{"timestamp":"2026-03-11T12:00:09.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1","last_agent_message":"Reply one"}}',
        '{"timestamp":"2026-03-11T12:01:00.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-2"}}',
        '{"timestamp":"2026-03-11T12:01:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"Second prompt"}}',
        '{"timestamp":"2026-03-11T12:01:04.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":220,"cached_input_tokens":40,"output_tokens":110,"total_tokens":330},"last_token_usage":{"input_tokens":120,"cached_input_tokens":20,"output_tokens":30,"total_tokens":150},"model_context_window":200000}}}',
        '{"timestamp":"2026-03-11T12:01:06.000Z","type":"event_msg","payload":{"type":"custom_tool_call","name":"read_file"}}',
        '{"timestamp":"2026-03-11T12:01:10.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-2","last_agent_message":"Reply two"}}',
      ].join('\n'),
      'utf8',
    );

    const stat = await fs.promises.stat(filePath);
    const service = new ProfilerService() as any;
    sandbox.stub(service, 'loadCodexThreadTitles').resolves(new Map([['sess-1', 'Thread title']]));
    const summary = await service.summarizeCodexFile({ agent: 'codex', filePath, stat });
    const detail = await service.analyzeCodexSession({ agent: 'codex', filePath, stat }, summary);

    assert.strictEqual(summary.title, 'First prompt');
    assert.strictEqual(summary.totalTokens, 330);
    assert.strictEqual(summary.requestCount, 2);
    assert.strictEqual(detail.timeline.length, 2);
    assert.strictEqual(detail.timeline[0].label, 'T01');
    assert.strictEqual(detail.timeline[0].totalTokens, 160);
    assert.strictEqual(detail.timeline[0].chartInputTokens, 100);
    assert.strictEqual(detail.timeline[0].chartOutputTokens, 40);
    assert.strictEqual(detail.timeline[0].chartCachedTokens, 20);
    assert.strictEqual(detail.timeline[0].chartTotalTokens, 160);
    assert.strictEqual(detail.timeline[1].totalTokens, 150);
    assert.strictEqual(detail.timeline[1].chartInputTokens, 120);
    assert.strictEqual(detail.timeline[1].chartOutputTokens, 30);
    assert.strictEqual(detail.timeline[1].chartCachedTokens, 20);
    assert.strictEqual(detail.timeline[1].chartTotalTokens, 150);
    assert.strictEqual(detail.timeline[1].chartTimestamp, '2026-03-11T12:01:04.000Z');
    assert.strictEqual(detail.timeline[1].sourceEventId, `${summary.id}:9`);
    assert.strictEqual(detail.timeline[1].detail, 'Second prompt');
    const tokenSnapshots = detail.rawEvents.filter((event) => event.eventType === 'token_count');
    assert.strictEqual(tokenSnapshots.length, 2);
    assert.strictEqual(tokenSnapshots[1].inputTokens, 120);
    assert.strictEqual(tokenSnapshots[1].outputTokens, 30);
    assert.strictEqual(tokenSnapshots[1].cachedTokens, 20);
    assert.strictEqual(tokenSnapshots[1].totalTokens, 150);
  });

  test('keeps codex event-log user preview focused on the prompt instead of attachment paths or tool output', async () => {
    const filePath = path.join(tempRoot, 'codex-user-preview.jsonl');
    await fs.promises.writeFile(
      filePath,
      [
        '{"timestamp":"2026-03-11T12:00:00.000Z","type":"session_meta","payload":{"id":"sess-preview","timestamp":"2026-03-11T12:00:00.000Z","cwd":"/tmp/project","model_provider":"openai"}}',
        '{"timestamp":"2026-03-11T12:00:01.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}}',
        '{"timestamp":"2026-03-11T12:00:02.000Z","type":"event_msg","payload":{"type":"user_message","message":"/Users/birdea/Desktop/screen-1.png /Users/birdea/Desktop/screen-2.png 첨부 이미지를 참고해서 profiler UI를 정리해줘"}}',
        '{"timestamp":"2026-03-11T12:00:03.000Z","type":"event_msg","payload":{"type":"user_message","message":"total 880\\ndrwxr-xr-x  29 birdea  staff  928 Mar 14 21:13 ."}}',
      ].join('\n'),
      'utf8',
    );

    const stat = await fs.promises.stat(filePath);
    const service = new ProfilerService() as any;
    sandbox.stub(service, 'loadCodexThreadTitles').resolves(new Map());
    const summary = await service.summarizeCodexFile({ agent: 'codex', filePath, stat });
    const detail = await service.analyzeCodexSession({ agent: 'codex', filePath, stat }, summary);

    assert.strictEqual(summary.title, '첨부 이미지를 참고해서 profiler UI를 정리해줘');
    assert.strictEqual(
      detail.rawEvents[2].messagePreview,
      '첨부 이미지를 참고해서 profiler UI를 정리해줘',
    );
    assert.strictEqual(detail.rawEvents[3].category, 'tool');
    assert.strictEqual(
      detail.rawEvents[3].messagePreview,
      '첨부 이미지를 참고해서 profiler UI를 정리해줘',
    );
  });

  test('groups claude requests by request id with usage totals', async () => {
    const filePath = path.join(tempRoot, 'claude.jsonl');
    await fs.promises.writeFile(
      filePath,
      [
        '{"parentUuid":null,"cwd":"/tmp/project","sessionId":"claude-1","type":"user","message":{"role":"user","content":"Review profiler"},"uuid":"u1","timestamp":"2026-03-11T10:00:00.000Z"}',
        '{"parentUuid":"u1","cwd":"/tmp/project","sessionId":"claude-1","type":"assistant","requestId":"req1","uuid":"a1","timestamp":"2026-03-11T10:00:02.000Z","message":{"model":"claude-sonnet-4-6","id":"msg1","role":"assistant","content":[{"type":"tool_use","name":"Read","id":"tool1","input":{"file_path":"a.ts"}}],"usage":{"input_tokens":300,"cache_creation_input_tokens":120,"cache_read_input_tokens":30,"output_tokens":60}}}',
        '{"parentUuid":"a1","cwd":"/tmp/project","sessionId":"claude-1","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool1","content":"file contents"}]},"uuid":"u2","timestamp":"2026-03-11T10:00:03.000Z"}',
        '{"parentUuid":"u2","cwd":"/tmp/project","sessionId":"claude-1","type":"assistant","requestId":"req2","uuid":"a2","timestamp":"2026-03-11T10:00:08.000Z","message":{"model":"claude-sonnet-4-6","id":"msg2","role":"assistant","content":[{"type":"text","text":"Profiler looks better."}],"usage":{"input_tokens":420,"cache_creation_input_tokens":0,"cache_read_input_tokens":200,"output_tokens":180}}}',
      ].join('\n'),
      'utf8',
    );

    const stat = await fs.promises.stat(filePath);
    const service = new ProfilerService() as any;
    const summary = await service.summarizeClaudeFile({ agent: 'claude', filePath, stat });
    const detail = await service.analyzeClaudeSession({ agent: 'claude', filePath, stat }, summary);

    assert.strictEqual(summary.title, 'Review profiler');
    assert.strictEqual(summary.requestCount, 2);
    assert.strictEqual(summary.totalInputTokens, 1070);
    assert.strictEqual(summary.totalOutputTokens, 240);
    assert.strictEqual(summary.totalCachedTokens, 230);
    assert.strictEqual(summary.totalTokens, 1310);
    assert.strictEqual(detail.timeline.length, 2);
    assert.strictEqual(detail.timeline[0].label, 'R01');
    assert.strictEqual(detail.timeline[0].detail, 'Read');
    assert.strictEqual(detail.timeline[1].detail, 'Profiler looks better.');
    assert.strictEqual(detail.timeline[1].latencyMs, 5000);
    assert.strictEqual(detail.rawEvents[0].messagePreview, 'Review profiler');
    assert.strictEqual(detail.rawEvents[2].category, 'tool');
    assert.strictEqual(detail.rawEvents[2].messagePreview, 'file contents');
  });

  test('selects the most recently modified live session across agents', async () => {
    const codexRoot = path.join(tempRoot, '.codex', 'sessions');
    const claudeRoot = path.join(tempRoot, '.claude', 'projects');
    await fs.promises.mkdir(codexRoot, { recursive: true });
    await fs.promises.mkdir(claudeRoot, { recursive: true });

    const codexFile = path.join(codexRoot, 'older-session.jsonl');
    await fs.promises.writeFile(
      codexFile,
      '{"timestamp":"2026-03-11T12:00:00.000Z","type":"session_meta","payload":{"id":"codex-1"}}\n',
      'utf8',
    );
    const older = new Date('2026-03-11T12:00:00.000Z');
    await fs.promises.utimes(codexFile, older, older);

    const claudeFile = path.join(claudeRoot, 'latest-session.jsonl');
    await fs.promises.writeFile(
      claudeFile,
      '{"parentUuid":null,"cwd":"/tmp/project","sessionId":"claude-live","type":"user","message":{"role":"user","content":"watch live"},"uuid":"u1","timestamp":"2026-03-11T12:01:00.000Z"}\n{"parentUuid":"u1","cwd":"/tmp/project","sessionId":"claude-live","type":"assistant","requestId":"req1","uuid":"a1","timestamp":"2026-03-11T12:01:03.000Z","message":{"model":"claude-sonnet-4-6","id":"msg1","role":"assistant","content":[{"type":"text","text":"live now"}],"usage":{"input_tokens":120,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":30}}}\n',
      'utf8',
    );
    const newer = new Date('2026-03-11T12:01:03.000Z');
    await fs.promises.utimes(claudeFile, newer, newer);

    (vscode.workspace.getConfiguration as sinon.SinonStub).callsFake(() => ({
      get: (key: string, defaultValue?: unknown) => {
        if (key === CONFIG_KEYS.PROFILER_CODEX_SEARCH_ROOTS) {
          return [codexRoot];
        }
        if (key === CONFIG_KEYS.PROFILER_CLAUDE_SEARCH_ROOTS) {
          return [claudeRoot];
        }
        if (key === CONFIG_KEYS.PROFILER_GEMINI_SEARCH_ROOTS) {
          return [];
        }
        return defaultValue;
      },
    }));

    const service = new ProfilerService() as any;
    sandbox.stub(service, 'loadCodexThreadTitles').resolves(new Map());
    sandbox.stub(service, 'getDefaultRoots').returns([]);

    const summary = await service.getLatestSessionSummary();

    assert.ok(summary);
    assert.strictEqual(summary?.agent, 'claude');
    assert.strictEqual(summary?.fileName, 'latest-session.jsonl');
  });

  test('refreshSessionDetail re-analyzes a growing live session file', async () => {
    const sessionDir = path.join(tempRoot, 'sessions');
    await fs.promises.mkdir(sessionDir, { recursive: true });
    const filePath = path.join(sessionDir, 'live-codex.jsonl');

    await fs.promises.writeFile(
      filePath,
      [
        '{"timestamp":"2026-03-11T12:00:00.000Z","type":"session_meta","payload":{"id":"sess-live","timestamp":"2026-03-11T12:00:00.000Z","cwd":"/tmp/project","model_provider":"openai"}}',
        '{"timestamp":"2026-03-11T12:00:01.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}}',
        '{"timestamp":"2026-03-11T12:00:02.000Z","type":"event_msg","payload":{"type":"user_message","message":"First prompt"}}',
        '{"timestamp":"2026-03-11T12:00:04.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":40,"total_tokens":160},"model_context_window":200000}}}',
        '{"timestamp":"2026-03-11T12:00:05.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1","last_agent_message":"Reply one"}}',
      ].join('\n'),
      'utf8',
    );

    const service = new ProfilerService() as any;
    sandbox.stub(service, 'loadCodexThreadTitles').resolves(new Map());

    const first = await service.refreshSessionDetail('codex', filePath);
    assert.strictEqual(first.detail.timeline.length, 1);
    assert.strictEqual(first.summary.totalTokens, 160);

    await fs.promises.appendFile(
      filePath,
      '\n' +
        [
          '{"timestamp":"2026-03-11T12:01:00.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-2"}}',
          '{"timestamp":"2026-03-11T12:01:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"Second prompt"}}',
          '{"timestamp":"2026-03-11T12:01:04.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":180,"cached_input_tokens":40,"output_tokens":100,"total_tokens":320},"model_context_window":200000}}}',
          '{"timestamp":"2026-03-11T12:01:07.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-2","last_agent_message":"Reply two"}}',
        ].join('\n'),
      'utf8',
    );

    const second = await service.refreshSessionDetail('codex', filePath);
    assert.strictEqual(second.detail.timeline.length, 2);
    assert.strictEqual(second.summary.totalTokens, 320);
    assert.strictEqual(second.detail.timeline[1].detail, 'Second prompt');
  });

  test('summarizes and analyzes gemini conversation files', async () => {
    const filePath = path.join(tempRoot, 'gemini-conversation.json');
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(
        {
          sessionId: 'gemini-session-1',
          projectHash: 'project-abc',
          startTime: '2026-03-11T09:00:00.000Z',
          lastUpdated: '2026-03-11T09:00:03.000Z',
          summary: 'Gemini generated summary',
          directories: ['/tmp/project'],
          kind: 'main',
          messages: [
            {
              id: 'u1',
              timestamp: '2026-03-11T09:00:00.000Z',
              type: 'user',
              content: 'Build a login form',
              tokens: {
                input: 120,
                output: 0,
                cached: 0,
                total: 120,
              },
            },
            {
              id: 'g1',
              timestamp: '2026-03-11T09:00:03.000Z',
              type: 'gemini',
              model: 'gemini-2.5-pro',
              displayContent: 'Here is a responsive login form.',
              tokens: {
                input: 0,
                output: 80,
                cached: 10,
                total: 90,
              },
              toolCalls: [{ name: 'Read workspace' }],
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const stat = await fs.promises.stat(filePath);
    const service = new ProfilerService() as any;
    const summary = await service.summarizeGeminiFile({ agent: 'gemini', filePath, stat });
    const detail = await service.analyzeGeminiSession({ agent: 'gemini', filePath, stat }, summary);

    assert.match(summary.id, /^gemini:[0-9a-f]{12}$/);
    assert.strictEqual(summary.title, 'Build a login form');
    assert.strictEqual(summary.model, 'gemini-2.5-pro');
    assert.strictEqual(summary.requestCount, 1);
    assert.strictEqual(summary.totalInputTokens, 120);
    assert.strictEqual(summary.totalOutputTokens, 80);
    assert.strictEqual(summary.totalCachedTokens, 10);
    assert.strictEqual(summary.totalTokens, 210);
    assert.strictEqual(detail.metadata.sessionId, 'gemini-session-1');
    assert.strictEqual(detail.timeline.length, 2);
    assert.strictEqual(detail.timeline[0].label, 'M01');
    assert.strictEqual(detail.timeline[1].label, 'M02');
    assert.strictEqual(detail.timeline[1].latencyMs, 3000);
    assert.strictEqual(detail.timeline[1].detail, 'Here is a responsive login form.');
    assert.ok(detail.eventBubbles.some((event) => event.title === 'Tool call'));
  });

  test('summarizes and analyzes gemini checkpoint files', async () => {
    const filePath = path.join(tempRoot, 'gemini-checkpoint.json');
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(
        {
          messageId: 'checkpoint-1',
          toolCall: {
            name: 'WriteFile',
          },
          history: [{ id: 1 }, { id: 2 }],
          clientHistory: [{ id: 'client-1' }],
          commitHash: 'abc123',
        },
        null,
        2,
      ),
      'utf8',
    );

    const stat = await fs.promises.stat(filePath);
    const service = new ProfilerService() as any;
    const summary = await service.summarizeGeminiFile({ agent: 'gemini', filePath, stat });
    const detail = await service.analyzeGeminiSession({ agent: 'gemini', filePath, stat }, summary);

    assert.match(summary.id, /^gemini:[0-9a-f]{12}$/);
    assert.strictEqual(summary.title, 'WriteFile');
    assert.strictEqual(summary.requestCount, 1);
    assert.strictEqual(summary.parseStatus, 'partial');
    assert.strictEqual(detail.metadata.sessionId, 'checkpoint-1');
    assert.strictEqual(detail.timeline.length, 1);
    assert.strictEqual(detail.timeline[0].label, 'C01');
    assert.strictEqual(detail.timeline[0].detail, 'WriteFile');
    assert.match(detail.rawEvents[0].messagePreview ?? '', /history 2 · client 1/);
  });

  test('scan limits concurrent session summarization per agent', async () => {
    const service = new ProfilerService() as any;
    const files = Array.from({ length: 12 }, (_, index) => ({
      agent: 'codex',
      filePath: `/tmp/session-${index}.jsonl`,
      stat: { mtimeMs: 12 - index },
    }));

    sandbox.stub(service, 'getDefaultRoots').returns([]);
    sandbox.stub(service, 'discoverFiles').callsFake(async (agent: string) => {
      return agent === 'codex' ? files : [];
    });

    let active = 0;
    let maxActive = 0;
    sandbox.stub(service, 'summarizeFile').callsFake(async (file: any) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        id: file.filePath,
        agent: file.agent,
        filePath: file.filePath,
        fileName: path.basename(file.filePath),
        modifiedAt: new Date().toISOString(),
        fileSizeBytes: 128,
        parseStatus: 'ok',
        warnings: [],
      };
    });

    const overview = await service.scan();

    assert.strictEqual(overview.sessionsByAgent.codex.length, 12);
    assert.ok(maxActive <= 8, `expected max concurrency <= 8, received ${maxActive}`);
  });

  test('createSessionId hashes sensitive seeds without exposing raw values', () => {
    const service = new ProfilerService() as any;
    const sessionId = service.createSessionId(
      'claude',
      'session-secret-123',
      '/tmp/private/chat.jsonl',
    );

    assert.match(sessionId, /^claude:[0-9a-f]{12}$/);
    assert.ok(!sessionId.includes('session-secret-123'));
    assert.ok(!sessionId.includes('/tmp/private/chat.jsonl'));
    assert.strictEqual(
      sessionId,
      service.createSessionId('claude', 'session-secret-123', '/tmp/private/chat.jsonl'),
    );
  });
});
