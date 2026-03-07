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
    case 'figma': {
      const layer = new FigmaLayer();
      app.innerHTML = layer.render();
      layer.mount();
      window.addEventListener('message', (event) => {
        const msg = event.data as HostToWebviewMessage;
        if (msg.event === 'figma.connectRequested') layer.requestConnect();
        else if (msg.event === 'figma.status')
          layer.onStatus(msg.connected, msg.methods, msg.error);
        else if (msg.event === 'figma.dataResult') layer.onDataResult(msg.data);
        else if (msg.event === 'figma.dataFetchError') {
          layer.onError(msg.message);
          layer.onDataResult(msg.fallbackData);
        }
        else if (msg.event === 'figma.screenshotResult') layer.onScreenshotResult(msg.base64);
        else if (msg.event === 'error' && msg.source === 'figma') layer.onError(msg.message);
      });
      break;
    }
    case 'agent': {
      const layer = new AgentLayer();
      app.innerHTML = layer.render();
      layer.mount();
      window.addEventListener('message', (event) => {
        const msg = event.data as HostToWebviewMessage;
        if (msg.event === 'agent.modelsResult') layer.onModelsResult(msg.models);
        else if (msg.event === 'agent.saveRequested') layer.onSaveRequested();
        else if (msg.event === 'agent.clearRequested') layer.onClearRequested();
        else if (msg.event === 'agent.state') layer.onState(msg.agent, msg.model, msg.hasApiKey);
        else if (msg.event === 'agent.settingsSaved')
          layer.onSettingsSaved(msg.agent, msg.model, msg.hasApiKey);
        else if (msg.event === 'agent.settingsCleared') layer.onSettingsCleared(msg.agent);
        else if (msg.event === 'error' && (msg.source === 'agent' || msg.source === 'system')) {
          layer.onError(msg.message);
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
        else if (msg.event === 'prompt.generating') layer.onGenerating(msg.progress);
        else if (msg.event === 'prompt.chunk') layer.onChunk(msg.text);
        else if (msg.event === 'prompt.result') layer.onResult(msg.code);
        else if (msg.event === 'prompt.estimateResult') layer.onEstimateResult(msg.tokens, msg.kb);
        else if (msg.event === 'prompt.error') layer.onError(msg.message);
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
