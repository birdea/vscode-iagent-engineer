import {
  handleOAuthCallback,
  handleOAuthRefresh,
  handleOAuthStart,
  handleOAuthToken,
} from './routes/oauth';
import { handleMcpStatus, handleMcpContext, handleMcpScreenshot } from './routes/mcp';

export interface Env {
  FIGMA_CLIENT_ID: string;
  FIGMA_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  if (!origin) {
    return {};
  }

  const allowed = env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!allowed.includes(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/figma/oauth/start' && request.method === 'GET') {
        return await handleOAuthStart(request, env);
      }
      if (path === '/api/figma/oauth/callback' && request.method === 'GET') {
        return await handleOAuthCallback(request, env);
      }
      if (path === '/api/figma/oauth/token' && request.method === 'POST') {
        return await handleOAuthToken(request, env, cors);
      }
      if (path === '/api/figma/oauth/refresh' && request.method === 'POST') {
        return await handleOAuthRefresh(request, env, cors);
      }
      if (path === '/api/figma/mcp/status' && request.method === 'GET') {
        return await handleMcpStatus(request, env, cors);
      }
      if (path === '/api/figma/mcp/context' && request.method === 'POST') {
        return await handleMcpContext(request, env, cors);
      }
      if (path === '/api/figma/mcp/screenshot' && request.method === 'POST') {
        return await handleMcpScreenshot(request, env, cors);
      }

      return jsonResponse({ error: 'Not Found' }, 404, cors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: message }, 500, cors);
    }
  },
};
