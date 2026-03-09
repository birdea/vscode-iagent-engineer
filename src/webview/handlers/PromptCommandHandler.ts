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

    const key = await this.context.secrets.get(getSecretStorageKey(agent));
    if (key) {
      await AgentFactory.getAgent(agent).setApiKey(key);
    }

    const resolvedPayload = {
      ...payload,
      agent,
      model,
      mcpData: payload.mcpData === undefined ? this.stateManager.getLastMcpData() : payload.mcpData,
    };

    Logger.info('prompt', `Generating ${resolvedPayload.outputFormat} code with ${agent}:${model}`);
    this.post({ event: 'prompt.streaming', progress: 0 });
    this.isGenerating = true;
    this.currentRequestId = payload.requestId ?? null;
    this.abortController = new AbortController();

    let fullCode = '';
    let progress = 5;

    try {
      this.post({ event: 'prompt.streaming', progress });
      const gen = AgentFactory.getAgent(agent).generateCode(
        resolvedPayload,
        this.abortController.signal,
      );
      for await (const chunk of gen) {
        if (this.abortController.signal.aborted) {
          throw new UserCancelledError(USER_CANCELLED_CODE_GENERATION);
        }
        fullCode += chunk;
        progress = Math.min(PROGRESS_CAP, progress + 5);
        this.post({ event: 'prompt.streaming', progress, text: chunk });
      }

      this.post({ event: 'prompt.streaming', progress: 100 });
      await this.editorIntegration.openInEditor(
        fullCode,
        this.toVsCodeLanguage(resolvedPayload.outputFormat),
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
        await this.editorIntegration.openInEditor(
          fullCode,
          this.toVsCodeLanguage(resolvedPayload.outputFormat),
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
      mcpData: payload.mcpData === undefined ? this.stateManager.getLastMcpData() : payload.mcpData,
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

  private toVsCodeLanguage(format: PromptPayload['outputFormat']): string {
    switch (format) {
      case 'tsx':
        return 'typescriptreact';
      case 'html':
      case 'tailwind':
        return 'html';
      case 'scss':
        return 'scss';
      case 'kotlin':
        return 'kotlin';
      default:
        return 'plaintext';
    }
  }

  getGeneratingState() {
    return this.isGenerating;
  }
}
