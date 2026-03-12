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
        '{"timestamp":"2026-03-11T12:00:05.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":40,"total_tokens":160},"model_context_window":200000}}}',
        '{"timestamp":"2026-03-11T12:00:08.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Reply one"}}',
        '{"timestamp":"2026-03-11T12:00:09.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1","last_agent_message":"Reply one"}}',
        '{"timestamp":"2026-03-11T12:01:00.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-2"}}',
        '{"timestamp":"2026-03-11T12:01:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"Second prompt"}}',
        '{"timestamp":"2026-03-11T12:01:04.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":180,"cached_input_tokens":40,"output_tokens":100,"total_tokens":320},"model_context_window":200000}}}',
        '{"timestamp":"2026-03-11T12:01:06.000Z","type":"event_msg","payload":{"type":"custom_tool_call","name":"read_file"}}',
        '{"timestamp":"2026-03-11T12:01:10.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-2","last_agent_message":"Reply two"}}',
      ].join('\n'),
      'utf8',
    );

    const stat = await fs.promises.stat(filePath);
    const service = new ProfilerService() as any;
    const summary = await service.summarizeCodexFile({ agent: 'codex', filePath, stat });
    const detail = await service.analyzeCodexSession({ agent: 'codex', filePath, stat }, summary);

    assert.strictEqual(summary.totalTokens, 320);
    assert.strictEqual(summary.requestCount, 2);
    assert.strictEqual(detail.timeline.length, 2);
    assert.strictEqual(detail.timeline[0].label, 'T01');
    assert.strictEqual(detail.timeline[0].totalTokens, 160);
    assert.strictEqual(detail.timeline[1].totalTokens, 160);
    assert.strictEqual(detail.timeline[1].detail, 'Second prompt');
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

    assert.strictEqual(summary.requestCount, 2);
    assert.strictEqual(summary.totalInputTokens, 720);
    assert.strictEqual(summary.totalOutputTokens, 240);
    assert.strictEqual(summary.totalCachedTokens, 350);
    assert.strictEqual(summary.totalTokens, 1310);
    assert.strictEqual(detail.timeline.length, 2);
    assert.strictEqual(detail.timeline[0].label, 'R01');
    assert.strictEqual(detail.timeline[0].detail, 'Read');
    assert.strictEqual(detail.timeline[1].detail, 'Profiler looks better.');
    assert.strictEqual(detail.timeline[1].latencyMs, 5000);
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
});
