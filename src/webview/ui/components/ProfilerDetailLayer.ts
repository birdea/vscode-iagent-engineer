import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  ProfilerDetailState,
  ProfilerMetricType,
  SessionDetail,
  SessionRawEventRef,
} from '../../../types';
import { getProfilerAgentDescriptor } from '../../../profiler/ProfilerCatalog';
import { vscode } from '../vscodeApi';
import { getDocumentLocale, UiLocale } from '../../../i18n';
import { ProfilerChart } from './ProfilerChart';

const EMPTY_STATE: ProfilerDetailState = {
  status: 'idle',
  message: '세션을 선택하면 상세 분석이 표시됩니다.',
};

export class ProfilerDetailLayer {
  private state = EMPTY_STATE;
  private metric: ProfilerMetricType = 'tokens';
  private readonly locale: UiLocale = getDocumentLocale();
  private chartRoot: Root | null = null;

  render(): string {
    return `
  <section class="profiler-detail-container">
  <div class="profiler-header-surface" id="profiler-header-surface"></div>
  <div class="profiler-chart-surface">
    <div class="profiler-chart-header" id="profiler-chart-header"></div>
    <div class="profiler-chart-wrapper" id="profiler-chart-shell"></div>
  </div>
  <div class="profiler-log-surface">
    <div class="profiler-log-header-row">
      <h3 class="profiler-surface-title">Event Log</h3>
      <span class="profiler-log-count" id="profiler-log-count"></span>
    </div>
    <div class="profiler-log-table" id="profiler-log-table"></div>
  </div>
  </section>`;
  }

  mount() {
    const attachClick = (id: string) => {
      document.getElementById(id)?.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest<HTMLButtonElement>('[data-file-path]');
        if (button) {
          this.openSource(button);
          return;
        }
      });
    };

    attachClick('profiler-chart-shell');
    attachClick('profiler-log-table');

    document.getElementById('profiler-header-surface')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const stopButton = target?.closest<HTMLElement>('[data-profiler-live-stop]');
      if (stopButton) {
        vscode.postMessage({ command: 'profiler.stopLiveData' });
        return;
      }
      const infoButton = target?.closest<HTMLButtonElement>('[data-info-kind]');
      if (infoButton) {
        const kind = infoButton.dataset.infoKind as 'summary' | 'key-events' | undefined;
        if (kind) {
          vscode.postMessage({ command: 'profiler.openInfoDoc', kind });
        }
      }
    });

    vscode.postMessage({ command: 'profiler.getState' });
    this.renderDynamicContent();
  }

  onState(state: ProfilerDetailState) {
    this.state = state;
    this.renderDynamicContent();
  }

  private openSource(button: HTMLButtonElement) {
    const filePath = button.dataset.filePath;
    const lineNumber = Number(button.dataset.lineNumber ?? '1');
    if (!filePath) {
      return;
    }
    vscode.postMessage({ command: 'profiler.openSource', filePath, lineNumber });
  }

  private renderDynamicContent() {
    const headerSurface = document.getElementById('profiler-header-surface');
    const chartShell = document.getElementById('profiler-chart-shell');
    const logTable = document.getElementById('profiler-log-table');
    const logCount = document.getElementById('profiler-log-count');

    if (!headerSurface || !chartShell || !logTable) {
      return;
    }

    if (this.state.status === 'loading') {
      this.unmountChart();
      headerSurface.innerHTML = this.renderStatusPanel(this.state.message ?? '로딩중..');
      chartShell.innerHTML = this.renderLoadingState();
      logTable.innerHTML = '';
      if (logCount) logCount.textContent = '';
      return;
    }

    if (this.state.status !== 'ready' || !this.state.detail) {
      headerSurface.innerHTML = this.renderStatusPanel(
        this.state.message ?? '세션을 선택하면 상세 분석이 표시됩니다.',
      );
      this.unmountChart();
      chartShell.innerHTML = this.renderEmptyState(
        this.state.message ?? '세션을 선택하면 상세 분석이 표시됩니다.',
      );
      logTable.innerHTML = '';
      if (logCount) logCount.textContent = '';
      return;
    }

    const detail = this.state.detail;
    headerSurface.innerHTML = this.renderOverview(detail);
    this.mountChart(chartShell, detail);

    const allEvents = [...detail.rawEvents];
    if (this.state.live?.messages) {
      this.state.live.messages.forEach((msg) => {
        allEvents.push({
          id: msg.id,
          filePath: '',
          lineNumber: 0,
          timestamp: msg.timestamp,
          eventType: 'live',
          category: 'system',
          summary: msg.message,
          excerpt: msg.detail ?? '',
          messagePreview: msg.message,
        });
      });
    }

    allEvents.sort(
      (a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.lineNumber - b.lineNumber,
    );

    logTable.innerHTML = this.renderLogTable(allEvents);
    if (logCount) logCount.textContent = `${allEvents.length} events`;
  }

  private renderLogTable(events: SessionRawEventRef[]): string {
    if (events.length === 0) {
      return '<div class="profiler-empty-state">No events recorded in this session.</div>';
    }

    return events
      .map((event) => {
        const type = event.eventType.toLowerCase();
        const cat = event.category;

        let roleClass = 'system';
        let roleLabel = 'System';

        if (type === 'user' || type === 'user_message' || type === 'token_count') {
          roleClass = 'user';
          roleLabel = 'User';
        } else if (
          type === 'gemini' ||
          type === 'assistant' ||
          type === 'agent_message' ||
          type === 'task_complete' ||
          cat === 'reasoning'
        ) {
          roleClass = 'agent';
          roleLabel = 'Agent';
        }

        const preview = event.messagePreview ?? event.excerpt;
        const time = this.formatTime(event.timestamp).split(' ')[1] ?? '-'; // Extract only time
        const tokens = event.totalTokens || (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
        const kb = event.payloadKb ? `${event.payloadKb.toFixed(1)}KB` : '';

        return `
  <button class="profiler-table-row ${roleClass}" ${this.getSourceAttrs(event)} title="Click to view source">
  <div class="table-cell time">${this.escapeHtml(time)}</div>
  <div class="table-cell role">
    <span class="role-dot"></span>
    ${roleLabel}
  </div>
  <div class="table-cell content">
    <span class="content-text">${this.escapeHtml(preview)}</span>
  </div>
  <div class="table-cell meta">
    ${kb ? `<span class="meta-size">${kb}</span>` : ''}
    ${tokens > 0 ? `<span class="meta-tokens">${this.formatNumber(tokens)}</span>` : ''}
  </div>
  </button>`;
      })
      .join('');
  }

  private renderOverview(detail: SessionDetail): string {
    const summary = detail.summary;
    const descriptor = getProfilerAgentDescriptor(summary.agent);
    const start = summary.startedAt ?? detail.timeline[0]?.timestamp;

    const input = summary.totalInputTokens ?? 0;
    const output = summary.totalOutputTokens ?? 0;
    const total = summary.totalTokens ?? input + output;
    const cost = this.estimateCost(summary.model, input, output);

    // Additional metrics
    const spanMs = this.getSpanMs(
      start,
      detail.timeline[detail.timeline.length - 1]?.endTimestamp ??
        detail.timeline[detail.timeline.length - 1]?.timestamp,
    );
    const peakTokens = Math.max(
      0,
      ...detail.timeline.map((p) => p.totalTokens ?? (p.inputTokens ?? 0) + (p.outputTokens ?? 0)),
    );
    const avgTokens = detail.timeline.length > 0 ? Math.round(total / detail.timeline.length) : 0;
    const cachedRatio =
      total > 0 && summary.totalCachedTokens
        ? ((summary.totalCachedTokens / total) * 100).toFixed(1)
        : '0.0';

    return `
  <div class="profiler-hero">
  <div class="profiler-hero-brand">
    <div class="brand-icon">${descriptor.iconSvg}</div>
    <div class="brand-text">
      <span class="vendor">${this.escapeHtml(descriptor.vendor)}</span>
      <h1 class="model-title">${this.escapeHtml(summary.model ?? descriptor.label)}</h1>
      <span class="session-id">${this.escapeHtml(summary.id)}</span>
    </div>
  </div>
  <div class="profiler-live-indicator">
    ${this.state.live?.active ? '<span class="status-dot connected"></span> <strong data-profiler-live-stop="true" style="cursor:pointer">Live active</strong>' : ''}
  </div>
  </div>

  <div class="profiler-metric-board">
  <div class="metric-group primary">
    ${this.metricItem('파일', this.truncate(summary.fileName, 32))}
    ${this.metricItem('크기', this.formatBytes(summary.fileSizeBytes))}
    ${this.metricItem('날짜', start ? this.formatStamp(start).split(' ')[0] : '-')}
    ${this.metricItem('소요', this.formatDuration(spanMs))}
    ${this.metricItem('토큰', `${this.formatNumber(input)} / ${this.formatNumber(output)}`)}
    ${this.metricItem('비용', cost > 0 ? `~$${cost.toFixed(4)}` : '-')}
  </div>
  <div class="metric-group secondary">
    ${this.metricItem('턴', String(summary.requestCount ?? detail.timeline.length))}
    ${this.metricItem('피크 턴', this.formatNumber(peakTokens))}
    ${this.metricItem('평균/턴', this.formatNumber(avgTokens))}
    ${this.metricItem('캐시 비율', `${cachedRatio}%`)}
    ${this.metricItem('최대 지연', this.formatDuration(Math.max(0, ...detail.timeline.map((p) => p.latencyMs ?? 0))))}
    ${this.metricItem('합계 토큰', this.formatNumber(total))}
  </div>
  </div>`;
  }

  private metricItem(label: string, value: string): string {
    return `
  <div class="metric-item">
  <span class="metric-label">${label}</span>
  <span class="metric-value">${this.escapeHtml(value)}</span>
  </div>`;
  }
  private mountChart(container: HTMLElement, detail: SessionDetail) {
    if (!this.chartRoot) {
      container.innerHTML = '';
      this.chartRoot = createRoot(container);
    }
    this.chartRoot.render(
      React.createElement(ProfilerChart, {
        detail,
        metric: this.metric,
        onOpenSource: (filePath: string, lineNumber: number) => {
          vscode.postMessage({ command: 'profiler.openSource', filePath, lineNumber });
        },
      }),
    );
  }

  private unmountChart() {
    if (!this.chartRoot) {
      return;
    }
    this.chartRoot.unmount();
    this.chartRoot = null;
  }

  private estimateCost(model: string | undefined, input: number, output: number): number {
    if (!model) return 0;
    const m = model.toLowerCase();

    // Simple estimation based on common pricing (per 1M tokens)
    let inputRate = 0;
    let outputRate = 0;

    if (m.includes('claude-3-5-sonnet')) {
      inputRate = 3.0;
      outputRate = 15.0;
    } else if (m.includes('claude-3-opus')) {
      inputRate = 15.0;
      outputRate = 75.0;
    } else if (m.includes('claude-3-haiku')) {
      inputRate = 0.25;
      outputRate = 1.25;
    } else if (m.includes('gemini-1.5-pro')) {
      inputRate = 3.5;
      outputRate = 10.5;
    } else if (m.includes('gemini-1.5-flash')) {
      inputRate = 0.075;
      outputRate = 0.3;
    } else if (m.includes('gpt-4o')) {
      inputRate = 5.0;
      outputRate = 15.0;
    } else if (m.includes('gpt-4-turbo')) {
      inputRate = 10.0;
      outputRate = 30.0;
    } else if (m.includes('gpt-3.5-turbo')) {
      inputRate = 0.5;
      outputRate = 1.5;
    }

    return (input / 1_000_000) * inputRate + (output / 1_000_000) * outputRate;
  }

  private renderLoadingState(): string {
    return `
<div class="profiler-loading-state">
  <div class="profiler-spinner"></div>
  <div>로딩중..</div>
</div>`;
  }

  private renderEmptyState(message: string): string {
    return `<div class="profiler-empty-chart">${this.escapeHtml(message)}</div>`;
  }

  private renderStatusPanel(message: string): string {
    return `
<div class="profiler-overview-panel">
  <div class="profiler-empty-chart">${this.escapeHtml(message)}</div>
</div>`;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  private getSpanMs(start?: string, end?: string): number {
    if (!start || !end) return 0;
    return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  private formatNumber(value: number): string {
    return Number.isFinite(value) ? value.toLocaleString() : '0';
  }

  private formatTime(value?: string): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return value;
    }
    return date.toLocaleString(this.locale === 'ko' ? 'ko-KR' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatStamp(value?: string): string {
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

  private truncate(value: string, length = 120): string {
    return value.length > length ? `${value.slice(0, length)}...` : value;
  }

  private getSourceAttrs(raw?: SessionRawEventRef): string {
    if (!raw) {
      return '';
    }
    return `data-file-path="${this.escapeAttr(raw.filePath)}" data-line-number="${raw.lineNumber}"`;
  }

  private escapeHtml(value: string | undefined | null): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttr(value: string | undefined | null): string {
    return this.escapeHtml(value);
  }
}
