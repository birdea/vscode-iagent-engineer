import { TOKEN_ESTIMATE_DIVISOR } from '../constants';

export interface TokenEstimate {
  tokens: number;
  kb: number;
}

export function estimateTokens(text: string): TokenEstimate {
  const bytes = new TextEncoder().encode(text).length;
  const kb = bytes / 1024;
  const tokens = Math.ceil(text.length / TOKEN_ESTIMATE_DIVISOR);
  return { tokens, kb };
}

export function formatEstimate(estimate: TokenEstimate): string {
  const kbStr = estimate.kb.toFixed(1);
  const tokStr = estimate.tokens.toLocaleString();
  return `${kbStr}KB / ~${tokStr} tok`;
}
