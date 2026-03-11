import {
  ProfilerDetailState,
  ProfilerMetricType,
  SessionDetail,
  SessionRawEventRef,
  SessionTimelinePoint,
} from '../../../types';
import { vscode } from '../vscodeApi';
import { getDocumentLocale, UiLocale } from '../../../i18n';

const EMPTY_STATE: ProfilerDetailState = {
  status: 'idle',
  message: '세션을 선택하면 상세 분석이 표시됩니다.',
};

const SERIES_COLORS = {
  total: '#2a73d9',
  output: '#6e9a2f',
  input: '#e48a0a',
  cached: '#1f2f8c',
  trend: '#e12d99',
  data: '#2a73d9',
  dataTrend: '#e48a0a',
  latency: '#e48a0a',
  latencyTrend: '#1f2f8c',
};

type ChartMarkerShape = 'circle' | 'square' | 'diamond' | 'triangleDown' | 'triangleUp';

type ChartSeries = {
  key: string;
  label: string;
  color: string;
  marker: ChartMarkerShape;
  values: number[];
  lineWidth?: number;
  opacity?: number;
};

type ChartGeometry = {
  width: number;
  height: number;
  plotWidth: number;
  plotHeight: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  minTime: number;
  domainRange: number;
  maxValue: number;
};

export class ProfilerDetailLayer {
  private state = EMPTY_STATE;
  private metric: ProfilerMetricType = 'tokens';
  private readonly locale: UiLocale = getDocumentLocale();

  render(): string {
    return `
<section class="panel profiler-detail-shell">
  <div class="section-heading">
    <div>
      <div class="panel-title">F.Profiler</div>
      <div class="description-text" id="profiler-detail-subtitle">Session timeline analysis</div>
    </div>
    <div class="profiler-detail-metric-toggle">
      <button class="secondary active" data-metric="tokens">Tokens</button>
      <button class="secondary" data-metric="data">KB</button>
      <button class="secondary" data-metric="latency">Latency</button>
    </div>
  </div>
  <div class="notice info" id="profiler-detail-notice">${this.state.message ?? ''}</div>
  <div class="profiler-detail-overview" id="profiler-detail-overview"></div>
  <div class="profiler-detail-viewer">
    <div class="profiler-chart-shell" id="profiler-chart-shell"></div>
    <div class="profiler-detail-rail">
      <div class="profiler-bubble-list" id="profiler-bubble-list"></div>
      <div class="profiler-raw-list" id="profiler-raw-list"></div>
    </div>
  </div>
</section>`;
  }

  mount() {
    document.querySelector('.profiler-detail-metric-toggle')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-metric]');
      if (!button) {
        return;
      }
      const metric = button.dataset.metric as ProfilerMetricType | undefined;
      if (!metric) {
        return;
      }
      this.metric = metric;
      this.renderDynamicContent();
    });
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
    const notice = document.getElementById('profiler-detail-notice');
    const overview = document.getElementById('profiler-detail-overview');
    const chartShell = document.getElementById('profiler-chart-shell');
    const bubbleList = document.getElementById('profiler-bubble-list');
    const rawList = document.getElementById('profiler-raw-list');
    const subtitle = document.getElementById('profiler-detail-subtitle');

    document
      .querySelectorAll<HTMLButtonElement>('.profiler-detail-metric-toggle [data-metric]')
      .forEach((button) => {
        button.classList.toggle('active', button.dataset.metric === this.metric);
      });

    if (!notice || !overview || !chartShell || !bubbleList || !rawList || !subtitle) {
      return;
    }

    if (this.state.status === 'loading') {
      notice.textContent = this.state.message ?? '로딩중..';
      notice.className = 'notice info';
      notice.title = '';
      overview.innerHTML = '';
      chartShell.innerHTML = this.renderLoadingState();
      bubbleList.innerHTML = '';
      rawList.innerHTML = '';
      subtitle.textContent = 'Loading session detail...';
      return;
    }

    if (this.state.status !== 'ready' || !this.state.detail) {
      notice.textContent = this.state.message ?? '세션을 선택하면 상세 분석이 표시됩니다.';
      notice.className = `notice ${this.state.status === 'error' ? 'error' : 'info'}`;
      notice.title = '';
      overview.innerHTML = '';
      chartShell.innerHTML = '';
      bubbleList.innerHTML = '';
      rawList.innerHTML = '';
      subtitle.textContent = 'Session timeline analysis';
      return;
    }

    const detail = this.state.detail;
    notice.textContent = this.compactPath(detail.summary.filePath, 7);
    notice.className = 'notice info';
    notice.title = detail.summary.filePath;
    overview.innerHTML = this.renderOverview(detail);
    chartShell.innerHTML = this.renderChart(detail);
    bubbleList.innerHTML = this.renderBubbleList(detail);
    rawList.innerHTML = this.renderRawList(detail);
    subtitle.textContent = `${detail.summary.agent.toUpperCase()} · ${detail.summary.model ?? 'Unknown model'}`;
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

    return `
<div class="profiler-overview-panel">
  <div class="profiler-overview-head">
    <div class="profiler-overview-identity">
      <span>Session</span>
      <strong title="${this.escapeAttr(summary.fileName)}">${this.escapeHtml(this.truncate(summary.fileName, 48))}</strong>
      <p title="${this.escapeAttr(summary.filePath)}">${this.escapeHtml(this.compactPath(summary.filePath, 6))}</p>
    </div>
    <div class="profiler-meta-inline">
      ${this.metaPill('Timestamp', start ? this.formatStamp(start) : '-')}
      ${this.metaPill('Range', start && end ? `${this.formatClock(start)} -> ${this.formatClock(end)}` : '-')}
      ${this.metaPill('Source', detail.metadata.sourceFormat)}
      ${this.metaPill('Provider', detail.metadata.provider ?? summary.agent)}
      ${this.metaPill('Status', summary.parseStatus.toUpperCase())}
      ${this.metaPill('Workspace', detail.metadata.cwd ? this.compactPath(detail.metadata.cwd, 5) : '-')}
    </div>
  </div>
  <div class="profiler-summary-grid">
    ${this.summaryCell('Total', this.formatNumber(summary.totalTokens ?? 0))}
    ${this.summaryCell('Turns', this.formatNumber(summary.requestCount ?? timeline.length))}
    ${this.summaryCell('Peak turn', this.formatNumber(peakTokens))}
    ${this.summaryCell('Slowest', this.formatDuration(peakLatency))}
    ${this.summaryCell('Span', this.formatDuration(spanMs))}
    ${this.summaryCell('Size', this.formatBytes(summary.fileSizeBytes))}
  </div>
  <div class="profiler-insight-grid">
    ${this.insightCard(
      'Peak tokens',
      topToken,
      topToken ? this.formatNumber(topToken.totalTokens ?? this.getTokenTotal(topToken)) : '-',
    )}
    ${this.insightCard(
      'Largest payload',
      topPayload,
      topPayload ? this.formatMetricValue(topPayload.payloadKb ?? 0, 'data') : '-',
    )}
    ${this.insightCard(
      'Slowest request',
      topLatency,
      topLatency ? this.formatMetricValue(topLatency.latencyMs ?? 0, 'latency') : '-',
    )}
  </div>
</div>`;
  }

  private insightCard(
    label: string,
    point: SessionTimelinePoint | undefined,
    value: string,
  ): string {
    return `
<div class="profiler-insight-card">
  <span>${label}</span>
  <strong>${value}</strong>
  <p>${this.escapeHtml(point ? `${point.label ?? point.eventType} | ${this.truncate(point.detail ?? '-', 72)}` : '-')}</p>
</div>`;
  }

  private renderChart(detail: SessionDetail): string {
    const timeline = this.getOrderedTimeline(detail.timeline);
    if (timeline.length === 0) {
      return '<div class="profiler-empty-chart">No timeline samples available for this session.</div>';
    }

    const series = this.getChartSeries(timeline);
    const geometry = this.getChartGeometry(timeline, series);
    const { width, height, plotWidth, plotHeight, padding, minTime, domainRange, maxValue } =
      geometry;

    const grid = [0, 0.33, 0.66, 1]
      .map((ratio) => {
        const y = padding.top + plotHeight * ratio;
        const value = maxValue * (1 - ratio);
        return `
<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="profiler-chart-grid" />
<text x="${width - padding.right + 12}" y="${y + 4}" class="profiler-chart-axis profiler-chart-axis-right">${this.formatAxisValue(value)}</text>`;
      })
      .join('');

    const paths = series
      .map((item, index) => {
        const points = timeline.map((point, pointIndex) => {
          const value = item.values[pointIndex] ?? 0;
          return {
            x: this.getPointX(
              point,
              pointIndex,
              timeline,
              minTime,
              domainRange,
              padding.left,
              plotWidth,
            ),
            y: this.getPointY(value, padding.top, plotHeight, maxValue),
            value,
          };
        });
        const linePath = this.buildLinePath(points);
        const areaPath = index === 0 ? this.buildAreaPath(points, padding.top + plotHeight) : '';
        const lastPoint = points[points.length - 1];
        return `
${areaPath ? `<path d="${areaPath}" fill="${item.color}" opacity="0.08" />` : ''}
<path d="${linePath}" fill="none" stroke="${item.color}" stroke-width="${item.lineWidth ?? 2.4}" stroke-linecap="round" stroke-linejoin="round" opacity="${item.opacity ?? 1}" />
${lastPoint ? this.renderMarker(item.marker, item.color, lastPoint.x, lastPoint.y, 7.5) : ''}`;
      })
      .join('');

    const xLabels = this.buildXAxisLabels(
      timeline,
      minTime,
      domainRange,
      padding.left,
      plotWidth,
    ).map((label) => {
      return `<text x="${label.x}" y="${height - 16}" class="profiler-chart-axis" text-anchor="middle">${this.escapeHtml(label.text)}</text>`;
    });

    const hotspots = this.renderChartHotspots(detail, timeline, series[0], geometry);
    const focus = this.renderChartFocus(detail, timeline);

    return `
<div class="profiler-chart-panel">
  <div class="profiler-chart-head">
    <div>
      <div class="profiler-chart-title">${this.getMetricTitle()}</div>
      <div class="profiler-chart-note">${timeline.length} samples | ${series.length} series</div>
    </div>
    <div class="profiler-chart-legend">${series.map((item) => this.renderLegendItem(item)).join('')}</div>
  </div>
  <div class="profiler-chart-scroll">
    <div class="profiler-chart-inner" style="width:${width}px">
      <svg viewBox="0 0 ${width} ${height}" class="profiler-chart-svg" aria-label="${this.escapeAttr(this.getMetricTitle())}">
        <rect x="${padding.left}" y="${padding.top}" width="${plotWidth}" height="${plotHeight}" class="profiler-chart-frame" rx="14" ry="14" />
        ${grid}
        ${paths}
        <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" class="profiler-chart-baseline" />
        ${xLabels.join('')}
      </svg>
      ${hotspots}
    </div>
  </div>
  ${focus}
</div>
`;
  }

  private renderChartFocus(detail: SessionDetail, timeline: SessionTimelinePoint[]): string {
    const ranked = [...timeline]
      .sort((a, b) => this.getPrimaryValue(b) - this.getPrimaryValue(a))
      .slice(0, Math.min(3, timeline.length));

    return `
<div class="profiler-chart-focus">
  ${ranked
    .map((point) => {
      const raw = this.findRawEvent(detail, point.sourceEventId);
      return `
<button class="profiler-focus-card" ${this.getSourceAttrs(raw)}>
  <span>${this.escapeHtml(point.label ?? point.eventType)}</span>
  <strong>${this.formatMetricValue(this.getPrimaryValue(point), this.metric)}</strong>
  <p>${this.escapeHtml(this.truncate(point.detail ?? raw?.summary ?? '-', 96))}</p>
</button>`;
    })
    .join('')}
</div>`;
  }

  private renderChartHotspots(
    detail: SessionDetail,
    timeline: SessionTimelinePoint[],
    anchorSeries: ChartSeries,
    geometry: ChartGeometry,
  ): string {
    const ranked = [...timeline]
      .sort((a, b) => this.getPrimaryValue(b) - this.getPrimaryValue(a))
      .slice(0, Math.min(5, timeline.length));

    const buttons = ranked
      .map((point, index) => {
        const raw = this.findRawEvent(detail, point.sourceEventId);
        if (!raw) {
          return '';
        }

        const pointIndex = timeline.findIndex((candidate) => candidate.id === point.id);
        const x = this.getPointX(
          point,
          pointIndex,
          timeline,
          geometry.minTime,
          geometry.domainRange,
          geometry.padding.left,
          geometry.plotWidth,
        );
        const y = this.getPointY(
          anchorSeries.values[pointIndex] ?? this.getPrimaryValue(point),
          geometry.padding.top,
          geometry.plotHeight,
          geometry.maxValue,
        );

        return `
<button
  class="profiler-chart-hotspot"
  style="left:${x}px; top:${Math.max(12, y - 16 - index * 2)}px"
  ${this.getSourceAttrs(raw)}
  title="${this.escapeAttr(point.detail ?? raw.summary)}"
>
  ${this.escapeHtml(point.label ?? point.eventType)}
</button>`;
      })
      .join('');

    return `<div class="profiler-chart-hotspots">${buttons}</div>`;
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

  private getOrderedTimeline(timeline: SessionTimelinePoint[]): SessionTimelinePoint[] {
    return [...timeline].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private getChartSeries(timeline: SessionTimelinePoint[]): ChartSeries[] {
    if (this.metric === 'tokens') {
      const totals = timeline.map((point) => point.totalTokens ?? this.getTokenTotal(point));
      return [
        {
          key: 'total',
          label: 'Total',
          color: SERIES_COLORS.total,
          marker: 'circle',
          values: totals,
          lineWidth: 3.2,
        },
        {
          key: 'output',
          label: 'Output',
          color: SERIES_COLORS.output,
          marker: 'square',
          values: timeline.map((point) => point.outputTokens ?? 0),
        },
        {
          key: 'input',
          label: 'Input',
          color: SERIES_COLORS.input,
          marker: 'diamond',
          values: timeline.map((point) => point.inputTokens ?? 0),
        },
        {
          key: 'cached',
          label: 'Cached',
          color: SERIES_COLORS.cached,
          marker: 'triangleDown',
          values: timeline.map((point) => point.cachedTokens ?? 0),
        },
        {
          key: 'trend',
          label: 'Trend',
          color: SERIES_COLORS.trend,
          marker: 'triangleUp',
          values: this.computeMovingAverage(totals, 3),
          opacity: 0.95,
        },
      ];
    }

    if (this.metric === 'data') {
      const payloads = timeline.map((point) => point.payloadKb ?? 0);
      return [
        {
          key: 'payload',
          label: 'Payload KB',
          color: SERIES_COLORS.data,
          marker: 'circle',
          values: payloads,
          lineWidth: 3.2,
        },
        {
          key: 'trend',
          label: 'Payload trend',
          color: SERIES_COLORS.dataTrend,
          marker: 'diamond',
          values: this.computeMovingAverage(payloads, 3),
          opacity: 0.95,
        },
      ];
    }

    const latencies = timeline.map((point) => point.latencyMs ?? 0);
    return [
      {
        key: 'latency',
        label: 'Latency ms',
        color: SERIES_COLORS.latency,
        marker: 'diamond',
        values: latencies,
        lineWidth: 3.2,
      },
      {
        key: 'trend',
        label: 'Latency trend',
        color: SERIES_COLORS.latencyTrend,
        marker: 'triangleDown',
        values: this.computeMovingAverage(latencies, 3),
        opacity: 0.95,
      },
    ];
  }

  private renderLegendItem(item: ChartSeries): string {
    return `<span class="profiler-legend-item">${this.renderLegendMarker(item.marker, item.color)}${this.escapeHtml(item.label)}</span>`;
  }

  private renderLegendMarker(marker: ChartMarkerShape, color: string): string {
    return `<svg viewBox="0 0 16 16" class="profiler-legend-marker" aria-hidden="true">${this.renderMarkerShape(marker, color, 8, 8, 5.2)}</svg>`;
  }

  private getChartGeometry(timeline: SessionTimelinePoint[], series: ChartSeries[]): ChartGeometry {
    const width = this.getChartWidth(timeline);
    const height = 252;
    const padding = { top: 18, right: 56, bottom: 34, left: 18 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const times = timeline.map((point) => new Date(point.timestamp).valueOf());
    const minTime = Math.min(...times);
    const maxTime = Math.max(
      ...timeline.map((point) => new Date(point.endTimestamp ?? point.timestamp).valueOf()),
    );
    const domainRange = Math.max(1, maxTime - minTime);
    const maxValue = Math.max(1, ...series.flatMap((item) => item.values));

    return {
      width,
      height,
      plotWidth,
      plotHeight,
      padding,
      minTime,
      domainRange,
      maxValue,
    };
  }

  private getChartWidth(timeline: SessionTimelinePoint[]): number {
    const times = timeline.map((point) => new Date(point.timestamp).valueOf());
    const minTime = Math.min(...times);
    const maxTime = Math.max(
      ...timeline.map((point) => new Date(point.endTimestamp ?? point.timestamp).valueOf()),
    );
    const spanMinutes = Math.max(1, (maxTime - minTime) / 60000);
    return Math.max(640, timeline.length * 72, Math.round(spanMinutes * 14));
  }

  private getPrimaryValue(point: SessionTimelinePoint): number {
    if (this.metric === 'data') {
      return point.payloadKb ?? 0;
    }
    if (this.metric === 'latency') {
      return point.latencyMs ?? 0;
    }
    return point.totalTokens ?? this.getTokenTotal(point);
  }

  private getTokenTotal(point: SessionTimelinePoint): number {
    return (point.inputTokens ?? 0) + (point.outputTokens ?? 0) + (point.cachedTokens ?? 0);
  }

  private getPointX(
    point: SessionTimelinePoint,
    index: number,
    timeline: SessionTimelinePoint[],
    minTime: number,
    domainRange: number,
    left: number,
    plotWidth: number,
  ): number {
    const current = new Date(point.timestamp).valueOf();
    const ratio = Number.isFinite(current)
      ? (current - minTime) / domainRange
      : index / Math.max(1, timeline.length - 1);
    return left + Math.max(0, Math.min(1, ratio)) * plotWidth;
  }

  private getPointY(value: number, top: number, plotHeight: number, maxValue: number): number {
    const ratio = Math.max(0, value) / Math.max(1, maxValue);
    return top + plotHeight - ratio * plotHeight;
  }

  private buildXAxisLabels(
    timeline: SessionTimelinePoint[],
    minTime: number,
    domainRange: number,
    left: number,
    plotWidth: number,
  ) {
    if (timeline.length <= 3) {
      return timeline.map((point, index) => ({
        x: this.getPointX(point, index, timeline, minTime, domainRange, left, plotWidth),
        text: this.formatAxisTime(new Date(point.timestamp), domainRange),
      }));
    }

    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const time = new Date(minTime + domainRange * ratio);
      return {
        x: left + plotWidth * ratio,
        text: this.formatAxisTime(time, domainRange),
      };
    });
  }

  private buildLinePath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) {
      return '';
    }
    return points
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      )
      .join(' ');
  }

  private buildAreaPath(points: Array<{ x: number; y: number }>, baselineY: number): string {
    if (points.length === 0) {
      return '';
    }

    const start = points[0];
    const end = points[points.length - 1];
    return [
      `M ${start.x.toFixed(2)} ${baselineY.toFixed(2)}`,
      ...points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
      `L ${end.x.toFixed(2)} ${baselineY.toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  private renderMarker(
    shape: ChartMarkerShape,
    color: string,
    x: number,
    y: number,
    size: number,
  ): string {
    return this.renderMarkerShape(shape, color, x, y, size);
  }

  private renderMarkerShape(
    shape: ChartMarkerShape,
    color: string,
    x: number,
    y: number,
    size: number,
  ): string {
    const stroke = 'rgba(255,255,255,0.9)';
    switch (shape) {
      case 'square':
        return `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" rx="2.5" ry="2.5" fill="${color}" stroke="${stroke}" stroke-width="1.4" />`;
      case 'diamond':
        return `<polygon points="${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}" fill="${color}" stroke="${stroke}" stroke-width="1.4" />`;
      case 'triangleDown':
        return `<polygon points="${x - size},${y - size * 0.7} ${x + size},${y - size * 0.7} ${x},${y + size}" fill="${color}" stroke="${stroke}" stroke-width="1.4" />`;
      case 'triangleUp':
        return `<polygon points="${x - size},${y + size * 0.7} ${x + size},${y + size * 0.7} ${x},${y - size}" fill="${color}" stroke="${stroke}" stroke-width="1.4" />`;
      case 'circle':
      default:
        return `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" stroke="${stroke}" stroke-width="1.4" />`;
    }
  }

  private computeMovingAverage(values: number[], windowSize: number): number[] {
    return values.map((_, index) => {
      const start = Math.max(0, index - windowSize + 1);
      const slice = values.slice(start, index + 1);
      const total = slice.reduce((sum, value) => sum + value, 0);
      return slice.length > 0 ? total / slice.length : 0;
    });
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
<div class="profiler-summary-cell">
  <span>${label}</span>
  <strong>${value}</strong>
</div>`;
  }

  private getMetricTitle(): string {
    switch (this.metric) {
      case 'data':
        return 'Payload Size Comparison';
      case 'latency':
        return 'Latency Comparison';
      case 'tokens':
      default:
        return 'Token Flow Comparison';
    }
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

  private formatAxisValue(value: number): string {
    if (this.metric === 'tokens') {
      return this.formatCompactNumber(Math.round(value));
    }
    if (this.metric === 'data') {
      return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} KB`;
    }
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  }

  private formatCompactNumber(value: number): string {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return String(value);
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

  private formatAxisTime(date: Date, domainRange: number): string {
    if (Number.isNaN(date.valueOf())) {
      return '-';
    }

    const longSpan = domainRange >= 24 * 60 * 60 * 1000;
    return date.toLocaleString(this.locale === 'ko' ? 'ko-KR' : 'en-US', {
      month: longSpan ? 'numeric' : undefined,
      day: longSpan ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
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
