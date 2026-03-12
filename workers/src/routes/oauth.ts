import type { Env } from '../index';

const FIGMA_AUTH_URL = 'https://www.figma.com/oauth';
const FIGMA_TOKEN_URL = 'https://api.figma.com/v1/oauth/token';
const FIGMA_REFRESH_URL = 'https://api.figma.com/v1/oauth/refresh';

interface TokenRequest {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

interface RefreshRequest {
  refreshToken: string;
}

interface OAuthStatePayload {
  vscodeRedirectUri: string;
}

function jsonResponse(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

function encodeState(payload: OAuthStatePayload): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeState(value: string): OAuthStatePayload | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(atob(padded)) as OAuthStatePayload;
  } catch {
    return null;
  }
}

function buildWorkerCallbackUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/figma/oauth/callback`;
}

export async function handleOAuthStart(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const vscodeRedirectUri = url.searchParams.get('vscode_redirect_uri');
  const scope = url.searchParams.get('scope') || 'file_content:read,current_user:read';

  if (!vscodeRedirectUri) {
    return new Response('Missing vscode_redirect_uri', { status: 400 });
  }

  const redirect = new URL(FIGMA_AUTH_URL);
  redirect.searchParams.set('client_id', env.FIGMA_CLIENT_ID);
  redirect.searchParams.set('redirect_uri', buildWorkerCallbackUrl(request));
  redirect.searchParams.set('scope', scope);
  redirect.searchParams.set('response_type', 'code');
  redirect.searchParams.set('state', encodeState({ vscodeRedirectUri }));

  return Response.redirect(redirect.toString(), 302);
}

export async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const decoded = state ? decodeState(state) : null;

  if (!code || !decoded?.vscodeRedirectUri) {
    return new Response('Invalid OAuth callback payload', { status: 400 });
  }

  const params = new URLSearchParams({
    redirect_uri: buildWorkerCallbackUrl(request),
    code,
    grant_type: 'authorization_code',
  });

  const res = await fetch(FIGMA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(env.FIGMA_CLIENT_ID, env.FIGMA_CLIENT_SECRET),
    },
    body: params.toString(),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    return new Response(`Token exchange failed: ${data.error || res.statusText}`, { status: 502 });
  }

  const redirect = new URL(decoded.vscodeRedirectUri);
  redirect.searchParams.set('access_token', data.access_token);
  if (data.refresh_token) {
    redirect.searchParams.set('refresh_token', data.refresh_token);
  }
  if (typeof data.expires_in === 'number') {
    redirect.searchParams.set('expires_in', String(data.expires_in));
  }

  return Response.redirect(redirect.toString(), 302);
}

export async function handleOAuthToken(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const body = (await request.json()) as TokenRequest;
  const { code, codeVerifier, redirectUri } = body;

  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse(
      { error: 'Missing required fields: code, codeVerifier, redirectUri' },
      400,
      cors,
    );
  }

  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    code,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const res = await fetch(FIGMA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(env.FIGMA_CLIENT_ID, env.FIGMA_CLIENT_SECRET),
    },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    return jsonResponse({ error: 'Token exchange failed', details: data }, res.status, cors);
  }

  return jsonResponse(data, 200, cors);
}

export async function handleOAuthRefresh(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const body = (await request.json()) as RefreshRequest;
  const { refreshToken } = body;

  if (!refreshToken) {
    return jsonResponse({ error: 'Missing required field: refreshToken' }, 400, cors);
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
  });

  const res = await fetch(FIGMA_REFRESH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(env.FIGMA_CLIENT_ID, env.FIGMA_CLIENT_SECRET),
    },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    return jsonResponse({ error: 'Token refresh failed', details: data }, res.status, cors);
  }

  return jsonResponse(data, 200, cors);
}
