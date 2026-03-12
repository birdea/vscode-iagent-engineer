import { PromptPayload, OutputFormat } from '../types';
import { estimateTokens, TokenEstimate } from './TokenEstimator';

export const DEFAULT_PROMPT_TEXT = [
  'You are an expert UI developer.',
  'Follow the requested output format exactly.',
  'Never switch to a different UI framework or file type than the requested output format.',
  'Treat the user instruction as required unless it conflicts with the requested output format or the provided Figma data.',
  'Output ONLY valid code. No explanation, no markdown code fences.',
].join('\n');

const FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  html: 'Generate semantic HTML5 with inline CSS. Use modern HTML elements. Do not use React, TSX, JSX, Vue, or template syntax.',
  tsx: 'Generate a React functional component in TypeScript (TSX). Use proper typing and hooks where needed.',
  vue: 'Generate a Vue 3 Single File Component (SFC) using Composition API and <script setup> syntax. Include <template>, <script setup>, and <style scoped> sections.',
  tailwind:
    'Generate HTML with Tailwind CSS utility classes. Use responsive design principles. Do not use React, TSX, JSX, Vue, or separate CSS files.',
};

const FORMAT_FORBIDDEN: Record<OutputFormat, string> = {
  html: 'Forbidden: TSX, JSX, React components, Vue templates, markdown fences, explanations.',
  tsx: 'Forbidden: plain HTML-only output, Vue SFC syntax, markdown fences, explanations.',
  vue: 'Forbidden: React/TSX, plain HTML without Vue directives, Options API, markdown fences, explanations.',
  tailwind:
    'Forbidden: React/TSX unless explicitly requested via TSX format, separate CSS files, markdown fences, explanations.',
};

export function getFormatPromptPreview(format: OutputFormat): string {
  return [
    `Generate ${format.toUpperCase()} code that faithfully reproduces the layout.`,
    FORMAT_INSTRUCTIONS[format],
    FORMAT_FORBIDDEN[format],
    '',
    '=== Output Contract ===',
    `Target format: ${format.toUpperCase()}`,
    `Primary rule: ${FORMAT_INSTRUCTIONS[format]}`,
    FORMAT_FORBIDDEN[format],
    '',
    '=== Final Response Rules ===',
    `Return only ${format.toUpperCase()} code.`,
    'Do not include any explanation, prose, comments about the format choice, or markdown fences.',
    `If the target format is not TSX, do not output TSX, JSX, or React code.`,
    `=== Output Format: ${format.toUpperCase()} ===`,
  ].join('\n');
}

export class PromptBuilder {
  getSystemPrompt(payload: PromptPayload): string {
    return payload.userPrompt?.trim() || DEFAULT_PROMPT_TEXT;
  }

  buildUserPrompt(payload: PromptPayload): string {
    const lines: string[] = [getFormatPromptPreview(payload.outputFormat), ''];

    if (payload.mcpData !== undefined && payload.mcpData !== null) {
      lines.push(
        payload.mcpDataKind === 'metadata'
          ? '=== Figma Metadata (MCP) ==='
          : '=== Figma Design Context (MCP) ===',
      );
      lines.push(
        typeof payload.mcpData === 'string'
          ? payload.mcpData
          : JSON.stringify(payload.mcpData, null, 2),
      );
      lines.push('');
    }

    if (payload.screenshotData) {
      lines.push('=== Figma Screenshot ===');
      lines.push(
        'A Figma screenshot is attached separately as an image input. Use it as the primary visual reference for spacing, styling, and layout fidelity.',
      );
      lines.push('');
    }

    lines.push('=== Final Response Rules ===');
    lines.push(`Return only ${payload.outputFormat.toUpperCase()} code.`);
    lines.push(
      'Do not include any explanation, prose, comments about the format choice, or markdown fences.',
    );
    lines.push(`If the target format is not TSX, do not output TSX, JSX, or React code.`);
    lines.push(`=== Output Format: ${payload.outputFormat.toUpperCase()} ===`);
    return lines.join('\n');
  }

  build(payload: PromptPayload): string {
    const systemPrompt = this.getSystemPrompt(payload);
    const userPrompt = this.buildUserPrompt(payload);
    return [systemPrompt, userPrompt].filter(Boolean).join('\n\n');
  }

  estimate(payload: PromptPayload): TokenEstimate {
    const text = this.build(payload);
    return estimateTokens(text);
  }
}
