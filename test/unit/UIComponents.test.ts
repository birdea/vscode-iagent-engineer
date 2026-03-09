import * as assert from 'assert';
import * as sinon from 'sinon';
import { vscode } from '../../src/webview/ui/vscodeApi';

import { AgentLayer } from '../../src/webview/ui/components/AgentLayer';
import { FigmaLayer } from '../../src/webview/ui/components/FigmaLayer';
import { LogLayer } from '../../src/webview/ui/components/LogLayer';
import { PromptLayer } from '../../src/webview/ui/components/PromptLayer';

suite('UI Components Consolidated', () => {
  let sandbox: sinon.SinonSandbox;
  let postMessageStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    postMessageStub = sandbox.stub(vscode, 'postMessage');
    document.body.innerHTML = '<div id="app"></div>';
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('AgentLayer', () => {
    let layer: AgentLayer;
    setup(() => {
      layer = new AgentLayer();
      document.getElementById('app')!.innerHTML = layer.render();
      layer.mount();
    });

    test('mount sends agent.getState', () => {
      assert.ok(postMessageStub.calledWithMatch({ command: 'agent.getState' }));
    });

    test('onModelsResult and status updates', () => {
      layer.onModelsResult([{ id: 'm1', name: 'Model 1' }]);
      assert.strictEqual(
        (document.getElementById('model-select') as HTMLSelectElement).value,
        'm1',
      );
      assert.ok(document.getElementById('agent-status')?.textContent?.includes('m1'));
    });

    test('onState logic', () => {
      layer.onState('claude', 'opus', true);
      assert.strictEqual(
        (document.getElementById('agent-select') as HTMLSelectElement).value,
        'claude',
      );
      assert.ok(postMessageStub.calledWithMatch({ command: 'agent.listModels', agent: 'claude' }));
    });

    test('onSettingsCleared logic', () => {
      layer.onSettingsCleared('claude');
      assert.strictEqual(
        (document.getElementById('agent-select') as HTMLSelectElement).value,
        'gemini',
      );
    });

    test('click handlers and explicit model load', () => {
      document.getElementById('link-get-api-key')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'agent.getApiKeyHelp' }));

      const input = document.getElementById('api-key-input') as HTMLInputElement;
      input.value = '1234567890123456';
      document.getElementById('link-get-model-info')?.click();
      assert.ok(
        postMessageStub.calledWithMatch({ command: 'agent.listModels', key: '1234567890123456' }),
      );
    });

    test('onSaveRequested and onClearRequested', () => {
      layer.onSaveRequested(); // Should show notice if no model
      assert.ok(document.getElementById('agent-notice')?.textContent?.includes('선택'));

      layer.onClearRequested();
      assert.ok(postMessageStub.calledWithMatch({ command: 'agent.clearSettings' }));
    });

    test('internal save button triggers save flow', () => {
      layer.onModelsResult([{ id: 'm1', name: 'Model 1' }]);
      document.getElementById('btn-save-settings')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'agent.saveSettings', model: 'm1' }));
    });

    test('onState with hasApiKey=false shows prompt notice', () => {
      layer.onState('gemini', '', false);
      const notice = document.getElementById('agent-notice');
      assert.ok(notice?.textContent?.includes('API 키'));
    });

    test('agent-select change event fires state.setAgent', () => {
      const select = document.getElementById('agent-select') as HTMLSelectElement;
      select.value = 'claude';
      select.dispatchEvent(new (global as any).window.Event('change'));
      assert.ok(postMessageStub.calledWithMatch({ command: 'state.setAgent', agent: 'claude' }));
    });

    test('model-select change event fires state.setModel', () => {
      layer.onModelsResult([
        { id: 'm1', name: 'M1' },
        { id: 'm2', name: 'M2' },
      ]);
      const select = document.getElementById('model-select') as HTMLSelectElement;
      select.value = 'm2';
      select.dispatchEvent(new (global as any).window.Event('change'));
      assert.ok(postMessageStub.calledWithMatch({ command: 'state.setModel', model: 'm2' }));
    });

    test('btn-load-models click without model selected shows warn', () => {
      const button = document.getElementById('btn-load-models') as HTMLButtonElement;
      button.click();
      const notice = document.getElementById('agent-notice');
      assert.ok(notice?.textContent?.includes('선택'));
    });

    test('btn-load-models with empty key uses saved key path', () => {
      const input = document.getElementById('api-key-input') as HTMLInputElement;
      input.value = ''; // empty key
      document.getElementById('link-get-model-info')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'agent.listModels' }));
    });

    test('onModelsResult with empty models shows warn notice', () => {
      layer.onModelsResult([]);
      const notice = document.getElementById('agent-notice');
      assert.ok(notice?.textContent?.includes('없'));
    });

    test('updateModelList with preferred model that matches', () => {
      // Set preferred model via onState with model
      layer.onState('gemini', 'm2', true);
      // Now resolve models including m2
      layer.onModelsResult([
        { id: 'm1', name: 'M1' },
        { id: 'm2', name: 'M2' },
      ]);
      const select = document.getElementById('model-select') as HTMLSelectElement;
      assert.strictEqual(select.value, 'm2');
    });

    test('agent status dot reflects whether a model is selected', () => {
      layer.onState('gemini', '', false);
      const dot = document.getElementById('agent-status-dot');
      assert.ok(!dot?.classList.contains('connected'));

      layer.onModelsResult([{ id: 'm1', name: 'Model 1' }]);
      assert.ok(dot?.classList.contains('connected'));
    });

    test('onError with No API key uses friendly message', () => {
      layer.onError('No API key set');
      const notice = document.getElementById('agent-notice');
      assert.ok(notice?.textContent?.includes('API 키'));
    });

    test('onError with HTTP 401 uses friendly message', () => {
      layer.onError('HTTP 401 Unauthorized');
      const notice = document.getElementById('agent-notice');
      assert.ok(notice?.textContent?.includes('인증'));
    });
  });

  suite('FigmaLayer', () => {
    let layer: FigmaLayer;
    setup(() => {
      layer = new FigmaLayer();
      document.getElementById('app')!.innerHTML = layer.render();
      layer.mount();
    });

    test('connect button click', () => {
      const btn = document.getElementById('btn-connect');
      btn?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.connect' }));
    });

    test('remote mode changes primary action to auth login', () => {
      document.getElementById('btn-mode-remote')?.click();
      const connectBtn = document.getElementById('btn-connect');
      assert.ok(connectBtn?.textContent?.includes('Auth Login'));

      connectBtn?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.connect', mode: 'remote' }));
    });

    test('settings button click', () => {
      document.getElementById('btn-open-settings')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.openSettings' }));
    });

    test('get button click requests opening Figma Desktop', () => {
      document.getElementById('btn-open-figma-app')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.openDesktopApp' }));
    });

    test('remote mode forwards mode when opening settings', () => {
      document.getElementById('btn-mode-remote')?.click();
      document.getElementById('btn-open-settings')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.openSettings', mode: 'remote' }));
    });

    test('switching back to local clears remote notice', () => {
      document.getElementById('btn-mode-remote')?.click();
      layer.onStatus(false, [], 'Remote MCP support is planned for a future update.');

      document.getElementById('btn-mode-local')?.click();

      const notice = document.getElementById('figma-connection-notice');
      assert.strictEqual(notice?.textContent, '');
    });

    test('onStatus handles methods and error', () => {
      layer.onStatus(true, ['tool1', 'tool2'], undefined);
      const text = document.getElementById('figma-status-text');
      const guide = document.getElementById('figma-guide');
      assert.ok(text?.textContent?.includes('연결'));
      assert.ok(guide?.textContent?.includes('2개'));
      assert.ok(guide?.textContent?.includes('tool1'));
      assert.ok(guide?.textContent?.includes('tool2'));

      layer.onStatus(false, [], 'Connect error');
      const notice = document.getElementById('figma-connection-notice');
      assert.ok(notice?.textContent?.includes('Connect error'));
    });

    test('onStatus disconnected without error clears notice', () => {
      layer.onStatus(false, [], undefined);
      const notice = document.getElementById('figma-connection-notice');
      assert.strictEqual(notice?.textContent, '');
    });

    test('screenshot button click when not connected shows warn', () => {
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/abc/test?node-id=1:2';
      // Button is disabled when not connected — force-enable to exercise the handler branch
      const screenshotBtn = document.getElementById('btn-screenshot') as HTMLButtonElement;
      screenshotBtn.disabled = false;
      screenshotBtn.click();
      const notice = document.getElementById('figma-data-notice');
      assert.ok(notice?.textContent?.includes('연결'));
    });

    test('screenshot click when connected with data sends message', () => {
      layer.onStatus(true, ['get_image']); // set connected = true
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/ABC/test?node-id=1:2';
      mcpInput.dispatchEvent(new (global as any).window.Event('input')); // trigger updateActionState
      document.getElementById('btn-screenshot')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.screenshot' }));
    });

    test('screenshot click with empty data shows warn notice', () => {
      const screenshotBtn = document.getElementById('btn-screenshot') as HTMLButtonElement;
      screenshotBtn.disabled = false; // force enable
      screenshotBtn.click();
      const notice = document.getElementById('figma-data-notice');
      assert.ok(notice?.textContent?.includes('MCP'));
    });

    test('fetch click with empty data shows warn notice', () => {
      const fetchBtn = document.getElementById('btn-fetch') as HTMLButtonElement;
      fetchBtn.disabled = false;
      fetchBtn.click();
      const notice = document.getElementById('figma-data-notice');
      assert.ok(notice?.textContent?.includes('입력'));
    });

    test('onDataResult and onScreenshotResult', () => {
      layer.onDataResult({ foo: 'bar' });
      const dataNotice = document.getElementById('figma-data-notice');
      assert.strictEqual(dataNotice?.textContent, '데이터를 불러왔습니다.');

      layer.onScreenshotResult('base64');
      assert.strictEqual(dataNotice?.textContent, '스크린샷을 가져왔습니다.');
    });

    test('onError calls setNotice', () => {
      layer.onError('some error');
      const notice = document.getElementById('figma-data-notice');
      assert.strictEqual(notice?.textContent, 'some error');
    });

    test('onAuthStarted clears loading state and shows remote guide', () => {
      document.getElementById('btn-mode-remote')?.click();
      document.getElementById('btn-connect')?.click();
      layer.onAuthStarted();

      const notice = document.getElementById('figma-connection-notice');
      const connectBtn = document.getElementById('btn-connect') as HTMLButtonElement;
      assert.ok(notice?.textContent?.includes('브라우저'));
      assert.ok(!connectBtn.disabled);
      assert.ok(connectBtn.textContent?.includes('Auth Login'));
    });

    test('fetch button click with data posts figma.fetchData', () => {
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/ABC/test?node-id=1:2';
      const fetchBtn = document.getElementById('btn-fetch') as HTMLButtonElement;
      fetchBtn.disabled = false;
      fetchBtn.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.fetchData' }));
    });

    test('updateActionState sets disconnected title when data present but not connected', () => {
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/ABC/test?node-id=1:2';
      mcpInput.dispatchEvent(new (global as any).window.Event('input'));
      layer.onStatus(false, [], undefined); // connected=false, hasData=true triggers line 160
      const screenshotBtn = document.getElementById('btn-screenshot') as HTMLButtonElement;
      assert.ok(screenshotBtn.title.length > 0);
    });
  });

  suite('LogLayer', () => {
    let layer: LogLayer;
    setup(() => {
      layer = new LogLayer();
      document.getElementById('app')!.innerHTML = layer.render();
      layer.mount();
    });

    test('appendEntry adds to log area', () => {
      layer.appendEntry({
        id: '1',
        timestamp: '12:00',
        level: 'info',
        layer: 'system',
        message: 'hello',
      });
      const area = document.getElementById('log-area');
      assert.ok(area?.textContent?.includes('hello'));
    });

    test('appendEntry with detail appends detail line', () => {
      layer.appendEntry({
        id: '1',
        timestamp: '12:00',
        level: 'error',
        layer: 'figma',
        message: 'failed',
        detail: 'stack trace',
      });
      const area = document.getElementById('log-area');
      assert.ok(area?.textContent?.includes('stack trace'));
    });

    test('appendEntry second entry adds newline separator', () => {
      layer.appendEntry({
        id: '1',
        timestamp: '',
        level: 'info',
        layer: 'system',
        message: 'first',
      });
      layer.appendEntry({
        id: '2',
        timestamp: '',
        level: 'info',
        layer: 'system',
        message: 'second',
      });
      const area = document.getElementById('log-area');
      assert.ok(area?.textContent?.includes('\n'));
    });

    test('clear resets log area', () => {
      layer.clear();
      assert.strictEqual(document.getElementById('log-area')?.textContent, '');
    });
  });

  suite('PromptLayer', () => {
    let layer: PromptLayer;
    setup(() => {
      layer = new PromptLayer();
      document.getElementById('app')!.innerHTML = layer.render();
      layer.mount();
    });

    test('onGenerating sets progress bar width', () => {
      layer.onGenerating(50);
      const bar = document.getElementById('prompt-progress') as HTMLProgressElement | null;
      assert.ok(bar);
      assert.strictEqual(bar?.value, 50);
    });

    test('appendLog and clearLog update prompt log area', () => {
      layer.appendLog({
        id: '1',
        timestamp: '12:00:00Z',
        level: 'info',
        layer: 'prompt',
        message: 'Request sent',
        detail: 'html | claude',
      });
      const area = document.getElementById('prompt-log-area');
      assert.ok(area?.textContent?.includes('Request sent'));
      assert.ok(area?.textContent?.includes('html | claude'));

      layer.clearLog();
      assert.strictEqual(area?.textContent, '');
    });

    test('onResult updates notice and clears generating state', () => {
      layer.onGenerateRequested();
      layer.onResult('const x = 1;', 'tsx');
      const notice = document.getElementById('prompt-notice');
      const generateBtn = document.getElementById('btn-generate') as HTMLButtonElement | null;
      assert.ok(notice?.textContent);
      assert.strictEqual(generateBtn?.disabled, false);
    });

    test('onResult preserves incomplete output with warning state', () => {
      layer.onResult('partial', 'html', false, 'cancelled', 35);
      const notice = document.getElementById('prompt-notice');
      const progressText = document.getElementById('prompt-progress-text');
      assert.strictEqual(notice?.textContent, 'cancelled');
      assert.strictEqual(progressText?.textContent, '불완전');
    });

    test('onError updates notice', () => {
      layer.onError('bad things');
      const notice = document.getElementById('prompt-notice');
      assert.strictEqual(notice?.textContent, 'bad things');
    });

    test('onChunk does not throw without preview area', () => {
      layer.onChunk('hello ');
      layer.onChunk('world');
      assert.ok(true);
    });

    test('open preview button enables after result', () => {
      const previewPanelButton = document.getElementById(
        'btn-preview-open-panel',
      ) as HTMLButtonElement;
      assert.strictEqual(previewPanelButton.disabled, true);

      layer.onResult('<div>preview</div>', 'html');

      assert.strictEqual(previewPanelButton.disabled, false);
    });

    test('open preview panel posts host command with latest code', () => {
      layer.onResult('<div>preview</div>', 'html');
      document.getElementById('btn-preview-open-panel')?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'preview.openPanel',
          code: '<div>preview</div>',
          format: 'html',
        }),
      );
    });

    test('onGenerateRequested validation', () => {
      const logArea = document.getElementById('prompt-log-area') as HTMLPreElement;
      logArea.textContent = 'old log';
      (document.getElementById('use-user-prompt') as HTMLInputElement).checked = false;
      (document.getElementById('use-user-prompt') as HTMLInputElement).dispatchEvent(
        new window.Event('change'),
      );
      assert.strictEqual(
        (document.getElementById('user-prompt') as HTMLTextAreaElement).disabled,
        true,
      );
      (document.getElementById('use-mcp-data') as HTMLInputElement).checked = false;
      layer.onGenerateRequested();
      assert.strictEqual(logArea.textContent, '');
      assert.ok(postMessageStub.calledWithMatch({ command: 'prompt.generate' }));
    });

    test('cancel button posts cancel command while generating', () => {
      layer.onGenerateRequested();
      document.getElementById('btn-cancel-generate')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'prompt.cancel' }));
    });

    test('onGenerateRequested while already generating shows warn', () => {
      layer.onGenerateRequested(); // starts generating
      postMessageStub.reset();
      layer.onGenerateRequested(); // should show warn
      assert.ok(!postMessageStub.calledWithMatch({ command: 'prompt.generate' }));
    });

    test('onHostError when not generating shows notice only', () => {
      layer.onHostError('host error');
      const notice = document.getElementById('prompt-notice');
      assert.ok(notice?.textContent?.includes('host error'));
    });

    test('onGenerating with 100 shows 완료됨', () => {
      layer.onGenerating(100);
      const text = document.getElementById('prompt-progress-text');
      assert.ok(text?.textContent?.includes('완료'));
    });

    test('onHostError while generating calls onError', () => {
      layer.onGenerateRequested(); // sets isGenerating = true
      layer.onHostError('error while generating');
      const notice = document.getElementById('prompt-notice');
      assert.ok(notice?.textContent?.includes('error while generating'));
    });

    test('updateEstimate debounce callback fires', () => {
      const clock = sandbox.useFakeTimers();
      const newLayer = new PromptLayer();
      document.getElementById('app')!.innerHTML = newLayer.render();
      newLayer.mount();
      // Trigger input to reset debounce (covers clearTimeout branch)
      const userPrompt = document.getElementById('user-prompt') as HTMLTextAreaElement;
      userPrompt.dispatchEvent(new (global as any).window.Event('input'));
      clock.tick(400);
      assert.ok(postMessageStub.calledWithMatch({ command: 'prompt.estimate' }));
      clock.restore();
    });

    test('onGenerateRequested when elements missing does not crash', () => {
      document.getElementById('app')!.innerHTML = '<div></div>'; // remove layer DOM
      assert.doesNotThrow(() => layer.onGenerateRequested());
    });

    test('onHostError with No API key uses friendly message', () => {
      layer.onHostError('No API key provided');
      const notice = document.getElementById('prompt-notice');
      assert.ok(notice?.textContent?.includes('API 키'));
    });

    test('onHostError with Generation already in progress uses friendly message', () => {
      layer.onHostError('Generation already in progress');
      const notice = document.getElementById('prompt-notice');
      assert.ok(notice?.textContent?.includes('이미'));
    });
  });
});

suite('UI Main Initialization', () => {
  setup(() => {
    document.body.innerHTML = '<div id="app"></div>';
    document.body.dataset.section = 'setup';
    // Clear cache for main.ts to re-run init()
    delete require.cache[require.resolve('../../src/webview/ui/main')];
  });

  test('init runs based on section', () => {
    require('../../src/webview/ui/main');
    const app = document.getElementById('app');
    assert.ok(app?.innerHTML.includes('panel'));
  });
});
