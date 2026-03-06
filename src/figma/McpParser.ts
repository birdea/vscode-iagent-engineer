import { ParsedMcpData } from '../types';

const FIGMA_URL_PATTERN =
  /figma\.com\/(?:file|design)\/([A-Za-z0-9]+)[^?"\s]*(?:\?.*node-id=([^&"\s]+))?/;

export function parseMcpData(input: string): ParsedMcpData {
  const trimmed = input.trim();

  // Try URL pattern first
  const urlMatch = trimmed.match(FIGMA_URL_PATTERN);
  if (urlMatch) {
    const fileId = urlMatch[1];
    const nodeId = urlMatch[2] ? decodeURIComponent(urlMatch[2]).replace(/-/g, ':') : '';
    return { fileId, nodeId, raw: trimmed };
  }

  // Try JSON parsing
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const fileId = extractString(json, ['fileId', 'file_id', 'id']) ?? '';
    const nodeId = extractString(json, ['nodeId', 'node_id', 'node']) ?? '';

    if (fileId) {
      return { fileId, nodeId, raw: json };
    }

    // Check if JSON contains a Figma URL
    const jsonStr = JSON.stringify(json);
    const urlInJson = jsonStr.match(FIGMA_URL_PATTERN);
    if (urlInJson) {
      return {
        fileId: urlInJson[1],
        nodeId: urlInJson[2] ? decodeURIComponent(urlInJson[2]).replace(/-/g, ':') : '',
        raw: json,
      };
    }
  } catch {
    // Not JSON, try to extract from plain text
    const textMatch = trimmed.match(FIGMA_URL_PATTERN);
    if (textMatch) {
      return {
        fileId: textMatch[1],
        nodeId: textMatch[2] ? decodeURIComponent(textMatch[2]).replace(/-/g, ':') : '',
        raw: trimmed,
      };
    }
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
