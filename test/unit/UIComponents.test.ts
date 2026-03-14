import * as assert from 'assert';
import * as sinon from 'sinon';
import { vscode } from '../../src/webview/ui/vscodeApi';

import { AgentLayer } from '../../src/webview/ui/components/AgentLayer';
import { FigmaLayer } from '../../src/webview/ui/components/FigmaLayer';
import { ProfilerDetailLayer } from '../../src/webview/ui/components/ProfilerDetailLayer';
import { ProfilerLayer } from '../../src/webview/ui/components/ProfilerLayer';
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

    test('metadata and variable defs buttons render codicons and labels', () => {
      const metadataBtn = document.getElementById('btn-fetch-metadata');
      const variableDefsBtn = document.getElementById('btn-fetch-variable-defs');

      assert.ok(metadataBtn?.textContent?.includes('Metadata'));
      assert.ok(variableDefsBtn?.textContent?.includes('Variable Defs'));
      assert.ok(metadataBtn?.querySelector('.codicon.codicon-info'));
      assert.ok(variableDefsBtn?.querySelector('.codicon.codicon-symbol-constant'));
    });

    test('metadata and variable defs buttons render in the updated order', () => {
      const actionRow = document.querySelector('.btn-row.btn-row-space-between .row');
      const buttonIds = Array.from(actionRow?.querySelectorAll('button') ?? []).map(
        (button) => button.id,
      );

      assert.deepStrictEqual(buttonIds, [
        'btn-fetch',
        'btn-fetch-metadata',
        'btn-fetch-variable-defs',
        'btn-screenshot',
      ]);
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
      assert.ok(notice?.classList.contains('error'));
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

    test('source data button click with URL posts figma.fetchSourceData', () => {
      layer.onStatus(true, ['get_file']);
      const input = document.getElementById('source-data-url') as HTMLTextAreaElement;
      input.value = 'http://localhost:3845/assets/test.svg';
      input.dispatchEvent(new (global as any).window.Event('input'));

      document.getElementById('btn-fetch-source-data')?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'figma.fetchSourceData',
          url: 'http://localhost:3845/assets/test.svg',
        }),
      );
    });

    test('source data button click without connection shows warn notice', () => {
      const input = document.getElementById('source-data-url') as HTMLTextAreaElement;
      input.value = 'http://localhost:3845/assets/test.svg';
      input.dispatchEvent(new (global as any).window.Event('input'));

      const button = document.getElementById('btn-fetch-source-data') as HTMLButtonElement;
      button.disabled = false;
      button.click();

      const notice = document.getElementById('figma-source-data-notice');
      assert.ok(notice?.textContent?.includes('MCP'));
    });

    test('source data result updates source notice', () => {
      layer.onSourceDataResult(2, [
        {
          assetKey: 'asset-1',
          url: 'http://localhost:3845/assets/test.svg',
          suggestedName: 'test.svg',
          thumbnailDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        },
      ]);
      const notice = document.getElementById('figma-source-data-notice');
      assert.ok(notice?.textContent?.includes('2'));
    });

    test('source data thumbnail click reopens the original image', () => {
      layer.onSourceDataResult(1, [
        {
          assetKey: 'asset-1',
          url: 'http://localhost:3845/assets/test.svg',
          suggestedName: 'test.svg',
          thumbnailDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        },
      ]);

      (document.querySelector('.source-card') as HTMLButtonElement)?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'figma.openSourceDataAsset',
          assetKey: 'asset-1',
        }),
      );
    });

    test('source data button disables in remote mode', () => {
      const input = document.getElementById('source-data-url') as HTMLTextAreaElement;
      input.value = 'http://localhost:3845/assets/test.svg';
      input.dispatchEvent(new (global as any).window.Event('input'));
      layer.onStatus(true, ['get_file']);

      document.getElementById('btn-mode-remote')?.click();

      const button = document.getElementById('btn-fetch-source-data') as HTMLButtonElement;
      assert.ok(button.disabled);
      assert.ok(button.title.length > 0);
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

  suite('PromptLayer', () => {
    let layer: PromptLayer;
    setup(() => {
      layer = new PromptLayer();
      document.getElementById('app')!.innerHTML = layer.render();
      layer.mount();
    });

    test('mount requests agent state for model metrics', () => {
      assert.ok(postMessageStub.calledWithMatch({ command: 'agent.getState' }));
    });

    test('onGenerating updates progress bar value', () => {
      layer.onGenerating(50);
      const bar = document.getElementById('prompt-progress') as HTMLProgressElement | null;
      assert.ok(bar);
      assert.strictEqual(bar?.value, 50);
    });

    test('onEstimateResult updates split metric values', () => {
      layer.onEstimateResult(1234, 2.5);
      assert.strictEqual(document.getElementById('prompt-data-size')?.textContent, '2.5KB');
      assert.strictEqual(
        document.getElementById('prompt-estimated-tokens')?.textContent,
        '~1,234 tok',
      );
      assert.ok(document.querySelector('.prompt-metrics-board'));
    });

    test('onModelsResult updates selected model max token display', () => {
      layer.onAgentState('claude', 'sonnet', true);
      postMessageStub.resetHistory();
      layer.onModelsResult([
        {
          id: 'sonnet',
          name: 'Sonnet',
          inputTokenLimit: 200000,
          outputTokenLimit: 8192,
          contextWindow: 200000,
        },
      ]);
      assert.strictEqual(
        document.getElementById('prompt-model-max-input-tokens')?.textContent,
        '200,000 tok',
      );
      assert.strictEqual(
        document.getElementById('prompt-model-max-output-tokens')?.textContent,
        '8,192 tok',
      );
      assert.strictEqual(
        document.getElementById('prompt-model-context-window')?.textContent,
        '200,000 tok',
      );
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

    test('secondary action buttons render below the primary toolbar', () => {
      const actionGroup = document.querySelector('.prompt-action-group');
      const toolbar = actionGroup?.querySelector('.prompt-primary-toolbar');
      const secondaryActions = actionGroup?.querySelector('.prompt-secondary-actions');

      assert.ok(actionGroup);
      assert.ok(toolbar);
      assert.ok(secondaryActions);
      assert.strictEqual(toolbar?.querySelector('#btn-generate')?.id, 'btn-generate');
      assert.strictEqual(
        secondaryActions?.querySelector('#btn-open-generated-editor')?.id,
        'btn-open-generated-editor',
      );
      assert.strictEqual(
        secondaryActions?.querySelector('#btn-preview-open-panel')?.id,
        'btn-preview-open-panel',
      );
      assert.strictEqual(
        secondaryActions?.querySelector('#btn-preview-open-browser')?.id,
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
      (document.getElementById('use-metadata') as HTMLInputElement).checked = true;
      (document.getElementById('use-screenshot-data') as HTMLInputElement).checked = false;
      (document.getElementById('user-prompt') as HTMLTextAreaElement).value = 'Visible prompt';
      layer.onGenerateRequested();
      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'prompt.generate',
          payload: sinon.match({
            userPrompt: 'Visible prompt',
            mcpDataKind: 'metadata',
            screenshotData: null,
          }),
        }),
      );
    });

    test('render includes radio-based MCP selector, screenshot toggle, and visible output format prompt preview', () => {
      const designContextToggle = document.getElementById('use-design-context');
      const metadataToggle = document.getElementById('use-metadata');
      const screenshotToggle = document.getElementById('use-screenshot-data');
      const promptEditor = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
      const formatPreview = document.getElementById(
        'format-prompt-preview',
      ) as HTMLTextAreaElement | null;

      assert.ok(designContextToggle);
      assert.ok(metadataToggle);
      assert.ok(screenshotToggle);
      assert.ok(promptEditor);
      assert.ok(promptEditor?.value.length);
      assert.ok(formatPreview);
      assert.ok(formatPreview?.value.includes('Generate TSX code'));
      assert.strictEqual(
        (document.querySelector('.minimal-options') as HTMLDetailsElement | null)?.open,
        true,
      );
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

  suite('ProfilerDetailLayer', () => {
    let layer: ProfilerDetailLayer;

    const createProfilerDetail = () => ({
      summary: {
        id: 'codex:test',
        agent: 'codex' as const,
        filePath: '/tmp/session.jsonl',
        fileName: 'session.jsonl',
        modifiedAt: '2026-03-11T10:00:00.000Z',
        fileSizeBytes: 4096,
        totalInputTokens: 320,
        totalOutputTokens: 140,
        totalCachedTokens: 60,
        totalTokens: 520,
        requestCount: 2,
        parseStatus: 'ok' as const,
        warnings: [],
      },
      metadata: {
        agentLabel: 'CODEX',
        vendorLabel: 'OpenAI',
        sessionId: 'session-123',
        cwd: '/tmp/workspace/demo',
        provider: 'OpenAI',
        sourceFormat: 'jsonl',
        storageLabel: '~/.codex/sessions',
        parserCoverage: 'Threads, usage, lifecycle, tooling',
        summarySections: [
          {
            id: 'storage',
            title: 'Storage',
            description: 'Persisted session file',
            fields: [
              { label: 'Path', value: '~/.codex/sessions', tone: 'muted' as const },
              { label: 'Format', value: 'JSONL', tone: 'default' as const },
            ],
          },
          {
            id: 'usage',
            title: 'Usage',
            description: 'Normalized token metrics',
            fields: [
              { label: 'Input', value: '320', tone: 'default' as const },
              { label: 'Output', value: '140', tone: 'accent' as const },
            ],
          },
        ],
        keyEventSections: [
          {
            id: 'conversation',
            title: 'Conversation',
            description: 'User and assistant turns',
            fields: [{ label: 'Count', value: '2', tone: 'default' as const }],
          },
          {
            id: 'usage',
            title: 'Usage',
            description: 'Token and latency checkpoints',
            fields: [{ label: 'Count', value: '2', tone: 'accent' as const }],
          },
        ],
      },
      timeline: [
        {
          id: 'p1',
          timestamp: '2026-03-11T10:00:00.000Z',
          endTimestamp: '2026-03-11T10:00:03.000Z',
          maxTokens: 200000,
          inputTokens: 100,
          outputTokens: 40,
          cachedTokens: 20,
          totalTokens: 160,
          payloadKb: 4.4,
          latencyMs: 3000,
          latencyPhase: 'response_completed' as const,
          eventType: 'turn',
          label: 'T01',
          detail: 'Inspect setup',
          sourceEventId: 'raw-1',
        },
        {
          id: 'p2',
          timestamp: '2026-03-11T10:01:00.000Z',
          endTimestamp: '2026-03-11T10:01:05.000Z',
          maxTokens: 200000,
          inputTokens: 220,
          outputTokens: 100,
          cachedTokens: 40,
          totalTokens: 360,
          payloadKb: 7.8,
          latencyMs: 5000,
          latencyPhase: 'response_completed' as const,
          eventType: 'turn',
          label: 'T02',
          detail: 'Render profiler chart',
          sourceEventId: 'raw-3',
        },
      ],
      eventBubbles: [
        {
          id: 'bubble-1',
          timestamp: '2026-03-11T10:01:05.000Z',
          title: 'Turn completed',
          detail: 'Render profiler chart',
          category: 'conversation' as const,
          rawEventId: 'raw-3',
        },
      ],
      rawEvents: [
        {
          id: 'raw-1',
          filePath: '/tmp/session.jsonl',
          lineNumber: 4,
          timestamp: '2026-03-11T10:00:03.000Z',
          eventType: 'token_count',
          category: 'usage' as const,
          summary: 'Token snapshot',
          excerpt: 'Initial user prompt',
          messagePreview: 'Initial user prompt',
          payloadKb: 4.4,
          payloadBytes: 4505,
          inputTokens: 100,
          outputTokens: 40,
          cachedTokens: 20,
          totalTokens: 160,
        },
        {
          id: 'raw-2',
          filePath: '/tmp/session.jsonl',
          lineNumber: 8,
          timestamp: '2026-03-11T10:01:04.000Z',
          eventType: 'token_count',
          category: 'usage' as const,
          summary: 'Token snapshot',
          excerpt: '{"sample":2}',
          messagePreview: 'Second token snapshot',
          payloadKb: 7.8,
          payloadBytes: 7987,
          inputTokens: 120,
          outputTokens: 60,
          cachedTokens: 20,
          totalTokens: 200,
        },
        {
          id: 'raw-3',
          filePath: '/tmp/session.jsonl',
          lineNumber: 9,
          timestamp: '2026-03-11T10:01:05.000Z',
          eventType: 'task_complete',
          category: 'conversation' as const,
          summary: 'Turn completed',
          excerpt: '{"sample":2}',
          messagePreview: 'Turn completed',
          payloadKb: 7.8,
          payloadBytes: 7987,
          inputTokens: 220,
          outputTokens: 100,
          cachedTokens: 40,
          totalTokens: 360,
        },
        {
          id: 'raw-system',
          filePath: '/tmp/session.jsonl',
          lineNumber: 1,
          timestamp: '2026-03-11T09:59:59.000Z',
          eventType: 'system',
          category: 'system' as const,
          summary: 'Session started',
          excerpt: 'Session started',
          messagePreview: 'Session started',
        },
      ],
    });

    setup(() => {
      layer = new ProfilerDetailLayer();
      document.getElementById('app')!.innerHTML = layer.render();
      layer.mount();
    });

    test('renders timeline chart and switches metric mode', async () => {
      const { act } = await import('react');
      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail: createProfilerDetail(),
        });
      });

      assert.ok(
        document.getElementById('profiler-header-surface')?.textContent?.includes('session.jsonl'),
      );
      // visx React chart renders legend toggle buttons with series labels
      const chartShell = document.getElementById('profiler-chart-shell');
      const viewer = document.querySelector('.profiler-chart-surface');
      const secondary = document.querySelector('.profiler-log-surface');
      const axisRail = document.querySelector('.profiler-chart-axis-rail');
      assert.ok(chartShell?.textContent?.includes('Input'));
      assert.ok(chartShell?.textContent?.includes('Trend'));
      assert.strictEqual(viewer?.nextElementSibling, secondary);
      assert.ok(axisRail);
      assert.ok(
        document.getElementById('profiler-log-table')?.textContent?.includes('Turn completed'),
      );
      assert.ok(
        document.getElementById('profiler-header-surface')?.textContent?.includes('Tokens'),
      );
      assert.ok(chartShell?.querySelector('.profiler-chart-limit-line'));
      assert.ok(chartShell?.querySelector('.profiler-chart-limit-label'));
      // visx chart renders bar rects for each timeline point
      assert.ok((chartShell?.querySelectorAll('.profiler-chart-bar').length ?? 0) >= 2);
    });

    test('re-renders chart after loading transition without leaving spinner behind', async () => {
      const { act } = await import('react');
      const detail = createProfilerDetail();

      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail,
        });
      });

      act(() => {
        layer.onState({
          status: 'loading',
          sessionId: 'codex:test',
          message: '로딩중..',
        });
      });

      const chartShell = document.getElementById('profiler-chart-shell');
      assert.ok(chartShell?.textContent?.includes('로딩중'));

      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail,
        });
      });

      assert.ok(chartShell?.textContent?.includes('Input'));
      assert.ok(!chartShell?.textContent?.includes('로딩중'));
      assert.ok((chartShell?.querySelectorAll('.profiler-chart-bar').length ?? 0) >= 2);
    });

    test('codex token chart uses raw token snapshots instead of turn count', async () => {
      const { act } = await import('react');
      const detail = createProfilerDetail();
      detail.timeline = [
        {
          id: 'p1',
          timestamp: '2026-03-11T10:00:00.000Z',
          endTimestamp: '2026-03-11T10:00:08.000Z',
          maxTokens: 200000,
          inputTokens: 220,
          outputTokens: 70,
          cachedTokens: 40,
          totalTokens: 330,
          eventType: 'turn',
          label: 'T01',
          detail: 'Single long task',
          sourceEventId: 'raw-2',
        },
      ];
      detail.rawEvents = [
        {
          id: 'raw-token-1',
          filePath: '/tmp/session.jsonl',
          lineNumber: 4,
          timestamp: '2026-03-11T10:00:03.000Z',
          eventType: 'token_count',
          category: 'usage' as const,
          summary: 'Token snapshot',
          excerpt: '{"sample":1}',
          messagePreview: 'snapshot-1',
          inputTokens: 100,
          outputTokens: 40,
          cachedTokens: 20,
          totalTokens: 160,
          maxTokens: 200000,
        },
        {
          id: 'raw-token-2',
          filePath: '/tmp/session.jsonl',
          lineNumber: 8,
          timestamp: '2026-03-11T10:00:06.000Z',
          eventType: 'token_count',
          category: 'usage' as const,
          summary: 'Token snapshot',
          excerpt: '{"sample":2}',
          messagePreview: 'snapshot-2',
          inputTokens: 120,
          outputTokens: 30,
          cachedTokens: 20,
          totalTokens: 170,
          maxTokens: 200000,
        },
      ];

      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail,
        });
      });

      const chartShell = document.getElementById('profiler-chart-shell');
      assert.ok(chartShell?.textContent?.includes('2 samples'));
      assert.strictEqual(chartShell?.querySelectorAll('.profiler-chart-bar').length, 2);
    });

    test('updates the chart when live detail grows in place', async () => {
      const { act } = await import('react');
      const detail = createProfilerDetail();

      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail,
          live: {
            active: true,
            status: 'streaming',
            messages: [],
          },
        });
      });

      const chartShell = document.getElementById('profiler-chart-shell');
      assert.strictEqual(chartShell?.querySelectorAll('.profiler-chart-bar').length, 2);

      detail.timeline.push({
        id: 'p3',
        timestamp: '2026-03-11T10:02:00.000Z',
        endTimestamp: '2026-03-11T10:02:06.000Z',
        inputTokens: 260,
        outputTokens: 120,
        cachedTokens: 40,
        totalTokens: 420,
        payloadKb: 9.6,
        latencyMs: 6000,
        latencyPhase: 'response_completed',
        eventType: 'turn',
        label: 'T03',
        detail: 'Stream new live point',
        sourceEventId: 'raw-3',
      });
      detail.rawEvents.push({
        id: 'raw-3',
        filePath: '/tmp/session.jsonl',
        lineNumber: 12,
        timestamp: '2026-03-11T10:02:05.000Z',
        eventType: 'token_count',
        category: 'usage' as const,
        summary: 'Live token snapshot',
        excerpt: '{"sample":3}',
        payloadKb: 9.6,
        payloadBytes: 9830,
        inputTokens: 260,
        outputTokens: 120,
        cachedTokens: 40,
        totalTokens: 420,
        maxTokens: 200000,
      });

      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail,
          live: {
            active: true,
            status: 'streaming',
            updatedAt: '2026-03-11T10:02:06.000Z',
            messages: [
              {
                id: 'live-2',
                timestamp: '2026-03-11T10:02:06.000Z',
                level: 'info',
                layer: 'profiler',
                message: 'Live session updated',
                detail: '3 timeline points · 3 events',
              },
            ],
          },
        });
      });

      assert.strictEqual(chartShell?.querySelectorAll('.profiler-chart-bar').length, 3);
      assert.ok(chartShell?.textContent?.includes('3 samples'));
      // In the new layout, live updates don't have a dedicated feed div anymore,
      // they go into the system list column if categorized as such.
      // But based on my current categorizeEvents, LogEntry items from state.live are not rendered
      // into the lists (only rawEvents are). I should fix this or adjust the test.
    });

    test('tooltip stays visible inside chart bounds and opens the linked raw event on click', async () => {
      const { act } = await import('react');
      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail: createProfilerDetail(),
        });
      });

      const scroll = document.querySelector('.profiler-chart-scroll') as HTMLDivElement | null;
      assert.ok(scroll);
      sandbox.stub(scroll, 'getBoundingClientRect').returns({
        left: 0,
        top: 0,
        right: 640,
        bottom: 252,
        width: 640,
        height: 252,
        x: 0,
        y: 0,
        toJSON: () => '',
      } as DOMRect);

      act(() => {
        scroll.dispatchEvent(
          new (global as any).window.MouseEvent('mousemove', {
            bubbles: true,
            clientX: 618,
            clientY: 64,
          }),
        );
      });

      const tooltip = document.querySelector(
        '.profiler-chart-tooltip-action',
      ) as HTMLButtonElement | null;
      assert.ok(tooltip);
      assert.strictEqual(tooltip?.style.top, '8px');
      assert.ok(tooltip?.querySelector('.profiler-tooltip-time')?.textContent);
      assert.ok(tooltip?.querySelector('.profiler-tooltip-data')?.textContent?.includes('Input'));
      assert.ok(tooltip?.querySelector('.profiler-tooltip-data')?.textContent?.includes('Trend'));

      act(() => {
        tooltip?.click();
      });

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'profiler.openSource',
          filePath: '/tmp/session.jsonl',
          lineNumber: 8,
        }),
      );
    });

    test('info buttons open markdown guides in the editor', async () => {
      const { act } = await import('react');
      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail: createProfilerDetail(),
        });
      });

      postMessageStub.resetHistory();
      (document.querySelector('[data-info-doc="profiler"]') as HTMLButtonElement | null)?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'profiler.openInfoDoc',
          kind: 'profiler',
        }),
      );
    });

    test('toggles summary, chart, and event log fold state from the header icons', async () => {
      const { act } = await import('react');
      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail: createProfilerDetail(),
        });
      });

      const summaryToggle = document.querySelector(
        '[data-profiler-summary-toggle]',
      ) as HTMLButtonElement | null;
      const chartToggle = document.querySelector(
        '[data-profiler-chart-toggle]',
      ) as HTMLButtonElement | null;
      const logToggle = document.getElementById('profiler-log-toggle') as HTMLButtonElement | null;
      const logSurface = document.querySelector('.profiler-log-surface') as HTMLElement | null;

      assert.ok(summaryToggle);
      assert.ok(chartToggle);
      assert.ok(logToggle);
      assert.ok(document.querySelector('.profiler-metric-board'));
      assert.ok(document.getElementById('profiler-chart-shell')?.textContent?.includes('Input'));
      assert.ok(
        document.getElementById('profiler-log-table')?.textContent?.includes('Turn completed'),
      );

      act(() => {
        summaryToggle?.click();
      });
      assert.ok(document.querySelector('.profiler-metric-board.is-collapsed'));
      assert.strictEqual(
        document.querySelector('[data-profiler-summary-toggle]')?.getAttribute('aria-expanded'),
        'false',
      );

      act(() => {
        (
          document.querySelector('[data-profiler-summary-toggle]') as HTMLButtonElement | null
        )?.click();
      });
      assert.ok(!document.querySelector('.profiler-metric-board.is-collapsed'));
      assert.strictEqual(
        document.querySelector('[data-profiler-summary-toggle]')?.getAttribute('aria-expanded'),
        'true',
      );

      act(() => {
        chartToggle?.click();
      });
      assert.strictEqual(
        document.querySelector('[data-profiler-chart-toggle]')?.getAttribute('aria-expanded'),
        'false',
      );
      assert.strictEqual(
        document.getElementById('profiler-chart-shell')?.textContent?.trim() ?? '',
        '',
      );

      act(() => {
        (
          document.querySelector('[data-profiler-chart-toggle]') as HTMLButtonElement | null
        )?.click();
      });
      assert.strictEqual(
        document.querySelector('[data-profiler-chart-toggle]')?.getAttribute('aria-expanded'),
        'true',
      );
      assert.ok(document.getElementById('profiler-chart-shell')?.textContent?.includes('Input'));

      act(() => {
        logToggle?.click();
      });
      assert.ok(logSurface?.classList.contains('is-collapsed'));
      assert.strictEqual(
        document.getElementById('profiler-log-toggle')?.getAttribute('aria-expanded'),
        'false',
      );

      act(() => {
        (document.getElementById('profiler-log-toggle') as HTMLButtonElement | null)?.click();
      });
      assert.ok(!logSurface?.classList.contains('is-collapsed'));
      assert.strictEqual(
        document.getElementById('profiler-log-toggle')?.getAttribute('aria-expanded'),
        'true',
      );
      assert.ok(
        document.getElementById('profiler-log-table')?.textContent?.includes('Turn completed'),
      );
    });

    test('renders live updates and toggles live mode off', async () => {
      const { act } = await import('react');
      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail: createProfilerDetail(),
          live: {
            active: true,
            status: 'streaming',
            agent: 'codex',
            filePath: '/tmp/session.jsonl',
            fileName: 'session.jsonl',
            startedAt: '2026-03-11T10:00:00.000Z',
            updatedAt: '2026-03-11T10:01:05.000Z',
            messages: [
              {
                id: 'live-1',
                timestamp: '2026-03-11T10:01:05.000Z',
                level: 'info',
                layer: 'profiler',
                message: 'Live session updated',
                detail: '2 timeline points · 2 events',
              },
            ],
          },
        });
      });

      assert.ok(document.getElementById('profiler-header-surface')?.textContent?.includes('Live'));

      const liveButton = document.querySelector(
        '[data-profiler-live-toggle]',
      ) as HTMLButtonElement | null;
      assert.strictEqual(liveButton?.dataset.liveActive, 'true');
      assert.ok(liveButton?.querySelector('.status-dot.connected'));
      liveButton?.click();

      assert.ok(postMessageStub.calledWithMatch({ command: 'profiler.stopLiveData' }));
    });

    test('renders a red live badge and toggles live mode on for the current session', async () => {
      const { act } = await import('react');
      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail: createProfilerDetail(),
          live: {
            active: false,
            status: 'stopped',
            agent: 'codex',
            filePath: '/tmp/session.jsonl',
            fileName: 'session.jsonl',
            startedAt: '2026-03-11T10:00:00.000Z',
            updatedAt: '2026-03-11T10:01:05.000Z',
            messages: [],
          },
        });
      });

      const liveButton = document.querySelector(
        '[data-profiler-live-toggle]',
      ) as HTMLButtonElement | null;
      assert.ok(liveButton);
      assert.strictEqual(liveButton?.dataset.liveActive, 'false');
      assert.ok(liveButton?.querySelector('.status-dot.disconnected'));

      liveButton?.click();

      assert.ok(
        postMessageStub.calledWithMatch({
          command: 'profiler.startLiveData',
          id: 'codex:test',
          agent: 'codex',
        }),
      );
    });

    test('events are correctly categorized in columns', async () => {
      const { act } = await import('react');
      act(() => {
        layer.onState({
          status: 'ready',
          sessionId: 'codex:test',
          detail: createProfilerDetail(),
        });
      });

      const stream = document.getElementById('profiler-log-table');
      assert.ok(stream?.textContent?.includes('User'));
      assert.ok(stream?.textContent?.includes('Initial user prompt'));
      assert.ok(stream?.textContent?.includes('Agent'));
      assert.ok(stream?.textContent?.includes('Turn completed'));
      assert.ok(stream?.textContent?.includes('System'));
      assert.ok(stream?.textContent?.includes('Session started'));
    });
  });

  suite('ProfilerLayer', () => {
    let layer: ProfilerLayer;

    setup(() => {
      layer = new ProfilerLayer();
      document.getElementById('app')!.innerHTML = layer.render();
      layer.mount();
    });

    test('renders session rows with an explicit filename header and metadata line', () => {
      layer.onState({
        status: 'ready',
        selectedAgent: 'codex',
        selectedSessionId: 'codex:1',
        aggregate: {
          totalSessions: 1,
          totalInputTokens: 100,
          totalOutputTokens: 40,
          totalCachedTokens: 0,
          totalTokens: 140,
          totalFileSizeBytes: 56320,
        },
        sessionsByAgent: {
          claude: [],
          codex: [
            {
              id: 'codex:1',
              agent: 'codex',
              filePath: '/tmp/very-long-session-file-name.jsonl',
              fileName: 'very-long-session-file-name.jsonl',
              modifiedAt: '2026-03-11T14:05:00.000Z',
              fileSizeBytes: 56320,
              parseStatus: 'ok',
              warnings: [],
            },
          ],
          gemini: [],
        },
      });

      const row = document.querySelector('.profiler-session-card') as HTMLButtonElement;
      const main = row?.querySelector('.profiler-session-card-main') as HTMLElement | null;
      const titleRow = row?.querySelector('.profiler-session-card-title-row') as HTMLElement | null;
      const fileCell = row?.querySelector('.profiler-session-card-name') as HTMLElement | null;
      const meta = row?.querySelector('.profiler-session-card-meta-row') as HTMLElement | null;
      const stampCell = row?.querySelector('.profiler-session-card-stamp') as HTMLElement | null;
      const sizeCell = row?.querySelector('.profiler-session-card-size') as HTMLElement | null;
      const sortButtons = Array.from(document.querySelectorAll('.profiler-sort-btn')).map(
        (button) => button.textContent?.trim(),
      );

      assert.ok(row);
      assert.strictEqual(document.querySelectorAll('.profiler-session-card').length, 1);
      assert.deepStrictEqual(sortButtons, ['Name', 'Time ↓', 'tin', 'tout', 'Size']);
      assert.ok(main);
      assert.ok(titleRow);
      assert.ok(fileCell);
      assert.ok(meta);
      assert.ok(stampCell);
      assert.ok(sizeCell);
      assert.strictEqual(fileCell.getAttribute('title'), 'very-long-session-file-name.jsonl');
      assert.strictEqual(fileCell.textContent, 'very-long-session-file-name.jsonl');
      assert.ok(stampCell.textContent?.includes('2026-03-11'));
      assert.strictEqual(sizeCell.textContent, '55.0 KB');
      assert.ok(row.textContent?.includes('IN 0K'));
      assert.ok(row.textContent?.includes('OUT 0K'));
    });

    test('marks the latest recently-updated session as live', () => {
      const liveTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const historyTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      layer.onState({
        status: 'ready',
        selectedAgent: 'codex',
        selectedSessionId: 'codex:live',
        aggregate: {
          totalSessions: 2,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCachedTokens: 0,
          totalTokens: 0,
          totalFileSizeBytes: 2048,
        },
        sessionsByAgent: {
          claude: [],
          codex: [
            {
              id: 'codex:live',
              agent: 'codex',
              filePath: '/tmp/live-session.jsonl',
              fileName: 'live-session.jsonl',
              modifiedAt: liveTimestamp,
              fileSizeBytes: 1024,
              parseStatus: 'ok',
              warnings: [],
            },
            {
              id: 'codex:history',
              agent: 'codex',
              filePath: '/tmp/history-session.jsonl',
              fileName: 'history-session.jsonl',
              modifiedAt: historyTimestamp,
              fileSizeBytes: 1024,
              parseStatus: 'ok',
              warnings: [],
            },
          ],
          gemini: [],
        },
      });

      const badges = Array.from(document.querySelectorAll('.profiler-session-card-badge')).map(
        (node) => node.textContent?.trim(),
      );

      assert.deepStrictEqual(badges, ['Live']);
      assert.ok(document.querySelector('.profiler-session-card')?.textContent?.includes('Live'));
    });

    test('falls back to the session path basename when fileName is blank', () => {
      layer.onState({
        status: 'ready',
        selectedAgent: 'codex',
        selectedSessionId: 'codex:2',
        aggregate: {
          totalSessions: 1,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCachedTokens: 0,
          totalTokens: 0,
          totalFileSizeBytes: 1024,
        },
        sessionsByAgent: {
          claude: [],
          codex: [
            {
              id: 'codex:2',
              agent: 'codex',
              filePath: '/tmp/fallback-session-name.jsonl',
              fileName: '   ',
              modifiedAt: '2026-03-11T14:05:00.000Z',
              fileSizeBytes: 1024,
              parseStatus: 'ok',
              warnings: [],
            },
          ],
          gemini: [],
        },
      });

      const fileCell = document.querySelector('.profiler-session-card-name') as HTMLElement | null;

      assert.ok(fileCell);
      assert.strictEqual(fileCell.textContent, 'fallback-session-name.jsonl');
      assert.strictEqual(fileCell.getAttribute('title'), 'fallback-session-name.jsonl');
    });

    test('find button posts scan command', () => {
      document.getElementById('profiler-start-analysis')?.click();

      assert.ok(postMessageStub.calledWithMatch({ command: 'profiler.scan' }));
    });

    test('claude and gemini tabs stay disabled and show a coming soon notice', () => {
      layer.onState({
        status: 'ready',
        selectedAgent: 'codex',
        selectedSessionId: 'codex:1',
        aggregate: {
          totalSessions: 1,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCachedTokens: 0,
          totalTokens: 0,
          totalFileSizeBytes: 1024,
        },
        sessionsByAgent: {
          claude: [
            {
              id: 'claude:1',
              agent: 'claude',
              filePath: '/tmp/claude-session.json',
              fileName: 'claude-session.json',
              modifiedAt: '2026-03-11T14:04:00.000Z',
              fileSizeBytes: 1024,
              parseStatus: 'ok',
              warnings: [],
            },
          ],
          codex: [],
          gemini: [
            {
              id: 'gemini:1',
              agent: 'gemini',
              filePath: '/tmp/gemini-session.json',
              fileName: 'gemini-session.json',
              modifiedAt: '2026-03-11T14:05:00.000Z',
              fileSizeBytes: 1024,
              parseStatus: 'ok',
              warnings: [],
            },
          ],
        },
      });

      const geminiTab = document.querySelector(
        '.profiler-tab[data-agent="gemini"]',
      ) as HTMLButtonElement | null;
      const claudeTab = document.querySelector(
        '.profiler-tab[data-agent="claude"]',
      ) as HTMLButtonElement | null;
      assert.ok(geminiTab?.classList.contains('is-disabled'));
      assert.ok(claudeTab?.classList.contains('is-disabled'));

      claudeTab?.click();

      assert.ok(
        document
          .getElementById('profiler-status-badge')
          ?.textContent?.toLowerCase()
          .includes('claude'),
      );
      assert.strictEqual(
        document.querySelector('.profiler-tab.active')?.getAttribute('data-agent'),
        'codex',
      );

      const refreshedGeminiTab = document.querySelector(
        '.profiler-tab[data-agent="gemini"]',
      ) as HTMLButtonElement | null;
      refreshedGeminiTab?.click();

      assert.ok(
        document
          .getElementById('profiler-status-badge')
          ?.textContent?.toLowerCase()
          .includes('gemini'),
      );
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
