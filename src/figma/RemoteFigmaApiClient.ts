import * as http from 'http';
import * as https from 'https';
import { NetworkError, TimeoutError, ValidationError } from '../errors';

export interface RemoteStatusResponse {
  connected: boolean;
  error?: string;
}

export interface RemoteScreenshotResponse {
  data: string;
  mimeType?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export class RemoteFigmaApiClient {
  constructor(private readonly timeoutMs = 10000) {}

  async checkStatus(baseUrl: string, accessToken: string): Promise<RemoteStatusResponse> {
    return this.requestJson<RemoteStatusResponse>(
      'GET',
      `${normalizeBaseUrl(baseUrl)}/api/figma/mcp/status`,
      accessToken,
    );
  }

  async fetchDesignContext(
    baseUrl: string,
    accessToken: string,
    payload: { figmaUrl?: string; fileKey?: string; nodeId?: string },
  ): Promise<unknown> {
    const result = await this.requestJson<{ data: unknown }>(
      'POST',
      `${normalizeBaseUrl(baseUrl)}/api/figma/mcp/context`,
      accessToken,
      payload,
    );
    return result.data;
  }

  async fetchScreenshot(
    baseUrl: string,
    accessToken: string,
    payload: { figmaUrl?: string; fileKey?: string; nodeId?: string },
  ): Promise<RemoteScreenshotResponse> {
    const result = await this.requestJson<RemoteScreenshotResponse>(
      'POST',
      `${normalizeBaseUrl(baseUrl)}/api/figma/mcp/screenshot`,
      accessToken,
      payload,
    );
    if (!result.data) {
      throw new ValidationError('Remote screenshot response did not include image data');
    }
    return result;
  }

  private requestJson<T>(
    method: 'GET' | 'POST',
    targetUrl: string,
    accessToken: string,
    body?: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(targetUrl);
      const isHttps = url.protocol === 'https:';
      const requestModule = isHttps ? https : http;
      const bodyStr = body ? JSON.stringify(body) : '';

      const req = requestModule.request(
        {
          hostname: url.hostname,
          port: url.port ? Number(url.port) : isHttps ? 443 : 80,
          path: `${url.pathname}${url.search}`,
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(bodyStr
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(bodyStr),
                }
              : {}),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(new NetworkError(`Remote Figma API HTTP ${res.statusCode ?? 0}: ${raw}`));
              return;
            }

            try {
              resolve(JSON.parse(raw) as T);
            } catch {
              reject(
                new ValidationError(
                  `Failed to parse remote Figma API response: ${raw.slice(0, 200)}`,
                ),
              );
            }
          });
        },
      );

      req.on('error', (error) =>
        reject(new NetworkError(`Remote Figma API request failed: ${error.message}`, error)),
      );
      req.setTimeout(this.timeoutMs, () => {
        req.destroy();
        reject(new TimeoutError('Remote Figma API request timed out'));
      });
      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }
}
