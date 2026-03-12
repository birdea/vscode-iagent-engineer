import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EditorIntegration } from '../editor/EditorIntegration';
import { Logger } from '../logger/Logger';
import { UiLocale, t } from '../i18n';
import { SourceDataThumbnail } from '../types';

export type SourceDataMode = 'text' | 'image';

export interface SourceDataFetchResult {
  assetKey: string;
  url: string;
  contentType: string;
  mode: SourceDataMode;
  statusCode: number;
  suggestedName: string;
  thumbnailDataUrl?: string;
}

type CurlExecutionResult = {
  body: Buffer;
  headersRaw: string;
  httpCode: number;
  stderr: string;
};

export type CurlRunner = (url: string) => Promise<CurlExecutionResult>;
export type DelayRunner = (ms: number) => Promise<void>;

const SOURCE_DATA_NEXT_REQUEST_DELAY_MS = 1000;

export class SourceDataService {
  constructor(
    private readonly editorIntegration: EditorIntegration,
    private readonly locale: UiLocale,
    private readonly runCurl: CurlRunner = runCurlRequest,
    private readonly delay: DelayRunner = wait,
  ) {}

  async fetch(url: string): Promise<SourceDataFetchResult> {
    const [result] = await this.fetchAll(url);
    return result;
  }

  async fetchAll(input: string): Promise<SourceDataFetchResult[]> {
    const normalizedUrls = this.normalizeUrls(input);
    const results: SourceDataFetchResult[] = [];

    for (const [index, normalizedUrl] of normalizedUrls.entries()) {
      results.push(await this.fetchSingle(normalizedUrl));
      if (index < normalizedUrls.length - 1) {
        await this.delay(SOURCE_DATA_NEXT_REQUEST_DELAY_MS);
      }
    }

    return results;
  }

  private async fetchSingle(normalizedUrl: string): Promise<SourceDataFetchResult> {
    Logger.info('figma', 'Source Data request started', `curl -i ${normalizedUrl}`);

    let response: CurlExecutionResult;
    try {
      response = await this.runCurl(normalizedUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/ENOENT/i.test(message)) {
        throw new Error(t(this.locale, 'host.figma.curlUnavailable'));
      }
      throw error;
    }

    const headerInfo = parseCurlHeaders(response.headersRaw);
    const contentType =
      headerInfo.headers['content-type']?.split(';')[0].trim().toLowerCase() ||
      inferMimeTypeFromName(normalizedUrl);
    const suggestedName = this.resolveSuggestedName(normalizedUrl, contentType);
    const mode: SourceDataMode = contentType.startsWith('image/') ? 'image' : 'text';

    Logger.info(
      'figma',
      `Source Data response received (${headerInfo.statusLine})`,
      headerInfo.rawBlock.trim(),
    );

    if (response.httpCode >= 400) {
      const detail = response.stderr.trim() || headerInfo.rawBlock.trim();
      Logger.error('figma', `Source Data request failed with HTTP ${response.httpCode}`, detail);
      throw new Error(`${t(this.locale, 'host.figma.sourceDataHttpError')} (${response.httpCode})`);
    }

    if (mode === 'image') {
      await this.editorIntegration.openBinaryInEditor(response.body, suggestedName, normalizedUrl);
    } else {
      await this.editorIntegration.openInEditor(
        response.body.toString('utf8'),
        this.resolveLanguage(contentType, suggestedName),
        suggestedName,
      );
    }

    Logger.success(
      'figma',
      `Source Data opened in editor as ${mode}`,
      `content-type=${contentType || 'unknown'}, bytes=${response.body.byteLength}`,
    );

    return {
      assetKey: normalizedUrl,
      url: normalizedUrl,
      contentType,
      mode,
      statusCode: response.httpCode,
      suggestedName,
      thumbnailDataUrl: mode === 'image' ? this.toDataUrl(response.body, contentType) : undefined,
    };
  }

  private normalizeUrls(input: string): string[] {
    const values = this.extractUrlCandidates(input);
    if (values.length === 0) {
      throw new Error(t(this.locale, 'host.figma.sourceDataUrlMissing'));
    }

    const normalizedUrls = values.map((value) => {
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid protocol');
        }
        return parsed.toString();
      } catch {
        throw new Error(t(this.locale, 'host.figma.sourceDataInvalidUrl'));
      }
    });

    return normalizedUrls;
  }

  private extractUrlCandidates(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    const matches = trimmed.match(/https?:\/\/[^\s"'`;]+/g);
    return matches ?? [];
  }

  private resolveSuggestedName(url: string, contentType: string): string {
    const pathname = new URL(url).pathname;
    const baseName = path.basename(pathname) || 'source-data';
    if (path.extname(baseName)) {
      return sanitizeFileName(baseName);
    }

    const extension = extensionFromMimeType(contentType);
    return sanitizeFileName(`${baseName || 'source-data'}${extension}`);
  }

  private resolveLanguage(contentType: string, suggestedName: string): string {
    if (contentType.includes('json')) return 'json';
    if (contentType.includes('html')) return 'html';
    if (contentType.includes('javascript')) return 'javascript';
    if (contentType.includes('typescript')) return 'typescript';
    if (contentType.includes('css')) return 'css';
    if (contentType.includes('xml') || suggestedName.endsWith('.svg')) return 'xml';
    return 'plaintext';
  }

  toThumbnail(result: SourceDataFetchResult): SourceDataThumbnail | null {
    if (result.mode !== 'image' || !result.thumbnailDataUrl) {
      return null;
    }

    return {
      assetKey: result.assetKey,
      url: result.url,
      suggestedName: result.suggestedName,
      thumbnailDataUrl: result.thumbnailDataUrl,
    };
  }

  private toDataUrl(content: Buffer, contentType: string): string {
    return `data:${contentType};base64,${content.toString('base64')}`;
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCurlRequest(url: string): Promise<CurlExecutionResult> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'figma-source-data-'));
  const headersPath = path.join(tempDir, 'headers.txt');
  const bodyPath = path.join(tempDir, 'body.bin');

  try {
    const { stdout, stderr, code } = await new Promise<{
      stdout: string;
      stderr: string;
      code: number | null;
    }>((resolve, reject) => {
      const child = spawn('curl', [
        '-sS',
        '-L',
        '-D',
        headersPath,
        '-o',
        bodyPath,
        '-w',
        '%{http_code}',
        url,
      ]);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.once('error', reject);
      child.once('close', (exitCode) => {
        resolve({ stdout, stderr, code: exitCode });
      });
    });

    if (code !== 0) {
      throw new Error(stderr.trim() || `curl exited with code ${code}`);
    }

    const [headersRaw, body] = await Promise.all([
      fs.promises.readFile(headersPath, 'utf8'),
      fs.promises.readFile(bodyPath),
    ]);

    return {
      headersRaw,
      body,
      httpCode: Number.parseInt(stdout.trim(), 10) || 0,
      stderr,
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function parseCurlHeaders(rawHeaders: string): {
  statusLine: string;
  headers: Record<string, string>;
  rawBlock: string;
} {
  const normalized = rawHeaders.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n\n(?=HTTP\/)/).filter(Boolean);
  const rawBlock = blocks[blocks.length - 1] || normalized;
  const lines = rawBlock.split('\n').filter(Boolean);
  const statusLine = lines[0] || 'HTTP response';
  const headers: Record<string, string> = {};

  for (const line of lines.slice(1)) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[key] = value;
  }

  return { statusLine, headers, rawBlock };
}

function inferMimeTypeFromName(url: string): string {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  switch (extension) {
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.json':
      return 'application/json';
    case '.html':
      return 'text/html';
    case '.txt':
      return 'text/plain';
    default:
      return 'text/plain';
  }
}

function extensionFromMimeType(contentType: string): string {
  switch (contentType) {
    case 'image/svg+xml':
      return '.svg';
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'application/json':
      return '.json';
    case 'text/html':
      return '.html';
    default:
      return '.txt';
  }
}

function sanitizeFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return sanitized || 'source-data';
}
