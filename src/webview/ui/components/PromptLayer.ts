import { vscode } from '../vscodeApi';
import { LogEntry, OutputFormat, PromptPayload } from '../../../types';
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
  private readonly locale: UiLocale = getDocumentLocale();

  render(): string {
    return `
<section class="panel panel-compact">
  <div class="section-heading">
      <div>
      <div class="panel-title">${this.msg('prompt.title')}</div>
      <div class="section-status" id="prompt-progress-text">${this.msg('prompt.status.ready')}</div>
    </div>
  </div>
  <div class="field-group">
    <textarea id="user-prompt" class="prompt-template-textarea">${DEFAULT_PROMPT_TEXT}</textarea>
  </div>
  <details class="minimal-options">
    <summary>${this.msg('prompt.options')}<i class="codicon codicon-chevron-right options-toggle-icon"></i></summary>
    <div class="field-group stack-gap-sm">
      <div class="checkbox-row">
        <input type="checkbox" id="use-mcp-data" checked />
        <label for="use-mcp-data" class="label-inline">${this.msg('prompt.includeMcpData')}</label>
      </div>
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
  </details>
  <div class="progress-row stack-gap-sm">
    <span class="token-estimate" id="token-estimate">0.0KB / ~0 tok</span>
    <progress class="progress-track" id="prompt-progress" max="100" value="0" aria-label="${this.msg('prompt.progress.aria')}"></progress>
  </div>
  <div class="prompt-action-group">
    <div class="btn-row">
      <button class="primary" id="btn-generate"><i class="codicon codicon-play"></i>${this.msg('prompt.generate')}</button>
      <button class="secondary hidden" id="btn-cancel-generate"><i class="codicon codicon-debug-stop"></i>${this.msg('prompt.cancel')}</button>
    </div>
    <div class="btn-row prompt-secondary-actions">
      <button class="secondary button-pseudo-disabled" id="btn-open-generated-editor" aria-disabled="true"><i class="codicon codicon-file-code"></i>${this.msg('prompt.openGeneratedEditor')}</button>
      <button class="secondary button-pseudo-disabled" id="btn-preview-open-panel" aria-disabled="true"><i class="codicon codicon-go-to-file"></i>${this.msg('prompt.preview.openPanel')}</button>
      <button class="secondary button-pseudo-disabled" id="btn-preview-open-browser" aria-disabled="true"><i class="codicon codicon-globe"></i>${this.msg('prompt.preview.openBrowser')}</button>
    </div>
  </div>
  <div class="notice hidden" id="prompt-notice"></div>
  <details class="minimal-options stack-gap-sm" id="prompt-log-panel" open>
    <summary>${this.msg('prompt.log.title')}</summary>
    <div class="log-shell">
      <pre class="log-terminal prompt-log-terminal" id="prompt-log-area"></pre>
    </div>
  </details>
</section>
`;
  }

  mount() {
    const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement;
    const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement;
    const useMcpDataEl = document.getElementById('use-mcp-data') as HTMLInputElement;
    const useScreenshotDataEl = document.getElementById('use-screenshot-data') as HTMLInputElement;

    userPromptEl?.addEventListener('input', () => this.updateEstimate());
    useMcpDataEl?.addEventListener('change', () => this.updateEstimate());
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
    this.updateEstimate();
  }

  onGenerateRequested() {
    if (this.isGenerating) {
      this.setNotice('warn', this.msg('prompt.notice.alreadyGenerating'));
      return;
    }

    const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
    const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement | null;
    const useMcpDataEl = document.getElementById('use-mcp-data') as HTMLInputElement | null;
    const useScreenshotDataEl = document.getElementById(
      'use-screenshot-data',
    ) as HTMLInputElement | null;
    if (
      !userPromptEl ||
      !outputFormatEl ||
      !useMcpDataEl ||
      !useScreenshotDataEl
    ) {
      return;
    }

    const payload: PromptPayload = {
      userPrompt: userPromptEl.value.trim(),
      mcpData: useMcpDataEl.checked ? undefined : null,
      screenshotData: useScreenshotDataEl.checked ? undefined : null,
      outputFormat: outputFormatEl.value as OutputFormat,
      requestId: this.nextRequestId(),
    };

    this.clearLog();
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
    this.setNotice('info', this.msg('prompt.preview.openedPanel'));
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
    this.setNotice('info', this.msg('prompt.preview.openedBrowser'));
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
      const useMcpDataEl = document.getElementById('use-mcp-data') as HTMLInputElement | null;
      const useScreenshotDataEl = document.getElementById(
        'use-screenshot-data',
      ) as HTMLInputElement | null;
      const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
      const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement | null;
      const estimateEl = document.getElementById('token-estimate');

      if (
        !useMcpDataEl ||
        !useScreenshotDataEl ||
        !userPromptEl ||
        !outputFormatEl ||
        !estimateEl
      )
        return;

      estimateEl.textContent = this.msg('prompt.notice.calculating');

      const payload: PromptPayload = {
        userPrompt: userPromptEl.value.trim(),
        mcpData: useMcpDataEl.checked ? undefined : null,
        screenshotData: useScreenshotDataEl.checked ? undefined : null,
        outputFormat: outputFormatEl.value as OutputFormat,
      };

      vscode.postMessage({ command: 'prompt.estimate', payload });
    }, DEBOUNCE_MS);
  }

  onEstimateResult(tokens: number, kb: number) {
    const estimateEl = document.getElementById('token-estimate');
    if (!estimateEl) return;
    const kbStr = kb.toFixed(1);
    const tokStr = tokens.toLocaleString();
    estimateEl.textContent = `${kbStr}KB / ~${tokStr} tok`;
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

  appendLog(entry: LogEntry) {
    const area = document.getElementById('prompt-log-area') as HTMLPreElement | null;
    if (!area) return;

    const line = this.formatLogEntry(entry);
    area.textContent = `${area.textContent ?? ''}${area.textContent ? '\n' : ''}${line}`;
    area.scrollTop = area.scrollHeight;
  }

  clearLog() {
    const area = document.getElementById('prompt-log-area');
    if (area) {
      area.textContent = '';
    }
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
    const previewEl = document.getElementById('format-prompt-preview') as HTMLTextAreaElement | null;
    if (!previewEl) return;
    previewEl.value = getFormatPromptPreview(format);
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

  private formatLogEntry(entry: LogEntry): string {
    const lines = [
      `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.layer}] ${entry.message}`,
    ];
    if (entry.detail) {
      lines.push(`  ${entry.detail}`);
    }
    return lines.join('\n');
  }
}
