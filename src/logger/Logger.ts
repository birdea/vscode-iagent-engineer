import * as vscode from 'vscode';
import { LogEntry, LogLevel, LayerType } from '../types';
import { MAX_LOG_ENTRIES } from '../constants';

export class Logger {
  private static entries = new Array<LogEntry | undefined>(MAX_LOG_ENTRIES);
  private static entryCount = 0;
  private static nextIndex = 0;
  private static outputChannel: vscode.OutputChannel;

  static initialize(channel: vscode.OutputChannel) {
    this.outputChannel = channel;
  }

  static log(level: LogLevel, layer: LayerType, message: string, detail?: string): LogEntry {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      layer,
      message,
      detail,
    };

    this.entries[this.nextIndex] = entry;
    this.nextIndex = (this.nextIndex + 1) % MAX_LOG_ENTRIES;
    this.entryCount = Math.min(this.entryCount + 1, MAX_LOG_ENTRIES);

    const logLine = `[${entry.timestamp}] [${level.toUpperCase()}] [${layer}] ${message}`;
    this.outputChannel?.appendLine(logLine);
    if (detail) {
      this.outputChannel?.appendLine(`  ${detail}`);
    }

    return entry;
  }

  static info(layer: LayerType, message: string, detail?: string) {
    return this.log('info', layer, message, detail);
  }

  static warn(layer: LayerType, message: string, detail?: string) {
    return this.log('warn', layer, message, detail);
  }

  static error(layer: LayerType, message: string, detail?: string) {
    return this.log('error', layer, message, detail);
  }

  static success(layer: LayerType, message: string, detail?: string) {
    return this.log('success', layer, message, detail);
  }

  static getEntries(): LogEntry[] {
    if (this.entryCount === 0) {
      return [];
    }

    const startIndex = this.entryCount === MAX_LOG_ENTRIES ? this.nextIndex : 0;
    const orderedEntries: LogEntry[] = [];
    for (let i = 0; i < this.entryCount; i++) {
      const index = (startIndex + i) % MAX_LOG_ENTRIES;
      const entry = this.entries[index];
      if (entry) {
        orderedEntries.push(entry);
      }
    }
    return orderedEntries;
  }

  static clear() {
    this.entries = new Array<LogEntry | undefined>(MAX_LOG_ENTRIES);
    this.entryCount = 0;
    this.nextIndex = 0;
    this.outputChannel?.clear();
  }

  static toText(): string {
    return this.getEntries()
      .map(
        (e) =>
          `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.layer}] ${e.message}${e.detail ? '\n  ' + e.detail : ''}`,
      )
      .join('\n');
  }

  static toJson(): string {
    return JSON.stringify(this.getEntries(), null, 2);
  }
}
