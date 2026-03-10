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

    test('dropdown contains all supported agents', () => {
      const select = document.getElementById('agent-select') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      assert.ok(options.includes('gemini'));
      assert.ok(options.includes('claude'));
      assert.ok(options.includes('deepseek'));
      assert.ok(options.includes('qwen'));
      assert.ok(options.includes('openrouter'));
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

    test('onStatus connected clears previous connection error notice', () => {
      layer.onStatus(false, [], 'Connect error');
      layer.onStatus(true, ['tool1'], undefined);

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

    test('metadata click when connected with data sends message', () => {
      layer.onStatus(true, ['get_metadata']);
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/ABC/test?node-id=1:2';
      mcpInput.dispatchEvent(new (global as any).window.Event('input'));
      document.getElementById('btn-fetch-metadata')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.fetchMetadata' }));
    });

    test('variable defs click when connected with data sends message', () => {
      layer.onStatus(true, ['get_variable_defs']);
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/ABC/test?node-id=1:2';
      mcpInput.dispatchEvent(new (global as any).window.Event('input'));
      document.getElementById('btn-fetch-variable-defs')?.click();
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.fetchVariableDefs' }));
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
      layer.onDataResult({ foo: 'bar' }, 'designContext');
      const dataNotice = document.getElementById('figma-data-notice');
      assert.strictEqual(dataNotice?.textContent, '데이터를 불러왔습니다.');

      layer.onDataResult({ foo: 'bar' }, 'metadata');
      assert.strictEqual(dataNotice?.textContent, '메타데이터를 불러왔습니다.');

      layer.onDataResult({ foo: 'bar' }, 'variableDefs');
      assert.strictEqual(dataNotice?.textContent, '변수 정의를 불러왔습니다.');

      layer.onDataResult({ foo: 'bar' }, 'parsedInput');
      assert.ok(dataNotice?.textContent?.includes('로컬에서 파싱'));

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

    test('clear button clears figma data and posts clear command', () => {
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/ABC/test?node-id=1:2';
      mcpInput.dispatchEvent(new (global as any).window.Event('input'));

      document.getElementById('btn-clear-data')?.click();

      assert.strictEqual(mcpInput.value, '');
      assert.ok(postMessageStub.calledWithMatch({ command: 'figma.clearData' }));
    });

    test('updateActionState sets disconnected title when data present but not connected', () => {
      const mcpInput = document.getElementById('mcp-data') as HTMLTextAreaElement;
      mcpInput.value = 'https://figma.com/file/ABC/test?node-id=1:2';
      mcpInput.dispatchEvent(new (global as any).window.Event('input'));
      layer.onStatus(false, [], undefined); // connected=false, hasData=true triggers line 160
      const screenshotBtn = document.getElementById('btn-screenshot') as HTMLButtonElement;
      const metadataBtn = document.getElementById('btn-fetch-metadata') as HTMLButtonElement;
      const variableDefsBtn = document.getElementById(
        'btn-fetch-variable-defs',
      ) as HTMLButtonElement;
      assert.ok(screenshotBtn.title.length > 0);
      assert.ok(metadataBtn.title.length > 0);
      assert.ok(variableDefsBtn.title.length > 0);
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

    test('action buttons render below the generate row', () => {
      const actionGroup = document.querySelector('.prompt-action-group');
      const actionRows = actionGroup?.querySelectorAll('.btn-row');

      assert.ok(actionGroup);
      assert.strictEqual(actionRows?.length, 2);
      assert.strictEqual(actionRows?.[0].querySelector('#btn-generate')?.id, 'btn-generate');
      assert.strictEqual(
        actionRows?.[1].querySelector('#btn-open-generated-editor')?.id,
        'btn-open-generated-editor',
      );
      assert.strictEqual(
        actionRows?.[1].querySelector('#btn-preview-open-panel')?.id,
        'btn-preview-open-panel',
      );
      assert.strictEqual(
        actionRows?.[1].querySelector('#btn-preview-open-browser')?.id,
        'btn-preview-open-browser',
      );
    });

    test('open preview button enables after result', () => {
      const openEditorButton = document.getElementById(
        'btn-open-generated-editor',
      ) as HTMLButtonElement;
      const previewPanelButton = document.getElementById(
        'btn-preview-open-panel',
      ) as HTMLButtonElement;
      const previewBrowserButton = document.getElementById(
        'btn-preview-open-browser',
      ) as HTMLButtonElement;
      assert.strictEqual(openEditorButton.getAttribute('aria-disabled'), 'true');
      assert.strictEqual(previewPanelButton.getAttribute('aria-disabled'), 'true');
      assert.strictEqual(previewBrowserButton.getAttribute('aria-disabled'), 'true');

      layer.onResult('<div>preview</div>', 'html');

      assert.strictEqual(openEditorButton.getAttribute('aria-disabled'), 'false');
      assert.strictEqual(previewPanelButton.getAttribute('aria-disabled'), 'false');
      assert.strictEqual(previewBrowserButton.getAttribute('aria-disabled'), 'false');
    });

    test('open preview panel posts host command with latest code', () => {
      layer.onResult('<div>preview</div>', 'html');
      document.getElementById('btn-preview-open-panel')?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'preview.openPanel',
          format: 'html',
        }),
      );
    });

    test('open preview panel while generating shows progress notice', () => {
      layer.onGenerateRequested();

      document.getElementById('btn-preview-open-panel')?.click();

      const notice = document.getElementById('prompt-notice');
      assert.ok(notice?.textContent?.includes('진행 중'));
      assert.ok(!postMessageStub.calledWithMatch({ command: 'preview.openPanel' }));
    });

    test('open browser preview posts host command with latest code', () => {
      layer.onResult('<div>preview</div>', 'html');
      document.getElementById('btn-preview-open-browser')?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'preview.openBrowser',
          format: 'html',
        }),
      );
    });

    test('open browser preview while generating shows progress notice', () => {
      layer.onGenerateRequested();

      document.getElementById('btn-preview-open-browser')?.click();

      const notice = document.getElementById('prompt-notice');
      assert.ok(notice?.textContent?.includes('진행 중'));
      assert.ok(!postMessageStub.calledWithMatch({ command: 'preview.openBrowser' }));
    });

    test('preview fallback notice is shown when browser preview opens in panel mode', () => {
      layer.onPreviewOpened('browser', 'panel');

      const notice = document.getElementById('prompt-notice');
      assert.ok(notice?.textContent?.includes('Preview Panel'));
    });

    test('open generated editor posts host command', () => {
      layer.onResult('<div>preview</div>', 'html');
      document.getElementById('btn-open-generated-editor')?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'editor.openGeneratedResult',
        }),
      );
    });

    test('onGenerateRequested validation', () => {
      const logArea = document.getElementById('prompt-log-area') as HTMLPreElement;
      logArea.textContent = 'old log';
      (document.getElementById('use-mcp-data') as HTMLInputElement).checked = false;
      (document.getElementById('use-screenshot-data') as HTMLInputElement).checked = false;
      (document.getElementById('user-prompt') as HTMLTextAreaElement).value = 'Visible prompt';
      layer.onGenerateRequested();
      assert.strictEqual(logArea.textContent, '');
      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'prompt.generate',
          payload: sinon.match({
            userPrompt: 'Visible prompt',
            mcpData: null,
            screenshotData: null,
          }),
        }),
      );
    });

    test('render includes screenshot toggle and visible output format prompt preview', () => {
      const screenshotToggle = document.getElementById('use-screenshot-data');
      const promptEditor = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
      const formatPreview = document.getElementById(
        'format-prompt-preview',
      ) as HTMLTextAreaElement | null;

      assert.ok(screenshotToggle);
      assert.ok(promptEditor);
      assert.ok(promptEditor?.value.length);
      assert.ok(formatPreview);
      assert.ok(formatPreview?.value.includes('Generate TSX code'));
      assert.strictEqual(document.getElementById('hidden-prompt'), null);
      assert.strictEqual(document.getElementById('use-user-prompt'), null);
    });

    test('output format preview updates when the selected format changes', () => {
      const outputFormat = document.getElementById('output-format') as HTMLSelectElement;
      const formatPreview = document.getElementById('format-prompt-preview') as HTMLTextAreaElement;

      outputFormat.value = 'vue';
      outputFormat.dispatchEvent(new (global as any).window.Event('change'));

      assert.ok(formatPreview.value.includes('Generate VUE code'));
      assert.ok(formatPreview.value.includes('Vue 3 Single File Component'));
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
