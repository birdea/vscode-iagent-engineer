import { FigmaLayer } from './components/FigmaLayer';
import { AgentLayer } from './components/AgentLayer';
import { PromptLayer } from './components/PromptLayer';
import { ProfilerLayer } from './components/ProfilerLayer';
import { ProfilerDetailLayer } from './components/ProfilerDetailLayer';
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
            figma.onDataResult(msg.data, msg.kind);
            break;
          case 'figma.sourceDataResult':
            figma.onSourceDataResult(msg.count, msg.images);
            break;
          case 'figma.sourceDataError':
            figma.onSourceDataError(msg.message);
            break;
          case 'figma.dataFetchError':
            figma.onError(msg.message);
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
          case 'agent.modelsResult':
            layer.onModelsResult(msg.models);
            break;
          case 'agent.state':
            layer.onAgentState(msg.agent, msg.model, msg.hasApiKey);
            break;
          case 'prompt.generateRequested':
            layer.onGenerateRequested();
            break;
          case 'prompt.previewOpened':
            layer.onPreviewOpened(msg.requested, msg.opened);
            break;
          case 'prompt.streaming':
            layer.onStreaming(msg.progress, msg.text);
            break;
          case 'prompt.result':
            layer.onResult(msg.code, msg.format, msg.complete, msg.message, msg.progress);
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
    case 'profiler': {
      const layer = new ProfilerLayer();
      app.innerHTML = layer.render();
      layer.mount();
      bindMessageHandler((msg) => {
        switch (msg.event) {
          case 'profiler.state':
            layer.onState(msg.state);
            break;
          case 'profiler.archiveResult':
            layer.onArchiveResult(msg.result);
            break;
          case 'error':
            if (msg.source === 'profiler' || msg.source === 'system') {
              layer.onState({
                status: 'error',
                message: msg.message,
                selectedAgent: 'claude',
                aggregate: {
                  totalSessions: 0,
                  totalInputTokens: 0,
                  totalOutputTokens: 0,
                  totalCachedTokens: 0,
                  totalTokens: 0,
                  totalFileSizeBytes: 0,
                },
                sessionsByAgent: {
                  claude: [],
                  codex: [],
                  gemini: [],
                },
              });
            }
            break;
        }
      });
      break;
    }
    case 'profiler-detail': {
      const layer = new ProfilerDetailLayer();
      app.innerHTML = layer.render();
      layer.mount();
      bindMessageHandler((msg) => {
        switch (msg.event) {
          case 'profiler.detailState':
            layer.onState(msg.state);
            break;
          case 'error':
            if (msg.source === 'profiler' || msg.source === 'system') {
              layer.onState({
                status: 'error',
                message: msg.message,
              });
            }
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
