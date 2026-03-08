import { FigmaLayer } from './components/FigmaLayer';
import { AgentLayer } from './components/AgentLayer';
import { PromptLayer } from './components/PromptLayer';
import { LogLayer } from './components/LogLayer';
import { HostToWebviewMessage } from '../../types';

export function init() {
  const app = document.getElementById('app');
  if (!app) return;

  const section = document.body.dataset.section;

  switch (section) {
    case 'setup': {
      const figma = new FigmaLayer();
      const agent = new AgentLayer();
      app.innerHTML = figma.render() + agent.render();
      figma.mount();
      agent.mount();
      window.addEventListener('message', (event) => {
        const msg = event.data as HostToWebviewMessage;
        if (msg.event === 'figma.connectRequested') figma.requestConnect();
        else if (msg.event === 'figma.status')
          figma.onStatus(msg.connected, msg.methods, msg.error);
        else if (msg.event === 'figma.dataResult') figma.onDataResult(msg.data);
        else if (msg.event === 'figma.dataFetchError') {
          figma.onError(msg.message);
          figma.onDataResult(msg.fallbackData);
        } else if (msg.event === 'figma.screenshotResult') figma.onScreenshotResult(msg.base64);
        else if (msg.event === 'error' && msg.source === 'figma') figma.onError(msg.message);
        else if (msg.event === 'agent.modelsResult') agent.onModelsResult(msg.models);
        else if (msg.event === 'agent.saveRequested') agent.onSaveRequested();
        else if (msg.event === 'agent.clearRequested') agent.onClearRequested();
        else if (msg.event === 'agent.state') agent.onState(msg.agent, msg.model, msg.hasApiKey);
        else if (msg.event === 'agent.settingsSaved')
          agent.onSettingsSaved(msg.agent, msg.model, msg.hasApiKey);
        else if (msg.event === 'agent.settingsCleared') agent.onSettingsCleared(msg.agent);
        else if (msg.event === 'error' && (msg.source === 'agent' || msg.source === 'system')) {
          agent.onError(msg.message);
        }
      });
      break;
    }
    case 'prompt': {
      const layer = new PromptLayer();
      app.innerHTML = layer.render();
      layer.mount();
      window.addEventListener('message', (event) => {
        const msg = event.data as HostToWebviewMessage;
        if (msg.event === 'prompt.generateRequested') layer.onGenerateRequested();
        else if (msg.event === 'prompt.cancelRequested') layer.onCancelRequested();
        else if (msg.event === 'prompt.streaming') layer.onStreaming(msg.progress, msg.text);
        else if (msg.event === 'prompt.result')
          layer.onResult(msg.code, msg.complete, msg.message, msg.progress);
        else if (msg.event === 'prompt.estimateResult') layer.onEstimateResult(msg.tokens, msg.kb);
        else if (msg.event === 'prompt.error') layer.onError(msg.message, msg.code);
        else if (msg.event === 'error' && (msg.source === 'prompt' || msg.source === 'system')) {
          layer.onHostError(msg.message);
        }
      });
      break;
    }
    case 'log': {
      const layer = new LogLayer();
      app.innerHTML = layer.render();
      layer.mount();
      window.addEventListener('message', (event) => {
        const msg = event.data as HostToWebviewMessage;
        if (msg.event === 'log.append') layer.appendEntry(msg.entry);
        else if (msg.event === 'log.clear') layer.clear();
      });
      break;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
