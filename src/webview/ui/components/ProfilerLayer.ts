import {
  ProfilerArchiveResult,
  ProfilerOverviewState,
  SessionSummary,
  ProfilerAgentType,
} from '../../../types';
import { getProfilerAgentDescriptor } from '../../../profiler/ProfilerCatalog';
import { isSessionLatest, isSessionLikelyLive } from '../../../profiler/ProfilerLiveUtils';
import { vscode } from '../vscodeApi';
import { getDocumentLocale, UiLocale } from '../../../i18n';

type SortField = 'name' | 'time' | 'tin' | 'tout' | 'size';
type SortDirection = 'asc' | 'desc';
const DEFAULT_SELECTED_AGENT: ProfilerAgentType = 'claude';
const AUTO_REFRESH_OPTIONS = [0, 1000, 3000, 5000, 10000, 30000, 60000] as const;

const EMPTY_STATE: ProfilerOverviewState = {
  status: 'idle',
  selectedAgent: DEFAULT_SELECTED_AGENT,
  aggregate: {
    totalSessions: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalTokens: 0,
    totalFileSizeBytes: 0,
  },
  sessionsByAgent: {
    claude: [],
    codex: [],
    gemini: [],
  },
};

const MESSAGES: Record<
  UiLocale,
  Record<
    | 'title'
    | 'scan'
    | 'loading'
    | 'empty'
    | 'sessions'
    | 'input'
    | 'output'
    | 'fileSize'
    | 'agentSoon'
    | 'noSelection'
    | 'archiveDone'
    | 'updated'
    | 'never'
    | 'autoRefresh'
    | 'off',
    string
  >
> = {
  en: {
    title: 'Agent Session Profiler',
    scan: 'Refresh',
    loading: '로딩중..',
    empty: 'No sessions found.',
    sessions: 'Sessions',
    input: 'Input',
    output: 'Output',
    fileSize: 'Size',
    agentSoon: 'Profiler support is coming soon.',
    noSelection: 'Select a session to inspect details.',
    archiveDone: 'Archive completed',
    updated: 'Updated',
    never: 'Never',
    autoRefresh: 'Auto Refresh',
    off: 'Off',
  },
  ko: {
    title: 'Agent 세션 프로파일러',
    scan: '새로고침',
    loading: '로딩중..',
    empty: '검색된 세션이 없습니다.',
    sessions: '세션',
    input: 'Input',
    output: 'Output',
    fileSize: '크기',
    agentSoon: '추후 지원 예정입니다.',
    noSelection: '세션을 선택하면 상세 분석이 표시됩니다.',
    archiveDone: '아카이브 완료',
    updated: '업데이트',
    never: '기록 없음',
    autoRefresh: '자동 새로고침',
    off: '끔',
  },
};

export class ProfilerLayer {
  private state = EMPTY_STATE;
  private locale: UiLocale = getDocumentLocale();
  private notice = '';
  private sortField: SortField = 'time';
  private sortDirection: SortDirection = 'desc';
  private autoRefreshMs = 0;
  private autoRefreshTimer?: number;

  render(): string {
    return `
<section class="panel panel-compact profiler-panel-shell">
  <div class="section-heading">
    <div class="profiler-heading-copy">
      <div class="panel-title">${this.msg('title')}</div>
      <div class="section-status profiler-updated-at" id="profiler-updated-at" title="${this.escapeAttr(this.getUpdatedAtTitle())}">${this.renderUpdatedAt()}</div>
    </div>
    <div class="profiler-heading-actions">
      <label class="profiler-auto-refresh-control" for="profiler-auto-refresh-select">
        <span class="profiler-auto-refresh-label">${this.msg('autoRefresh')}</span>
        <select id="profiler-auto-refresh-select" class="profiler-auto-refresh-select">
          ${this.renderAutoRefreshOptions()}
        </select>
      </label>
      <button class="secondary icon-btn profiler-refresh-button" id="profiler-start-analysis" aria-label="${this.msg('scan')}" title="${this.msg('scan')}"><i class="codicon codicon-refresh"></i></button>
    </div>
  </div>
  <div class="profiler-toolbar profiler-toolbar-status">
    <div class="section-status" id="profiler-status-badge">${this.renderStatusBadge()}</div>
  </div>
  <div class="profiler-tab-row" id="profiler-tab-row" role="tablist" aria-label="Agents"></div>
  <div class="profiler-sort-bar" id="profiler-sort-bar"></div>
  <div class="profiler-list" id="profiler-session-list"></div>
</section>`;
  }

  mount() {
    document
      .getElementById('profiler-start-analysis')
      ?.addEventListener('click', () =>
        vscode.postMessage({ command: 'profiler.refreshOverview' }),
      );
    document.getElementById('profiler-auto-refresh-select')?.addEventListener('change', (event) => {
      const target = event.target as HTMLSelectElement | null;
      this.autoRefreshMs = Number(target?.value ?? '0');
      this.syncAutoRefreshTimer();
    });
    document.getElementById('profiler-tab-row')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-agent]');
      if (!button) {
        return;
      }
      const agent = button.dataset.agent as ProfilerAgentType | undefined;
      if (!agent) {
        return;
      }
      if (this.isDisabledAgent(agent)) {
        this.notice = this.getDisabledAgentNotice(agent);
        this.renderDynamicContent();
        return;
      }
      this.state = {
        ...this.state,
        selectedAgent: agent,
      };
      this.notice = this.state.message ?? '';
      this.renderDynamicContent();
      vscode.postMessage({ command: 'profiler.selectAgent', agent });
    });
    document.getElementById('profiler-sort-bar')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-sort]');
      if (!button) {
        return;
      }
      const field = button.dataset.sort as SortField | undefined;
      if (!field) {
        return;
      }
      if (this.sortField === field) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortField = field;
        this.sortDirection = field === 'name' ? 'asc' : 'desc';
      }
      this.renderDynamicContent();
    });
    document.getElementById('profiler-session-list')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest<HTMLButtonElement>('[data-session-id]');
      if (!row) {
        return;
      }
      const id = row.dataset.sessionId;
      const agent = row.dataset.agent as ProfilerAgentType | undefined;
      if (!id || !agent) {
        return;
      }
      this.notice = this.msg('loading');
      this.renderDynamicContent();
      vscode.postMessage({ command: 'profiler.selectSession', id, agent });
    });
    vscode.postMessage({ command: 'profiler.getState' });
    this.renderDynamicContent();
  }

  onState(state: ProfilerOverviewState) {
    const selectedAgent = this.isDisabledAgent(state.selectedAgent)
      ? DEFAULT_SELECTED_AGENT
      : state.selectedAgent;
    this.state = {
      ...state,
      selectedAgent,
    };
    this.notice =
      state.message ??
      (this.isDisabledAgent(state.selectedAgent)
        ? this.getDisabledAgentNotice(state.selectedAgent)
        : '');
    this.renderDynamicContent();
  }

  onArchiveResult(result: ProfilerArchiveResult) {
    this.notice = `${this.msg('archiveDone')}: ${result.fileCount} -> ${result.targetPath}`;
    this.renderDynamicContent();
  }

  private renderDynamicContent() {
    const loading = this.state.status === 'loading';
    const startButton = document.getElementById(
      'profiler-start-analysis',
    ) as HTMLButtonElement | null;
    const badge = document.getElementById('profiler-status-badge');
    const updatedAt = document.getElementById('profiler-updated-at');
    const tabs = document.getElementById('profiler-tab-row');
    const sortBar = document.getElementById('profiler-sort-bar');
    const list = document.getElementById('profiler-session-list');

    if (startButton) startButton.disabled = loading;
    if (badge) badge.innerHTML = this.renderStatusBadge();
    if (updatedAt) {
      updatedAt.innerHTML = this.renderUpdatedAt();
      updatedAt.setAttribute('title', this.getUpdatedAtTitle());
    }
    if (tabs) {
      tabs.innerHTML = this.renderTabs();
    }
    if (sortBar) {
      sortBar.innerHTML = this.renderSortBar();
    }
    if (list) {
      list.innerHTML = this.renderSessionList();
    }
  }

  private renderTabs(): string {
    return (['claude', 'codex', 'gemini'] as const)
      .map((agent) => {
        const isActive = this.state.selectedAgent === agent;
        const isDisabled = this.isDisabledAgent(agent);
        const count = this.state.sessionsByAgent[agent].length;
        const descriptor = getProfilerAgentDescriptor(agent);
        return `<button class="profiler-tab ${isActive ? 'active' : ''} ${isDisabled ? 'is-disabled' : ''}" data-agent="${agent}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-disabled="${isDisabled ? 'true' : 'false'}" title="${isDisabled ? this.getDisabledAgentNotice(agent) : descriptor.label}">
  <span class="profiler-tab-brand">
    <span class="profiler-agent-icon" aria-hidden="true">${descriptor.iconMarkup}</span>
    <span class="profiler-tab-label">${descriptor.label}</span>
  </span>
  <span>${count}</span>
</button>`;
      })
      .join('');
  }

  private isDisabledAgent(agent: ProfilerAgentType): boolean {
    return agent === 'gemini';
  }

  private getDisabledAgentNotice(agent: ProfilerAgentType): string {
    const descriptor = getProfilerAgentDescriptor(agent);
    return `${descriptor.label} ${this.msg('agentSoon')}`;
  }

  private renderSortBar(): string {
    const sessions = this.state.sessionsByAgent[this.state.selectedAgent] ?? [];
    if (sessions.length === 0) {
      return '';
    }
    const arrow = (field: SortField) => {
      if (this.sortField !== field) {
        return '';
      }
      return this.sortDirection === 'asc' ? ' ↑' : ' ↓';
    };
    const active = (field: SortField) => (this.sortField === field ? ' active' : '');
    return `<div class="profiler-sort-header">
<button class="profiler-sort-btn${active('name')}" data-sort="name">name${arrow('name')}</button>
<button class="profiler-sort-btn${active('time')}" data-sort="time">time${arrow('time')}</button>
<button class="profiler-sort-btn${active('tin')}" data-sort="tin">in${arrow('tin')}</button>
<button class="profiler-sort-btn${active('tout')}" data-sort="tout">out${arrow('tout')}</button>
<button class="profiler-sort-btn${active('size')}" data-sort="size">size${arrow('size')}</button>
</div>`;
  }

  private renderSessionList(): string {
    if (this.state.status === 'loading' && this.state.aggregate.totalSessions === 0) {
      return `<div class="profiler-empty">${this.msg('loading')}</div>`;
    }

    const sessions = this.state.sessionsByAgent[this.state.selectedAgent] ?? [];
    if (sessions.length === 0) {
      return `<div class="profiler-empty">${this.msg('empty')}</div>`;
    }

    const sorted = [...sessions].sort((a, b) => {
      let cmp = 0;
      switch (this.sortField) {
        case 'name':
          cmp = this.getDisplayFileName(a).localeCompare(this.getDisplayFileName(b));
          break;
        case 'time': {
          const ta = a.startedAt ?? a.modifiedAt ?? '';
          const tb = b.startedAt ?? b.modifiedAt ?? '';
          cmp = ta.localeCompare(tb);
          break;
        }
        case 'tin':
          cmp = (a.totalInputTokens ?? 0) - (b.totalInputTokens ?? 0);
          break;
        case 'tout':
          cmp = (a.totalOutputTokens ?? 0) - (b.totalOutputTokens ?? 0);
          break;
        case 'size':
          cmp = a.fileSizeBytes - b.fileSizeBytes;
          break;
      }
      return this.sortDirection === 'asc' ? cmp : -cmp;
    });

    return sorted.map((session) => this.renderSessionRow(session)).join('');
  }

  private renderSessionRow(session: SessionSummary): string {
    const isSelected = this.state.selectedSessionId === session.id;
    const timestamp = session.startedAt ?? session.modifiedAt;
    const title = this.getDisplayFileName(session);
    const inK = this.formatTokensK(session.totalInputTokens);
    const outK = this.formatTokensK(session.totalOutputTokens);
    const badges = this.renderSessionBadges(session);
    return `
<button
  class="profiler-session-card ${isSelected ? 'selected' : ''}"
  data-session-id="${session.id}"
  data-agent="${session.agent}"
  title="${this.escapeAttr(session.filePath)}"
>
    <span class="profiler-session-card-main">
      <span class="profiler-session-card-title-row">
      <span class="profiler-session-card-title-wrap">
        <span class="profiler-session-card-name" title="${this.escapeAttr(title)}">${this.escapeHtml(title)}</span>
        ${badges}
      </span>
      <span class="profiler-session-card-size">${this.formatBytes(session.fileSizeBytes)}</span>
    </span>
    <span class="profiler-session-card-meta-row">
      <span class="profiler-session-card-stamp">${this.formatDate(timestamp)}</span>
      <span class="profiler-session-card-token-group">
        <span class="profiler-session-card-token profiler-session-card-token-in">IN ${inK}</span>
        <span class="profiler-session-card-token profiler-session-card-token-out">OUT ${outK}</span>
      </span>
    </span>
  </span>
</button>`;
  }

  private isLiveSession(session: SessionSummary): boolean {
    const sessions = this.state.sessionsByAgent[session.agent] ?? [];
    return isSessionLikelyLive(session, sessions);
  }

  private isLatestSession(session: SessionSummary): boolean {
    const sessions = this.state.sessionsByAgent[session.agent] ?? [];
    return isSessionLatest(session, sessions);
  }

  private renderSessionBadges(session: SessionSummary): string {
    const badges: string[] = [];

    if (this.isLatestSession(session)) {
      badges.push(
        '<span class="profiler-session-card-badge is-latest" data-profiler-badge="latest">Latest</span>',
      );
    }
    if (this.isLiveSession(session)) {
      badges.push(
        '<span class="profiler-session-card-badge is-live" data-profiler-badge="live">Live</span>',
      );
    }

    return badges.join('');
  }

  private renderStatusBadge(): string {
    const loading = this.state.status === 'loading';
    const statusLabel = loading ? this.msg('loading') : this.state.status.toUpperCase();
    const detail = this.notice && !loading ? ` · ${this.notice}` : '';
    return `<span class="profiler-status-chip ${this.state.status}">${statusLabel}${detail}</span>`;
  }

  private renderUpdatedAt(): string {
    return `${this.msg('updated')} ${this.formatUpdatedAt(this.state.updatedAt)}`;
  }

  private getUpdatedAtTitle(): string {
    if (!this.state.updatedAt) {
      return `${this.msg('updated')} ${this.msg('never')}`;
    }
    return `${this.msg('updated')} ${this.formatDateTime(this.state.updatedAt)}`;
  }

  private renderAutoRefreshOptions(): string {
    return AUTO_REFRESH_OPTIONS.map((value) => {
      const selected = this.autoRefreshMs === value ? ' selected' : '';
      return `<option value="${value}"${selected}>${this.getAutoRefreshLabel(value)}</option>`;
    }).join('');
  }

  private getAutoRefreshLabel(value: number): string {
    if (value === 0) {
      return `${this.msg('autoRefresh')}: ${this.msg('off')}`;
    }
    if (value < 60_000) {
      return `${this.msg('autoRefresh')}: ${value / 1000}s`;
    }
    return `${this.msg('autoRefresh')}: 1m`;
  }

  private syncAutoRefreshTimer() {
    if (this.autoRefreshTimer) {
      window.clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }

    if (this.autoRefreshMs <= 0) {
      return;
    }

    this.autoRefreshTimer = window.setInterval(() => {
      vscode.postMessage({ command: 'profiler.refreshOverview' });
    }, this.autoRefreshMs);
  }

  private formatUpdatedAt(value?: string): string {
    if (!value) {
      return this.msg('never');
    }
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return value;
    }

    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${hour}:${minute}:${second}`;
  }

  private formatDate(value?: string): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return value;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  private formatDateTime(value?: string): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return value;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  private formatTokensK(value?: number): string {
    if (!value || !Number.isFinite(value) || value <= 0) {
      return '0K';
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return `${(value / 1000).toFixed(1)}K`;
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 KB';
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  private formatNumber(value: number): string {
    return Number.isFinite(value) ? value.toLocaleString() : '0';
  }

  private getDisplayFileName(session: SessionSummary): string {
    const title = session.title?.trim();
    if (title) {
      return title;
    }

    const fileName = session.fileName?.trim();
    if (fileName) {
      return fileName;
    }

    const normalizedPath = session.filePath.replace(/\\/g, '/');
    const fallback = normalizedPath.split('/').pop()?.trim();
    return fallback || 'session';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttr(value: string): string {
    return this.escapeHtml(value);
  }

  private msg(key: keyof (typeof MESSAGES)['en']): string {
    return MESSAGES[this.locale][key];
  }
}
