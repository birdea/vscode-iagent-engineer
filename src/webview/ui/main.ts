import { FigmaLayer } from './components/FigmaLayer';
import { AgentLayer } from './components/AgentLayer';
import { PromptLayer } from './components/PromptLayer';
import { LogLayer } from './components/LogLayer';
import { HostToWebviewMessage } from '../../types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHostMessage(value: unknown): value is HostToWebviewMessage {
  return isObject(value) && typeof value.event === 'string';
}

function bindMessageHandler(handler: (message: HostToWebviewMessage) => void) {
  window.addEventListener('message', (event) => {
    if (!isHostMessage(event.data)) {
      return;
    }

    handler(event.data);
  });
}

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
      bindMessageHandler((msg) => {
        switch (msg.event) {
          case 'figma.connectRequested':
            figma.requestConnect();
            break;
          case 'figma.status':
            figma.onStatus(msg.connected, msg.methods, msg.error);
            break;
          case 'figma.authStarted':
            figma.onAuthStarted();
            break;
          case 'figma.dataResult':
            figma.onDataResult(msg.data);
            break;
          case 'figma.dataFetchError':
            figma.onError(msg.message);
            figma.onDataResult(msg.fallbackData);
            break;
          case 'figma.screenshotResult':
            figma.onScreenshotResult(msg.base64);
            break;
          case 'agent.modelsResult':
            agent.onModelsResult(msg.models);
            break;
          case 'agent.state':
            agent.onState(msg.agent, msg.model, msg.hasApiKey);
            break;
          case 'agent.settingsSaved':
            agent.onSettingsSaved(msg.agent, msg.model, msg.hasApiKey);
            break;
          case 'agent.settingsCleared':
            agent.onSettingsCleared(msg.agent);
            break;
          case 'error':
            if (msg.source === 'figma') figma.onError(msg.message);
            if (msg.source === 'agent' || msg.source === 'system') agent.onError(msg.message);
            break;
        }
      });
      break;
    }
    case 'prompt': {
      const layer = new PromptLayer();
      app.innerHTML = layer.render();
      layer.mount();
      bindMessageHandler((msg) => {
        switch (msg.event) {
          case 'prompt.generateRequested':
            layer.onGenerateRequested();
            break;
          case 'prompt.streaming':
            layer.onStreaming(msg.progress, msg.text);
            break;
          case 'prompt.result':
            layer.onResult(msg.code, msg.complete, msg.message, msg.progress);
            break;
          case 'prompt.estimateResult':
            layer.onEstimateResult(msg.tokens, msg.kb);
            break;
          case 'prompt.error':
            layer.onError(msg.message, msg.code);
            break;
          case 'error':
            if (msg.source === 'prompt' || msg.source === 'system') {
              layer.onHostError(msg.message);
            }
            break;
        }
      });
      break;
    }
    case 'log': {
      const layer = new LogLayer();
      app.innerHTML = layer.render();
      layer.mount();
      bindMessageHandler((msg) => {
        switch (msg.event) {
          case 'log.append':
            layer.appendEntry(msg.entry);
            break;
          case 'log.clear':
            layer.clear();
            break;
        }
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
