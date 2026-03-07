import { vscode } from '../vscodeApi';
import { OutputFormat, PromptPayload } from '../../../types';

export class PromptLayer {
  private generatedCode = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isGenerating = false;
  private requestId: string | null = null;

  render(): string {
    return `
<div class="panel">
  <div class="panel-title">4단계. 코드 생성</div>
  <div class="description-text">프롬프트와 출력 형식을 정한 뒤 생성하세요.</div>
  <div class="field-group">
    <div class="checkbox-row">
      <input type="checkbox" id="use-user-prompt" checked />
      <label for="use-user-prompt" class="label-inline">사용자 프롬프트 포함</label>
    </div>
    <textarea id="user-prompt" placeholder="추가 지시사항 입력..."></textarea>
  </div>
  <div class="checkbox-row stack-gap-sm">
    <input type="checkbox" id="use-mcp-data" checked />
    <label for="use-mcp-data" class="label-inline">MCP 데이터 포함</label>
  </div>
  <div class="field-group stack-gap-sm">
    <label for="output-format">출력 포맷</label>
    <select id="output-format">
      <option value="tsx">TSX (React)</option>
      <option value="html">HTML</option>
      <option value="scss">SCSS</option>
      <option value="tailwind">Tailwind CSS</option>
      <option value="kotlin">Kotlin (Compose)</option>
    </select>
  </div>
  <div class="token-estimate stack-gap-xs" id="token-estimate">0.0KB / ~0 tok</div>
  <div class="progress-row stack-gap-sm">
    <span class="progress-text" id="prompt-progress-text">준비됨</span>
    <progress class="progress-track" id="prompt-progress" max="100" value="0" aria-label="Prompt generation progress"></progress>
  </div>
  <div class="btn-row stack-gap-sm">
    <button class="primary" id="btn-generate"><i class="codicon codicon-play"></i>생성</button>
    <button class="secondary hidden" id="btn-cancel-generate"><i class="codicon codicon-debug-stop"></i>취소</button>
  </div>
  <div class="notice hidden stack-gap-sm" id="prompt-notice"></div>
</div>
<div class="panel">
  <div class="panel-title">생성 결과</div>
  <div class="btn-row hidden stack-gap-sm" id="code-actions">
    <button class="primary" id="btn-open-editor"><i class="codicon codicon-go-to-file"></i>에디터에서 열기</button>
    <button class="secondary" id="btn-save-file"><i class="codicon codicon-save"></i>파일로 저장</button>
  </div>
  <pre class="code-output" id="code-output"></pre>
</div>
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
    document.getElementById('btn-generate')?.addEventListener('click', () => this.onGenerateRequested());
    document.getElementById('btn-cancel-generate')?.addEventListener('click', () => this.onCancelRequested());

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
      this.setNotice('warn', '이미 생성 중입니다.');
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
    this.setNotice('info', '코드 생성을 시작합니다...');
    this.setGeneratingState(true);
    this.onGenerating(0);

    vscode.postMessage({ command: 'prompt.generate', payload });
  }

  onCancelRequested() {
    if (!this.isGenerating) {
      this.setNotice('warn', '진행 중인 코드 생성이 없습니다.');
      return;
    }
    vscode.postMessage({ command: 'prompt.cancel', requestId: this.requestId ?? undefined });
    this.setNotice('info', '코드 생성을 취소하는 중입니다...');
  }

  private updateEstimate() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const useUserPromptEl = document.getElementById('use-user-prompt') as HTMLInputElement | null;
      const useMcpDataEl = document.getElementById('use-mcp-data') as HTMLInputElement | null;
      const userPromptEl = document.getElementById('user-prompt') as HTMLTextAreaElement | null;
      const outputFormatEl = document.getElementById('output-format') as HTMLSelectElement | null;
      const estimateEl = document.getElementById('token-estimate');

      if (!useUserPromptEl || !useMcpDataEl || !userPromptEl || !outputFormatEl || !estimateEl) return;

      estimateEl.textContent = '계산 중...';

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
    const progressBar = document.getElementById('prompt-progress') as HTMLProgressElement | null;
    const progressText = document.getElementById('prompt-progress-text');

    if (progressBar) {
      progressBar.value = safeProgress;
    }
    if (progressText) {
      progressText.textContent = safeProgress >= 100 ? '완료됨' : `생성 중... ${safeProgress}%`;
    }
  }

  onChunk(text: string) {
    this.generatedCode += text;
    const codeOutput = document.getElementById('code-output') as HTMLPreElement;
    if (codeOutput) {
      codeOutput.textContent = this.generatedCode;
      codeOutput.scrollTop = codeOutput.scrollHeight;
    }
  }

  onResult(code: string) {
    this.generatedCode = code;
    const codeOutput = document.getElementById('code-output') as HTMLPreElement;
    if (codeOutput) {
      codeOutput.textContent = code;
      codeOutput.classList.add('visible');
    }
    const actions = document.getElementById('code-actions');
    if (actions) actions.classList.remove('hidden');
    this.onGenerating(100);
    this.setGeneratingState(false);
    this.setNotice('success', '코드 생성이 완료되었습니다.');
  }

  onError(message: string, code?: 'cancelled' | 'failed') {
    const actions = document.getElementById('code-actions');
    if (actions) actions.classList.add('hidden');

    this.setGeneratingState(false);
    this.onGenerating(0);
    this.setNotice(code === 'cancelled' ? 'warn' : 'error', message);
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
      return '코드를 생성하려면 먼저 Agent 패널에서 API 키를 저장하세요.';
    }
    if (message.includes('Generation already in progress')) {
      return '이미 코드 생성이 진행 중입니다.';
    }
    return message;
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
