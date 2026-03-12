const FIGMA_API_BASE = 'https://api.figma.com/v1';

const KEEP_KEYS = new Set([
  'id',
  'name',
  'type',
  'visible',
  'children',
  'layoutMode',
  'layoutAlign',
  'layoutGrow',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'itemSpacing',
  'absoluteBoundingBox',
  'absoluteRenderBounds',
  'constraints',
  'relativeTransform',
  'fills',
  'strokes',
  'strokeWeight',
  'strokeAlign',
  'cornerRadius',
  'rectangleCornerRadii',
  'opacity',
  'blendMode',
  'effects',
  'clipsContent',
  'characters',
  'style',
  'characterStyleOverrides',
  'styleOverrideTable',
  'componentId',
  'componentProperties',
]);

function trimNode(node: Record<string, unknown>): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {};

  for (const key of Object.keys(node)) {
    if (!KEEP_KEYS.has(key)) continue;

    if (key === 'children' && Array.isArray(node.children)) {
      trimmed.children = (node.children as Record<string, unknown>[]).map(trimNode);
    } else {
      trimmed[key] = node[key];
    }
  }

  return trimmed;
}

function trimResponse(data: Record<string, unknown>): unknown {
  const nodes = data.nodes as Record<string, { document: Record<string, unknown> }> | undefined;
  if (!nodes) return data;

  const trimmed: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(nodes)) {
    trimmed[id] = {
      document: trimNode(entry.document),
    };
  }

  return { nodes: trimmed };
}

export async function getFileNodes(
  fileKey: string,
  nodeId: string,
  accessToken: string,
): Promise<unknown> {
  const url = `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const error = await res.text();
    const err = new Error(`Figma API error (${res.status}): ${error}`);
    (err as unknown as Record<string, unknown>).status = res.status;
    throw err;
  }

  const raw = (await res.json()) as Record<string, unknown>;
  return trimResponse(raw);
}

export async function getNodeImage(
  fileKey: string,
  nodeId: string,
  accessToken: string,
  format: 'png' | 'jpg' | 'svg' = 'png',
  scale = 2,
): Promise<{ data: string; mimeType: string }> {
  const url = `${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const error = await res.text();
    const err = new Error(`Figma Image API error (${res.status}): ${error}`);
    (err as unknown as Record<string, unknown>).status = res.status;
    throw err;
  }

  const json = (await res.json()) as { images: Record<string, string | null> };
  const imageUrl = Object.values(json.images)[0];

  if (!imageUrl) {
    throw new Error('Figma returned no image for the specified node');
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download image: ${imageRes.status}`);
  }

  const buffer = await imageRes.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;

  return { data: base64, mimeType };
}
