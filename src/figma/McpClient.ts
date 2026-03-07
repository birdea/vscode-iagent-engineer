import * as http from 'http';
import * as https from 'https';
import { Logger } from '../logger/Logger';

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

export class McpClient {
  private endpoint: string;
  private requestId = 0;
  private initialized = false;

  constructor(
    endpoint: string,
    private readonly clientInfo: { name: string; version: string } = {
      name: 'vscode-figmalab',
      version: '0.1.0',
    },
  ) {
    this.endpoint = endpoint;
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const bodyStr = JSON.stringify(body);

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
              ? 3845
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
            const response: JsonRpcResponse = JSON.parse(data);
            if (response.jsonrpc !== '2.0') {
              reject(new Error(`Invalid MCP JSON-RPC version: ${String(response.jsonrpc)}`));
              return;
            }
            if (response.id !== null && response.id !== undefined && String(response.id) !== String(id)) {
              reject(new Error(`MCP response id mismatch: expected ${id}, got ${response.id}`));
              return;
            }
            if (response.error) {
              reject(new Error(`MCP Error ${response.error.code}: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          } catch {
            reject(new Error(`Failed to parse MCP response: ${data}`));
          }
        });
      });

      req.on('error', (e) => reject(new Error(`MCP request failed: ${e.message}`)));
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('MCP request timed out'));
      });
      req.write(bodyStr);
      req.end();
    });
  }

  async initialize(): Promise<boolean> {
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
      Logger.error('figma', `MCP connection failed: ${(e as Error).message}`);
      return false;
    }
  }

  async listTools(): Promise<string[]> {
    try {
      const result = (await this.sendRequest('tools/list')) as { tools: Array<{ name: string }> };
      return result.tools.map((t) => t.name);
    } catch (e) {
      Logger.error('figma', `Failed to list MCP tools: ${(e as Error).message}`);
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
    return result.base64 || result.data || '';
  }

  isConnected(): boolean {
    return this.initialized;
  }

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint;
    this.initialized = false;
  }
}
