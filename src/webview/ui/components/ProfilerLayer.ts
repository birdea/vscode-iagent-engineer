import {
  ProfilerArchiveResult,
  ProfilerOverviewState,
  SessionSummary,
  ProfilerAgentType,
} from '../../../types';
import { vscode } from '../vscodeApi';
import { getDocumentLocale, UiLocale } from '../../../i18n';

type SortField = 'name' | 'time' | 'size';
type SortDirection = 'asc' | 'desc';

const AGENT_ICONS: Record<ProfilerAgentType, string> = {
  claude: `<svg class="profiler-tab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.28 11.21L9.57 3.88C9.3 3.59 8.88 3.5 8.52 3.66C8.16 3.82 7.94 4.19 7.97 4.58L8.45 10.59L4.08 12.4C3.74 12.54 3.52 12.87 3.52 13.24C3.52 13.61 3.74 13.94 4.08 14.08L8.45 15.89L7.97 21.9C7.94 22.29 8.16 22.66 8.52 22.82C8.88 22.98 9.3 22.89 9.57 22.6L16.28 15.27C16.72 14.79 16.96 14.16 16.96 13.5V12.98C16.96 12.32 16.72 11.69 16.28 11.21Z" fill="currentColor"/><path d="M20.48 10.38L18.04 7.66C17.89 7.5 17.66 7.44 17.46 7.53C17.26 7.62 17.14 7.82 17.15 8.04L17.42 11.43L15 12.45C14.81 12.53 14.69 12.71 14.69 12.92C14.69 13.13 14.81 13.31 15 13.39L17.42 14.41L17.15 17.8C17.14 18.02 17.26 18.22 17.46 18.31C17.66 18.4 17.89 18.34 18.04 18.18L20.48 15.46C20.73 15.19 20.86 14.83 20.86 14.46V11.38C20.86 11.01 20.73 10.65 20.48 10.38Z" fill="currentColor" opacity="0.6"/></svg>`,
  codex: `<svg class="profiler-tab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/><line x1="12" y1="3" x2="12" y2="7" stroke="currentColor" stroke-width="2"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2"/><line x1="3" y1="12" x2="7" y2="12" stroke="currentColor" stroke-width="2"/><line x1="17" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2"/></svg>`,
  gemini: `<svg class="profiler-tab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C12 2 14.5 6.5 18 8.5C14.5 10.5 12 15 12 15C12 15 9.5 10.5 6 8.5C9.5 6.5 12 2 12 2Z" fill="currentColor"/><path d="M12 9C12 9 13.5 12 16 13.5C13.5 15 12 18 12 18C12 18 10.5 15 8 13.5C10.5 12 12 9 12 9Z" fill="currentColor" opacity="0.6" transform="translate(0, 4)"/></svg>`,
};

const EMPTY_STATE: ProfilerOverviewState = {
  status: 'idle',
  selectedAgent: 'codex',
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
    | 'live'
    | 'archive'
    | 'loading'
    | 'empty'
    | 'sessions'
    | 'input'
    | 'output'
    | 'fileSize'
    | 'noSelection'
    | 'archiveDone',
    string
  >
> = {
  en: {
    title: 'Agent Session Profiler',
    scan: 'See OldData',
    live: 'See LiveData',
    archive: 'Archive All',
    loading: '로딩중..',
    empty: 'No sessions found.',
    sessions: 'Sessions',
    input: 'Input',
    output: 'Output',
    fileSize: 'Size',
    noSelection: 'Select a session to inspect details.',
    archiveDone: 'Archive completed',
  },
  ko: {
    title: 'Agent 세션 프로파일러',
    scan: 'See OldData',
    live: 'See LiveData',
    archive: 'Archive All',
    loading: '로딩중..',
    empty: '검색된 세션이 없습니다.',
    sessions: '세션',
    input: 'Input',
    output: 'Output',
    fileSize: '크기',
    noSelection: '세션을 선택하면 상세 분석이 표시됩니다.',
    archiveDone: '아카이브 완료',
  },
};

export class ProfilerLayer {
  private state = EMPTY_STATE;
  private locale: UiLocale = getDocumentLocale();
  private notice = '';
  private sortField: SortField = 'time';
  private sortDirection: SortDirection = 'desc';

  render(): string {
    return `
<section class="panel panel-compact profiler-panel-shell">
  <div class="section-heading">
    <div>
      <div class="panel-title">${this.msg('title')}</div>
    </div>
    <div class="section-status" id="profiler-status-badge">${this.renderStatusBadge()}</div>
  </div>
  <div class="btn-row profiler-toolbar profiler-toolbar-inline">
    <button class="secondary" id="profiler-see-livedata">${this.msg('live')}</button>
    <button class="primary" id="profiler-start-analysis">${this.msg('scan')}</button>
    <button class="primary" id="profiler-archive-all">${this.msg('archive')}</button>
  </div>
  <div class="notice ${this.notice ? 'info' : 'hidden'}" id="profiler-notice">${this.notice}</div>
  <div class="profiler-tab-row" id="profiler-tab-row"></div>
  <div class="profiler-sort-bar" id="profiler-sort-bar"></div>
  <div class="profiler-list" id="profiler-session-list"></div>
</section>`;
  }

  mount() {
    document
      .getElementById('profiler-see-livedata')
      ?.addEventListener('click', () => vscode.postMessage({ command: 'profiler.startLiveData' }));
    document
      .getElementById('profiler-start-analysis')
      ?.addEventListener('click', () => vscode.postMessage({ command: 'profiler.scan' }));
    document
      .getElementById('profiler-archive-all')
      ?.addEventListener('click', () => vscode.postMessage({ command: 'profiler.archiveAll' }));
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
      this.state = {
        ...this.state,
        selectedAgent: agent,
      };
      this.renderDynamicContent();
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
    this.state = state;
    this.notice = state.message ?? '';
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
    const liveButton = document.getElementById('profiler-see-livedata') as HTMLButtonElement | null;
    const archiveButton = document.getElementById(
      'profiler-archive-all',
    ) as HTMLButtonElement | null;
    const notice = document.getElementById('profiler-notice');
    const badge = document.getElementById('profiler-status-badge');
    const tabs = document.getElementById('profiler-tab-row');
    const sortBar = document.getElementById('profiler-sort-bar');
    const list = document.getElementById('profiler-session-list');

    if (liveButton) liveButton.disabled = loading;
    if (startButton) startButton.disabled = loading;
    if (archiveButton) archiveButton.disabled = loading || this.state.aggregate.totalSessions === 0;
    if (badge) badge.innerHTML = this.renderStatusBadge();
    if (notice) {
      notice.textContent = this.notice;
      notice.className = `notice ${this.notice ? 'info' : 'hidden'}`;
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
        const count = this.state.sessionsByAgent[agent].length;
        const icon = AGENT_ICONS[agent];
        return `<button class="profiler-tab-item ${isActive ? 'active' : ''}" data-agent="${agent}">${icon}<span class="profiler-tab-label">${agent.toUpperCase()}</span><span class="profiler-tab-count">${count}</span></button>`;
      })
      .join('');
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
    return `
<button class="profiler-sort-btn profiler-sort-btn-name${active('name')}" data-sort="name">Name${arrow('name')}</button>
<button class="profiler-sort-btn profiler-sort-btn-time${active('time')}" data-sort="time">Time${arrow('time')}</button>
<button class="profiler-sort-btn profiler-sort-btn-size${active('size')}" data-sort="size">Size${arrow('size')}</button>`;
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
          cmp = a.fileName.localeCompare(b.fileName);
          break;
        case 'time': {
          const ta = a.startedAt ?? a.modifiedAt ?? '';
          const tb = b.startedAt ?? b.modifiedAt ?? '';
          cmp = ta.localeCompare(tb);
          break;
        }
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
    return `
<button
  class="profiler-session-row ${isSelected ? 'selected' : ''}"
  data-session-id="${session.id}"
  data-agent="${session.agent}"
  title="${this.escapeAttr(session.filePath)}"
>
  <span class="profiler-session-file" title="${this.escapeAttr(session.fileName)}">${this.escapeHtml(session.fileName)}</span>
  <span class="profiler-session-stamp">${this.formatDate(timestamp)}</span>
  <span class="profiler-session-size">${this.formatBytes(session.fileSizeBytes)}</span>
</button>`;
  }

  private renderStatusBadge(): string {
    const loading = this.state.status === 'loading';
    const label = loading ? this.msg('loading') : this.state.status.toUpperCase();
    return `<span class="profiler-status-chip ${this.state.status}">${label}</span>`;
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

  private truncate(value: string, length: number): string {
    if (value.length <= length) {
      return value;
    }
    return `${value.slice(0, Math.max(0, length - 3))}...`;
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
