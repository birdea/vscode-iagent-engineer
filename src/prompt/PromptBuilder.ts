import { PromptPayload, OutputFormat } from '../types';
import { estimateTokens, TokenEstimate } from './TokenEstimator';

const FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  html: 'Generate semantic HTML5 with inline CSS. Use modern HTML elements. Do not use React, TSX, JSX, Vue, or template syntax.',
  tsx: 'Generate a React functional component in TypeScript (TSX). Use proper typing and hooks where needed.',
  vue: 'Generate a Vue 3 Single File Component (SFC) using Composition API and <script setup> syntax. Include <template>, <script setup>, and <style scoped> sections.',
  scss: 'Generate SCSS stylesheet with BEM naming convention and CSS custom properties. Do not emit HTML, TSX, JSX, or JavaScript.',
  tailwind:
    'Generate HTML with Tailwind CSS utility classes. Use responsive design principles. Do not use React, TSX, JSX, Vue, or separate CSS files.',
  kotlin:
    'Generate Jetpack Compose UI code in Kotlin. Use composable functions, idiomatic Compose layout primitives, and avoid web-specific markup.',
};

const FORMAT_FORBIDDEN: Record<OutputFormat, string> = {
  html: 'Forbidden: TSX, JSX, React components, Vue templates, markdown fences, explanations.',
  tsx: 'Forbidden: plain HTML-only output, Vue SFC syntax, markdown fences, explanations.',
  vue: 'Forbidden: React/TSX, plain HTML without Vue directives, Options API, markdown fences, explanations.',
  scss: 'Forbidden: HTML markup, TSX/JSX, JavaScript, markdown fences, explanations.',
  tailwind:
    'Forbidden: React/TSX unless explicitly requested via TSX format, separate CSS files, markdown fences, explanations.',
  kotlin: 'Forbidden: HTML, TSX, JSX, React, XML layouts, SwiftUI, markdown fences, explanations.',
};

export class PromptBuilder {
  build(payload: PromptPayload): string {
    const lines: string[] = [
      'You are an expert UI developer.',
      'Follow the requested output format exactly.',
      'Never switch to a different UI framework or file type than the requested output format.',
      'Treat the user instruction as required unless it conflicts with the requested output format or the provided Figma data.',
      'Output ONLY valid code. No explanation, no markdown code fences.',
      '',
      `Generate ${payload.outputFormat.toUpperCase()} code that faithfully reproduces the layout.`,
      FORMAT_INSTRUCTIONS[payload.outputFormat],
      FORMAT_FORBIDDEN[payload.outputFormat],
      '',
    ];

    lines.push('=== Output Contract ===');
    lines.push(`Target format: ${payload.outputFormat.toUpperCase()}`);
    lines.push(`Primary rule: ${FORMAT_INSTRUCTIONS[payload.outputFormat]}`);
    lines.push(FORMAT_FORBIDDEN[payload.outputFormat]);
    lines.push('');

    if (payload.mcpData !== undefined && payload.mcpData !== null) {
      lines.push('=== Figma Design Data (MCP) ===');
      lines.push(
        typeof payload.mcpData === 'string'
          ? payload.mcpData
          : JSON.stringify(payload.mcpData, null, 2),
      );
      lines.push('');
    }

    if (payload.userPrompt?.trim()) {
      lines.push('=== User Instruction ===');
      lines.push(payload.userPrompt.trim());
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

  estimate(payload: PromptPayload): TokenEstimate {
    const text = this.build(payload);
    return estimateTokens(text);
  }
}
