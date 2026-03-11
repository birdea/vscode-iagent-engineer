import { vscode } from '../vscodeApi';
import {
  AgentType,
  ModelInfo,
  OutputFormat,
  PromptMcpDataKind,
  PromptPayload,
} from '../../../types';
import { getDocumentLocale, t, UiLocale } from '../../../i18n';
import { DEBOUNCE_MS } from '../../../constants';
import { DEFAULT_PROMPT_TEXT, getFormatPromptPreview } from '../../../prompt/PromptBuilder';

export class PromptLayer {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isGenerating = false;
  private previewReady = false;
  private requestId: string | null = null;
  private lastCode = '';
  private lastFormat: OutputFormat | undefined;
  private currentAgent: AgentType = 'gemini';
  private currentModel = '';
  private modelCatalog: ModelInfo[] = [];
  private readonly locale: UiLocale = getDocumentLocale();
  private readonly requestAgentState = () => {
    vscode.postMessage({ command: 'agent.getState' });
  };
  private readonly handleVisibilityChange = () => {
    if (!document.hidden) {
      this.requestAgentState();
    }
  };

  render(): string {
    return `
<section class="panel panel-compact">
  <div class="section-heading">
    <div>
      <div class="panel-title">${this.msg('prompt.title')}</div>
    </div>
  </div>
  <details class="minimal-options" open>
    <summary>${this.msg('prompt.options')}<i class="codicon codicon-chevron-right options-toggle-icon"></i></summary>
    <div class="field-group stack-gap-sm">
      <label>${this.msg('prompt.includeMcpData')}</label>
      <div class="choice-grid">
        <label class="choice-card" for="use-design-context">
          <input type="radio" id="use-design-context" name="prompt-mcp-data-kind" value="designContext" checked />
          <span>${this.msg('prompt.includeDesignContext')}</span>
        </label>
        <label class="choice-card" for="use-metadata">
          <input type="radio" id="use-metadata" name="prompt-mcp-data-kind" value="metadata" />
          <span>${this.msg('prompt.includeMetadata')}</span>
        </label>
      </div>
    </div>
    <div class="field-group stack-gap-sm">
      <div class="checkbox-row">
        <input type="checkbox" id="use-screenshot-data" checked />
        <label for="use-screenshot-data" class="label-inline">${this.msg('prompt.includeScreenshotData')}</label>
      </div>
    </div>
    <div class="field-group stack-gap-sm">
      <label for="output-format">${this.msg('prompt.outputFormat')}</label>
      <select id="output-format">
        <option value="tsx">TSX (React)</option>
        <option value="html">HTML</option>
        <option value="vue">Vue 3 (SFC)</option>
        <option value="tailwind">Tailwind CSS</option>
      </select>
    </div>
    <div class="field-group stack-gap-sm">
      <label for="format-prompt-preview">${this.msg('prompt.outputFormatPrompt')}</label>
      <textarea id="format-prompt-preview" class="prompt-format-preview" readonly>${getFormatPromptPreview('tsx')}</textarea>
    </div>
    <div class="field-group stack-gap-sm">
      <label for="user-prompt">${this.msg('prompt.userPrompt')}</label>
      <textarea id="user-prompt" class="prompt-template-textarea">${DEFAULT_PROMPT_TEXT}</textarea>
    </div>
  </details>
  <div class="prompt-metrics stack-gap-sm" id="token-estimate">
    <div class="prompt-metric-card">
      <span class="prompt-metric-label">${this.msg('prompt.metrics.data')}</span>
      <strong class="prompt-metric-value" id="prompt-data-size">0.0KB</strong>
    </div>
    <div class="prompt-metric-card">
      <span class="prompt-metric-label">${this.msg('prompt.metrics.estimate')}</span>
      <strong class="prompt-metric-value" id="prompt-estimated-tokens">~0 tok</strong>
    </div>
    <div class="prompt-metric-card">
      <span class="prompt-metric-label">${this.msg('prompt.metrics.maxInput')}</span>
      <strong class="prompt-metric-value" id="prompt-model-max-input-tokens">-</strong>
    </div>
    <div class="prompt-metric-card">
      <span class="prompt-metric-label">${this.msg('prompt.metrics.maxOutput')}</span>
      <strong class="prompt-metric-value" id="prompt-model-max-output-tokens">-</strong>
    </div>
    <div class="prompt-metric-card">
      <span class="prompt-metric-label">${this.msg('prompt.metrics.contextWindow')}</span>
      <strong class="prompt-metric-value" id="prompt-model-context-window">-</strong>
    </div>
  </div>
  <div class="prompt-action-group">
    <div class="prompt-primary-toolbar">
      <div class="btn-row prompt-generate-buttons">
        <button class="primary" id="btn-generate"><i class="codicon codicon-play"></i>${this.msg('prompt.generate')}</button>
        <button class="secondary hidden" id="btn-cancel-generate"><i class="codicon codicon-debug-stop"></i>${this.msg('prompt.cancel')}</button>
      </div>
      <div class="prompt-generate-status">
        <div class="section-status prompt-inline-status" id="prompt-progress-text">${this.msg('prompt.status.ready')}</div>
        <progress class="progress-track" id="prompt-progress" max="100" value="0" aria-label="${this.msg('prompt.progress.aria')}"></progress>
      </div>
    </div>
    <div class="btn-row prompt-secondary-actions">
      <button class="secondary button-pseudo-disabled" id="btn-open-generated-editor" aria-disabled="true"><i class="codicon codicon-file-code"></i>${this.msg('prompt.openGeneratedEditor')}</button>
      <button class="secondary button-pseudo-disabled" id="btn-preview-open-panel" aria-disabled="true"><i class="codicon codicon-go-to-file"></i>${this.msg('prompt.preview.openPanel')}</button>
      <button class="secondary button-pseudo-disabled" id="btn-preview-open-browser" aria-disabled="true"><i class="codicon codicon-globe"></i>${this.msg('prompt.preview.openBrowser')}</button>
    </div>
  </div>
  <div class="notice hidden" id="prompt-notice"></div>
</section>
`;
  }

  mount() {
    const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement;
    const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement;
    const useScreenshotDataEl = document.getElementById('use-screenshot-data') as HTMLInputElement;
    const mcpDataKindEls = document.querySelectorAll<HTMLInputElement>(
      'input[name="prompt-mcp-data-kind"]',
    );

    userPromptEl?.addEventListener('input', () => this.updateEstimate());
    mcpDataKindEls.forEach((el) => el.addEventListener('change', () => this.updateEstimate()));
    useScreenshotDataEl?.addEventListener('change', () => this.updateEstimate());
    outputFormatEl?.addEventListener('change', () => {
      this.updateFormatPromptPreview(outputFormatEl.value as OutputFormat);
      this.updateEstimate();
    });
    document
      .getElementById('btn-generate')
      ?.addEventListener('click', () => this.onGenerateRequested());
    document
      .getElementById('btn-open-generated-editor')
      ?.addEventListener('click', () => this.onOpenGeneratedEditorRequested());
    document
      .getElementById('btn-preview-open-panel')
      ?.addEventListener('click', () => this.onOpenPreviewPanelRequested());
    document
      .getElementById('btn-preview-open-browser')
      ?.addEventListener('click', () => this.onOpenBrowserPreviewRequested());
    document
      .getElementById('btn-cancel-generate')
      ?.addEventListener('click', () => this.onCancelRequested());

    this.updatePreviewButtonState();
    this.updateFormatPromptPreview((outputFormatEl?.value as OutputFormat | undefined) ?? 'tsx');
    this.refreshModelMetrics();
    this.updateEstimate();
    this.requestAgentState();
    window.addEventListener('focus', this.requestAgentState);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  onGenerateRequested() {
    if (this.isGenerating) {
      this.setNotice('warn', this.msg('prompt.notice.alreadyGenerating'));
      return;
    }

    const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
    const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement | null;
    const useScreenshotDataEl = document.getElementById(
      'use-screenshot-data',
    ) as HTMLInputElement | null;
    const mcpDataKind = this.getSelectedMcpDataKind();
    if (!userPromptEl || !outputFormatEl || !useScreenshotDataEl || !mcpDataKind) {
      return;
    }

    const payload: PromptPayload = {
      userPrompt: userPromptEl.value.trim(),
      mcpDataKind,
      screenshotData: useScreenshotDataEl.checked ? undefined : null,
      outputFormat: outputFormatEl.value as OutputFormat,
      requestId: this.nextRequestId(),
    };

    this.lastCode = '';
    this.lastFormat = payload.outputFormat;
    this.previewReady = false;
    this.requestId = payload.requestId ?? null;
    this.setNotice('info', this.msg('prompt.notice.starting'));
    this.setGeneratingState(true);
    this.onGenerating(0);
    this.updatePreviewButtonState();

    vscode.postMessage({ command: 'prompt.generate', payload });
  }

  onOpenPreviewPanelRequested() {
    if (this.isGenerating) {
      this.setNotice('info', this.msg('prompt.preview.generating'));
      return;
    }

    const code = this.lastCode.trim() ? this.lastCode : '';
    if (!code) {
      this.setNotice('warn', this.msg('prompt.preview.empty'));
      return;
    }

    vscode.postMessage({ command: 'preview.openPanel', format: this.lastFormat });
    this.setNotice('info', this.msg('prompt.preview.openingPanel'));
  }

  onOpenBrowserPreviewRequested() {
    if (this.isGenerating) {
      this.setNotice('info', this.msg('prompt.preview.generating'));
      return;
    }

    const code = this.lastCode.trim() ? this.lastCode : '';
    if (!code) {
      this.setNotice('warn', this.msg('prompt.preview.empty'));
      return;
    }

    vscode.postMessage({ command: 'preview.openBrowser', format: this.lastFormat });
    this.setNotice('info', this.msg('prompt.preview.openingBrowser'));
  }

  onOpenGeneratedEditorRequested() {
    if (this.isGenerating) {
      this.setNotice('info', this.msg('prompt.preview.generating'));
      return;
    }

    const code = this.lastCode.trim() ? this.lastCode : '';
    if (!code) {
      this.setNotice('warn', this.msg('prompt.preview.empty'));
      return;
    }

    vscode.postMessage({ command: 'editor.openGeneratedResult' });
    this.setNotice('info', this.msg('prompt.openGeneratedEditorOpened'));
  }

  onCancelRequested() {
    if (!this.isGenerating) {
      this.setNotice('warn', this.msg('prompt.notice.noneInProgress'));
      return;
    }
    vscode.postMessage({ command: 'prompt.cancel', requestId: this.requestId ?? undefined });
    this.setNotice('info', this.msg('prompt.notice.cancelling'));
  }

  private updateEstimate() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const useScreenshotDataEl = document.getElementById(
        'use-screenshot-data',
      ) as HTMLInputElement | null;
      const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
      const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement | null;
      const mcpDataKind = this.getSelectedMcpDataKind();

      if (!useScreenshotDataEl || !userPromptEl || !outputFormatEl || !mcpDataKind) return;

      this.setEstimateDisplay(
        this.msg('prompt.notice.calculating'),
        this.msg('prompt.notice.calculating'),
      );

      const payload: PromptPayload = {
        userPrompt: userPromptEl.value.trim(),
        mcpDataKind,
        screenshotData: useScreenshotDataEl.checked ? undefined : null,
        outputFormat: outputFormatEl.value as OutputFormat,
      };

      vscode.postMessage({ command: 'prompt.estimate', payload });
    }, DEBOUNCE_MS);
  }

  onEstimateResult(tokens: number, kb: number) {
    this.setEstimateDisplay(`${kb.toFixed(1)}KB`, `~${tokens.toLocaleString()} tok`);
  }

  onAgentState(agent: AgentType, model: string, hasApiKey: boolean) {
    this.currentAgent = agent;
    this.currentModel = model;
    this.modelCatalog = [];
    this.refreshModelMetrics();
    if (hasApiKey) {
      vscode.postMessage({ command: 'agent.listModels', agent });
    }
  }

  onModelsResult(models: ModelInfo[]) {
    this.modelCatalog = models;
    this.refreshModelMetrics();
  }

  onGenerating(progress: number) {
    const safeProgress = Math.max(0, Math.min(100, progress));
    this.setProgressState(
      safeProgress,
      safeProgress >= 100
        ? this.msg('prompt.status.completed')
        : this.msg('prompt.status.generating', { progress: safeProgress }),
    );
  }

  onChunk(text: string) {
    this.lastCode += text;
    this.updatePreviewButtonState();
  }

  onStreaming(progress: number, text?: string) {
    this.onGenerating(progress);
    if (text) {
      this.onChunk(text);
    }
  }

  onResult(
    code: string,
    format?: OutputFormat,
    complete = true,
    message?: string,
    progress?: number,
  ) {
    this.lastCode = code;
    this.lastFormat = format;
    if (complete) {
      this.onGenerating(100);
      this.previewReady = true;
    } else {
      this.setProgressState(progress ?? 0, this.msg('prompt.status.incomplete'));
      this.previewReady = false;
    }
    this.setGeneratingState(false);
    this.updatePreviewButtonState();
    this.setNotice(
      complete ? 'success' : 'warn',
      message ??
        (complete ? this.msg('prompt.notice.completed') : this.msg('prompt.notice.incomplete')),
    );
  }

  onError(message: string, code?: 'cancelled' | 'failed') {
    this.setGeneratingState(false);
    this.onGenerating(0);
    this.previewReady = false;
    this.updatePreviewButtonState();
    this.setNotice(code === 'cancelled' ? 'warn' : 'error', message);
  }

  private setProgressState(progress: number, statusText: string) {
    const progressBar = document.getElementById('prompt-progress') as HTMLProgressElement | null;
    const progressText = document.getElementById('prompt-progress-text');

    if (progressBar) {
      progressBar.value = Math.max(0, Math.min(100, progress));
    }
    if (progressText) {
      progressText.textContent = statusText;
    }
  }

  onHostError(message: string) {
    if (this.isGenerating) {
      this.onError(message);
      return;
    }
    this.setNotice('error', this.toFriendlyError(message));
  }

  onPreviewOpened(requested: 'panel' | 'browser', opened: 'panel' | 'browser') {
    if (requested === 'browser' && opened === 'panel') {
      this.setNotice('info', this.msg('prompt.preview.browserFallback'));
      return;
    }

    this.setNotice(
      'success',
      opened === 'browser'
        ? this.msg('prompt.preview.openedBrowser')
        : this.msg('prompt.preview.openedPanel'),
    );
  }

  private setGeneratingState(generating: boolean) {
    this.isGenerating = generating;
    const generateBtn = document.getElementById('btn-generate') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('btn-cancel-generate') as HTMLButtonElement | null;
    if (generateBtn) {
      generateBtn.disabled = generating;
    }
    if (cancelBtn) {
      cancelBtn.classList.toggle('hidden', !generating);
      cancelBtn.disabled = !generating;
    }
    if (!generating) {
      this.requestId = null;
    }
  }

  private updatePreviewButtonState() {
    const previewPanelBtn = document.getElementById(
      'btn-preview-open-panel',
    ) as HTMLButtonElement | null;
    const openEditorBtn = document.getElementById(
      'btn-open-generated-editor',
    ) as HTMLButtonElement | null;
    const previewBrowserBtn = document.getElementById(
      'btn-preview-open-browser',
    ) as HTMLButtonElement | null;
    if (!previewPanelBtn || !previewBrowserBtn || !openEditorBtn) {
      return;
    }

    const enabled = !this.isGenerating && this.previewReady && !!this.lastCode.trim();
    openEditorBtn.classList.toggle('button-pseudo-disabled', !enabled);
    openEditorBtn.setAttribute('aria-disabled', String(!enabled));
    previewPanelBtn.classList.toggle('button-pseudo-disabled', !enabled);
    previewPanelBtn.setAttribute('aria-disabled', String(!enabled));
    previewBrowserBtn.classList.toggle('button-pseudo-disabled', !enabled);
    previewBrowserBtn.setAttribute('aria-disabled', String(!enabled));
  }

  private setNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    const notice = document.getElementById('prompt-notice');
    if (!notice) return;
    notice.className = `notice ${level}`;
    notice.textContent = message;
  }

  private nextRequestId(): string {
    return `prompt-${Date.now()}`;
  }

  private updateFormatPromptPreview(format: OutputFormat) {
    const previewEl = document.getElementById(
      'format-prompt-preview',
    ) as HTMLTextAreaElement | null;
    if (!previewEl) return;
    previewEl.value = getFormatPromptPreview(format);
  }

  private getSelectedMcpDataKind(): PromptMcpDataKind | null {
    const selected = document.querySelector<HTMLInputElement>(
      'input[name="prompt-mcp-data-kind"]:checked',
    );
    if (!selected) {
      return null;
    }
    return selected.value as PromptMcpDataKind;
  }

  private setEstimateDisplay(dataSize: string, estimatedTokens: string) {
    const dataSizeEl = document.getElementById('prompt-data-size');
    const estimatedTokensEl = document.getElementById('prompt-estimated-tokens');
    if (dataSizeEl) {
      dataSizeEl.textContent = dataSize;
    }
    if (estimatedTokensEl) {
      estimatedTokensEl.textContent = estimatedTokens;
    }
  }

  private refreshModelMetrics() {
    const modelMaxInputTokensEl = document.getElementById('prompt-model-max-input-tokens');
    const modelMaxOutputTokensEl = document.getElementById('prompt-model-max-output-tokens');
    const modelContextWindowEl = document.getElementById('prompt-model-context-window');
    if (!modelMaxInputTokensEl || !modelMaxOutputTokensEl || !modelContextWindowEl) {
      return;
    }

    const modelInfo = this.modelCatalog.find((entry) => entry.id === this.currentModel);
    const maxInputTokens = modelInfo?.inputTokenLimit ?? modelInfo?.contextWindow ?? null;
    const maxOutputTokens = modelInfo?.maxOutputTokens ?? modelInfo?.outputTokenLimit ?? null;
    const contextWindow = modelInfo?.contextWindow ?? modelInfo?.inputTokenLimit ?? null;
    modelMaxInputTokensEl.textContent = maxInputTokens
      ? `${maxInputTokens.toLocaleString()} tok`
      : '-';
    modelMaxOutputTokensEl.textContent = maxOutputTokens
      ? `${maxOutputTokens.toLocaleString()} tok`
      : '-';
    modelContextWindowEl.textContent = contextWindow
      ? `${contextWindow.toLocaleString()} tok`
      : '-';
  }

  private toFriendlyError(message: string): string {
    if (message.includes('No API key')) {
      return this.msg('prompt.error.noApiKey');
    }
    if (message.includes('Generation already in progress')) {
      return this.msg('prompt.error.alreadyInProgress');
    }
    return message;
  }

  private msg(key: string, params?: Record<string, string | number>) {
    return t(this.locale, key, params);
  }
}
