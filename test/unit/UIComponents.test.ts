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
      assert.strictEqual((document.getElementById('model-select') as HTMLSelectElement).value, 'm1');
      assert.ok(document.getElementById('agent-status')?.textContent?.includes('m1'));
    });

    test('onState logic', () => {
        layer.onState('claude', 'opus', true);
        assert.strictEqual((document.getElementById('agent-select') as HTMLSelectElement).value, 'claude');
        assert.ok(postMessageStub.calledWithMatch({ command: 'agent.listModels', agent: 'claude' }));
    });

    test('onSettingsCleared logic', () => {
        layer.onSettingsCleared('claude');
        assert.strictEqual((document.getElementById('agent-select') as HTMLSelectElement).value, 'gemini');
    });

    test('click handlers and auto load', (done) => {
        document.getElementById('link-get-api-key')?.click();
        assert.ok(postMessageStub.calledWithMatch({ command: 'agent.getApiKeyHelp' }));

        const input = document.getElementById('api-key-input') as HTMLInputElement;
        input.value = '1234567890123456';
        input.dispatchEvent(new window.Event('input'));
        
        setTimeout(() => {
            assert.ok(postMessageStub.calledWithMatch({ command: 'agent.listModels' }));
            done();
        }, 800);
    });

    test('onSaveRequested and onClearRequested', () => {
        layer.onSaveRequested(); // Should show notice if no model
        assert.ok(document.getElementById('agent-notice')?.textContent?.includes('선택'));

        layer.onClearRequested();
        assert.ok(postMessageStub.calledWithMatch({ command: 'agent.clearSettings' }));
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

    test('onStatus handles methods and error', () => {
      layer.onStatus(true, ['tool1', 'tool2'], undefined);
      const text = document.getElementById('figma-status-text');
      assert.ok(text?.textContent?.includes('2 tools'));
      assert.ok(document.getElementById('figma-tool-list')?.innerHTML.includes('tool1'));

      layer.onStatus(false, [], 'Connect error');
      const notice = document.getElementById('figma-notice');
      assert.ok(notice?.textContent?.includes('error'));
    });

    test('onDataResult and onScreenshotResult', () => {
        layer.onDataResult({ foo: 'bar' });
        assert.ok(document.getElementById('figma-data-preview')?.textContent?.includes('bar'));

        layer.onScreenshotResult('base64');
        const img = document.getElementById('figma-screenshot-preview') as HTMLImageElement;
        assert.ok(img.src.includes('base64'));
    });

    test('onError calls setNotice', () => {
        layer.onError('some error');
        const notice = document.getElementById('figma-notice');
        assert.strictEqual(notice?.textContent, 'some error');
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
        message: 'hello'
      });
      const area = document.getElementById('log-area');
      assert.ok(area?.textContent?.includes('hello'));
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
      const bar = document.getElementById('prompt-progress-fill');
      assert.ok(bar);
      assert.strictEqual(bar?.style.width, '50%');
    });

    test('onResult updates generated code', () => {
      layer.onResult('const x = 1;');
      const area = document.getElementById('code-output') as HTMLPreElement;
      assert.strictEqual(area.textContent, 'const x = 1;');
    });

    test('onError updates output and notice', () => {
        layer.onError('bad things');
        const area = document.getElementById('code-output');
        assert.ok(area?.textContent?.includes('bad things'));
        const notice = document.getElementById('prompt-notice');
        assert.strictEqual(notice?.textContent, 'bad things');
    });

    test('onChunk appends text', () => {
        layer.onChunk('hello ');
        layer.onChunk('world');
        const area = document.getElementById('code-output');
        assert.strictEqual(area?.textContent, 'hello world');
    });

    test('buttons: open and save', () => {
        layer.onResult('code');
        document.getElementById('btn-open-editor')?.click();
        assert.ok(postMessageStub.calledWithMatch({ command: 'editor.open' }));

        document.getElementById('btn-save-file')?.click();
        assert.ok(postMessageStub.calledWithMatch({ command: 'editor.saveFile' }));
    });

    test('onGenerateRequested validation', () => {
        (document.getElementById('use-user-prompt') as HTMLInputElement).checked = false;
        (document.getElementById('use-mcp-data') as HTMLInputElement).checked = false;
        layer.onGenerateRequested();
        assert.ok(postMessageStub.calledWithMatch({ command: 'prompt.generate' }));
    });
  });
});

suite('UI Main Initialization', () => {
    setup(() => {
        document.body.innerHTML = '<div id="app"></div>';
        document.body.dataset.section = 'figma';
        // Clear cache for main.ts to re-run init()
        delete require.cache[require.resolve('../../src/webview/ui/main')];
    });

    test('init runs based on section', () => {
        require('../../src/webview/ui/main');
        const app = document.getElementById('app');
        assert.ok(app?.innerHTML.includes('panel'));
    });
});
