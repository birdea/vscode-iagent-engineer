export type UiLocale = 'ko' | 'en';

export const USER_CANCELLED_CODE_GENERATION = 'USER_CANCELLED_CODE_GENERATION';

type MessageParams = Record<string, string | number | undefined>;
type MessageValue = string | ((params: MessageParams) => string);

const messages: Record<UiLocale, Record<string, MessageValue>> = {
  en: {
    'figma.connectionTitle': 'Figma Connection',
    'figma.statusDisconnected': 'Disconnected',
    'figma.statusConnected': 'Connected',
    'figma.settings': 'Settings',
    'figma.connect': 'Connect',
    'figma.connecting': 'Connecting...',
    'figma.designDataTitle': 'Design Data',
    'figma.mcpPlaceholder': 'https://figma.com/file/... or JSON',
    'figma.fetchData': 'Fetch Data',
    'figma.screenshot': 'Screenshot',
    'figma.screenshotAlt': 'Figma screenshot preview',
    'figma.warn.enterData': 'Enter a Figma URL or JSON payload first.',
    'figma.info.loadingData': 'Loading MCP data...',
    'figma.warn.enterDataForScreenshot': 'Enter MCP data before requesting a screenshot.',
    'figma.warn.connectBeforeScreenshot': 'Screenshots are available only after connecting to MCP.',
    'figma.info.generatingScreenshot': 'Generating screenshot...',
    'figma.info.connecting': 'Attempting to connect.',
    'figma.guide.availableTools': ({ count }) => `${count} tools available`,
    'figma.guide.checkServer':
      'Check whether the server is running and whether the endpoint is correct.',
    'figma.success.dataLoaded': 'Data loaded.',
    'figma.success.screenshotLoaded': 'Screenshot loaded.',
    'figma.title.fetchDisabled': 'Available after entering a Figma URL or JSON payload.',
    'figma.title.screenshotNeedsData': 'Enter a Figma URL or JSON payload first.',
    'figma.title.screenshotNeedsConnection': 'Available after connecting to the MCP server.',
    'figma.preview.unable': '[Unable to render data preview]',
    'host.figma.connectRefused': ({ endpoint }) =>
      `Unable to connect to the MCP server. Check that the server is running. (${endpoint})`,
    'host.figma.connectTimeout': ({ endpoint }) =>
      `The MCP server is taking too long to respond. Check the server status and endpoint. (${endpoint})`,
    'host.figma.connectGeneric': ({ endpoint }) =>
      `A problem occurred while connecting to MCP. Check the settings and server status. (${endpoint})`,
    'host.figma.connectCancelled': ({ endpoint }) =>
      `Connection to a non-local MCP endpoint was cancelled. Review the endpoint before retrying. (${endpoint})`,
    'host.figma.fileIdMissing': 'Could not find a fileId in the Figma URL or JSON payload.',
    'host.figma.screenshotFailed':
      'Could not fetch the screenshot. Recheck the MCP connection and the Figma input.',
    'host.figma.fetchRefused':
      'Could not fetch data because the MCP server is unreachable. Check that the server is running.',
    'host.figma.fetchTimeout': 'The MCP server timed out. Try again shortly.',
    'host.figma.fetchGeneric':
      'Could not fetch Figma data. Recheck the URL/JSON input and MCP server status.',
    'agent.settingsTitle': 'Agent Settings',
    'agent.status.noSavedKey': 'Enter an API key first if none has been saved yet.',
    'agent.apiKeyHelp': 'Help',
    'agent.apiKeyPlaceholder': 'Enter API key...',
    'agent.apiKeyPlaceholderSaved': 'Saved API key available ✓',
    'agent.modelSelect': 'Select Model',
    'agent.modelInfo': 'Info',
    'agent.modelLoadPrompt': 'Load models',
    'agent.refreshModels': 'Refresh model list',
    'agent.save': 'Save',
    'agent.clear': 'Reset',
    'agent.notice.switched': ({ agent }) => `Switched to ${agent}.`,
    'agent.notice.selectModelFirst': 'Select a model first.',
    'agent.notice.modelsLoaded': ({ count }) => `Loaded ${count} models.`,
    'agent.notice.noModels': 'No models are available.',
    'agent.notice.enterApiKeyToLoad': 'Models will load after you enter an API key.',
    'agent.notice.loadingSavedSettings': 'Loading saved settings.',
    'agent.notice.settingsSaved': 'Settings saved.',
    'agent.notice.settingsCleared': 'Saved settings cleared.',
    'agent.notice.selectModelBeforeSave': 'Select a model before saving.',
    'agent.status.apiKeyEntered': 'An API key is entered. Review the model and save.',
    'agent.status.modelNotSelected': 'No model has been selected yet.',
    'agent.status.modelSelected': ({ model }) => `${model} is selected.`,
    'agent.notice.loadingModelsWithKey': 'Loading model list.',
    'agent.notice.loadingModelsWithSavedKey': 'Loading model list with the saved API key.',
    'agent.error.noApiKey':
      'No API key is available, so models cannot be loaded. Enter a key or verify the saved key.',
    'agent.error.auth': 'API key authentication failed. Check that the key is valid.',
    'agent.error.invalidKeyFormat':
      'The API key format looks invalid. Check that you pasted the correct provider key.',
    'agent.error.generic':
      'Could not process the agent settings. Recheck the API key and model information.',
    'prompt.title': 'Code Generation',
    'prompt.status.ready': 'Ready',
    'prompt.placeholder': 'Enter additional instructions...',
    'prompt.options': 'Options',
    'prompt.includeUserPrompt': 'Include user prompt',
    'prompt.includeMcpData': 'Include MCP data',
    'prompt.outputFormat': 'Output Format',
    'prompt.progress.aria': 'Prompt generation progress',
    'prompt.generate': 'Generate',
    'prompt.cancel': 'Cancel',
    'prompt.resultTitle': 'Generated Result',
    'prompt.openEditor': 'Open in Editor',
    'prompt.saveFile': 'Save as File',
    'prompt.notice.alreadyGenerating': 'Generation is already in progress.',
    'prompt.notice.starting': 'Starting code generation...',
    'prompt.notice.noneInProgress': 'No code generation is currently in progress.',
    'prompt.notice.cancelling': 'Cancelling code generation...',
    'prompt.notice.calculating': 'Calculating...',
    'prompt.status.completed': 'Completed',
    'prompt.status.incomplete': 'Incomplete',
    'prompt.status.generating': ({ progress }) => `Generating... ${progress}%`,
    'prompt.notice.completed': 'Code generation completed.',
    'prompt.notice.incomplete': 'Partial code is available, but the generation did not complete.',
    'prompt.error.noApiKey': 'Save an API key in the Agent panel before generating code.',
    'prompt.error.alreadyInProgress': 'Code generation is already in progress.',
    'host.prompt.alreadyGenerating': 'Generation is already in progress.',
    'host.prompt.cancelled': 'Code generation was cancelled.',
    'system.logCopied': 'Log copied to clipboard',
    'system.saveLog': 'Save Log',
    'system.logSaved': ({ path }) => `Log saved: ${path}`,
    'system.saveScreenshot': 'Save Screenshot',
    'system.screenshotSaved': ({ path }) => `Screenshot saved: ${path}`,
  },
  ko: {
    'figma.connectionTitle': 'Figma 연결',
    'figma.statusDisconnected': '연결되지 않음',
    'figma.statusConnected': '연결됨',
    'figma.settings': '설정',
    'figma.connect': '연결하기',
    'figma.connecting': '연결 중...',
    'figma.designDataTitle': '디자인 데이터',
    'figma.mcpPlaceholder': 'https://figma.com/file/... 또는 JSON',
    'figma.fetchData': '데이터 가져오기',
    'figma.screenshot': '스크린샷',
    'figma.screenshotAlt': 'Figma 스크린샷',
    'figma.warn.enterData': 'Figma URL 또는 JSON 데이터를 먼저 입력하세요.',
    'figma.info.loadingData': 'MCP 데이터를 불러오는 중입니다...',
    'figma.warn.enterDataForScreenshot': '스크린샷을 위해 MCP 데이터를 먼저 입력하세요.',
    'figma.warn.connectBeforeScreenshot': '스크린샷은 MCP 연결 후에만 가능합니다.',
    'figma.info.generatingScreenshot': '스크린샷을 생성하는 중입니다...',
    'figma.info.connecting': '연결을 시도하는 중입니다.',
    'figma.guide.availableTools': ({ count }) => `도구 ${count}개 사용 가능`,
    'figma.guide.checkServer': '서버 실행 여부와 엔드포인트를 확인하세요.',
    'figma.success.dataLoaded': '데이터를 불러왔습니다.',
    'figma.success.screenshotLoaded': '스크린샷을 가져왔습니다.',
    'figma.title.fetchDisabled': 'Figma URL 또는 JSON을 입력하면 사용할 수 있습니다.',
    'figma.title.screenshotNeedsData': 'Figma URL 또는 JSON을 먼저 입력하세요.',
    'figma.title.screenshotNeedsConnection': 'MCP 서버에 연결한 뒤 사용할 수 있습니다.',
    'figma.preview.unable': '[데이터 미리보기를 표시할 수 없습니다]',
    'host.figma.connectRefused': ({ endpoint }) =>
      `MCP 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요. (${endpoint})`,
    'host.figma.connectTimeout': ({ endpoint }) =>
      `MCP 서버 응답이 지연되고 있습니다. 서버 상태와 엔드포인트를 확인하세요. (${endpoint})`,
    'host.figma.connectGeneric': ({ endpoint }) =>
      `MCP 연결 중 문제가 발생했습니다. 설정과 서버 상태를 확인하세요. (${endpoint})`,
    'host.figma.connectCancelled': ({ endpoint }) =>
      `로컬이 아닌 MCP 엔드포인트 연결이 취소되었습니다. 엔드포인트를 확인한 뒤 다시 시도하세요. (${endpoint})`,
    'host.figma.fileIdMissing': 'Figma URL 또는 JSON에서 fileId를 찾을 수 없습니다.',
    'host.figma.screenshotFailed':
      '스크린샷을 가져오지 못했습니다. MCP 연결과 입력한 Figma 데이터를 다시 확인하세요.',
    'host.figma.fetchRefused':
      'MCP 서버에 연결할 수 없어 데이터를 가져오지 못했습니다. 서버 실행 상태를 확인하세요.',
    'host.figma.fetchTimeout': 'MCP 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.',
    'host.figma.fetchGeneric':
      'Figma 데이터를 가져오지 못했습니다. 입력한 URL/JSON과 MCP 서버 상태를 확인하세요.',
    'agent.settingsTitle': '에이전트 설정',
    'agent.status.noSavedKey': '저장된 API 키가 없으면 먼저 입력하세요.',
    'agent.apiKeyHelp': '안내',
    'agent.apiKeyPlaceholder': 'API Key 입력...',
    'agent.apiKeyPlaceholderSaved': '저장된 API Key 있음 ✓',
    'agent.modelSelect': '모델 선택',
    'agent.modelInfo': '정보',
    'agent.modelLoadPrompt': '모델을 불러오세요',
    'agent.refreshModels': '모델 목록 새로고침',
    'agent.save': '저장',
    'agent.clear': '초기화',
    'agent.notice.switched': ({ agent }) => `${agent}로 전환했습니다.`,
    'agent.notice.selectModelFirst': '모델을 먼저 선택하세요.',
    'agent.notice.modelsLoaded': ({ count }) => `${count}개 모델을 불러왔습니다.`,
    'agent.notice.noModels': '사용 가능한 모델이 없습니다.',
    'agent.notice.enterApiKeyToLoad': 'API 키를 입력하면 모델을 불러옵니다.',
    'agent.notice.loadingSavedSettings': '저장된 설정을 불러오는 중입니다.',
    'agent.notice.settingsSaved': '설정을 저장했습니다.',
    'agent.notice.settingsCleared': '저장값을 삭제했습니다.',
    'agent.notice.selectModelBeforeSave': '저장하기 전에 모델을 먼저 선택하세요.',
    'agent.status.apiKeyEntered': 'API 키가 입력되었습니다. 모델을 확인하고 저장하세요.',
    'agent.status.modelNotSelected': '모델을 아직 선택하지 않았습니다.',
    'agent.status.modelSelected': ({ model }) => `${model} 모델이 선택되었습니다.`,
    'agent.notice.loadingModelsWithKey': '모델 목록을 불러오는 중입니다.',
    'agent.notice.loadingModelsWithSavedKey': '저장된 API 키로 모델 목록을 불러오는 중입니다.',
    'agent.error.noApiKey':
      'API 키가 없어 모델을 불러올 수 없습니다. API 키를 입력하거나 저장된 키를 확인하세요.',
    'agent.error.auth': 'API 키 인증에 실패했습니다. 올바른 키인지 확인하세요.',
    'agent.error.invalidKeyFormat':
      'API 키 형식이 올바르지 않습니다. 해당 공급자의 키를 정확히 붙여넣었는지 확인하세요.',
    'agent.error.generic':
      '에이전트 설정을 처리하지 못했습니다. API 키와 모델 정보를 다시 확인하세요.',
    'prompt.title': '코드 생성',
    'prompt.status.ready': '준비됨',
    'prompt.placeholder': '추가 지시사항 입력...',
    'prompt.options': '옵션',
    'prompt.includeUserPrompt': '사용자 프롬프트 포함',
    'prompt.includeMcpData': 'MCP 데이터 포함',
    'prompt.outputFormat': '출력 포맷',
    'prompt.progress.aria': '응답 생성 진행 중',
    'prompt.generate': '생성',
    'prompt.cancel': '취소',
    'prompt.resultTitle': '생성 결과',
    'prompt.openEditor': '에디터에서 열기',
    'prompt.saveFile': '파일로 저장',
    'prompt.notice.alreadyGenerating': '이미 생성 중입니다.',
    'prompt.notice.starting': '코드 생성을 시작합니다...',
    'prompt.notice.noneInProgress': '진행 중인 코드 생성이 없습니다.',
    'prompt.notice.cancelling': '코드 생성을 취소하는 중입니다...',
    'prompt.notice.calculating': '계산 중...',
    'prompt.status.completed': '완료됨',
    'prompt.status.incomplete': '불완전',
    'prompt.status.generating': ({ progress }) => `생성 중... ${progress}%`,
    'prompt.notice.completed': '코드 생성이 완료되었습니다.',
    'prompt.notice.incomplete': '부분 코드는 생성되었지만 작업이 끝나지 않았습니다.',
    'prompt.error.noApiKey': '코드를 생성하려면 먼저 Agent 패널에서 API 키를 저장하세요.',
    'prompt.error.alreadyInProgress': '이미 코드 생성이 진행 중입니다.',
    'host.prompt.alreadyGenerating': '이미 코드 생성이 진행 중입니다.',
    'host.prompt.cancelled': '코드 생성을 취소했습니다.',
    'system.logCopied': '로그를 클립보드에 복사했습니다.',
    'system.saveLog': '로그 저장',
    'system.logSaved': ({ path }) => `로그를 저장했습니다: ${path}`,
    'system.saveScreenshot': '스크린샷 저장',
    'system.screenshotSaved': ({ path }) => `스크린샷을 저장했습니다: ${path}`,
  },
};

export function resolveLocale(language?: string): UiLocale {
  return language?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function t(locale: UiLocale, key: string, params: MessageParams = {}): string {
  const value = messages[locale][key] ?? messages.en[key] ?? key;
  return typeof value === 'function' ? value(params) : value;
}

export function getDocumentLocale(): UiLocale {
  if (typeof document === 'undefined') {
    return 'en';
  }

  return resolveLocale(document.body?.dataset.locale ?? document.documentElement.lang);
}
