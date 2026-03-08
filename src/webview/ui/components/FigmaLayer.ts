import { vscode } from '../vscodeApi';
import { getDocumentLocale, t, UiLocale } from '../../../i18n';

export class FigmaLayer {
  private connected = false;
  private connecting = false;
  private readonly locale: UiLocale = getDocumentLocale();

  render(): string {
    return `
<section class="panel panel-compact">
  <div class="section-heading">
      <div>
      <div class="panel-title">${this.msg('figma.connectionTitle')}</div>
      <div class="status-row section-status" id="figma-status-row">
        <span class="status-dot" id="figma-status-dot"></span>
        <span id="figma-status-text" class="status-text">${this.msg('figma.statusDisconnected')}</span>
      </div>
    </div>
    <button class="text-btn" id="btn-open-settings">${this.msg('figma.settings')}</button>
  </div>
  <div class="btn-row">
    <button class="primary" id="btn-connect"><i class="codicon codicon-plug"></i>${this.msg('figma.connect')}</button>
  </div>
  <div class="notice info hidden" id="figma-guide"></div>
</section>
<section class="panel panel-compact">
  <div class="section-heading">
    <div class="panel-title">${this.msg('figma.designDataTitle')}</div>
  </div>
  <div class="field-group">
    <textarea id="mcp-data" placeholder="${this.msg('figma.mcpPlaceholder')}"></textarea>
  </div>
  <div class="btn-row">
    <button class="primary" id="btn-fetch"><i class="codicon codicon-cloud-download"></i>${this.msg('figma.fetchData')}</button>
    <button class="secondary" id="btn-screenshot"><i class="codicon codicon-device-camera"></i>${this.msg('figma.screenshot')}</button>
  </div>
  <div class="notice hidden" id="figma-notice"></div>
  <pre class="code-output" id="figma-data-preview"></pre>
  <img class="screenshot-preview" id="figma-screenshot-preview" alt="${this.msg('figma.screenshotAlt')}" />
</section>
`;
  }

  mount() {
    const dataInput = document.getElementById('mcp-data') as HTMLTextAreaElement | null;

    dataInput?.addEventListener('input', () => this.updateActionState());

    document.getElementById('btn-fetch')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setNotice('warn', this.msg('figma.warn.enterData'));
        return;
      }
      this.setNotice('info', this.msg('figma.info.loadingData'));
      vscode.postMessage({ command: 'figma.fetchData', mcpData });
    });

    document.getElementById('btn-connect')?.addEventListener('click', () => {
      this.requestConnect();
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'figma.openSettings' });
    });

    document.getElementById('btn-screenshot')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setNotice('warn', this.msg('figma.warn.enterDataForScreenshot'));
        return;
      }
      if (!this.connected) {
        this.setNotice('warn', this.msg('figma.warn.connectBeforeScreenshot'));
        return;
      }
      this.setNotice('info', this.msg('figma.info.generatingScreenshot'));
      vscode.postMessage({ command: 'figma.screenshot', mcpData });
    });

    this.updateActionState();
  }

  requestConnect() {
    this.connecting = true;
    this.syncConnectButton();
    this.setGuideMessage(this.msg('figma.info.connecting'));
    vscode.postMessage({ command: 'figma.connect' });
  }

  onStatus(connected: boolean, methods: string[], error?: string) {
    this.connected = connected;
    this.connecting = false;
    const dot = document.getElementById('figma-status-dot');
    const text = document.getElementById('figma-status-text');

    if (dot) dot.className = `status-dot${connected ? ' connected' : ''}`;
    if (text) {
      text.classList.toggle('status-text-error', !connected);
      if (connected) {
        text.textContent = this.msg('figma.statusConnected');
        this.setGuideMessage(
          methods.length > 0
            ? this.msg('figma.guide.availableTools', { count: methods.length })
            : '',
        );
      } else {
        text.textContent = this.msg('figma.statusDisconnected');
        if (error) {
          this.setNotice('error', error);
          this.setGuideMessage(this.msg('figma.guide.checkServer'));
        } else {
          this.clearNotice();
          this.setGuideMessage('');
        }
      }
    }

    this.renderToolList(methods, connected);
    this.updateActionState();
    this.syncConnectButton();
  }

  onDataResult(data: unknown) {
    const preview = document.getElementById('figma-data-preview') as HTMLPreElement | null;
    if (!preview) return;

    const text = this.stringifyForPreview(data);
    preview.textContent = text;
    preview.classList.add('visible');
    this.setNotice('success', this.msg('figma.success.dataLoaded'));
  }

  onScreenshotResult(base64: string) {
    const img = document.getElementById('figma-screenshot-preview') as HTMLImageElement | null;
    if (!img) return;

    img.src = `data:image/png;base64,${base64}`;
    img.classList.add('visible');
    this.setNotice('success', this.msg('figma.success.screenshotLoaded'));
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
    if (fetchBtn) {
      fetchBtn.title = hasData ? '' : this.msg('figma.title.fetchDisabled');
    }
    if (screenshotBtn) {
      screenshotBtn.disabled = !hasData || !this.connected;
      screenshotBtn.title = !hasData
        ? this.msg('figma.title.screenshotNeedsData')
        : !this.connected
          ? this.msg('figma.title.screenshotNeedsConnection')
          : '';
    }
  }

  private setNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    const notice = document.getElementById('figma-notice');
    if (!notice) return;
    if (!message) {
      notice.className = 'notice hidden';
      notice.textContent = '';
      return;
    }
    notice.className = `notice ${level}`;
    notice.textContent = message;
  }

  private setGuideMessage(message: string) {
    const guide = document.getElementById('figma-guide');
    if (!guide) return;
    guide.classList.toggle('hidden', !message);
    guide.textContent = message;
  }

  private clearNotice() {
    this.setNotice('info', '');
  }

  private syncConnectButton() {
    const connectBtn = document.getElementById('btn-connect') as HTMLButtonElement | null;
    if (!connectBtn) return;
    connectBtn.disabled = this.connecting;
    connectBtn.innerHTML = this.connecting
      ? `<i class="codicon codicon-loading codicon-modifier-spin"></i>${this.msg('figma.connecting')}`
      : `<i class="codicon codicon-plug"></i>${this.msg('figma.connect')}`;
  }

  private renderToolList(methods: string[], connected: boolean) {
    const hasExtraTools = connected && methods.length > 0;
    this.setGuideMessage(
      hasExtraTools ? this.msg('figma.guide.availableTools', { count: methods.length }) : '',
    );
  }

  private stringifyForPreview(data: unknown): string {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return this.msg('figma.preview.unable');
    }
  }

  private msg(key: string, params?: Record<string, string | number>) {
    return t(this.locale, key, params);
  }
}
