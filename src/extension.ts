import * as vscode from 'vscode';
import { SidebarProvider } from './webview/SidebarProvider';
import { Logger } from './logger/Logger';
import { AgentFactory } from './agent/AgentFactory';
import { COMMANDS, CONFIG_KEYS, SECRET_KEYS, VIEW_IDS, getSecretStorageKey } from './constants';
import { RemoteFigmaAuthService } from './figma/RemoteFigmaAuthService';
import { AgentType } from './types';
import { StateManager } from './state/StateManager';
import { ProfilerLiveMonitor } from './profiler/ProfilerLiveMonitor';
import { ProfilerStateManager } from './profiler/ProfilerStateManager';
import { ProfilerService } from './profiler/ProfilerService';
import { resolveLocale, t } from './i18n';

let outputChannelRef: vscode.OutputChannel | undefined;
let sidebarProviders: SidebarProvider[] = [];
let profilerLiveMonitorRef: ProfilerLiveMonitor | undefined;
let profilerProviderRef: SidebarProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const locale = resolveLocale(vscode.env.language);
  const outputChannel = vscode.window.createOutputChannel('iAgent Engineer');
  outputChannelRef = outputChannel;
  Logger.initialize(outputChannel);
  const stateManager = new StateManager();
  const profilerStateManager = new ProfilerStateManager();
  const profilerService = new ProfilerService();
  const profilerLiveMonitor = new ProfilerLiveMonitor(profilerStateManager, profilerService);
  profilerLiveMonitorRef = profilerLiveMonitor;
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
  const profilerProvider = new SidebarProvider(
    VIEW_IDS.PROFILER,
    'profiler',
    context.extensionUri,
    context,
    stateManager,
    remoteAuthService,
    profilerStateManager,
    profilerService,
    profilerLiveMonitor,
  );
  profilerProviderRef = profilerProvider;
  const profilerDetailProvider = new SidebarProvider(
    VIEW_IDS.PROFILER_DETAIL,
    'profiler-detail',
    context.extensionUri,
    context,
    stateManager,
    remoteAuthService,
    profilerStateManager,
    profilerService,
    profilerLiveMonitor,
  );
  sidebarProviders = [setupProvider, promptProvider, profilerProvider, profilerDetailProvider];

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        if (uri.path !== '/figma-remote-auth') {
          return;
        }

        try {
          await remoteAuthService.handleCallbackUri(uri, context.extension.id);
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
    vscode.window.registerWebviewViewProvider(VIEW_IDS.PROFILER, profilerProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.PROFILER_DETAIL, profilerDetailProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('iagent-engineer')) return;

      if (e.affectsConfiguration(CONFIG_KEYS.PROFILER_REFRESH_PERIOD_MS)) {
        profilerProviderRef?.syncProfilerSettings();
      }

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
      await vscode.commands.executeCommand('workbench.view.extension.iagent-engineer');
      setupProvider.postMessage({ event: 'figma.connectRequested' });
    }),
    vscode.commands.registerCommand(COMMANDS.GENERATE, () => {
      vscode.commands.executeCommand('workbench.view.extension.iagent-engineer');
    }),
    vscode.commands.registerCommand(COMMANDS.PROFILER_OPEN_SETTINGS, async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        CONFIG_KEYS.PROFILER_REFRESH_PERIOD_MS,
      );
    }),
    vscode.commands.registerCommand(COMMANDS.PROFILER_REFRESH, () => {
      profilerProviderRef?.performProfilerAction('refresh');
    }),
    vscode.commands.registerCommand(COMMANDS.PROFILER_DELETE_SELECTED, () => {
      profilerProviderRef?.performProfilerAction('deleteSelected');
    }),
    vscode.commands.registerCommand(COMMANDS.PROFILER_SELECT_ALL, () => {
      profilerProviderRef?.performProfilerAction('toggleSelectAll');
    }),
    vscode.commands.registerCommand(COMMANDS.PROFILER_DESELECT_ALL, () => {
      profilerProviderRef?.performProfilerAction('toggleSelectAll');
    }),
    vscode.commands.registerCommand('iagent-engineer.prompt.generate', () => {
      promptProvider.postMessage({ event: 'prompt.generateRequested' });
    }),
    vscode.commands.registerCommand('iagent-engineer.log.clear', () => {
      Logger.clear();
      outputChannel.clear();
    }),
    vscode.commands.registerCommand('iagent-engineer.log.copy', async () => {
      await vscode.env.clipboard.writeText(Logger.toText());
      vscode.window.showInformationMessage(t(locale, 'system.logCopied'));
    }),
    vscode.commands.registerCommand('iagent-engineer.setup.reset', async () => {
      const confirm = await vscode.window.showWarningMessage(
        t(locale, 'system.setupResetConfirm'),
        { modal: true },
        t(locale, 'system.setupResetConfirmButton'),
      );
      if (confirm !== t(locale, 'system.setupResetConfirmButton')) return;

      // Clear all API key secrets and Figma auth
      for (const key of Object.values(SECRET_KEYS)) {
        await context.secrets.delete(key);
      }

      // Clear globalState
      await context.globalState.update(CONFIG_KEYS.DEFAULT_AGENT, undefined);
      await context.globalState.update(CONFIG_KEYS.DEFAULT_MODEL, undefined);

      // Reset in-memory state
      stateManager.resetAgentState();
      stateManager.clearLastDesignContextData();
      stateManager.clearLastMetadata();
      stateManager.clearLastMcpInput();
      stateManager.clearLastScreenshot();

      // Clear AgentFactory cached keys
      AgentFactory.clear();

      // Notify webview to reset UI
      setupProvider.postMessage({ event: 'setup.reset' });

      vscode.window.showInformationMessage(t(locale, 'system.setupResetDone'));
    }),
    outputChannel,
  );

  Logger.info('system', `iAgent Engineer v${context.extension.packageJSON.version} activated`);
}

export async function deactivate(): Promise<void> {
  Logger.info('system', 'iAgent Engineer deactivated');
  profilerLiveMonitorRef?.dispose();
  profilerLiveMonitorRef = undefined;
  profilerProviderRef = undefined;
  await Promise.allSettled(sidebarProviders.splice(0).map((provider) => provider.dispose()));
  AgentFactory.clear();
  Logger.clear();
  outputChannelRef?.dispose();
  outputChannelRef = undefined;
}
