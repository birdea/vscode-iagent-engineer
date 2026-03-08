import { vscode } from '../vscodeApi';
import { OutputFormat, PromptPayload } from '../../../types';
import { getDocumentLocale, t, UiLocale } from '../../../i18n';

export class PromptLayer {
  private generatedCode = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isGenerating = false;
  private requestId: string | null = null;
  private readonly locale: UiLocale = getDocumentLocale();
  private pendingChunks: string[] = [];
  private rafPending = false;

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
    <textarea id="user-prompt" placeholder="${this.msg('prompt.placeholder')}"></textarea>
  </div>
  <details class="minimal-options">
    <summary>${this.msg('prompt.options')}</summary>
    <div class="field-group stack-gap-sm">
      <div class="checkbox-row">
        <input type="checkbox" id="use-user-prompt" checked />
        <label for="use-user-prompt" class="label-inline">${this.msg('prompt.includeUserPrompt')}</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="use-mcp-data" checked />
        <label for="use-mcp-data" class="label-inline">${this.msg('prompt.includeMcpData')}</label>
      </div>
    </div>
    <div class="field-group stack-gap-sm">
      <label for="output-format">${this.msg('prompt.outputFormat')}</label>
      <select id="output-format">
        <option value="tsx">TSX (React)</option>
        <option value="html">HTML</option>
        <option value="scss">SCSS</option>
        <option value="tailwind">Tailwind CSS</option>
        <option value="kotlin">Kotlin (Compose)</option>
      </select>
    </div>
  </details>
  <div class="progress-row stack-gap-sm">
    <span class="token-estimate" id="token-estimate">0.0KB / ~0 tok</span>
    <progress class="progress-track" id="prompt-progress" max="100" value="0" aria-label="${this.msg('prompt.progress.aria')}"></progress>
  </div>
  <div class="btn-row">
    <button class="primary" id="btn-generate"><i class="codicon codicon-play"></i>${this.msg('prompt.generate')}</button>
    <button class="secondary hidden" id="btn-cancel-generate"><i class="codicon codicon-debug-stop"></i>${this.msg('prompt.cancel')}</button>
  </div>
  <div class="notice hidden" id="prompt-notice"></div>
</section>
<section class="panel panel-compact">
  <div class="panel-title">${this.msg('prompt.resultTitle')}</div>
  <div class="btn-row hidden stack-gap-sm" id="code-actions">
    <button class="primary" id="btn-open-editor"><i class="codicon codicon-go-to-file"></i>${this.msg('prompt.openEditor')}</button>
    <button class="secondary" id="btn-save-file"><i class="codicon codicon-save"></i>${this.msg('prompt.saveFile')}</button>
  </div>
  <pre class="code-output" id="code-output"></pre>
</section>
`;
  }

  mount() {
    const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement;
    const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement;
    const useUserPromptEl = document.getElementById('use-user-prompt') as HTMLInputElement;
    const useMcpDataEl = document.getElementById('use-mcp-data') as HTMLInputElement;

    userPromptEl?.addEventListener('input', () => this.updateEstimate());
    useUserPromptEl?.addEventListener('change', () => {
      this.syncPromptInputState();
      this.updateEstimate();
    });
    useMcpDataEl?.addEventListener('change', () => this.updateEstimate());
    outputFormatEl?.addEventListener('change', () => this.updateEstimate());
    document
      .getElementById('btn-generate')
      ?.addEventListener('click', () => this.onGenerateRequested());
    document
      .getElementById('btn-cancel-generate')
      ?.addEventListener('click', () => this.onCancelRequested());

    document.getElementById('btn-open-editor')?.addEventListener('click', () => {
      if (this.generatedCode) {
        const format = outputFormatEl.value as OutputFormat;
        vscode.postMessage({
          command: 'editor.open',
          code: this.generatedCode,
          language: this.toVsCodeLanguage(format),
        });
      }
    });

    document.getElementById('btn-save-file')?.addEventListener('click', () => {
      if (this.generatedCode) {
        const format = outputFormatEl.value;
        const ext =
          format === 'tsx'
            ? 'tsx'
            : format === 'scss'
              ? 'scss'
              : format === 'kotlin'
                ? 'kt'
                : 'html';
        vscode.postMessage({
          command: 'editor.saveFile',
          code: this.generatedCode,
          filename: `generated.${ext}`,
        });
      }
    });

    this.syncPromptInputState();
    this.updateEstimate();
  }

  onGenerateRequested() {
    if (this.isGenerating) {
      this.setNotice('warn', this.msg('prompt.notice.alreadyGenerating'));
      return;
    }

    const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
    const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement | null;
    const useUserPromptEl = document.getElementById('use-user-prompt') as HTMLInputElement | null;
    const useMcpDataEl = document.getElementById('use-mcp-data') as HTMLInputElement | null;
    if (!userPromptEl || !outputFormatEl || !useUserPromptEl || !useMcpDataEl) {
      return;
    }

    const payload: PromptPayload = {
      userPrompt: useUserPromptEl.checked ? userPromptEl.value.trim() : undefined,
      mcpData: useMcpDataEl.checked ? undefined : null,
      outputFormat: outputFormatEl.value as OutputFormat,
      requestId: this.nextRequestId(),
    };

    const codeOutput = document.getElementById('code-output') as HTMLPreElement | null;
    if (codeOutput) {
      codeOutput.textContent = '';
      codeOutput.classList.add('visible');
    }
    const codeActions = document.getElementById('code-actions');
    if (codeActions) {
      codeActions.classList.add('hidden');
    }
    this.generatedCode = '';
    this.requestId = payload.requestId ?? null;
    this.setNotice('info', this.msg('prompt.notice.starting'));
    this.setGeneratingState(true);
    this.onGenerating(0);

    vscode.postMessage({ command: 'prompt.generate', payload });
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
      const useUserPromptEl = document.getElementById('use-user-prompt') as HTMLInputElement | null;
      const useMcpDataEl = document.getElementById('use-mcp-data') as HTMLInputElement | null;
      const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
      const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement | null;
      const estimateEl = document.getElementById('token-estimate');

      if (!useUserPromptEl || !useMcpDataEl || !userPromptEl || !outputFormatEl || !estimateEl)
        return;

      estimateEl.textContent = this.msg('prompt.notice.calculating');

      const payload: PromptPayload = {
        userPrompt: useUserPromptEl.checked ? userPromptEl.value.trim() : undefined,
        mcpData: useMcpDataEl.checked ? undefined : null,
        outputFormat: outputFormatEl.value as OutputFormat,
      };

      vscode.postMessage({ command: 'prompt.estimate', payload });
    }, 300);
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
    this.generatedCode += text;
    this.pendingChunks.push(text);
    if (!this.rafPending) {
      this.rafPending = true;
      const flush = () => {
        const codeOutput = document.getElementById('code-output') as HTMLPreElement | null;
        if (codeOutput && this.pendingChunks.length > 0) {
          codeOutput.insertAdjacentText('beforeend', this.pendingChunks.join(''));
          codeOutput.scrollTop = codeOutput.scrollHeight;
        }
        this.pendingChunks = [];
        this.rafPending = false;
      };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(flush);
      } else {
        setTimeout(flush, 0);
      }
    }
  }

  onStreaming(progress: number, text?: string) {
    this.onGenerating(progress);
    if (text) {
      this.onChunk(text);
    }
  }

  onResult(code: string, complete = true, message?: string, progress?: number) {
    this.generatedCode = code;
    const codeOutput = document.getElementById('code-output') as HTMLPreElement;
    if (codeOutput) {
      codeOutput.textContent = code;
      codeOutput.classList.add('visible');
    }
    const actions = document.getElementById('code-actions');
    if (actions) actions.classList.remove('hidden');
    if (complete) {
      this.onGenerating(100);
    } else {
      this.setProgressState(progress ?? 0, this.msg('prompt.status.incomplete'));
    }
    this.setGeneratingState(false);
    this.setNotice(
      complete ? 'success' : 'warn',
      message ??
        (complete ? this.msg('prompt.notice.completed') : this.msg('prompt.notice.incomplete')),
    );
  }

  onError(message: string, code?: 'cancelled' | 'failed') {
    const actions = document.getElementById('code-actions');
    if (actions) actions.classList.add('hidden');

    this.setGeneratingState(false);
    this.onGenerating(0);
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

  private setNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    const notice = document.getElementById('prompt-notice');
    if (!notice) return;
    notice.className = `notice ${level}`;
    notice.textContent = message;
  }

  private syncPromptInputState() {
    const useUserPromptEl = document.getElementById('use-user-prompt') as HTMLInputElement | null;
    const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
    if (!useUserPromptEl || !userPromptEl) return;
    userPromptEl.disabled = !useUserPromptEl.checked;
  }

  private nextRequestId(): string {
    return `prompt-${Date.now()}`;
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

  private toVsCodeLanguage(format: OutputFormat): string {
    switch (format) {
      case 'tsx':
        return 'typescriptreact';
      case 'html':
      case 'tailwind':
        return 'html';
      case 'scss':
        return 'scss';
      case 'kotlin':
        return 'kotlin';
      default:
        return 'plaintext';
    }
  }
}
