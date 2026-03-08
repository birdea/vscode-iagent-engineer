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

export class McpClient {
  private endpoint: string;
  private requestId = 0;
  private initialized = false;
  private readonly approvedExternalEndpoints = new Set<string>();

  constructor(
    endpoint: string,
    private readonly clientInfo: { name: string; version: string } = {
      name: 'vscode-figmalab',
      version: resolveDefaultClientVersion(),
    },
  ) {
    this.endpoint = endpoint;
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const bodyStr = JSON.stringify(body);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.performRequest(id, bodyStr);
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

  private performRequest(id: number, bodyStr: string): Promise<unknown> {
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
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
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
            const parsed: unknown = JSON.parse(data);
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

  async getImage(fileId: string, nodeId: string): Promise<string> {
    const result = (await this.callTool('get_image', { fileId, nodeId })) as {
      base64?: string;
      data?: string;
    };
    const imageData = result.base64 || result.data;
    if (!imageData) {
      throw new ValidationError('MCP get_image returned no image data');
    }
    return imageData;
  }

  isConnected(): boolean {
    return this.initialized;
  }

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
    this.initialized = false;
  }
}
