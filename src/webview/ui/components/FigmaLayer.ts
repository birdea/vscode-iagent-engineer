import { vscode } from '../vscodeApi';

export class FigmaLayer {
  private connected = false;

  render(): string {
    return `
<div class="panel">
  <div class="meta-row">
    <div class="meta-title">MCP Connect</div>
    <div class="status-row meta-subtitle" id="figma-status-row">
      <span class="status-dot" id="figma-status-dot"></span>
      <span id="figma-status-text" class="status-text">연결되지 않음</span>
    </div>
  </div>
  <div class="btn-row" style="margin-top: 8px;">
    <button class="primary" id="btn-connect"><i class="codicon codicon-plug"></i>Connect</button>
  </div>
  <div class="tool-list hidden" id="figma-tool-list" style="margin-top: 8px;"></div>
</div>
<div class="panel">
  <div class="meta-row">
    <div class="meta-title">Source</div>
    <span class="meta-subtitle" title="MCP 데이터 입력 (URL 또는 JSON)">MCP 데이터 입력 (URL 또는 JSON)</span>
  </div>
  <div class="field-group">
    <textarea id="mcp-data" placeholder="https://figma.com/file/... 또는 JSON"></textarea>
  </div>
  <div class="btn-row" style="margin-top: 8px;">
    <button class="primary" id="btn-fetch"><i class="codicon codicon-cloud-download"></i>Fetch Data</button>
    <button class="primary" id="btn-screenshot"><i class="codicon codicon-device-camera"></i>Screenshot</button>
  </div>
  <div class="notice hidden" id="figma-notice" style="margin-top: 8px;"></div>
  <pre class="code-output" id="figma-data-preview"></pre>
  <img class="screenshot-preview" id="figma-screenshot-preview" alt="Figma screenshot preview" />
</div>
`;
  }

  mount() {
    const dataInput = document.getElementById('mcp-data') as HTMLTextAreaElement | null;

    dataInput?.addEventListener('input', () => this.updateActionState());

    document.getElementById('btn-fetch')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setNotice('warn', 'Figma URL 또는 JSON 데이터를 먼저 입력하세요.');
        return;
      }
      this.setNotice('info', 'MCP 데이터를 불러오는 중입니다...');
      vscode.postMessage({ command: 'figma.fetchData', mcpData });
    });

    document.getElementById('btn-connect')?.addEventListener('click', () => {
      this.requestConnect();
    });

    document.getElementById('btn-screenshot')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setNotice('warn', '스크린샷을 위해 MCP 데이터를 먼저 입력하세요.');
        return;
      }
      if (!this.connected) {
        this.setNotice('warn', '스크린샷은 MCP 연결 후에만 가능합니다.');
        return;
      }
      this.setNotice('info', '스크린샷을 생성하는 중입니다...');
      vscode.postMessage({ command: 'figma.screenshot', mcpData });
    });

    this.updateActionState();
  }

  requestConnect() {
    vscode.postMessage({ command: 'figma.connect' });
  }

  onStatus(connected: boolean, methods: string[], error?: string) {
    this.connected = connected;
    const dot = document.getElementById('figma-status-dot');
    const text = document.getElementById('figma-status-text');

    if (dot) dot.className = `status-dot${connected ? ' connected' : ''}`;
    if (text) {
      if (connected) {
        text.textContent = `연결됨 (${methods.length} tools available)`;
        text.style.color = '';
      } else {
        text.textContent = '연결되지 않음';
        text.style.color = 'var(--vscode-errorForeground)';
        if (error) {
          this.setNotice('error', `연결 실패: ${error}`);
        } else {
          this.setNotice('warn', 'MCP 서버에 연결되지 않았습니다.');
        }
      }
    }

    this.renderToolList(methods, connected);
    this.updateActionState();
  }

  onDataResult(data: unknown) {
    const preview = document.getElementById('figma-data-preview') as HTMLPreElement | null;
    if (!preview) return;

    const text = this.stringifyForPreview(data);
    preview.textContent = text;
    preview.classList.add('visible');
    this.setNotice('success', 'MCP 데이터를 불러왔습니다.');
  }

  onScreenshotResult(base64: string) {
    const img = document.getElementById('figma-screenshot-preview') as HTMLImageElement | null;
    if (!img) return;

    img.src = `data:image/png;base64,${base64}`;
    img.classList.add('visible');
    this.setNotice('success', '스크린샷을 가져왔습니다. 에디터에도 함께 열렸습니다.');
  }

  onError(message: string) {
    this.setNotice('error', message);
  }

  private updateActionState() {
    const dataInput = document.getElementById('mcp-data') as HTMLTextAreaElement | null;
    const hasData = !!dataInput?.value.trim();

    const fetchBtn = document.getElementById('btn-fetch') as HTMLButtonElement | null;
    const screenshotBtn = document.getElementById('btn-screenshot') as HTMLButtonElement | null;

    if (fetchBtn) fetchBtn.disabled = !hasData;
    if (screenshotBtn) screenshotBtn.disabled = !hasData || !this.connected;
  }

  private setNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    const notice = document.getElementById('figma-notice');
    if (!notice) return;
    notice.className = `notice ${level}`;
    notice.textContent = message;
  }

  private renderToolList(methods: string[], connected: boolean) {
    const list = document.getElementById('figma-tool-list');
    if (!list) return;

    if (!connected || methods.length === 0) {
      list.className = 'tool-list hidden';
      list.innerHTML = '';
      return;
    }

    list.className = 'tool-list';
    list.innerHTML = methods
      .map((method) => `<span class="tool-chip">${this.escapeHtml(method)}</span>`)
      .join('');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private stringifyForPreview(data: unknown): string {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return '[Unable to render data preview]';
    }
  }
}
