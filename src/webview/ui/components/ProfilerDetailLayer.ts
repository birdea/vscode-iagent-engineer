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
<section class="panel profiler-detail-shell">
  <div class="profiler-detail-overview" id="profiler-detail-overview"></div>
  <div class="profiler-detail-viewer">
    <div class="profiler-chart-shell" id="profiler-chart-shell"></div>
  </div>
  <div class="profiler-detail-secondary-triple">
    <div class="profiler-column">
      <div class="profiler-column-header">
        <i class="codicon codicon-person"></i>
        <span>User Intent</span>
      </div>
      <div class="profiler-column-content" id="profiler-request-list"></div>
    </div>
    <div class="profiler-column">
      <div class="profiler-column-header">
        <i class="codicon codicon-robot"></i>
        <span>Agent Response</span>
      </div>
      <div class="profiler-column-content" id="profiler-response-list"></div>
    </div>
    <div class="profiler-column">
      <div class="profiler-column-header">
        <i class="codicon codicon-terminal"></i>
        <span>System Logs</span>
      </div>
      <div class="profiler-column-content" id="profiler-system-list"></div>
    </div>
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
        const infoButton = target?.closest<HTMLButtonElement>('[data-info-kind]');
        if (infoButton) {
          const kind = infoButton.dataset.infoKind as 'summary' | 'key-events' | undefined;
          if (kind) {
            vscode.postMessage({ command: 'profiler.openInfoDoc', kind });
          }
        }
      });
    };

    attachClick('profiler-chart-shell');
    attachClick('profiler-request-list');
    attachClick('profiler-response-list');
    attachClick('profiler-system-list');

    document.getElementById('profiler-detail-overview')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const stopButton = target?.closest<HTMLButtonElement>('[data-profiler-live-stop]');
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
    const overview = document.getElementById('profiler-detail-overview');
    const chartShell = document.getElementById('profiler-chart-shell');
    const requestList = document.getElementById('profiler-request-list');
    const responseList = document.getElementById('profiler-response-list');
    const systemList = document.getElementById('profiler-system-list');

    if (!overview || !chartShell || !requestList || !responseList || !systemList) {
      return;
    }

    if (this.state.status === 'loading') {
      this.unmountChart();
      overview.innerHTML = this.renderStatusPanel(this.state.message ?? '로딩중..');
      chartShell.innerHTML = this.renderLoadingState();
      requestList.innerHTML = '';
      responseList.innerHTML = '';
      systemList.innerHTML = '';
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
      requestList.innerHTML = '';
      responseList.innerHTML = '';
      systemList.innerHTML = '';
      return;
    }

    const detail = this.state.detail;
    overview.innerHTML = this.renderOverview(detail);
    this.mountChart(chartShell, detail);

    const { requests, responses, logs } = this.categorizeEvents(detail);

    // Add live messages to logs if present
    if (this.state.live?.messages) {
      this.state.live.messages.forEach((msg) => {
        logs.unshift({
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

    requestList.innerHTML = this.renderEventColumn(requests);
    responseList.innerHTML = this.renderEventColumn(responses);
    systemList.innerHTML = this.renderEventColumn(logs);
  }

  private categorizeEvents(detail: SessionDetail) {
    const requests: SessionRawEventRef[] = [];
    const responses: SessionRawEventRef[] = [];
    const logs: SessionRawEventRef[] = [];

    const sorted = [...detail.rawEvents].sort(
      (a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.lineNumber - b.lineNumber,
    );

    sorted.forEach((event) => {
      const type = event.eventType.toLowerCase();
      const cat = event.category;

      if (type === 'user' || type === 'user_message' || type === 'token_count') {
        requests.push(event);
      } else if (
        type === 'gemini' ||
        type === 'assistant' ||
        type === 'agent_message' ||
        type === 'task_complete' ||
        cat === 'reasoning'
      ) {
        responses.push(event);
      } else {
        logs.push(event);
      }
    });

    return { requests, responses, logs };
  }

  private renderEventColumn(events: SessionRawEventRef[]): string {
    if (events.length === 0) {
      return '<div class="profiler-empty-column">No events in this category.</div>';
    }

    return events
      .map((event) => {
        const preview = event.messagePreview ?? event.excerpt;
        const time = this.formatTime(event.timestamp);
        const tokens = event.totalTokens || (event.inputTokens ?? 0) + (event.outputTokens ?? 0);

        return `
<button class="profiler-event-card" ${this.getSourceAttrs(event)}>
  <div class="profiler-event-card-head">
    <span class="profiler-event-type">${this.escapeHtml(event.eventType)}</span>
    <span class="profiler-event-time">${this.escapeHtml(time)}</span>
  </div>
  <div class="profiler-event-content">${this.escapeHtml(this.truncate(preview, 200))}</div>
  ${tokens > 0 ? `<div class="profiler-event-footer"><i class="codicon codicon-symbol-number"></i> ${this.formatNumber(tokens)} tokens</div>` : ''}
</button>`;
      })
      .join('');
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
    const descriptor = getProfilerAgentDescriptor(summary.agent);
    const start = summary.startedAt ?? detail.timeline[0]?.timestamp;

    const input = summary.totalInputTokens ?? 0;
    const output = summary.totalOutputTokens ?? 0;
    const cost = this.estimateCost(summary.model, input, output);

    return `
<div class="profiler-matrix-overview">
  <div class="profiler-matrix-header">
    <div class="profiler-agent-identity">
      <span class="profiler-agent-icon">${descriptor.iconSvg}</span>
      <div class="profiler-agent-text">
        <span class="profiler-vendor">${this.escapeHtml(descriptor.vendor)}</span>
        <strong class="profiler-model-name">${this.escapeHtml(summary.model ?? descriptor.label)}</strong>
      </div>
      <button class="secondary icon-btn profiler-info-btn" data-info-kind="summary" title="Summary data guide">
        <i class="codicon codicon-info"></i>
      </button>
      <button class="secondary icon-btn profiler-info-btn" data-info-kind="key-events" title="Key event guide">
        <i class="codicon codicon-question"></i>
      </button>
    </div>
    <div class="profiler-live-indicator">
       ${this.state.live?.active ? '<span class="status-dot connected"></span> <strong data-profiler-live-stop="true" style="cursor:pointer">Live active</strong>' : ''}
    </div>
  </div>
  
  <div class="profiler-matrix-grid">
    ${this.matrixCell('File Name', this.truncate(summary.fileName, 32), 'codicon-file')}
    ${this.matrixCell('File Size', this.formatBytes(summary.fileSizeBytes), 'codicon-database')}
    ${this.matrixCell('Date', start ? this.formatStamp(start).split(' ')[0] : '-', 'codicon-calendar')}
    ${this.matrixCell('Time', start ? this.formatStamp(start).split(' ')[1] : '-', 'codicon-watch')}
    ${this.matrixCell('Tokens', `${this.formatNumber(input)} / ${this.formatNumber(output)}`, 'codicon-symbol-number')}
    ${this.matrixCell('Est. Cost', cost > 0 ? `$${cost.toFixed(4)}` : 'Free/Unk', 'codicon-credit-card')}
  </div>
</div>`;
  }

  private matrixCell(label: string, value: string, icon: string): string {
    return `
<div class="profiler-matrix-cell">
  <div class="profiler-matrix-label">
    <i class="codicon ${icon}"></i>
    <span>${label}</span>
  </div>
  <div class="profiler-matrix-value">${this.escapeHtml(value)}</div>
</div>`;
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
