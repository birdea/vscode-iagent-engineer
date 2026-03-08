import type { Env } from '../index';
import { getFileNodes, getNodeImage } from '../lib/figmaRestApi';

function jsonResponse(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function getAccessToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

interface McpRequest {
  figmaUrl?: string;
  nodeId?: string;
  fileKey?: string;
}

function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  const match = url.match(
    /https?:\/\/(?:www\.)?figma\.com\/(?:design|file)\/([^/]+)\/[^?]*\?[^]*node-id=([^&\s]+)/,
  );
  if (!match) return null;
  return { fileKey: match[1], nodeId: match[2].replace(/-/g, ':') };
}

function resolveFileAndNode(body: McpRequest): { fileKey: string; nodeId: string } | null {
  if (body.figmaUrl) {
    return parseFigmaUrl(body.figmaUrl);
  }
  if (body.fileKey && body.nodeId) {
    return { fileKey: body.fileKey, nodeId: body.nodeId };
  }
  return null;
}

export async function handleMcpStatus(
  request: Request,
  _env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401, cors);
  }

  try {
    const res = await fetch('https://api.figma.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      return jsonResponse({ connected: true }, 200, cors);
    }
    return jsonResponse({ connected: false, error: `Figma API returned ${res.status}` }, 200, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ connected: false, error: message }, 200, cors);
  }
}

export async function handleMcpContext(
  request: Request,
  _env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401, cors);
  }

  const body = (await request.json()) as McpRequest;
  const target = resolveFileAndNode(body);

  if (!target) {
    return jsonResponse(
      { error: 'Provide a valid figmaUrl or both nodeId and fileKey' },
      400,
      cors,
    );
  }

  try {
    const result = await getFileNodes(target.fileKey, target.nodeId, accessToken);
    return jsonResponse({ data: result }, 200, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as Record<string, unknown>).status;
    return jsonResponse({ error: message }, typeof status === 'number' ? status : 500, cors);
  }
}

export async function handleMcpScreenshot(
  request: Request,
  _env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401, cors);
  }

  const body = (await request.json()) as McpRequest;
  const target = resolveFileAndNode(body);

  if (!target) {
    return jsonResponse(
      { error: 'Provide a valid figmaUrl or both nodeId and fileKey' },
      400,
      cors,
    );
  }

  try {
    const image = await getNodeImage(target.fileKey, target.nodeId, accessToken);
    return jsonResponse({ data: image.data, mimeType: image.mimeType }, 200, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as Record<string, unknown>).status;
    return jsonResponse({ error: message }, typeof status === 'number' ? status : 500, cors);
  }
}
