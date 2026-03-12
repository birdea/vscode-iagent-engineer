import * as vscode from 'vscode';
import { AgentFactory } from '../../agent/AgentFactory';
import { EditorIntegration } from '../../editor/EditorIntegration';
import { Logger } from '../../logger/Logger';
import { PromptBuilder } from '../../prompt/PromptBuilder';
import { PromptPayload, HostToWebviewMessage } from '../../types';
import { PROGRESS_CAP, getSecretStorageKey } from '../../constants';
import { StateManager } from '../../state/StateManager';
import { UiLocale, USER_CANCELLED_CODE_GENERATION, t } from '../../i18n';
import { UserCancelledError, toErrorMessage } from '../../errors';

export class PromptCommandHandler {
  private isGenerating = false;
  private currentRequestId: string | null = null;
  private abortController: AbortController | null = null;

  constructor(
    private webview: vscode.Webview,
    private context: vscode.ExtensionContext,
    private editorIntegration: EditorIntegration,
    private stateManager: StateManager,
    private locale: UiLocale,
  ) {}

  private post(msg: HostToWebviewMessage) {
    this.webview.postMessage(msg);
  }

  private postPromptLog(
    level: 'info' | 'warn' | 'error' | 'success',
    layer: 'prompt' | 'agent' | 'editor',
    message: string,
    detail?: string,
  ) {
    Logger.log(level, layer, message, detail);
  }

  async generate(payload: PromptPayload) {
    if (this.isGenerating) {
      this.post({
        event: 'prompt.error',
        message: t(this.locale, 'host.prompt.alreadyGenerating'),
        code: 'failed',
      });
      return;
    }

    const agent = payload.agent ?? this.stateManager.getAgent();
    const model = payload.model ?? this.stateManager.getModel();
    const runtimeAgent = AgentFactory.getAgent(agent);

    const key = await this.context.secrets.get(getSecretStorageKey(agent));
    if (key) {
      await runtimeAgent.setApiKey(key);
    } else {
      await runtimeAgent.clearApiKey();
    }

    const requestedScreenshot =
      payload.screenshotData === undefined
        ? this.stateManager.getLastScreenshot()
        : payload.screenshotData;
    const supportsScreenshot = this.agentSupportsScreenshot(agent);
    const resolvedMcpData = this.resolveMcpData(payload);
    const resolvedPayload = {
      ...payload,
      agent,
      model,
      mcpData: resolvedMcpData,
      screenshotData: supportsScreenshot ? requestedScreenshot : null,
    };

    Logger.info('prompt', `Generating ${resolvedPayload.outputFormat} code with ${agent}:${model}`);
    this.postPromptLog(
      'info',
      'prompt',
      `Starting ${resolvedPayload.outputFormat.toUpperCase()} generation`,
      `${agent}:${model || 'default'} | userPrompt=${resolvedPayload.userPrompt ? 'yes' : 'no'} | mcpData=${resolvedPayload.mcpData ? (payload.mcpDataKind ?? 'designContext') : 'no'} | screenshot=${resolvedPayload.screenshotData ? 'yes' : 'no'}`,
    );
    if (requestedScreenshot && !supportsScreenshot) {
      this.postPromptLog(
        'warn',
        'prompt',
        'Screenshot input skipped for the current agent',
        `${agent} currently uses text-only generation in this extension.`,
      );
    }
    this.post({ event: 'prompt.streaming', progress: 0 });
    this.isGenerating = true;
    this.currentRequestId = payload.requestId ?? null;
    this.abortController = new AbortController();

    let fullCode = '';
    let progress = 5;

    try {
      this.post({ event: 'prompt.streaming', progress });
      const gen = runtimeAgent.generateCode(resolvedPayload, this.abortController.signal);
      this.postPromptLog('info', 'agent', 'Request sent to AI agent');
      for await (const chunk of gen) {
        if (this.abortController.signal.aborted) {
          throw new UserCancelledError(USER_CANCELLED_CODE_GENERATION);
        }
        fullCode += chunk;
        progress = Math.min(PROGRESS_CAP, progress + 5);
        this.postPromptLog(
          'info',
          'agent',
          `Response chunk received (${chunk.length} chars)`,
          this.summarizeChunk(chunk),
        );
        this.post({ event: 'prompt.streaming', progress, text: chunk });
      }

      this.post({ event: 'prompt.streaming', progress: 100 });
      fullCode = this.stripMarkdownFences(fullCode);
      this.editorIntegration.setGeneratedOutputFormat(resolvedPayload.outputFormat);
      await this.editorIntegration.openInEditor(
        fullCode,
        this.toVsCodeLanguage(resolvedPayload.outputFormat),
        this.toSuggestedFilename(resolvedPayload.outputFormat),
      );
      await this.editorIntegration.syncBrowserPreviewIfActive(
        fullCode,
        resolvedPayload.outputFormat,
      );
      this.postPromptLog(
        'success',
        'editor',
        'Generated output opened in editor',
        this.toSuggestedFilename(resolvedPayload.outputFormat),
      );
      this.post({
        event: 'prompt.result',
        code: fullCode,
        format: resolvedPayload.outputFormat,
        complete: true,
        progress: 100,
      });
    } catch (e) {
      const errMessage = toErrorMessage(e);
      const isCancelled =
        e instanceof UserCancelledError ||
        this.abortController?.signal.aborted ||
        errMessage === USER_CANCELLED_CODE_GENERATION;
      const errorMessage = isCancelled ? t(this.locale, 'host.prompt.cancelled') : errMessage;
      if (fullCode.length > 0) {
        fullCode = this.stripMarkdownFences(fullCode);
        this.editorIntegration.setGeneratedOutputFormat(resolvedPayload.outputFormat);
        await this.editorIntegration.openInEditor(
          fullCode,
          this.toVsCodeLanguage(resolvedPayload.outputFormat),
          this.toSuggestedFilename(resolvedPayload.outputFormat),
        );
        await this.editorIntegration.syncBrowserPreviewIfActive(
          fullCode,
          resolvedPayload.outputFormat,
        );
        this.postPromptLog(
          isCancelled ? 'warn' : 'error',
          'editor',
          'Partial output opened in editor',
          `${this.toSuggestedFilename(resolvedPayload.outputFormat)} | ${errorMessage}`,
        );
        this.post({
          event: 'prompt.result',
          code: fullCode,
          format: resolvedPayload.outputFormat,
          complete: false,
          message: errorMessage,
          progress,
        });
      } else {
        this.postPromptLog(
          isCancelled ? 'warn' : 'error',
          'agent',
          'Generation failed before any output was produced',
          errorMessage,
        );
        this.post({
          event: 'prompt.error',
          message: errorMessage,
          code: isCancelled ? 'cancelled' : 'failed',
        });
      }
    } finally {
      this.isGenerating = false;
      this.currentRequestId = null;
      this.abortController = null;
    }
  }

  cancel(requestId?: string) {
    if (!this.isGenerating || !this.abortController) {
      return;
    }
    if (requestId && this.currentRequestId && requestId !== this.currentRequestId) {
      return;
    }

    Logger.info('prompt', 'Code generation cancelled by user');
    this.abortController.abort();
  }

  estimate(payload: PromptPayload) {
    const builder = new PromptBuilder();
    const resolvedPayload = {
      ...payload,
      mcpData: this.resolveMcpData(payload),
      screenshotData:
        payload.screenshotData === undefined
          ? this.stateManager.getLastScreenshot()
          : payload.screenshotData,
    };
    const estimate = builder.estimate(resolvedPayload);
    this.post({ event: 'prompt.estimateResult', tokens: estimate.tokens, kb: estimate.kb });
  }

  async openEditor(code: string, language?: string) {
    await this.editorIntegration.openInEditor(code, language);
  }

  async saveFile(code: string, filename: string) {
    await this.editorIntegration.saveAsNewFile(code, filename);
  }

  async openPreviewPanel(code?: string, format?: PromptPayload['outputFormat']) {
    const opened = await this.editorIntegration.openPreviewPanel(code, format);
    this.post({ event: 'prompt.previewOpened', requested: 'panel', opened });
  }

  async openBrowserPreview(code?: string, format?: PromptPayload['outputFormat']) {
    const opened = await this.editorIntegration.openBrowserPreview(code, format);
    this.post({ event: 'prompt.previewOpened', requested: 'browser', opened });
  }

  async openGeneratedEditor() {
    await this.editorIntegration.openGeneratedInEditor();
  }

  private toVsCodeLanguage(format: PromptPayload['outputFormat']): string {
    switch (format) {
      case 'tsx':
        return 'typescriptreact';
      case 'html':
      case 'tailwind':
        return 'html';
      case 'vue':
        return 'vue';
      default:
        return 'plaintext';
    }
  }

  private toSuggestedFilename(format: PromptPayload['outputFormat']): string {
    switch (format) {
      case 'tsx':
        return 'generated-ui.tsx';
      case 'html':
      case 'tailwind':
        return 'generated-ui.html';
      case 'vue':
        return 'GeneratedUi.vue';
      default:
        return 'generated-ui.txt';
    }
  }

  private stripMarkdownFences(code: string): string {
    let result = code.replace(/^```[\w]*\r?\n/, '');
    result = result.replace(/\n?```\s*$/, '');
    return result;
  }

  private summarizeChunk(chunk: string): string {
    const singleLine = chunk.replace(/\s+/g, ' ').trim();
    return singleLine.length > 120 ? `${singleLine.slice(0, 117)}...` : singleLine;
  }

  private resolveMcpData(payload: PromptPayload): unknown {
    if (payload.mcpData !== undefined) {
      return payload.mcpData;
    }
    if (payload.mcpDataKind === null) {
      return null;
    }
    if (payload.mcpDataKind === 'metadata') {
      return this.stateManager.getLastMetadata();
    }
    return this.stateManager.getLastDesignContextData();
  }

  private agentSupportsScreenshot(agent: PromptPayload['agent']): boolean {
    return agent === 'gemini' || agent === 'claude' || agent === 'qwen' || agent === 'openrouter';
  }

  getGeneratingState() {
    return this.isGenerating;
  }
}
