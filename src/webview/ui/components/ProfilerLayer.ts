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
    | 'deleteSelected'
    | 'deleteAll'
    | 'selected'
    | 'updated'
    | 'never'
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
    deleteSelected: 'Delete Selected',
    deleteAll: 'Delete All',
    selected: 'selected',
    updated: 'Updated',
    never: 'Never',
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
    deleteSelected: '선택 삭제',
    deleteAll: '전체 삭제',
    selected: '선택',
    updated: '업데이트',
    never: '기록 없음',
    off: '끔',
  },
};

export class ProfilerLayer {
  private state = EMPTY_STATE;
  private locale: UiLocale = getDocumentLocale();
  private notice = '';
  private sortField: SortField = 'time';
  private sortDirection: SortDirection = 'desc';
  private autoRefreshMs = this.readInitialRefreshPeriod();
  private autoRefreshTimer?: number;
  private selectedIdsByAgent: Record<ProfilerAgentType, Set<string>> = {
    claude: new Set<string>(),
    codex: new Set<string>(),
    gemini: new Set<string>(),
  };

  render(): string {
    return `
<section class="panel panel-compact profiler-panel-shell">
  <div class="section-heading">
    <div class="profiler-heading-copy">
      <div class="panel-title">${this.msg('title')}</div>
      <div class="section-status profiler-updated-at" id="profiler-updated-at" title="${this.escapeAttr(this.getUpdatedAtTitle())}">${this.renderUpdatedAt()}</div>
    </div>
    <div class="profiler-heading-actions">
      <div class="section-status" id="profiler-status-badge">${this.renderStatusBadge()}</div>
    </div>
  </div>
  <div class="profiler-tab-row" id="profiler-tab-row" role="tablist" aria-label="Agents"></div>
  <div class="profiler-sort-bar" id="profiler-sort-bar"></div>
  <div class="profiler-list" id="profiler-session-list"></div>
</section>`;
  }

  mount() {
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
      this.reportSelectionState();
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
    document.getElementById('profiler-session-list')?.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target?.matches('[data-session-select]')) {
        return;
      }

      const id = target.dataset.sessionSelect;
      const agent = target.dataset.agent as ProfilerAgentType | undefined;
      if (!id || !agent) {
        return;
      }

      this.setSessionSelected(agent, id, target.checked);
      this.renderDynamicContent();
      this.reportSelectionState();
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
    this.syncAutoRefreshTimer();
    this.reportSelectionState();
  }

  dispose() {
    if (this.autoRefreshTimer) {
      window.clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }
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
    this.pruneSelectedIds();
    this.renderDynamicContent();
    this.reportSelectionState();
  }

  onArchiveResult(result: ProfilerArchiveResult) {
    this.notice = `${this.msg('archiveDone')}: ${result.fileCount} -> ${result.targetPath}`;
    this.renderDynamicContent();
  }

  onSettingsChanged(refreshPeriodMs: number) {
    this.autoRefreshMs = this.normalizeRefreshPeriod(refreshPeriodMs);
    this.syncAutoRefreshTimer();
    this.renderDynamicContent();
  }

  onPerformAction(action: 'refresh' | 'deleteSelected' | 'toggleSelectAll') {
    switch (action) {
      case 'refresh':
        this.runRefresh();
        return;
      case 'deleteSelected':
        this.runDeleteSelected();
        return;
      case 'toggleSelectAll':
        this.toggleSelectAll();
        return;
    }
  }

  private renderDynamicContent() {
    const badge = document.getElementById('profiler-status-badge');
    const updatedAt = document.getElementById('profiler-updated-at');
    const tabs = document.getElementById('profiler-tab-row');
    const sortBar = document.getElementById('profiler-sort-bar');
    const list = document.getElementById('profiler-session-list');

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

  private isDisabledAgent(_agent: ProfilerAgentType): boolean {
    return false;
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

  private runRefresh() {
    this.notice = this.msg('loading');
    this.renderDynamicContent();
    vscode.postMessage({ command: 'profiler.refreshOverview', agent: this.state.selectedAgent });
  }

  private runDeleteSelected() {
    const agent = this.state.selectedAgent;
    const ids = this.getSelectedIds(agent);
    if (ids.length === 0) {
      return;
    }

    this.notice = this.msg('loading');
    this.renderDynamicContent();
    vscode.postMessage({ command: 'profiler.deleteSessions', ids, agent });
  }

  private toggleSelectAll() {
    const agent = this.state.selectedAgent;
    const sessions = this.state.sessionsByAgent[agent] ?? [];
    const allSelected =
      sessions.length > 0 && sessions.every((session) => this.isSessionSelected(agent, session.id));

    if (allSelected) {
      this.selectedIdsByAgent[agent].clear();
    } else {
      this.selectedIdsByAgent[agent] = new Set(sessions.map((session) => session.id));
    }

    this.renderDynamicContent();
    this.reportSelectionState();
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
    const isChecked = this.isSessionSelected(session.agent, session.id);
    const timestamp = session.startedAt ?? session.modifiedAt;
    const title = this.getDisplayFileName(session);
    const inK = this.formatTokensK(session.totalInputTokens);
    const outK = this.formatTokensK(session.totalOutputTokens);
    const badges = this.renderSessionBadges(session);
    return `
<div class="profiler-session-row">
  <label class="profiler-session-check" title="${this.escapeAttr(`${this.msg('selected')} ${title}`)}">
    <input
      type="checkbox"
      class="profiler-session-check-input"
      data-session-select="${session.id}"
      data-agent="${session.agent}"
      ${isChecked ? 'checked' : ''}
    />
    <span class="profiler-session-check-mark" aria-hidden="true"></span>
  </label>
<button
  class="profiler-session-card ${isSelected ? 'selected' : ''}"
  data-session-id="${session.id}"
  data-agent="${session.agent}"
  type="button"
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
</button>
</div>`;
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

  private syncAutoRefreshTimer() {
    if (this.autoRefreshTimer) {
      window.clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }

    if (this.autoRefreshMs <= 0) {
      return;
    }

    this.autoRefreshTimer = window.setInterval(() => {
      vscode.postMessage({ command: 'profiler.refreshOverview', agent: this.state.selectedAgent });
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

  private getSelectedIds(agent: ProfilerAgentType): string[] {
    return [...this.selectedIdsByAgent[agent]];
  }

  private isSessionSelected(agent: ProfilerAgentType, id: string): boolean {
    return this.selectedIdsByAgent[agent].has(id);
  }

  private setSessionSelected(agent: ProfilerAgentType, id: string, selected: boolean) {
    if (selected) {
      this.selectedIdsByAgent[agent].add(id);
      return;
    }
    this.selectedIdsByAgent[agent].delete(id);
  }

  private pruneSelectedIds() {
    for (const agent of ['claude', 'codex', 'gemini'] as const) {
      const validIds = new Set(this.state.sessionsByAgent[agent].map((session) => session.id));
      this.selectedIdsByAgent[agent] = new Set(
        [...this.selectedIdsByAgent[agent]].filter((id) => validIds.has(id)),
      );
    }
  }

  private reportSelectionState() {
    const agent = this.state.selectedAgent;
    const totalCount = this.state.sessionsByAgent[agent]?.length ?? 0;
    const selectedCount = this.getSelectedIds(agent).length;
    vscode.postMessage({
      command: 'profiler.reportSelectionState',
      summary: {
        agent,
        selectedCount,
        totalCount,
        allSelected: totalCount > 0 && selectedCount === totalCount,
      },
    });
  }

  private readInitialRefreshPeriod(): number {
    const rawValue = document.body.dataset.profilerRefreshPeriodMs;
    return this.normalizeRefreshPeriod(Number(rawValue ?? '1000'));
  }

  private normalizeRefreshPeriod(value: number): number {
    return AUTO_REFRESH_OPTIONS.includes(value as (typeof AUTO_REFRESH_OPTIONS)[number])
      ? value
      : 1000;
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
