import * as vscode from 'vscode';
import { SidebarProvider } from './webview/SidebarProvider';
import { Logger } from './logger/Logger';
import { AgentFactory } from './agent/AgentFactory';
import { COMMANDS, VIEW_IDS, SECRET_KEYS } from './constants';
import { AgentType } from './types';

export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('FigmaLab');
  Logger.initialize(outputChannel);

  // Load saved API keys at activation
  const agents: AgentType[] = ['gemini', 'claude'];
  for (const agent of agents) {
    const secretKey = SECRET_KEYS[`${agent.toUpperCase()}_API_KEY` as keyof typeof SECRET_KEYS];
    const key = await context.secrets.get(secretKey);
    if (key) {
      await AgentFactory.getAgent(agent).setApiKey(key);
    }
  }

  const figmaProvider = new SidebarProvider(VIEW_IDS.FIGMA, 'figma', context.extensionUri, context);
  const agentProvider = new SidebarProvider(VIEW_IDS.AGENT, 'agent', context.extensionUri, context);
  const promptProvider = new SidebarProvider(VIEW_IDS.PROMPT, 'prompt', context.extensionUri, context);
  const logProvider = new SidebarProvider(
    VIEW_IDS.LOG,
    'log',
    context.extensionUri,
    context,
    (entry) => logProvider.postMessage({ event: 'log.append', entry })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_IDS.FIGMA, figmaProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.AGENT, agentProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.PROMPT, promptProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.LOG, logProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CONNECT, async () => {
      await vscode.commands.executeCommand('workbench.view.extension.figmalab');
      figmaProvider.postMessage({ event: 'figma.connectRequested' });
    }),
    vscode.commands.registerCommand(COMMANDS.GENERATE, () => {
      vscode.commands.executeCommand('workbench.view.extension.figmalab');
    }),
    vscode.commands.registerCommand('figmalab.agent.save', () => {
      agentProvider.postMessage({ event: 'agent.saveRequested' });
    }),
    vscode.commands.registerCommand('figmalab.agent.clear', () => {
      agentProvider.postMessage({ event: 'agent.clearRequested' });
    }),
    vscode.commands.registerCommand('figmalab.prompt.generate', () => {
      promptProvider.postMessage({ event: 'prompt.generateRequested' });
    }),
    vscode.commands.registerCommand('figmalab.log.clear', () => {
      Logger.clear();
      logProvider.postMessage({ event: 'log.clear' });
    }),
    vscode.commands.registerCommand('figmalab.log.copy', async () => {
      await vscode.env.clipboard.writeText(Logger.toText());
      vscode.window.showInformationMessage('Log copied to clipboard');
    }),
    vscode.commands.registerCommand('figmalab.log.save', async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: { JSON: ['json'], Text: ['txt'] },
        saveLabel: 'Save Log',
      });
      if (uri) {
        const content = uri.fsPath.endsWith('.json') ? Logger.toJson() : Logger.toText();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
        vscode.window.showInformationMessage(`Log saved: ${uri.fsPath}`);
      }
    }),
    outputChannel
  );

  Logger.info('system', `FigmaLab v${context.extension.packageJSON.version} activated`);
}

export function deactivate() {
  Logger.info('system', 'FigmaLab deactivated');
}
