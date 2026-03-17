import { vscode } from '../vscodeApi';
import { AgentType, ModelInfo } from '../../../types';
import { getDocumentLocale, t, UiLocale } from '../../../i18n';
import { toFriendlyApiKeyError } from '../utils/errorUtils';

export class AgentLayer {
  private models: ModelInfo[] = [];
  private autoLoadTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLoadSignature = '';
  private readonly locale: UiLocale = getDocumentLocale();

  render(): string {
    return `
<section class="panel panel-compact">
  <div class="section-heading">
      <div>
      <div class="panel-title">${this.msg('agent.settingsTitle')}</div>
      <div class="status-row section-status" id="agent-status-row">
        <span class="status-dot" id="agent-status-dot"></span>
        <span id="agent-status" class="status-text">${this.msg('agent.status.noSavedKey')}</span>
      </div>
    </div>
  </div>
  <div class="field-group">
    <label for="agent-select">AI Agent</label>
    <select id="agent-select">
      <option value="gemini">Gemini</option>
      <option value="openrouter">OpenRouter</option>
      <option value="deepseek">DeepSeek</option>
      <option value="claude">Claude</option>
      <option value="qwen">Qwen</option>
    </select>
  </div>
  <div class="field-group stack-gap-sm">
    <div class="row row-space-between">
      <label for="api-key-input">API Key</label>
      <button type="button" id="link-get-api-key" class="link-meta-btn">${this.msg('agent.apiKeyHelp')}</button>
    </div>
    <div class="row">
      <input type="password" id="api-key-input" placeholder="${this.msg('agent.apiKeyPlaceholder')}" />
    </div>
  </div>
  <div class="field-group stack-gap-sm">
    <div class="row row-space-between">
      <label for="model-select">${this.msg('agent.modelSelect')}</label>
      <button type="button" id="link-get-model-info" class="link-meta-btn">${this.msg('agent.refresh')}</button>
    </div>
    <div class="row">
      <select id="model-select">
        <option value="">${this.msg('agent.modelLoadPrompt')}</option>
      </select>
      <button class="secondary icon-btn" id="btn-load-models" title="${this.msg('agent.modelInfo')}"><i class="codicon codicon-info"></i></button>
    </div>
  </div>
  <div class="btn-row stack-gap-sm">
    <button class="primary" id="btn-save-settings"><i class="codicon codicon-save"></i>${this.msg('agent.save')}</button>
    <button class="text-btn" id="btn-clear-settings">${this.msg('agent.clear')}</button>
  </div>
  <div class="notice hidden" id="agent-notice"></div>
</section>
`;
  }

  mount() {
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement | null;

    document.getElementById('agent-select')?.addEventListener('change', (e) => {
      const agent = (e.target as HTMLSelectElement).value as AgentType;
      vscode.postMessage({ command: 'state.setAgent', agent });
      this.updateModelList([]);
      this.updateStatus();
      this.setNotice('info', this.msg('agent.notice.switched', { agent }));
      this.scheduleModelLoad();
    });

    document.getElementById('link-get-api-key')?.addEventListener('click', () => {
      const agent = (document.getElementById('agent-select') as HTMLSelectElement)
        .value as AgentType;
      vscode.postMessage({ command: 'agent.getApiKeyHelp', agent });
    });

    document.getElementById('link-get-model-info')?.addEventListener('click', () => {
      this.requestModelLoad(true);
    });

    document.getElementById('btn-load-models')?.addEventListener('click', () => {
      const agent = (document.getElementById('agent-select') as HTMLSelectElement)
        .value as AgentType;
      const modelId = (document.getElementById('model-select') as HTMLSelectElement).value;
      if (!modelId) {
        this.setNotice('warn', this.msg('agent.notice.selectModelFirst'));
        return;
      }
      vscode.postMessage({ command: 'agent.getModelInfoHelp', agent, modelId });
    });

    document.getElementById('model-select')?.addEventListener('change', (e) => {
      const modelId = (e.target as HTMLSelectElement).value;
      vscode.postMessage({ command: 'state.setModel', model: modelId });
      this.updateStatus();
    });

    apiKeyInput?.addEventListener('input', () => {
      this.updateStatus();
      this.scheduleModelLoad();
    });
    apiKeyInput?.addEventListener('blur', () => this.requestModelLoad(false));

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      this.onSaveRequested();
    });
    document.getElementById('btn-clear-settings')?.addEventListener('click', () => {
      this.onClearRequested();
    });

    this.updateStatus();
    vscode.postMessage({ command: 'agent.getState' });

    window.addEventListener('unload', () => this.dispose());
  }

  dispose() {
    if (this.autoLoadTimer) {
      clearTimeout(this.autoLoadTimer);
      this.autoLoadTimer = null;
    }
  }

  onModelsResult(models: ModelInfo[]) {
    this.models = models;
    this.updateModelList(models);
    if (models.length > 0) {
      this.setNotice('success', this.msg('agent.notice.modelsLoaded', { count: models.length }));
    } else {
      this.setNotice('warn', this.msg('agent.notice.noModels'));
    }
    this.updateStatus();
  }

  onState(agent: AgentType, model: string, hasApiKey: boolean) {
    const agentSelect = document.getElementById('agent-select') as HTMLSelectElement | null;
    const keyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    if (agentSelect) {
      agentSelect.value = agent;
    }
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = hasApiKey
        ? this.msg('agent.apiKeyPlaceholderSaved')
        : this.msg('agent.apiKeyPlaceholder');
    }
    this.lastLoadSignature = '';
    this.updateModelList([]);
    this.updateStatus();
    if (!hasApiKey) {
      this.setNotice('info', this.msg('agent.notice.enterApiKeyToLoad'));
      return;
    }
    this.setNotice('info', this.msg('agent.notice.loadingSavedSettings'));
    vscode.postMessage({ command: 'agent.listModels', agent });
    if (model) {
      // Keep preferred model until list result arrives, then restore selection.
      const modelSelect = document.getElementById('model-select') as HTMLSelectElement | null;
      if (modelSelect) {
        modelSelect.dataset.preferredModel = model;
      }
    }
  }

  onSettingsSaved(_agent: AgentType, model: string, hasApiKey: boolean) {
    const keyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = hasApiKey
        ? this.msg('agent.apiKeyPlaceholderSaved')
        : this.msg('agent.apiKeyPlaceholder');
    }
    this.setNotice('success', this.msg('agent.notice.settingsSaved'));
    this.updateStatus();
  }

  reset() {
    const agentSelect = document.getElementById('agent-select') as HTMLSelectElement | null;
    const keyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    if (agentSelect) agentSelect.value = 'gemini';
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = this.msg('agent.apiKeyPlaceholder');
    }
    this.lastLoadSignature = '';
    this.updateModelList([]);
    this.updateStatus();
    this.setNotice('info', this.msg('agent.notice.settingsCleared'));
  }

  onSettingsCleared(_agent: AgentType) {
    const agentSelect = document.getElementById('agent-select') as HTMLSelectElement | null;
    const keyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    if (agentSelect) {
      agentSelect.value = 'gemini';
    }
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = this.msg('agent.apiKeyPlaceholder');
    }
    this.lastLoadSignature = '';
    this.updateModelList([]);
    this.updateStatus();
    this.setNotice('info', this.msg('agent.notice.settingsCleared'));
  }

  onSaveRequested() {
    const agent = (document.getElementById('agent-select') as HTMLSelectElement | null)?.value as
      | AgentType
      | undefined;
    const key =
      (document.getElementById('api-key-input') as HTMLInputElement | null)?.value.trim() ?? '';
    const model =
      (document.getElementById('model-select') as HTMLSelectElement | null)?.value ?? '';
    if (!agent) return;
    if (!model) {
      this.setNotice('warn', this.msg('agent.notice.selectModelBeforeSave'));
      return;
    }
    vscode.postMessage({ command: 'agent.saveSettings', agent, model, key: key || undefined });
  }

  onClearRequested() {
    const agent = (document.getElementById('agent-select') as HTMLSelectElement | null)?.value as
      | AgentType
      | undefined;
    if (!agent) return;
    vscode.postMessage({ command: 'agent.clearSettings', agent });
  }

  private updateModelList(models: ModelInfo[]) {
    const select = document.getElementById('model-select') as HTMLSelectElement;
    if (!select) return;
    const preferredModel = select.dataset.preferredModel ?? '';
    select.replaceChildren();
    if (models.length === 0) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = this.msg('agent.modelLoadPrompt');
      select.appendChild(emptyOption);
      vscode.postMessage({ command: 'state.setModel', model: '' });
      return;
    }
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
    const selectedModel =
      (preferredModel && models.some((m) => m.id === preferredModel)
        ? preferredModel
        : models[0].id) ?? '';
    select.value = selectedModel;
    delete select.dataset.preferredModel;
    vscode.postMessage({ command: 'state.setModel', model: selectedModel });
  }

  onError(message: string) {
    this.setNotice('error', this.toFriendlyError(message));
  }

  private updateStatus() {
    const agent = (document.getElementById('agent-select') as HTMLSelectElement | null)?.value;
    const model = (document.getElementById('model-select') as HTMLSelectElement | null)?.value;
    const apiKey =
      (document.getElementById('api-key-input') as HTMLInputElement | null)?.value.trim() ?? '';
    const status = document.getElementById('agent-status');
    const statusDot = document.getElementById('agent-status-dot');
    if (!status || !agent) return;

    if (statusDot) {
      statusDot.className = `status-dot${model ? ' connected' : ''}`;
    }

    if (apiKey) {
      status.textContent = this.msg('agent.status.apiKeyEntered');
      return;
    }
    if (!model) {
      status.textContent = this.msg('agent.status.modelNotSelected');
      return;
    }
    status.textContent = this.msg('agent.status.modelSelected', { model });
  }

  private setNotice(level: 'info' | 'success' | 'warn' | 'error', message: string) {
    const notice = document.getElementById('agent-notice');
    if (!notice) return;
    notice.className = `notice ${level}`;
    notice.textContent = message;
  }

  private scheduleModelLoad() {
    if (this.autoLoadTimer) clearTimeout(this.autoLoadTimer);
    this.autoLoadTimer = setTimeout(() => {
      this.requestModelLoad(false);
    }, 500);
  }

  private requestModelLoad(force: boolean) {
    const agent = (document.getElementById('agent-select') as HTMLSelectElement | null)?.value as
      | AgentType
      | undefined;
    const key =
      (document.getElementById('api-key-input') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!agent) return;

    const signature = `${agent}:${key}`;
    if (!force && !key && this.models.length === 0) {
      return;
    }
    if (!force && signature === this.lastLoadSignature) {
      return;
    }

    this.lastLoadSignature = signature;
    this.setNotice(
      'info',
      key
        ? this.msg('agent.notice.loadingModelsWithKey')
        : this.msg('agent.notice.loadingModelsWithSavedKey'),
    );
    vscode.postMessage({ command: 'agent.listModels', agent, key: key || undefined });
  }

  private toFriendlyError(message: string): string {
    return toFriendlyApiKeyError(
      this.locale,
      message,
      'agent.error.noApiKey',
      'agent.error.auth',
      'agent.error.generic',
    );
  }

  private msg(key: string, params?: Record<string, string | number>) {
    return t(this.locale, key, params);
  }
}
