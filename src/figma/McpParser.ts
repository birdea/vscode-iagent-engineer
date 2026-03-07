import { ParsedMcpData } from '../types';

const FIGMA_URL_PATTERN =
  /figma\.com\/(?:file|design)\/([A-Za-z0-9]+)[^?"\s]*(?:\?.*node-id=([^&"\s]+))?/;

export function parseMcpData(input: string): ParsedMcpData {
  const trimmed = input.trim();

  // Try JSON parsing first for richer 'raw' data
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const fileId = extractString(json, ['fileId', 'fileId', 'file_id', 'id']) ?? '';
    const nodeId = extractString(json, ['nodeId', 'node_id', 'node']) ?? '';

    if (fileId) {
      return { fileId, nodeId, raw: json };
    }

    // Check if JSON content strings contain a Figma URL
    const jsonStr = JSON.stringify(json);
    const urlMatch = jsonStr.match(FIGMA_URL_PATTERN);
    if (urlMatch) {
      return {
        fileId: urlMatch[1],
        nodeId: urlMatch[2] ? decodeURIComponent(urlMatch[2]).replace(/-/g, ':') : '',
        raw: json,
      };
    }
  } catch {
  }

  // Try direct URL match in plain text
  const textMatch = trimmed.match(FIGMA_URL_PATTERN);
  if (textMatch) {
    return {
      fileId: textMatch[1],
      nodeId: textMatch[2] ? decodeURIComponent(textMatch[2]).replace(/-/g, ':') : '',
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
