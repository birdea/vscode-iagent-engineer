import { ParsedMcpData } from '../types';

const FIGMA_URL_PATTERN =
  /figma\.com\/(?:file|design)\/([A-Za-z0-9]+)[^?"\s]*(?:\?.*node-id=([^&"\s]+))?/;
const MAX_FILE_ID_LENGTH = 128;
const MAX_NODE_ID_LENGTH = 256;

export function parseMcpData(input: string): ParsedMcpData {
  const trimmed = input.trim();

  // Try JSON parsing first for richer 'raw' data
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const fileId = sanitizeFileId(extractString(json, ['fileId', 'fileId', 'file_id', 'id']));
    const nodeId = sanitizeNodeId(extractString(json, ['nodeId', 'node_id', 'node']));

    if (fileId) {
      return { fileId, nodeId, raw: json };
    }

    // Check if JSON content strings contain a Figma URL
    const jsonStr = JSON.stringify(json);
    const urlMatch = jsonStr.match(FIGMA_URL_PATTERN);
    if (urlMatch) {
      return {
        fileId: sanitizeFileId(urlMatch[1]),
        nodeId: sanitizeNodeId(urlMatch[2]),
        raw: json,
      };
    }
  } catch {}

  // Try direct URL match in plain text
  const textMatch = trimmed.match(FIGMA_URL_PATTERN);
  if (textMatch) {
    return {
      fileId: sanitizeFileId(textMatch[1]),
      nodeId: sanitizeNodeId(textMatch[2]),
      raw: trimmed,
    };
  }

  return { fileId: '', nodeId: '', raw: trimmed };
}

function extractString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof obj[key] === 'string' && obj[key]) {
      return obj[key] as string;
    }
  }
  return undefined;
}

function sanitizeFileId(fileId?: string): string {
  if (!fileId) {
    return '';
  }

  const normalized = fileId.replace(/[^A-Za-z0-9]/g, '');
  if (!normalized || normalized.length > MAX_FILE_ID_LENGTH) {
    return '';
  }

  return normalized;
}

function sanitizeNodeId(nodeId?: string): string {
  if (!nodeId) {
    return '';
  }

  let decoded = nodeId;
  try {
    decoded = decodeURIComponent(nodeId);
  } catch {
    decoded = nodeId;
  }

  const normalized = decoded.replace(/-/g, ':').replace(/[^\w:]/g, '');
  return normalized.slice(0, MAX_NODE_ID_LENGTH);
}
