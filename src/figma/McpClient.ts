import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from '../logger/Logger';
import { MCP_DEFAULT_PORT, REQUEST_TIMEOUT_MS } from '../constants';
import { ValidationError, TimeoutError, NetworkError, toErrorMessage } from '../errors';

function resolveDefaultClientVersion(): string {
  try {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      version?: unknown;
    };
    return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolContentItem {
  type?: string;
  text?: string;
  data?: string;
  mimeType?: string;
  url?: string;
  source?: string;
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['jsonrpc'] !== '2.0') return false;
  if (v['id'] !== null && typeof v['id'] !== 'number' && typeof v['id'] !== 'string') return false;
  const hasResult = 'result' in v;
  const hasError =
    typeof v['error'] === 'object' &&
    v['error'] !== null &&
    typeof (v['error'] as Record<string, unknown>)['code'] === 'number' &&
    typeof (v['error'] as Record<string, unknown>)['message'] === 'string';
  return hasResult || hasError;
}

function tryParseSsePayload(raw: string): unknown {
  const normalized = raw.replace(/\r\n/g, '\n');
  const events = normalized.split('\n\n');

  for (const eventBlock of events) {
    const lines = eventBlock
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0 && !line.startsWith(':'));
    if (lines.length === 0) {
      continue;
    }

    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart());
    if (dataLines.length === 0) {
      continue;
    }

    const payload = dataLines.join('\n').trim();
    if (!payload) {
      continue;
    }

    return JSON.parse(payload);
  }

  throw new ValidationError(`Failed to parse MCP SSE response: ${raw.slice(0, 200)}`);
}

function stripDataUrlPrefix(value: string): string {
  const match = value.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : value;
}

export class McpClient {
  private endpoint: string;
  private requestId = 0;
  private initialized = false;
  private sessionId?: string;
  private readonly approvedExternalEndpoints = new Set<string>();

  constructor(
    endpoint: string,
    private readonly clientInfo: { name: string; version: string } = {
      name: 'vscode-figmalab',
      version: resolveDefaultClientVersion(),
    },
  ) {
    this.endpoint = this.normalizeEndpoint(endpoint);
  }

  private normalizeEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      const isLocalhost =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
      const hasRootPath = !url.pathname || url.pathname === '/';
      if (isLocalhost && hasRootPath) {
        url.pathname = '/mcp';
        return url.toString();
      }
    } catch {
      // Preserve invalid endpoints so the existing validation path can surface the error later.
    }

    return endpoint;
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const bodyStr = JSON.stringify(body);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.performRequest(method, id, bodyStr);
      } catch (e) {
        if (!(e instanceof Error)) {
          throw e;
        }
        lastError = e;
        if (!this.shouldRetry(e, attempt)) {
          throw e;
        }
        const delayMs = 250 * 2 ** attempt;
        Logger.warn(
          'figma',
          `Retrying MCP ${method} request (${attempt + 2}/3) after ${delayMs}ms: ${e.message}`,
        );
        await this.delay(delayMs);
      }
    }

    throw lastError ?? new NetworkError('MCP request failed after retries');
  }

  private async fetchBinaryAsBase64(sourceUrl: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      const url = new URL(sourceUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        reject(new ValidationError(`Unsupported image source protocol: ${url.protocol}`));
        return;
      }

      const requestModule = url.protocol === 'https:' ? https : http;
      const req = requestModule.request(
        {
          hostname: url.hostname,
          port: url.port
            ? Number(url.port)
            : url.protocol === 'https:'
              ? 443
              : url.hostname === 'localhost' || url.hostname === '127.0.0.1'
                ? MCP_DEFAULT_PORT
                : 80,
          path: `${url.pathname || '/'}${url.search || ''}`,
          method: 'GET',
          headers: { Accept: 'image/*, application/octet-stream' },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
          );
          res.on('end', () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(
                new NetworkError(
                  `Image HTTP ${res.statusCode ?? 0}: ${
                    Buffer.concat(chunks).toString('utf8').slice(0, 200) || 'No response body'
                  }`,
                ),
              );
              return;
            }
            resolve(Buffer.concat(chunks).toString('base64'));
          });
        },
      );

      req.on('error', (e) => reject(new NetworkError(`Image request failed: ${e.message}`, e)));
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(new TimeoutError('Image request timed out'));
      });
      req.end();
    });
  }

  private isToolUnavailable(error: Error): boolean {
    return /Method not found|Unknown tool|tool.+not found|MCP Error -32601/i.test(error.message);
  }

  private toLocalNodeId(nodeId?: string, modern = true): string | undefined {
    if (!nodeId) {
      return undefined;
    }

    return modern ? nodeId.replace(/:/g, '-') : nodeId;
  }

  private uniqueAttempts(
    attempts: Array<{ name: string; args: Record<string, unknown> }>,
  ): Array<{ name: string; args: Record<string, unknown> }> {
    const seen = new Set<string>();
    return attempts.filter((attempt) => {
      const key = `${attempt.name}:${JSON.stringify(attempt.args)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async callWithFallback(
    attempts: Array<{ name: string; args: Record<string, unknown> }>,
  ): Promise<unknown> {
    let lastError: unknown;
    for (let index = 0; index < attempts.length; index++) {
      const attempt = attempts[index];
      try {
        return await this.callTool(attempt.name, attempt.args);
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof Error) ||
          !this.isToolUnavailable(error) ||
          index === attempts.length - 1
        ) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('MCP tool call failed');
  }

  private extractToolTextPayload(content: McpToolContentItem[]): unknown {
    const textPayload = content
      .filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n')
      .trim();

    if (!textPayload) {
      return undefined;
    }

    try {
      return JSON.parse(textPayload);
    } catch {
      return textPayload;
    }
  }

  private extractStructuredToolResult(result: unknown): unknown {
    if (typeof result !== 'object' || result === null) {
      return result;
    }

    const record = result as Record<string, unknown>;
    if ('structuredContent' in record && record.structuredContent !== undefined) {
      return record.structuredContent;
    }

    if (Array.isArray(record.content)) {
      const textPayload = this.extractToolTextPayload(record.content as McpToolContentItem[]);
      if (textPayload !== undefined) {
        return textPayload;
      }
    }

    return result;
  }

  private async extractImageData(result: unknown): Promise<string | undefined> {
    if (typeof result === 'string') {
      return stripDataUrlPrefix(result);
    }

    if (typeof result !== 'object' || result === null) {
      return undefined;
    }

    const record = result as Record<string, unknown>;
    if (typeof record.base64 === 'string') {
      return stripDataUrlPrefix(record.base64);
    }
    if (typeof record.data === 'string') {
      return stripDataUrlPrefix(record.data);
    }

    if (Array.isArray(record.content)) {
      for (const item of record.content as McpToolContentItem[]) {
        if (item.type === 'image' && typeof item.data === 'string') {
          return stripDataUrlPrefix(item.data);
        }
        const source = typeof item.source === 'string' ? item.source : item.url;
        if (item.type === 'image' && typeof source === 'string' && /^https?:\/\//i.test(source)) {
          return await this.fetchBinaryAsBase64(source);
        }
      }

      const textPayload = this.extractToolTextPayload(record.content as McpToolContentItem[]);
      if (textPayload !== undefined) {
        return await this.extractImageData(textPayload);
      }
    }

    if ('structuredContent' in record) {
      return await this.extractImageData(record.structuredContent);
    }

    return undefined;
  }

  private performRequest(method: string, id: number, bodyStr: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        reject(new Error(`Unsupported MCP protocol: ${url.protocol}`));
        return;
      }
      const isHttps = url.protocol === 'https:';
      const requestModule = isHttps ? https : http;
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const resolvedPort =
        url.port && url.port.trim()
          ? Number(url.port)
          : isHttps
            ? 443
            : isLocalhost
              ? MCP_DEFAULT_PORT
              : 80;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: resolvedPort,
        path: `${url.pathname || '/'}${url.search || ''}`,
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...(method !== 'initialize' && this.sessionId
            ? { 'Mcp-Session-Id': this.sessionId }
            : {}),
        },
      };

      const req = requestModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`MCP HTTP ${res.statusCode ?? 0}: ${data || 'No response body'}`));
            return;
          }

          try {
            const contentTypeHeader = res.headers['content-type'];
            const contentType = Array.isArray(contentTypeHeader)
              ? contentTypeHeader.join(', ')
              : contentTypeHeader || '';
            const parsed: unknown = contentType.includes('text/event-stream')
              ? tryParseSsePayload(data)
              : JSON.parse(data);
            if (!isJsonRpcResponse(parsed)) {
              reject(
                new ValidationError(`Invalid MCP JSON-RPC response shape: ${data.slice(0, 200)}`),
              );
              return;
            }
            const response = parsed;
            if (
              response.id !== null &&
              response.id !== undefined &&
              String(response.id) !== String(id)
            ) {
              reject(
                new ValidationError(`MCP response id mismatch: expected ${id}, got ${response.id}`),
              );
              return;
            }
            if (response.error) {
              reject(
                new NetworkError(`MCP Error ${response.error.code}: ${response.error.message}`),
              );
            } else {
              if (method === 'initialize') {
                const sessionHeader =
                  res.headers['mcp-session-id'] ?? res.headers['Mcp-Session-Id'];
                const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
                this.sessionId =
                  typeof sessionId === 'string' && sessionId.trim() ? sessionId : undefined;
              }
              resolve(response.result);
            }
          } catch (parseErr) {
            if (parseErr instanceof ValidationError || parseErr instanceof NetworkError) {
              reject(parseErr);
            } else {
              reject(new ValidationError(`Failed to parse MCP response: ${data.slice(0, 200)}`));
            }
          }
        });
      });

      req.on('error', (e) => reject(new NetworkError(`MCP request failed: ${e.message}`, e)));
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(new TimeoutError('MCP request timed out'));
      });
      req.write(bodyStr);
      req.end();
    });
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= 2) {
      return false;
    }
    if (error instanceof ValidationError) {
      return false;
    }
    if (this.isToolUnavailable(error)) {
      return false;
    }
    if (error instanceof TimeoutError || error instanceof NetworkError) {
      return true;
    }
    return /MCP HTTP 5\d{2}/.test(error.message);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async confirmEndpointSafety(): Promise<void> {
    let url: URL;
    try {
      url = new URL(this.endpoint);
    } catch {
      return;
    }

    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
      return;
    }

    if (this.approvedExternalEndpoints.has(this.endpoint)) {
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `The configured MCP endpoint is not local: ${this.endpoint}`,
      { modal: true },
      'Connect',
    );

    if (choice !== 'Connect') {
      throw new ValidationError(
        `MCP connection cancelled for non-local endpoint: ${this.endpoint}`,
      );
    }

    this.approvedExternalEndpoints.add(this.endpoint);
  }

  async initialize(): Promise<boolean> {
    await this.confirmEndpointSafety();
    try {
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: this.clientInfo,
      });
      this.initialized = true;
      Logger.success('figma', `MCP server connected: ${this.endpoint}`);
      return true;
    } catch (e) {
      Logger.error('figma', `MCP connection failed: ${toErrorMessage(e)}`);
      return false;
    }
  }

  async listTools(): Promise<string[]> {
    try {
      const result = (await this.sendRequest('tools/list')) as { tools?: Array<{ name: string }> };
      if (!Array.isArray(result?.tools)) {
        Logger.warn('figma', 'MCP tools/list response has unexpected shape — returning empty list');
        return [];
      }
      return result.tools.map((t) => t.name);
    } catch (e) {
      Logger.error('figma', `Failed to list MCP tools: ${toErrorMessage(e)}`);
      return [];
    }
  }

  async callTool(name: string, args?: unknown): Promise<unknown> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }
    Logger.info('figma', `Calling MCP tool: ${name}`);
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    Logger.success('figma', `MCP tool result received: ${name}`);
    return result;
  }

  async getDesignContext(fileId: string, nodeId?: string): Promise<unknown> {
    const modernNodeId = this.toLocalNodeId(nodeId, true);
    const legacyNodeId = this.toLocalNodeId(nodeId, false);
    const result = await this.callWithFallback(
      this.uniqueAttempts([
        {
          name: 'get_design_context',
          args: {
            fileKey: fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_design_context',
          args: {
            fileKey: fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
        {
          name: 'get_file',
          args: {
            fileKey: fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_file',
          args: {
            fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_file',
          args: {
            fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
      ]),
    );

    return this.extractStructuredToolResult(result);
  }

  async getMetadata(fileId: string, nodeId?: string): Promise<unknown> {
    const modernNodeId = this.toLocalNodeId(nodeId, true);
    const legacyNodeId = this.toLocalNodeId(nodeId, false);
    const result = await this.callWithFallback(
      this.uniqueAttempts([
        {
          name: 'get_metadata',
          args: {
            fileKey: fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_metadata',
          args: {
            fileKey: fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
        {
          name: 'get_metadata',
          args: {
            fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_metadata',
          args: {
            fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
      ]),
    );

    return this.extractStructuredToolResult(result);
  }

  async getVariableDefs(fileId: string, nodeId?: string): Promise<unknown> {
    const modernNodeId = this.toLocalNodeId(nodeId, true);
    const legacyNodeId = this.toLocalNodeId(nodeId, false);
    const result = await this.callWithFallback(
      this.uniqueAttempts([
        {
          name: 'get_variable_defs',
          args: {
            fileKey: fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_variable_defs',
          args: {
            fileKey: fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
        {
          name: 'get_variable_defs',
          args: {
            fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_variable_defs',
          args: {
            fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
      ]),
    );

    return this.extractStructuredToolResult(result);
  }

  async getImage(fileId: string, nodeId: string): Promise<string> {
    const modernNodeId = this.toLocalNodeId(nodeId, true);
    const legacyNodeId = this.toLocalNodeId(nodeId, false);
    const result = await this.callWithFallback(
      this.uniqueAttempts([
        {
          name: 'get_screenshot',
          args: {
            fileKey: fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_screenshot',
          args: {
            fileKey: fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
        {
          name: 'get_image',
          args: {
            fileKey: fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_image',
          args: {
            fileId,
            ...(modernNodeId ? { nodeId: modernNodeId } : {}),
          },
        },
        {
          name: 'get_image',
          args: {
            fileId,
            ...(legacyNodeId ? { nodeId: legacyNodeId } : {}),
          },
        },
      ]),
    );
    const imageData = await this.extractImageData(result);
    if (!imageData) {
      throw new ValidationError('MCP screenshot tool returned no image data');
    }
    return imageData;
  }

  isConnected(): boolean {
    return this.initialized;
  }

  setEndpoint(endpoint: string) {
    this.endpoint = this.normalizeEndpoint(endpoint);
    this.initialized = false;
    this.sessionId = undefined;
  }
}
