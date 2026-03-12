import * as vscode from 'vscode';
import { SidebarProvider } from './webview/SidebarProvider';
import { Logger } from './logger/Logger';
import { AgentFactory } from './agent/AgentFactory';
import { COMMANDS, VIEW_IDS, getSecretStorageKey } from './constants';
import { RemoteFigmaAuthService } from './figma/RemoteFigmaAuthService';
import { AgentType } from './types';
import { StateManager } from './state/StateManager';
import { resolveLocale, t } from './i18n';

let outputChannelRef: vscode.OutputChannel | undefined;
let sidebarProviders: SidebarProvider[] = [];

export async function activate(context: vscode.ExtensionContext) {
  const locale = resolveLocale(vscode.env.language);
  const outputChannel = vscode.window.createOutputChannel('Figma MCP Helper');
  outputChannelRef = outputChannel;
  Logger.initialize(outputChannel);
  const stateManager = new StateManager();
  const remoteAuthService = new RemoteFigmaAuthService(context.secrets);

  // Load saved API keys at activation
  const agents: AgentType[] = ['gemini', 'claude'];
  for (const agent of agents) {
    const key = await context.secrets.get(getSecretStorageKey(agent));
    if (key) {
      await AgentFactory.getAgent(agent).setApiKey(key);
    }
  }

  const setupProvider = new SidebarProvider(
    VIEW_IDS.SETUP,
    'setup',
    context.extensionUri,
    context,
    stateManager,
    remoteAuthService,
  );
  const promptProvider = new SidebarProvider(
    VIEW_IDS.PROMPT,
    'prompt',
    context.extensionUri,
    context,
    stateManager,
    remoteAuthService,
  );
  const logProvider = new SidebarProvider(
    VIEW_IDS.LOG,
    'log',
    context.extensionUri,
    context,
    stateManager,
    remoteAuthService,
    (entry) => logProvider.postMessage({ event: 'log.append', entry }),
  );
  sidebarProviders = [setupProvider, promptProvider, logProvider];

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        if (uri.path !== '/figma-remote-auth') {
          return;
        }

        try {
          await remoteAuthService.handleCallbackUri(uri);
          vscode.window.showInformationMessage(t(locale, 'host.figma.remoteAuthCompleted'));
        } catch (error) {
          Logger.error('figma', `Remote auth callback failed: ${String(error)}`);
          vscode.window.showErrorMessage(t(locale, 'host.figma.remoteAuthCallbackFailed'));
        }
      },
    }),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.SETUP, setupProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.PROMPT, promptProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.LOG, logProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('figma-mcp-helper')) return;

      Logger.info('system', 'Configuration changed — reloading agent API keys');
      for (const agent of agents) {
        const key = await context.secrets.get(getSecretStorageKey(agent));
        if (key) {
          await AgentFactory.getAgent(agent).setApiKey(key);
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CONNECT, async () => {
      await vscode.commands.executeCommand('workbench.view.extension.figma-mcp-helper');
      setupProvider.postMessage({ event: 'figma.connectRequested' });
    }),
    vscode.commands.registerCommand(COMMANDS.GENERATE, () => {
      vscode.commands.executeCommand('workbench.view.extension.figma-mcp-helper');
    }),
    vscode.commands.registerCommand('figma-mcp-helper.prompt.generate', () => {
      promptProvider.postMessage({ event: 'prompt.generateRequested' });
    }),
    vscode.commands.registerCommand('figma-mcp-helper.log.clear', () => {
      Logger.clear();
      logProvider.postMessage({ event: 'log.clear' });
    }),
    vscode.commands.registerCommand('figma-mcp-helper.log.copy', async () => {
      await vscode.env.clipboard.writeText(Logger.toText());
      vscode.window.showInformationMessage(t(locale, 'system.logCopied'));
    }),
    outputChannel,
  );

  Logger.info('system', `Figma MCP Helper v${context.extension.packageJSON.version} activated`);
}

export async function deactivate(): Promise<void> {
  Logger.info('system', 'Figma MCP Helper deactivated');
  await Promise.allSettled(sidebarProviders.splice(0).map((provider) => provider.dispose()));
  AgentFactory.clear();
  Logger.clear();
  outputChannelRef?.dispose();
  outputChannelRef = undefined;
}
