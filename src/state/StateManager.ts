import { AgentType, ScreenshotAsset } from '../types';

export class StateManager {
  private currentAgent: AgentType = 'gemini';
  private currentModel = '';
  private lastMcpData: unknown = null;
  private lastMcpInput = '';
  private lastScreenshot: ScreenshotAsset | null = null;

  getAgent(): AgentType {
    return this.currentAgent;
  }

  setAgent(agent: AgentType) {
    this.currentAgent = agent;
    this.currentModel = '';
  }

  getModel(): string {
    return this.currentModel;
  }

  setModel(model: string) {
    this.currentModel = model;
  }

  getLastMcpData(): unknown {
    return this.lastMcpData;
  }

  setLastMcpData(data: unknown) {
    this.lastMcpData = data;
  }

  clearLastMcpData() {
    this.lastMcpData = null;
  }

  getLastMcpInput(): string {
    return this.lastMcpInput;
  }

  setLastMcpInput(input: string) {
    this.lastMcpInput = input;
  }

  clearLastMcpInput() {
    this.lastMcpInput = '';
  }

  getLastScreenshot(): ScreenshotAsset | null {
    return this.lastScreenshot;
  }

  setLastScreenshot(screenshot: ScreenshotAsset | null) {
    this.lastScreenshot = screenshot;
  }

  clearLastScreenshot() {
    this.lastScreenshot = null;
  }

  resetAgentState() {
    this.currentAgent = 'gemini';
    this.currentModel = '';
  }
}
