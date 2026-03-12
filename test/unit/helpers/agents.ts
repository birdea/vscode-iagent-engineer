import * as sinon from 'sinon';
import { IAgent } from '../../../src/agent/BaseAgent';
import { ModelInfo, PromptPayload } from '../../../src/types';

export function createAgentStub(
  sandbox: sinon.SinonSandbox,
  overrides: Partial<IAgent> = {},
): IAgent {
  return {
    type: 'gemini',
    setApiKey: sandbox.stub().resolves(),
    clearApiKey: sandbox.stub().resolves(),
    listModels: sandbox.stub().resolves([] as ModelInfo[]),
    getModelInfo: sandbox.stub().resolves({ id: 'model' } as ModelInfo),
    generateCode: async function* (_payload: PromptPayload, _signal?: AbortSignal) {},
    ...overrides,
  };
}
