import { vscode } from '../vscodeApi';
import { getDocumentLocale, t, UiLocale } from '../../../i18n';
import { ConnectionMode, FigmaDataResultKind, SourceDataThumbnail } from '../../../types';

export class FigmaLayer {
  private connected = false;
  private connecting = false;
  private connectionMode: ConnectionMode =
    document.body?.dataset.mcpMode === 'remote' ? 'remote' : 'local';
  private readonly locale: UiLocale = getDocumentLocale();
  private readonly stateKey = 'figmaMcpData';
  private readonly sourceStateKey = 'figmaSourceDataUrl';
  private sourceImages: SourceDataThumbnail[] = [];

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
    <div class="field-group mode-field">
      <label>${this.msg('figma.connectionMode')}</label>
      <div class="mode-switch" id="figma-mode-switch" role="tablist" aria-label="${this.msg('figma.connectionMode')}">
        <button class="mode-option active" id="btn-mode-local" type="button" data-mode="local">${this.msg('figma.modeLocal')}</button>
        <button class="mode-option" id="btn-mode-remote" type="button" data-mode="remote">${this.msg('figma.modeRemote')}</button>
      </div>
      <div class="inline-note" id="figma-mode-hint">${this.msg('figma.modeHintLocal')}</div>
    </div>
  </div>
  <div class="btn-row">
    <button class="primary" id="btn-connect"><i class="codicon codicon-plug"></i>${this.msg('figma.connect')}</button>
  </div>
  <div class="notice info hidden" id="figma-guide"></div>
  <div class="notice hidden" id="figma-connection-notice"></div>
</section>
<section class="panel panel-compact">
  <div class="section-heading">
    <div class="panel-title">${this.msg('figma.designDataTitle')}</div>
    <button class="text-btn" id="btn-open-figma-app">${this.msg('figma.get')}</button>
  </div>
  <div class="field-group">
    <textarea id="mcp-data" placeholder="${this.msg('figma.mcpPlaceholder')}"></textarea>
  </div>
    <div class="btn-row btn-row-space-between">
      <div class="row">
        <button class="primary" id="btn-fetch"><i class="codicon codicon-cloud-download"></i>${this.msg('figma.fetchData')}</button>
        <button class="secondary" id="btn-fetch-metadata"><i class="codicon codicon-info"></i>${this.msg('figma.metadata')}</button>
        <button class="secondary" id="btn-fetch-variable-defs"><i class="codicon codicon-symbol-constant"></i>${this.msg('figma.variableDefs')}</button>
        <button class="primary" id="btn-screenshot"><i class="codicon codicon-device-camera"></i>${this.msg('figma.screenshot')}</button>
      </div>
      <button class="secondary" id="btn-clear-data"><i class="codicon codicon-trash"></i>${this.msg('figma.clear')}</button>
  </div>
  <div class="notice hidden" id="figma-data-notice"></div>
</section>
<section class="panel panel-compact">
  <div class="section-heading">
    <div>
      <div class="panel-title">${this.msg('figma.sourceDataTitle')}</div>
      <div class="inline-note">${this.msg('figma.sourceDataHint')}</div>
    </div>
  </div>
  <div class="field-group">
    <textarea id="source-data-url" placeholder="${this.msg('figma.sourceDataPlaceholder')}"></textarea>
  </div>
  <div class="btn-row">
    <button class="primary" id="btn-fetch-source-data"><i class="codicon codicon-cloud-download"></i>${this.msg('figma.sourceDataGet')}</button>
  </div>
  <div class="notice hidden" id="figma-source-data-notice"></div>
  <div class="source-data-gallery hidden" id="source-data-gallery-section">
    <div class="panel-title">${this.msg('figma.sourceDataPreviewTitle')}</div>
    <div class="source-data-gallery-track" id="source-data-gallery"></div>
  </div>
</section>
`;
  }

  mount() {
    const dataInput = document.getElementById('mcp-data') as HTMLTextAreaElement | null;
    const sourceInput = document.getElementById('source-data-url') as HTMLTextAreaElement | null;
    if (dataInput) {
      dataInput.value = this.getSavedMcpData();
    }
    if (sourceInput) {
      sourceInput.value = this.getSavedSourceDataUrl();
    }

    dataInput?.addEventListener('input', () => {
      this.persistMcpData(dataInput.value);
      this.updateActionState();
    });

    sourceInput?.addEventListener('input', () => {
      this.persistSourceDataUrl(sourceInput.value);
      this.updateActionState();
    });

    document.getElementById('btn-fetch')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setDataNotice('warn', this.msg('figma.warn.enterData'));
        return;
      }
      this.setDataNotice('info', this.msg('figma.info.loadingData'));
      vscode.postMessage({ command: 'figma.fetchData', mcpData });
    });

    document.getElementById('btn-fetch-metadata')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setDataNotice('warn', this.msg('figma.warn.enterDataForMetadata'));
        return;
      }
      if (!this.connected) {
        this.setDataNotice('warn', this.msg('figma.warn.connectBeforeMetadata'));
        return;
      }
      this.setDataNotice('info', this.msg('figma.info.loadingMetadata'));
      vscode.postMessage({ command: 'figma.fetchMetadata', mcpData });
    });

    document.getElementById('btn-fetch-variable-defs')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setDataNotice('warn', this.msg('figma.warn.enterDataForVariableDefs'));
        return;
      }
      if (!this.connected) {
        this.setDataNotice('warn', this.msg('figma.warn.connectBeforeVariableDefs'));
        return;
      }
      this.setDataNotice('info', this.msg('figma.info.loadingVariableDefs'));
      vscode.postMessage({ command: 'figma.fetchVariableDefs', mcpData });
    });

    document.getElementById('btn-clear-data')?.addEventListener('click', () => {
      if (dataInput) {
        dataInput.value = '';
      }
      this.persistMcpData('');
      this.clearDataNotice();
      this.updateActionState();
      vscode.postMessage({ command: 'figma.clearData' });
    });

    document.getElementById('btn-fetch-source-data')?.addEventListener('click', () => {
      const url = sourceInput?.value.trim() ?? '';
      if (!url) {
        this.setSourceDataNotice('warn', this.msg('figma.warn.enterSourceDataUrl'));
        return;
      }
      if (this.connectionMode === 'remote') {
        this.setSourceDataNotice('warn', this.msg('figma.warn.sourceDataRemoteUnavailable'));
        return;
      }
      if (!this.connected) {
        this.setSourceDataNotice('warn', this.msg('figma.warn.connectBeforeSourceData'));
        return;
      }
      this.setSourceDataNotice('info', this.msg('figma.info.loadingSourceData'));
      vscode.postMessage({ command: 'figma.fetchSourceData', url });
    });

    document.getElementById('btn-connect')?.addEventListener('click', () => {
      this.requestConnect();
    });

    document.getElementById('btn-mode-local')?.addEventListener('click', () => {
      this.setConnectionMode('local');
    });

    document.getElementById('btn-mode-remote')?.addEventListener('click', () => {
      this.setConnectionMode('remote');
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'figma.openSettings', mode: this.connectionMode });
    });

    document.getElementById('btn-open-figma-app')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'figma.openDesktopApp' });
    });

    document.getElementById('btn-screenshot')?.addEventListener('click', () => {
      const mcpData = dataInput?.value.trim() ?? '';
      if (!mcpData) {
        this.setDataNotice('warn', this.msg('figma.warn.enterDataForScreenshot'));
        return;
      }
      if (!this.connected) {
        this.setDataNotice('warn', this.msg('figma.warn.connectBeforeScreenshot'));
        return;
      }
      this.setDataNotice('info', this.msg('figma.info.generatingScreenshot'));
      vscode.postMessage({ command: 'figma.screenshot', mcpData });
    });

    this.updateActionState();
    this.syncConnectionModeUI();
    this.syncConnectButton();
  }

  requestConnect() {
    this.connecting = true;
    this.syncConnectButton();
    this.setGuideMessage(
      this.connectionMode === 'remote'
        ? this.msg('figma.guide.remoteLogin')
        : this.msg('figma.info.connecting'),
    );
    vscode.postMessage({ command: 'figma.connect', mode: this.connectionMode });
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
        this.clearConnectionNotice();
      } else {
        text.textContent = this.msg('figma.statusDisconnected');
        if (error) {
          this.setConnectionNotice('error', error);
          this.setGuideMessage(
            this.connectionMode === 'remote'
              ? this.msg('figma.guide.remoteLogin')
              : this.msg('figma.guide.checkServer'),
          );
        } else {
          this.clearConnectionNotice();
          this.setGuideMessage(
            this.connectionMode === 'remote' ? this.msg('figma.guide.remoteLogin') : '',
          );
        }
      }
    }

    this.renderToolList(methods, connected);
    this.updateActionState();
    this.syncConnectButton();
  }

  onDataResult(data: unknown, kind: FigmaDataResultKind = 'designContext') {
    void data;
    if (kind === 'metadata') {
      this.setDataNotice('success', this.msg('figma.success.metadataLoaded'));
      return;
    }
    if (kind === 'variableDefs') {
      this.setDataNotice('success', this.msg('figma.success.variableDefsLoaded'));
      return;
    }
    if (kind === 'parsedInput') {
      this.setDataNotice('info', this.msg('figma.info.parsedInput'));
      return;
    }
    this.setDataNotice('success', this.msg('figma.success.dataLoaded'));
  }

  onScreenshotResult(base64: string) {
    void base64;
    this.setDataNotice('success', this.msg('figma.success.screenshotLoaded'));
  }

  onAuthStarted() {
    this.connecting = false;
    this.syncConnectButton();
    this.setConnectionNotice('info', this.msg('figma.info.remoteAuthStarted'));
    this.setGuideMessage(this.msg('figma.guide.remoteLogin'));
  }

  onError(message: string) {
    this.setDataNotice('error', message);
  }

  onSourceDataResult(count: number, images: SourceDataThumbnail[]) {
    this.sourceImages = images;
    this.renderSourceDataGallery();
    this.setSourceDataNotice('success', this.msg('figma.success.sourceDataBatchLoaded', { count }));
  }

  onSourceDataError(message: string) {
    this.setSourceDataNotice('error', message);
  }

  reset() {
    const dataInput = document.getElementById('mcp-data') as HTMLTextAreaElement | null;
    const sourceInput = document.getElementById('source-data-url') as HTMLTextAreaElement | null;

    if (dataInput) dataInput.value = '';
    if (sourceInput) sourceInput.value = '';

    // Clear persisted webview state
    const state = (vscode.getState() as Record<string, unknown> | null) ?? {};
    vscode.setState({ ...state, [this.stateKey]: '', [this.sourceStateKey]: '' });

    // Clear source images gallery
    this.sourceImages = [];
    this.renderSourceDataGallery();

    // Clear all notices
    this.clearConnectionNotice();
    this.clearDataNotice();
    this.setSourceDataNotice('info', '');

    this.updateActionState();

    // Notify host to clear cached MCP data
    vscode.postMessage({ command: 'figma.clearData' });
  }

  private renderSourceDataGallery() {
    const section = document.getElementById('source-data-gallery-section');
    const gallery = document.getElementById('source-data-gallery');
    if (!section || !gallery) {
      return;
    }

    gallery.replaceChildren();
    if (this.sourceImages.length === 0) {
      section.classList.add('hidden');
      return;
    }

    for (const image of this.sourceImages) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'source-card';
      button.title = `${image.suggestedName}\n${this.msg('figma.sourceDataOpenAsset')}`;
      button.style.flex = '0 0 66px';
      button.style.width = '66px';
      button.style.minWidth = '66px';
      button.style.maxWidth = '66px';
      button.addEventListener('click', () => {
        vscode.postMessage({ command: 'figma.openSourceDataAsset', assetKey: image.assetKey });
      });

      const frame = document.createElement('span');
      frame.className = 'source-card-thumb';
      frame.style.flex = '0 0 50px';
      frame.style.width = '50px';
      frame.style.height = '50px';
      const img = document.createElement('img');
      img.className = 'source-card-image';
      img.src = image.thumbnailDataUrl;
      img.alt = image.suggestedName;
      img.width = 50;
      img.height = 50;
      img.style.width = '50px';
      img.style.height = '50px';
      frame.appendChild(img);

      const label = document.createElement('span');
      label.className = 'source-card-label';
      label.textContent = image.suggestedName;

      button.append(frame, label);
      gallery.appendChild(button);
    }

    section.classList.remove('hidden');
  }

  private setConnectionMode(mode: ConnectionMode) {
    if (this.connectionMode === mode) return;
    this.connectionMode = mode;
    this.clearConnectionNotice();
    this.clearDataNotice();
    this.syncConnectionModeUI();
    this.syncConnectButton();
    this.updateActionState();
    if (!this.connected) {
      this.setGuideMessage(mode === 'remote' ? this.msg('figma.guide.remoteLogin') : '');
    }
  }

  private updateActionState() {
    const dataInput = document.getElementById('mcp-data') as HTMLTextAreaElement | null;
    const hasData = !!dataInput?.value.trim();
    const sourceInput = document.getElementById('source-data-url') as HTMLTextAreaElement | null;
    const hasSourceUrl = !!sourceInput?.value.trim();
    const isRemote = this.connectionMode === 'remote';

    const fetchBtn = document.getElementById('btn-fetch') as HTMLButtonElement | null;
    const clearBtn = document.getElementById('btn-clear-data') as HTMLButtonElement | null;
    const sourceBtn = document.getElementById('btn-fetch-source-data') as HTMLButtonElement | null;
    const metadataBtn = document.getElementById('btn-fetch-metadata') as HTMLButtonElement | null;
    const screenshotBtn = document.getElementById('btn-screenshot') as HTMLButtonElement | null;
    const variableDefsBtn = document.getElementById(
      'btn-fetch-variable-defs',
    ) as HTMLButtonElement | null;

    if (fetchBtn) fetchBtn.disabled = !hasData;
    if (clearBtn) clearBtn.disabled = !hasData;
    if (sourceBtn) {
      sourceBtn.disabled = !hasSourceUrl || !this.connected || isRemote;
      sourceBtn.title = !hasSourceUrl
        ? this.msg('figma.title.sourceDataNeedsUrl')
        : isRemote
          ? this.msg('figma.title.sourceDataRemoteUnavailable')
          : !this.connected
            ? this.msg('figma.title.sourceDataNeedsConnection')
            : '';
    }
    if (fetchBtn) {
      fetchBtn.title = hasData ? '' : this.msg('figma.title.fetchDisabled');
    }
    if (metadataBtn) {
      metadataBtn.disabled = !hasData || !this.connected;
      metadataBtn.title = !hasData
        ? this.msg('figma.title.metadataNeedsData')
        : !this.connected
          ? this.msg('figma.title.metadataNeedsConnection')
          : '';
    }
    if (screenshotBtn) {
      screenshotBtn.disabled = !hasData || !this.connected;
      screenshotBtn.title = !hasData
        ? this.msg('figma.title.screenshotNeedsData')
        : !this.connected
          ? this.msg('figma.title.screenshotNeedsConnection')
          : '';
    }
    if (variableDefsBtn) {
      variableDefsBtn.disabled = !hasData || !this.connected;
      variableDefsBtn.title = !hasData
        ? this.msg('figma.title.variableDefsNeedsData')
        : !this.connected
          ? this.msg('figma.title.variableDefsNeedsConnection')
          : '';
    }
  }

  private setNotice(
    elementId: 'figma-connection-notice' | 'figma-data-notice' | 'figma-source-data-notice',
    level: 'info' | 'success' | 'warn' | 'error',
    message: string,
  ) {
    const notice = document.getElementById(elementId);
    if (!notice) return;
    if (!message) {
      notice.className = 'notice hidden';
      notice.textContent = '';
      return;
    }
    notice.className = `notice ${level}`;
    notice.textContent = message;
  }

  private setConnectionNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    this.setNotice('figma-connection-notice', level, message);
  }

  private setDataNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    this.setNotice('figma-data-notice', level, message);
  }

  private setSourceDataNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    this.setNotice('figma-source-data-notice', level, message);
  }

  private setGuideMessage(message: string) {
    const guide = document.getElementById('figma-guide');
    if (!guide) return;
    guide.classList.toggle('hidden', !message);
    guide.textContent = message;
  }

  private clearConnectionNotice() {
    this.setConnectionNotice('info', '');
  }

  private clearDataNotice() {
    this.setDataNotice('info', '');
  }

  private syncConnectButton() {
    const connectBtn = document.getElementById('btn-connect') as HTMLButtonElement | null;
    if (!connectBtn) return;
    connectBtn.disabled = this.connecting;
    const isRemote = this.connectionMode === 'remote';
    connectBtn.replaceChildren(
      this.createCodicon(
        this.connecting ? 'loading codicon-modifier-spin' : isRemote ? 'globe' : 'plug',
      ),
      document.createTextNode(
        this.connecting
          ? isRemote
            ? this.msg('figma.authStarting')
            : this.msg('figma.connecting')
          : isRemote
            ? this.msg('figma.authLogin')
            : this.msg('figma.connect'),
      ),
    );
  }

  private syncConnectionModeUI() {
    const localBtn = document.getElementById('btn-mode-local') as HTMLButtonElement | null;
    const remoteBtn = document.getElementById('btn-mode-remote') as HTMLButtonElement | null;
    const hint = document.getElementById('figma-mode-hint');
    const isRemote = this.connectionMode === 'remote';

    localBtn?.classList.toggle('active', !isRemote);
    remoteBtn?.classList.toggle('active', isRemote);
    localBtn?.setAttribute('aria-selected', String(!isRemote));
    remoteBtn?.setAttribute('aria-selected', String(isRemote));
    if (hint) {
      hint.textContent = this.msg(isRemote ? 'figma.modeHintRemote' : 'figma.modeHintLocal');
    }
  }

  private renderToolList(methods: string[], connected: boolean) {
    const hasExtraTools = connected && methods.length > 0;
    this.setGuideMessage(
      hasExtraTools
        ? this.msg('figma.guide.availableTools', {
            count: methods.length,
            tools: methods.join(', '),
          })
        : '',
    );
  }

  private msg(key: string, params?: Record<string, string | number>) {
    return t(this.locale, key, params);
  }

  private getSavedMcpData(): string {
    const state = (vscode.getState() as Record<string, unknown> | null) ?? {};
    return typeof state[this.stateKey] === 'string' ? (state[this.stateKey] as string) : '';
  }

  private getSavedSourceDataUrl(): string {
    const state = (vscode.getState() as Record<string, unknown> | null) ?? {};
    return typeof state[this.sourceStateKey] === 'string'
      ? (state[this.sourceStateKey] as string)
      : '';
  }

  private persistMcpData(value: string) {
    const state = (vscode.getState() as Record<string, unknown> | null) ?? {};
    vscode.setState({ ...state, [this.stateKey]: value });
  }

  private persistSourceDataUrl(value: string) {
    const state = (vscode.getState() as Record<string, unknown> | null) ?? {};
    vscode.setState({ ...state, [this.sourceStateKey]: value });
  }

  private createCodicon(iconName: string): HTMLElement {
    const icon = document.createElement('i');
    icon.className = `codicon codicon-${iconName}`;
    return icon;
  }
}
