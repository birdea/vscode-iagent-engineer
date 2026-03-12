import { LogEntry } from '../../../types';

export class LogLayer {
  render(): string {
    return `
<pre class="log-terminal" id="log-area"></pre>`;
  }

  mount() {}

  appendEntry(entry: LogEntry) {
    const area = document.getElementById('log-area') as HTMLPreElement | null;
    if (!area) return;

    const lines: string[] = [this.formatEntry(entry)];
    if (entry.detail) {
      lines.push(`  ${entry.detail}`);
    }

    area.textContent = `${area.textContent ?? ''}${area.textContent ? '\n' : ''}${lines.join('\n')}`;
    area.scrollTop = area.scrollHeight;
  }

  clear() {
    const area = document.getElementById('log-area');
    if (area) area.textContent = '';
  }

  private formatEntry(entry: LogEntry): string {
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.layer}] ${entry.message}`;
  }
}
