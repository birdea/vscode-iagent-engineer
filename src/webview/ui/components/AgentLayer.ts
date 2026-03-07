import { vscode } from '../vscodeApi';
import { AgentType, ModelInfo } from '../../../types';

export class AgentLayer {
  private models: ModelInfo[] = [];
  private autoLoadTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLoadSignature = '';

  render(): string {
    return `
<div class="panel">
  <div class="panel-title">3단계. 에이전트 설정</div>
  <div class="description-text">API 키를 입력하고 모델을 선택한 뒤 저장하세요.</div>
  <div class="field-group">
    <label for="agent-select">AI Agent</label>
    <select id="agent-select">
      <option value="gemini">Gemini</option>
      <option value="claude">Claude</option>
    </select>
  </div>
  <div class="field-group stack-gap-sm">
    <div class="row row-space-between">
      <label for="api-key-input">API Key</label>
      <a href="#" id="link-get-api-key" class="link-meta">발급 안내</a>
    </div>
    <div class="row">
      <input type="password" id="api-key-input" placeholder="API Key 입력..." />
    </div>
  </div>
  <div class="field-group stack-gap-sm">
    <div class="row row-space-between">
      <label for="model-select">모델 선택</label>
      <a href="#" id="link-get-model-info" class="link-meta">모델 정보</a>
    </div>
    <div class="row">
      <select id="model-select">
        <option value="">모델을 불러오세요</option>
      </select>
      <button class="secondary icon-btn" id="btn-load-models" title="모델 목록 새로고침"><i class="codicon codicon-refresh"></i></button>
    </div>
  </div>
  <div class="description-text stack-gap-sm" id="agent-status">저장된 API 키가 없다면 먼저 입력하세요.</div>
  <div class="btn-row stack-gap-sm">
    <button class="primary" id="btn-save-settings"><i class="codicon codicon-save"></i>저장</button>
    <button class="secondary" id="btn-clear-settings"><i class="codicon codicon-trash"></i>초기화</button>
  </div>
  <div class="notice hidden stack-gap-sm" id="agent-notice"></div>
</div>
`;
  }

  mount() {
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement | null;

    document.getElementById('agent-select')?.addEventListener('change', (e) => {
      const agent = (e.target as HTMLSelectElement).value as AgentType;
      vscode.postMessage({ command: 'state.setAgent', agent });
      this.updateModelList([]);
      this.updateStatus();
      this.setNotice('info', `${agent} 에이전트로 전환했습니다. API 키가 있으면 모델을 자동으로 다시 불러옵니다.`);
      this.scheduleModelLoad();
    });

    document.getElementById('link-get-api-key')?.addEventListener('click', (e) => {
      e.preventDefault();
      const agent = (document.getElementById('agent-select') as HTMLSelectElement)
        .value as AgentType;
      vscode.postMessage({ command: 'agent.getApiKeyHelp', agent });
    });

    document.getElementById('btn-load-models')?.addEventListener('click', () => {
      this.requestModelLoad(true);
    });

    document.getElementById('link-get-model-info')?.addEventListener('click', (e) => {
      e.preventDefault();
      const agent = (document.getElementById('agent-select') as HTMLSelectElement)
        .value as AgentType;
      const modelId = (document.getElementById('model-select') as HTMLSelectElement).value;
      if (!modelId) {
        this.setNotice('warn', '모델을 먼저 선택하세요.');
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
  }

  onModelsResult(models: ModelInfo[]) {
    this.models = models;
    this.updateModelList(models);
    if (models.length > 0) {
      this.setNotice('success', `${models.length}개의 모델을 불러왔습니다.`);
    } else {
      this.setNotice('warn', '사용 가능한 모델이 없습니다. API Key와 권한을 확인하세요.');
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
      keyInput.placeholder = hasApiKey ? '저장된 API Key 있음 ✓' : 'API Key 입력...';
    }
    this.lastLoadSignature = '';
    this.updateModelList([]);
    this.updateStatus();
    if (!hasApiKey) {
      this.setNotice('info', `${agent} API Key를 입력하면 모델을 자동으로 불러옵니다.`);
      return;
    }
    this.setNotice('info', `${agent} 설정을 불러오는 중입니다...`);
    vscode.postMessage({ command: 'agent.listModels', agent });
    if (model) {
      // Keep preferred model until list result arrives, then restore selection.
      const modelSelect = document.getElementById('model-select') as HTMLSelectElement | null;
      if (modelSelect) {
        modelSelect.dataset.preferredModel = model;
      }
    }
  }

  onSettingsSaved(agent: AgentType, model: string, hasApiKey: boolean) {
    const keyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = hasApiKey ? '저장된 API Key 있음 ✓' : 'API Key 입력...';
    }
    this.setNotice('success', `${agent} / ${model} 설정을 저장했습니다.`);
    this.updateStatus();
  }

  onSettingsCleared(agent: AgentType) {
    const agentSelect = document.getElementById('agent-select') as HTMLSelectElement | null;
    const keyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    if (agentSelect) {
      agentSelect.value = 'gemini';
    }
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = 'API Key 입력...';
    }
    this.lastLoadSignature = '';
    this.updateModelList([]);
    this.updateStatus();
    this.setNotice('info', `${agent} 저장값을 삭제했습니다.`);
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
      this.setNotice('warn', '저장하기 전에 모델을 먼저 선택하세요.');
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
    select.innerHTML = '';
    if (models.length === 0) {
      select.innerHTML = '<option value="">모델을 불러오세요</option>';
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
    if (!status || !agent) return;

    if (apiKey) {
      status.textContent = `${agent} API 키가 입력되었습니다. 모델 목록을 확인하고 저장하세요.`;
      return;
    }
    if (!model) {
      status.textContent = `${agent} 모델이 아직 선택되지 않았습니다. 저장된 API 키가 있으면 목록을 불러오세요.`;
      return;
    }
    status.textContent = `${agent} 에서 ${model} 모델이 선택되었습니다. 저장하면 Prompt에서 바로 사용할 수 있습니다.`;
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
    const agent = (document.getElementById('agent-select') as HTMLSelectElement | null)
      ?.value as AgentType | undefined;
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
        ? `${agent} 모델 목록을 불러오는 중입니다...`
        : `${agent} 모델 목록을 불러오는 중입니다... (저장된 API Key 사용)`,
    );
    vscode.postMessage({ command: 'agent.listModels', agent, key: key || undefined });
  }

  private toFriendlyError(message: string): string {
    if (message.includes('No API key')) {
      return 'API 키가 없어 모델을 불러올 수 없습니다. API 키를 입력하거나 저장된 키를 확인하세요.';
    }
    if (message.includes('HTTP 401') || message.includes('permission')) {
      return 'API 키 인증에 실패했습니다. 올바른 키인지 확인하세요.';
    }
    return '에이전트 설정을 처리하지 못했습니다. API 키와 모델 정보를 다시 확인하세요.';
  }
}
