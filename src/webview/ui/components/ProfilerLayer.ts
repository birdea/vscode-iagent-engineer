import {
  ProfilerArchiveResult,
  ProfilerOverviewState,
  SessionSummary,
  ProfilerAgentType,
} from '../../../types';
import { vscode } from '../vscodeApi';
import { getDocumentLocale, UiLocale } from '../../../i18n';

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
    scan: 'Start Analysis',
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
    scan: 'Start Analysis',
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

  render(): string {
    return `
<section class="panel panel-compact profiler-panel-shell">
  <div class="section-heading">
    <div>
      <div class="panel-title">${this.msg('title')}</div>
    </div>
    <div class="section-status" id="profiler-status-badge">${this.renderStatusBadge()}</div>
  </div>
  <div class="btn-row profiler-toolbar">
    <button class="primary" id="profiler-start-analysis">${this.msg('scan')}</button>
    <button class="secondary" id="profiler-archive-all">${this.msg('archive')}</button>
  </div>
  <div class="notice ${this.notice ? 'info' : 'hidden'}" id="profiler-notice">${this.notice}</div>
  <div class="profiler-metric-grid" id="profiler-metric-grid"></div>
  <div class="profiler-tab-row" id="profiler-tab-row"></div>
  <div class="profiler-list" id="profiler-session-list"></div>
</section>`;
  }

  mount() {
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
    const archiveButton = document.getElementById(
      'profiler-archive-all',
    ) as HTMLButtonElement | null;
    const notice = document.getElementById('profiler-notice');
    const badge = document.getElementById('profiler-status-badge');
    const metrics = document.getElementById('profiler-metric-grid');
    const tabs = document.getElementById('profiler-tab-row');
    const list = document.getElementById('profiler-session-list');

    if (startButton) startButton.disabled = loading;
    if (archiveButton) archiveButton.disabled = loading || this.state.aggregate.totalSessions === 0;
    if (badge) badge.innerHTML = this.renderStatusBadge();
    if (notice) {
      notice.textContent = this.notice;
      notice.className = `notice ${this.notice ? 'info' : 'hidden'}`;
    }
    if (metrics) {
      metrics.innerHTML = this.renderMetrics();
    }
    if (tabs) {
      tabs.innerHTML = this.renderTabs();
    }
    if (list) {
      list.innerHTML = this.renderSessionList();
    }
  }

  private renderMetrics(): string {
    const aggregate = this.state.aggregate;
    return [
      this.metricCard(this.msg('sessions'), String(aggregate.totalSessions)),
      this.metricCard(this.msg('input'), this.formatNumber(aggregate.totalInputTokens)),
      this.metricCard(this.msg('output'), this.formatNumber(aggregate.totalOutputTokens)),
      this.metricCard(this.msg('fileSize'), this.formatBytes(aggregate.totalFileSizeBytes)),
    ].join('');
  }

  private renderTabs(): string {
    return (['claude', 'codex', 'gemini'] as const)
      .map((agent) => {
        const isActive = this.state.selectedAgent === agent;
        const count = this.state.sessionsByAgent[agent].length;
        return `<button class="profiler-tab ${isActive ? 'active' : ''}" data-agent="${agent}">${agent.toUpperCase()} <span>${count}</span></button>`;
      })
      .join('');
  }

  private renderSessionList(): string {
    if (this.state.status === 'loading' && this.state.aggregate.totalSessions === 0) {
      return `<div class="profiler-empty">${this.msg('loading')}</div>`;
    }

    const sessions = this.state.sessionsByAgent[this.state.selectedAgent] ?? [];
    if (sessions.length === 0) {
      return `<div class="profiler-empty">${this.msg('empty')}</div>`;
    }

    return sessions.map((session) => this.renderSessionRow(session)).join('');
  }

  private renderSessionRow(session: SessionSummary): string {
    const isSelected = this.state.selectedSessionId === session.id;
    const timestamp = session.startedAt ?? session.modifiedAt;
    const displayName = this.truncate(session.fileName, 20);
    return `
<button
  class="profiler-session-row ${isSelected ? 'selected' : ''}"
  data-session-id="${session.id}"
  data-agent="${session.agent}"
  title="${this.escapeAttr(session.filePath)}"
>
  <span class="profiler-session-file" title="${this.escapeAttr(session.fileName)}">${this.escapeHtml(displayName)}</span>
  <span class="profiler-session-stamp">${this.formatDate(timestamp)}</span>
  <span class="profiler-session-size">${this.formatBytes(session.fileSizeBytes)}</span>
</button>`;
  }

  private renderStatusBadge(): string {
    const loading = this.state.status === 'loading';
    const label = loading ? this.msg('loading') : this.state.status.toUpperCase();
    return `<span class="profiler-status-chip ${this.state.status}">${label}</span>`;
  }

  private metricCard(label: string, value: string): string {
    return `
<div class="profiler-metric-card">
  <span class="profiler-metric-label">${label}</span>
  <strong class="profiler-metric-value">${value}</strong>
</div>`;
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
