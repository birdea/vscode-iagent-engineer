import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  ProfilerDetailState,
  ProfilerMetricType,
  SessionDetail,
  SessionRawEventRef,
  SessionTimelinePoint,
} from '../../../types';
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
<section class="panel profiler-detail-shell">
  <div class="profiler-detail-overview" id="profiler-detail-overview"></div>
  <div class="profiler-detail-viewer">
    <div class="profiler-chart-shell" id="profiler-chart-shell"></div>
  </div>
  <div class="profiler-detail-secondary">
    <div class="profiler-live-feed" id="profiler-live-feed"></div>
    <div class="profiler-bubble-list" id="profiler-bubble-list"></div>
    <div class="profiler-raw-list" id="profiler-raw-list"></div>
  </div>
</section>`;
  }

  mount() {
    document.getElementById('profiler-chart-shell')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-file-path]');
      if (!button) {
        return;
      }
      this.openSource(button);
    });
    document.getElementById('profiler-bubble-list')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-file-path]');
      if (!button) {
        return;
      }
      this.openSource(button);
    });
    document.getElementById('profiler-raw-list')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-file-path]');
      if (!button) {
        return;
      }
      this.openSource(button);
    });
    document.getElementById('profiler-detail-overview')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-profiler-live-stop]');
      if (!button) {
        return;
      }
      vscode.postMessage({ command: 'profiler.stopLiveData' });
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
    const overview = document.getElementById('profiler-detail-overview');
    const chartShell = document.getElementById('profiler-chart-shell');
    const liveFeed = document.getElementById('profiler-live-feed');
    const bubbleList = document.getElementById('profiler-bubble-list');
    const rawList = document.getElementById('profiler-raw-list');

    if (!overview || !chartShell || !liveFeed || !bubbleList || !rawList) {
      return;
    }

    if (this.state.status === 'loading') {
      this.unmountChart();
      overview.innerHTML = this.renderStatusPanel(this.state.message ?? '로딩중..');
      chartShell.innerHTML = this.renderLoadingState();
      liveFeed.innerHTML = this.renderLiveFeed();
      bubbleList.innerHTML = '';
      rawList.innerHTML = '';
      return;
    }

    if (this.state.status !== 'ready' || !this.state.detail) {
      overview.innerHTML = this.renderStatusPanel(
        this.state.message ?? '세션을 선택하면 상세 분석이 표시됩니다.',
      );
      this.unmountChart();
      chartShell.innerHTML = this.renderEmptyState(
        this.state.message ?? '세션을 선택하면 상세 분석이 표시됩니다.',
      );
      liveFeed.innerHTML = this.renderLiveFeed();
      bubbleList.innerHTML = '';
      rawList.innerHTML = '';
      return;
    }

    const detail = this.state.detail;
    overview.innerHTML = this.renderOverview(detail);
    this.mountChart(chartShell, detail);
    liveFeed.innerHTML = this.renderLiveFeed();
    bubbleList.innerHTML = this.renderBubbleList(detail);
    rawList.innerHTML = this.renderRawList(detail);
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

  private renderOverview(detail: SessionDetail): string {
    const summary = detail.summary;
    const timeline = this.getOrderedTimeline(detail.timeline);
    const start = summary.startedAt ?? timeline[0]?.timestamp;
    const end =
      summary.endedAt ??
      timeline[timeline.length - 1]?.endTimestamp ??
      timeline[timeline.length - 1]?.timestamp;
    const firstPoint = timeline[0];
    const lastPoint = timeline[timeline.length - 1];
    const spanMs = this.getSpanMs(
      summary.startedAt ?? firstPoint?.timestamp,
      summary.endedAt ?? lastPoint?.endTimestamp ?? lastPoint?.timestamp,
    );
    const peakTokens = Math.max(
      0,
      ...timeline.map((point) => point.totalTokens ?? this.getTokenTotal(point)),
    );
    const peakLatency = Math.max(0, ...timeline.map((point) => point.latencyMs ?? 0));
    const topToken = timeline.length
      ? [...timeline].sort(
          (a, b) =>
            (b.totalTokens ?? this.getTokenTotal(b)) - (a.totalTokens ?? this.getTokenTotal(a)),
        )[0]
      : undefined;
    const topPayload = timeline.length
      ? [...timeline].sort((a, b) => (b.payloadKb ?? 0) - (a.payloadKb ?? 0))[0]
      : undefined;
    const topLatency = timeline.length
      ? [...timeline].sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))[0]
      : undefined;
    const live = this.state.live;

    return `
<div class="profiler-overview-panel">
  <div class="profiler-overview-head">
    <div class="profiler-overview-identity">
      <span>Session</span>
      <strong title="${this.escapeAttr(summary.fileName)}">${this.escapeHtml(this.truncate(summary.fileName, 48))}</strong>
      <p title="${this.escapeAttr(summary.filePath)}">${this.escapeHtml(this.compactPath(summary.filePath, 6))}</p>
    </div>
    <div class="profiler-meta-inline">
      ${live?.status && live.status !== 'idle' ? this.metaPill('Live', live.status.toUpperCase()) : ''}
      ${this.metaPill('Timestamp', start ? this.formatStamp(start) : '-')}
      ${this.metaPill('Range', start && end ? `${this.formatClock(start)} -> ${this.formatClock(end)}` : '-')}
      ${this.metaPill('Source', detail.metadata.sourceFormat)}
      ${this.metaPill('Provider', detail.metadata.provider ?? summary.agent)}
      ${this.metaPill('Status', summary.parseStatus.toUpperCase())}
      ${this.metaPill('Workspace', detail.metadata.cwd ? this.compactPath(detail.metadata.cwd, 5) : '-')}
    </div>
  </div>
  ${this.renderLiveStatusLine()}
  <div class="profiler-overview-board">
    ${this.summaryCell('Total', this.formatNumber(summary.totalTokens ?? 0))}
    ${this.summaryCell('Turns', this.formatNumber(summary.requestCount ?? timeline.length))}
    ${this.summaryCell('Peak turn', this.formatNumber(peakTokens))}
    ${this.summaryCell('Slowest', this.formatDuration(peakLatency))}
    ${this.summaryCell('Span', this.formatDuration(spanMs))}
    ${this.summaryCell('Size', this.formatBytes(summary.fileSizeBytes))}
    ${this.summaryCell('Peak tokens', topToken ? this.formatNumber(topToken.totalTokens ?? this.getTokenTotal(topToken)) : '-')}
    ${this.summaryCell('Largest payload', topPayload ? this.formatMetricValue(topPayload.payloadKb ?? 0, 'data') : '-')}
    ${this.summaryCell('Slowest request', topLatency ? this.formatMetricValue(topLatency.latencyMs ?? 0, 'latency') : '-')}
  </div>
</div>`;
  }

  private renderLiveStatusLine(): string {
    const live = this.state.live;
    if (!live || (live.status === 'idle' && live.messages.length === 0)) {
      return '';
    }

    const connectedText = live.filePath
      ? `${live.agent?.toUpperCase() ?? 'LIVE'} · ${this.escapeHtml(this.compactPath(live.filePath, 6))}`
      : 'Watching the latest session candidate';
    const updatedText = live.updatedAt ? this.formatTime(live.updatedAt) : '-';

    return `
<div class="profiler-live-status-row">
  <div class="profiler-live-status-copy">
    <strong>${live.active ? 'LiveData active' : 'LiveData idle'}</strong>
    <span>${connectedText}</span>
    <span>Last sync ${updatedText}</span>
  </div>
  ${
    live.active
      ? '<button class="secondary profiler-live-stop" data-profiler-live-stop="true">Stop LiveData</button>'
      : ''
  }
</div>`;
  }

  private renderBubbleList(detail: SessionDetail): string {
    const bubbles = detail.eventBubbles.slice(0, 8);
    const body =
      bubbles.length === 0
        ? '<div class="profiler-empty">No key events extracted for this session.</div>'
        : bubbles
            .map((bubble) => {
              const raw = this.findRawEvent(detail, bubble.rawEventId);
              if (!raw) {
                return '';
              }
              return `
<button class="profiler-bubble-card" ${this.getSourceAttrs(raw)}>
  <div class="profiler-bubble-card-top">
    <strong>${this.escapeHtml(bubble.title)}</strong>
    <span>${this.escapeHtml(this.formatTime(bubble.timestamp))}</span>
  </div>
  <p>${this.escapeHtml(this.truncate(bubble.detail, 140))}</p>
</button>`;
            })
            .join('');

    return `
<section class="profiler-side-section">
  <div class="profiler-section-label">Key events</div>
  ${body}
</section>`;
  }

  private renderRawList(detail: SessionDetail): string {
    const rows = detail.rawEvents.slice(0, 16);
    return `
<section class="profiler-side-section">
  <div class="profiler-section-label">Linked raw events</div>
  ${rows
    .map((event) => {
      return `
<button class="profiler-raw-row" ${this.getSourceAttrs(event)}>
  <div class="profiler-raw-header">
    <strong>${this.escapeHtml(event.summary)}</strong>
    <span>${this.escapeHtml(this.formatTime(event.timestamp))}</span>
  </div>
  <div class="profiler-raw-meta">${this.escapeHtml(event.eventType)} · line ${event.lineNumber} · ${
    event.payloadKb ? `${event.payloadKb.toFixed(1)} KB` : 'n/a'
  }</div>
  <pre>${this.escapeHtml(this.truncate(event.excerpt, 200))}</pre>
</button>`;
    })
    .join('')}
</section>`;
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
  ${this.renderLiveStatusLine()}
  <div class="profiler-empty-chart">${this.escapeHtml(message)}</div>
</div>`;
  }

  private renderLiveFeed(): string {
    const messages = this.state.live?.messages ?? [];
    const body =
      messages.length === 0
        ? '<div class="profiler-empty">Live updates will appear here.</div>'
        : messages
            .slice()
            .reverse()
            .map(
              (entry) => `
<div class="profiler-live-row ${entry.level}">
  <div class="profiler-live-row-top">
    <strong>${this.escapeHtml(entry.message)}</strong>
    <span>${this.escapeHtml(this.formatTime(entry.timestamp))}</span>
  </div>
  ${entry.detail ? `<p>${this.escapeHtml(this.truncate(entry.detail, 180))}</p>` : ''}
</div>`,
            )
            .join('');

    return `
<section class="profiler-side-section">
  <div class="profiler-section-label">Live updates</div>
  <div class="profiler-live-list">${body}</div>
</section>`;
  }

  private getOrderedTimeline(timeline: SessionTimelinePoint[]): SessionTimelinePoint[] {
    return [...timeline].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private getTokenTotal(point: SessionTimelinePoint): number {
    return (point.inputTokens ?? 0) + (point.outputTokens ?? 0) + (point.cachedTokens ?? 0);
  }

  private findRawEvent(detail: SessionDetail, rawEventId?: string): SessionRawEventRef | undefined {
    if (!rawEventId) {
      return undefined;
    }
    return detail.rawEvents.find((event) => event.id === rawEventId);
  }

  private getSourceAttrs(raw?: SessionRawEventRef): string {
    if (!raw) {
      return '';
    }
    return `data-file-path="${this.escapeAttr(raw.filePath)}" data-line-number="${raw.lineNumber}"`;
  }

  private summaryCell(label: string, value: string): string {
    return `
<div class="profiler-metric-cell">
  <span class="profiler-metric-label">${label}</span>
  <strong class="profiler-metric-value">${value}</strong>
</div>`;
  }

  private compactPath(value: string, depth = 3): string {
    const parts = value.split(/[\\/]+/).filter(Boolean);
    if (parts.length <= depth) {
      return value;
    }
    return `.../${parts.slice(-depth).join('/')}`;
  }

  private getSpanMs(start?: string, end?: string): number {
    if (!start || !end) {
      return 0;
    }
    const startMs = new Date(start).valueOf();
    const endMs = new Date(end).valueOf();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return 0;
    }
    return Math.max(0, endMs - startMs);
  }

  private formatMetricValue(value: number, metric: ProfilerMetricType): string {
    if (metric === 'data') {
      return `${value.toFixed(value >= 10 ? 0 : 1)} KB`;
    }
    if (metric === 'latency') {
      return this.formatDuration(value);
    }
    return this.formatNumber(Math.round(value));
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  private formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
      return '0s';
    }
    if (ms >= 60000) {
      return `${(ms / 60000).toFixed(1)}m`;
    }
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${Math.round(ms)}ms`;
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

  private formatClock(value?: string): string {
    if (!value) {
      return '-';
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

  private truncate(value: string, length = 120): string {
    return value.length > length ? `${value.slice(0, length)}...` : value;
  }

  private metaPill(label: string, value: string): string {
    return `
<span class="profiler-meta-pill" title="${this.escapeAttr(`${label}: ${value}`)}">
  <strong>${label}</strong>${this.escapeHtml(value)}
</span>`;
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
}
