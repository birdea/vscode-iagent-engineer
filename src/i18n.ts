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
    'figma.connectionMode': 'Connection Mode',
    'figma.modeLocal': 'Local',
    'figma.modeRemote': 'Remote',
    'figma.modeHintLocal': 'Use the Desktop MCP server running on your machine.',
    'figma.modeHintRemote': 'Use a remote MCP server that requires browser login.',
    'figma.connect': 'Connect',
    'figma.authLogin': 'Auth Login',
    'figma.connecting': 'Connecting...',
    'figma.authStarting': 'Opening remote login...',
    'figma.designDataTitle': 'Design Data',
    'figma.get': 'Get',
    'figma.clear': 'Clear',
    'figma.mcpPlaceholder': 'https://figma.com/file/... or JSON',
    'figma.fetchData': 'Context',
    'figma.sourceDataTitle': 'Source Data',
    'figma.sourceDataPlaceholder': 'http://localhost:3845/assets/...svg',
    'figma.sourceDataHint': 'Enter an asset URL from the connected Figma MCP response.',
    'figma.sourceDataGet': 'Get',
    'figma.sourceDataPreviewTitle': 'Image Assets',
    'figma.sourceDataOpenAsset': 'Open original image in editor',
    'figma.screenshot': 'Screenshot',
    'figma.metadata': 'Metadata',
    'figma.variableDefs': 'Variable Defs',
    'figma.screenshotAlt': 'Figma screenshot preview',
    'figma.warn.enterData': 'Enter a Figma URL or JSON payload first.',
    'figma.warn.enterDataForMetadata': 'Enter MCP data before requesting metadata.',
    'figma.warn.enterDataForVariableDefs': 'Enter MCP data before requesting variable definitions.',
    'figma.info.loadingData': 'Loading MCP data...',
    'figma.info.loadingMetadata': 'Loading metadata...',
    'figma.info.loadingVariableDefs': 'Loading variable definitions...',
    'figma.info.loadingSourceData': 'Downloading Source Data...',
    'figma.info.parsedInput': 'Parsed the input locally. Connect to MCP to fetch full Figma data.',
    'figma.warn.enterDataForScreenshot': 'Enter MCP data before requesting a screenshot.',
    'figma.warn.enterSourceDataUrl': 'Enter a Source Data URL first.',
    'figma.warn.connectBeforeSourceData': 'Source Data is available only after connecting to MCP.',
    'figma.warn.sourceDataRemoteUnavailable':
      'Source Data curl download is available only in local MCP mode.',
    'figma.warn.connectBeforeMetadata': 'Metadata is available only after connecting to MCP.',
    'figma.warn.connectBeforeVariableDefs':
      'Variable definitions are available only after connecting to MCP.',
    'figma.warn.connectBeforeScreenshot': 'Screenshots are available only after connecting to MCP.',
    'figma.info.generatingScreenshot': 'Generating screenshot...',
    'figma.info.connecting': 'Attempting to connect.',
    'figma.info.remoteAuthStarted':
      'Remote login opened in your browser. Finish authentication, then retry the MCP connection once the remote endpoint is ready.',
    'figma.guide.availableTools': ({ count, tools }) => `${count} tools available: ${tools}`,
    'figma.guide.checkServer':
      'Check whether the server is running and whether the endpoint is correct.',
    'figma.guide.remoteLogin':
      'Use Auth Login to continue in the browser, then return here to finish setup.',
    'figma.success.dataLoaded': 'Data loaded.',
    'figma.success.metadataLoaded': 'Metadata loaded.',
    'figma.success.screenshotLoaded': 'Screenshot loaded.',
    'figma.success.variableDefsLoaded': 'Variable definitions loaded.',
    'figma.success.sourceDataTextLoaded': 'Source Data text opened in the editor.',
    'figma.success.sourceDataImageLoaded': 'Source Data image opened in the editor.',
    'figma.success.sourceDataBatchLoaded': ({ count }) =>
      `${count} Source Data item${count === 1 ? '' : 's'} opened in the editor.`,
    'figma.title.fetchDisabled': 'Available after entering a Figma URL or JSON payload.',
    'figma.title.sourceDataNeedsUrl': 'Enter a Source Data URL first.',
    'figma.title.sourceDataNeedsConnection': 'Available after connecting to the MCP server.',
    'figma.title.sourceDataRemoteUnavailable': 'Available only in local MCP mode.',
    'figma.title.metadataNeedsData': 'Enter a Figma URL or JSON payload first.',
    'figma.title.metadataNeedsConnection': 'Available after connecting to the MCP server.',
    'figma.title.screenshotNeedsData': 'Enter a Figma URL or JSON payload first.',
    'figma.title.screenshotNeedsConnection': 'Available after connecting to the MCP server.',
    'figma.title.variableDefsNeedsData': 'Enter a Figma URL or JSON payload first.',
    'figma.title.variableDefsNeedsConnection': 'Available after connecting to the MCP server.',
    'figma.preview.unable': '[Unable to render data preview]',
    'host.figma.connectRefused': ({ endpoint }) =>
      `Unable to connect to the MCP server. Check that the server is running. (${endpoint})`,
    'host.figma.connectTimeout': ({ endpoint }) =>
      `The MCP server is taking too long to respond. Check the server status and endpoint. (${endpoint})`,
    'host.figma.connectGeneric': ({ endpoint }) =>
      `A problem occurred while connecting to MCP. Check the settings and server status. (${endpoint})`,
    'host.figma.connectCancelled': ({ endpoint }) =>
      `Connection to a non-local MCP endpoint was cancelled. Review the endpoint before retrying. (${endpoint})`,
    'host.figma.remoteAuthUrlMissing':
      'Remote auth URL is unavailable. Check the remote authentication settings and try again.',
    'host.figma.remoteAuthUrlInvalid':
      'Remote auth URL is invalid. Review iagent-engineer.remoteMcpAuthUrl in Settings.',
    'host.figma.remoteEndpointMissing':
      'Remote API endpoint is unavailable. Check the remote endpoint settings and try again.',
    'host.figma.remoteAuthRequired':
      'Remote authentication is required. Start Auth Login and complete the browser flow.',
    'host.figma.remoteConnectGeneric':
      'Could not validate the remote Figma session. Check the remote settings and sign in again.',
    'host.figma.remoteFetchGeneric':
      'Could not fetch remote Figma data. Check the remote auth session and endpoint.',
    'host.figma.remoteScreenshotFailed':
      'Could not fetch the remote screenshot. Check the remote auth session and endpoint.',
    'host.figma.remoteComingSoon':
      'Remote MCP support is planned for a future update. The Remote UI stays visible for now, but Auth Login and remote fetch are not available yet.',
    'host.figma.remoteAuthCompleted':
      'Remote Figma authentication completed. Return to Setup and connect again.',
    'host.figma.remoteAuthCallbackFailed':
      'Remote auth callback failed. Check the redirect flow and try again.',
    'host.figma.fileIdMissing': 'Could not find a fileId in the Figma URL or JSON payload.',
    'host.figma.screenshotFailed':
      'Could not fetch the screenshot. Recheck the MCP connection and the Figma input.',
    'host.figma.desktopAppOpenFailed':
      'Could not launch Figma Desktop. Check that the desktop app is installed and available on this machine.',
    'host.figma.fetchRefused':
      'Could not fetch data because the MCP server is unreachable. Check that the server is running.',
    'host.figma.fetchTimeout': 'The MCP server timed out. Try again shortly.',
    'host.figma.fetchGeneric':
      'Could not fetch Figma data. Recheck the URL/JSON input and MCP server status.',
    'host.figma.curlUnavailable':
      'curl is unavailable on this machine. Install curl or make it available in PATH, then retry.',
    'host.figma.sourceDataInvalidUrl':
      'Source Data URL is invalid. Enter a full http:// or https:// URL.',
    'host.figma.sourceDataUrlMissing': 'Enter a Source Data URL first.',
    'host.figma.sourceDataHttpError':
      'Source Data download failed. Check the asset URL and the local MCP server.',
    'host.figma.sourceDataRequiresConnection':
      'Connect to the MCP server before requesting Source Data.',
    'host.figma.fetchRequiresConnection':
      'Connect to the MCP server before requesting metadata or variable definitions.',
    'agent.settingsTitle': 'Agent Settings',
    'agent.status.noSavedKey': 'Enter an API key first if none has been saved yet.',
    'agent.apiKeyHelp': 'Get',
    'agent.apiKeyPlaceholder': 'Enter API key...',
    'agent.apiKeyPlaceholderSaved': 'Saved API key available ✓',
    'agent.modelSelect': 'Select Model',
    'agent.modelInfo': 'Info',
    'agent.refresh': 'Refresh',
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
    'prompt.options': 'Options',
    'prompt.includeMcpData': 'Include MCP data',
    'prompt.includeDesignContext': 'Design context',
    'prompt.includeMetadata': 'Metadata',
    'prompt.includeScreenshotData': 'Include screenshot data',
    'prompt.outputFormat': 'Output Format',
    'prompt.outputFormatPrompt': 'Format Prompt',
    'prompt.userPrompt': 'User Prompt',
    'prompt.metrics.data': 'Prompt data',
    'prompt.metrics.estimate': 'Estimated tokens',
    'prompt.metrics.contextWindow': 'Model context window',
    'prompt.metrics.maxInput': 'Model max input',
    'prompt.metrics.maxOutput': 'Model max output',
    'prompt.progress.aria': 'Prompt generation progress',
    'prompt.generate': 'Generate',
    'prompt.openGeneratedEditor': 'Open In Editor',
    'prompt.openGeneratedEditorOpened': 'Generated editor opened.',
    'prompt.preview.openPanel': 'Open In Preview',
    'prompt.preview.openBrowser': 'Open In Browser',
    'prompt.preview.empty': 'Generate code first to open a preview.',
    'prompt.preview.generating':
      'Code generation is still in progress. Open the preview after it completes.',
    'prompt.preview.openingPanel': 'Opening preview...',
    'prompt.preview.openingBrowser': 'Opening browser preview...',
    'prompt.preview.openedPanel': 'Preview opened.',
    'prompt.preview.openedBrowser':
      'Browser preview opened. Future generations will hot-update the same page.',
    'prompt.preview.browserFallback':
      'Browser preview is unavailable in this packaged installation. Opened the Preview Panel instead.',
    'prompt.cancel': 'Cancel',
    'prompt.log.title': 'Request / Response Log',
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
    'figma.connectionMode': '연결 방식',
    'figma.modeLocal': 'Local',
    'figma.modeRemote': 'Remote',
    'figma.modeHintLocal': '현재 PC에서 실행 중인 Desktop MCP 서버에 연결합니다.',
    'figma.modeHintRemote': '브라우저 인증이 필요한 Remote MCP 서버를 사용합니다.',
    'figma.connect': '연결하기',
    'figma.authLogin': 'Auth Login',
    'figma.connecting': '연결 중...',
    'figma.authStarting': '원격 로그인 창을 여는 중...',
    'figma.designDataTitle': '디자인 데이터',
    'figma.get': 'Get',
    'figma.clear': 'Clear',
    'figma.mcpPlaceholder': 'https://figma.com/file/... 또는 JSON',
    'figma.fetchData': 'Context',
    'figma.sourceDataTitle': 'Source Data',
    'figma.sourceDataPlaceholder': 'http://localhost:3845/assets/...svg',
    'figma.sourceDataHint': '연결된 Figma MCP 응답에서 받은 asset URL을 입력하세요.',
    'figma.sourceDataGet': 'Get',
    'figma.sourceDataPreviewTitle': 'Image Assets',
    'figma.sourceDataOpenAsset': '원본 이미지를 Editor에서 열기',
    'figma.screenshot': '스크린샷',
    'figma.metadata': 'Metadata',
    'figma.variableDefs': 'Variable Defs',
    'figma.screenshotAlt': 'Figma 스크린샷',
    'figma.warn.enterData': 'Figma URL 또는 JSON 데이터를 먼저 입력하세요.',
    'figma.warn.enterDataForMetadata': '메타데이터를 가져오려면 MCP 데이터를 먼저 입력하세요.',
    'figma.warn.enterDataForVariableDefs': '변수 정의를 가져오려면 MCP 데이터를 먼저 입력하세요.',
    'figma.info.loadingData': 'MCP 데이터를 불러오는 중입니다...',
    'figma.info.loadingMetadata': '메타데이터를 불러오는 중입니다...',
    'figma.info.loadingVariableDefs': '변수 정의를 불러오는 중입니다...',
    'figma.info.loadingSourceData': 'Source Data를 내려받는 중입니다...',
    'figma.info.parsedInput':
      '입력값만 로컬에서 파싱했습니다. 전체 Figma 데이터는 MCP에 연결한 뒤 가져오세요.',
    'figma.warn.enterDataForScreenshot': '스크린샷을 위해 MCP 데이터를 먼저 입력하세요.',
    'figma.warn.enterSourceDataUrl': 'Source Data URL을 먼저 입력하세요.',
    'figma.warn.connectBeforeSourceData': 'Source Data는 MCP 연결 후에만 가능합니다.',
    'figma.warn.sourceDataRemoteUnavailable':
      'Source Data curl 다운로드는 local MCP 모드에서만 가능합니다.',
    'figma.warn.connectBeforeMetadata': '메타데이터는 MCP 연결 후에만 가능합니다.',
    'figma.warn.connectBeforeVariableDefs': '변수 정의는 MCP 연결 후에만 가능합니다.',
    'figma.warn.connectBeforeScreenshot': '스크린샷은 MCP 연결 후에만 가능합니다.',
    'figma.info.generatingScreenshot': '스크린샷을 생성하는 중입니다...',
    'figma.info.connecting': '연결을 시도하는 중입니다.',
    'figma.info.remoteAuthStarted':
      '브라우저에서 원격 로그인을 시작했습니다. 인증을 마친 뒤 Remote MCP 엔드포인트가 준비되면 다시 연결을 시도하세요.',
    'figma.guide.availableTools': ({ count, tools }) => `도구 ${count}개 사용 가능: ${tools}`,
    'figma.guide.checkServer': '서버 실행 여부와 엔드포인트를 확인하세요.',
    'figma.guide.remoteLogin':
      'Auth Login으로 브라우저 인증을 진행한 뒤 여기로 돌아와 설정을 마무리하세요.',
    'figma.success.dataLoaded': '데이터를 불러왔습니다.',
    'figma.success.metadataLoaded': '메타데이터를 불러왔습니다.',
    'figma.success.screenshotLoaded': '스크린샷을 가져왔습니다.',
    'figma.success.variableDefsLoaded': '변수 정의를 불러왔습니다.',
    'figma.success.sourceDataTextLoaded': 'Source Data 텍스트를 Editor에 열었습니다.',
    'figma.success.sourceDataImageLoaded': 'Source Data 이미지를 Editor에 열었습니다.',
    'figma.success.sourceDataBatchLoaded': ({ count }) =>
      `Source Data ${count}개를 Editor에 열었습니다.`,
    'figma.title.fetchDisabled': 'Figma URL 또는 JSON을 입력하면 사용할 수 있습니다.',
    'figma.title.sourceDataNeedsUrl': 'Source Data URL을 먼저 입력하세요.',
    'figma.title.sourceDataNeedsConnection': 'MCP 서버에 연결한 뒤 사용할 수 있습니다.',
    'figma.title.sourceDataRemoteUnavailable': 'local MCP 모드에서만 사용할 수 있습니다.',
    'figma.title.metadataNeedsData': 'Figma URL 또는 JSON을 먼저 입력하세요.',
    'figma.title.metadataNeedsConnection': 'MCP 서버에 연결한 뒤 사용할 수 있습니다.',
    'figma.title.screenshotNeedsData': 'Figma URL 또는 JSON을 먼저 입력하세요.',
    'figma.title.screenshotNeedsConnection': 'MCP 서버에 연결한 뒤 사용할 수 있습니다.',
    'figma.title.variableDefsNeedsData': 'Figma URL 또는 JSON을 먼저 입력하세요.',
    'figma.title.variableDefsNeedsConnection': 'MCP 서버에 연결한 뒤 사용할 수 있습니다.',
    'figma.preview.unable': '[데이터 미리보기를 표시할 수 없습니다]',
    'host.figma.connectRefused': ({ endpoint }) =>
      `MCP 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요. (${endpoint})`,
    'host.figma.connectTimeout': ({ endpoint }) =>
      `MCP 서버 응답이 지연되고 있습니다. 서버 상태와 엔드포인트를 확인하세요. (${endpoint})`,
    'host.figma.connectGeneric': ({ endpoint }) =>
      `MCP 연결 중 문제가 발생했습니다. 설정과 서버 상태를 확인하세요. (${endpoint})`,
    'host.figma.connectCancelled': ({ endpoint }) =>
      `로컬이 아닌 MCP 엔드포인트 연결이 취소되었습니다. 엔드포인트를 확인한 뒤 다시 시도하세요. (${endpoint})`,
    'host.figma.remoteAuthUrlMissing':
      'Remote auth URL을 사용할 수 없습니다. remote 인증 설정을 확인한 뒤 다시 시도하세요.',
    'host.figma.remoteAuthUrlInvalid':
      'Remote auth URL 형식이 올바르지 않습니다. 설정의 iagent-engineer.remoteMcpAuthUrl 값을 확인하세요.',
    'host.figma.remoteEndpointMissing':
      'Remote API 엔드포인트를 사용할 수 없습니다. remote 엔드포인트 설정을 확인한 뒤 다시 시도하세요.',
    'host.figma.remoteAuthRequired':
      'Remote 인증이 필요합니다. Auth Login으로 브라우저 인증을 완료하세요.',
    'host.figma.remoteConnectGeneric':
      'Remote Figma 세션을 확인하지 못했습니다. remote 설정과 로그인 상태를 다시 확인하세요.',
    'host.figma.remoteFetchGeneric':
      'Remote Figma 데이터를 가져오지 못했습니다. remote 인증 상태와 엔드포인트를 확인하세요.',
    'host.figma.remoteScreenshotFailed':
      'Remote 스크린샷을 가져오지 못했습니다. remote 인증 상태와 엔드포인트를 확인하세요.',
    'host.figma.remoteComingSoon':
      'Remote MCP는 추후 업데이트에서 지원할 예정입니다. 현재는 UI만 유지되고 있으며 Auth Login과 remote 데이터 가져오기는 아직 사용할 수 없습니다.',
    'host.figma.remoteAuthCompleted':
      'Remote Figma 인증이 완료되었습니다. Setup으로 돌아가 다시 연결하세요.',
    'host.figma.remoteAuthCallbackFailed':
      'Remote 인증 callback 처리에 실패했습니다. redirect 흐름을 확인한 뒤 다시 시도하세요.',
    'host.figma.fileIdMissing': 'Figma URL 또는 JSON에서 fileId를 찾을 수 없습니다.',
    'host.figma.screenshotFailed':
      '스크린샷을 가져오지 못했습니다. MCP 연결과 입력한 Figma 데이터를 다시 확인하세요.',
    'host.figma.desktopAppOpenFailed':
      'Figma Desktop 앱을 실행하지 못했습니다. 이 PC에 앱이 설치되어 있고 실행 가능한지 확인하세요.',
    'host.figma.fetchRefused':
      'MCP 서버에 연결할 수 없어 데이터를 가져오지 못했습니다. 서버 실행 상태를 확인하세요.',
    'host.figma.fetchTimeout': 'MCP 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.',
    'host.figma.fetchGeneric':
      'Figma 데이터를 가져오지 못했습니다. 입력한 URL/JSON과 MCP 서버 상태를 확인하세요.',
    'host.figma.curlUnavailable':
      '이 환경에서 curl을 사용할 수 없습니다. curl 설치 또는 PATH 설정을 확인한 뒤 다시 시도하세요.',
    'host.figma.sourceDataInvalidUrl':
      'Source Data URL 형식이 올바르지 않습니다. 전체 http:// 또는 https:// URL을 입력하세요.',
    'host.figma.sourceDataUrlMissing': 'Source Data URL을 먼저 입력하세요.',
    'host.figma.sourceDataHttpError':
      'Source Data 다운로드에 실패했습니다. asset URL과 local MCP 서버 상태를 확인하세요.',
    'host.figma.sourceDataRequiresConnection':
      'Source Data를 요청하기 전에 먼저 MCP 서버에 연결하세요.',
    'host.figma.fetchRequiresConnection':
      '메타데이터 또는 변수 정의를 가져오려면 먼저 MCP 서버에 연결하세요.',
    'agent.settingsTitle': '에이전트 설정',
    'agent.status.noSavedKey': '저장된 API 키가 없으면 먼저 입력하세요.',
    'agent.apiKeyHelp': 'Get',
    'agent.apiKeyPlaceholder': 'API Key 입력...',
    'agent.apiKeyPlaceholderSaved': '저장된 API Key 있음 ✓',
    'agent.modelSelect': '모델 선택',
    'agent.modelInfo': '정보',
    'agent.refresh': '새로고침',
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
    'prompt.options': '옵션',
    'prompt.includeMcpData': 'MCP 데이터 포함',
    'prompt.includeDesignContext': '디자인 컨텍스트',
    'prompt.includeMetadata': '메타데이터',
    'prompt.includeScreenshotData': '스크린샷 데이터 포함',
    'prompt.outputFormat': '출력 포맷',
    'prompt.outputFormatPrompt': '첨부될 출력 포맷 규칙',
    'prompt.userPrompt': '사용자 프롬프트',
    'prompt.metrics.data': '프롬프트 데이터',
    'prompt.metrics.estimate': '예상 토큰 소비량',
    'prompt.metrics.contextWindow': '모델 컨텍스트 윈도우',
    'prompt.metrics.maxInput': '모델 최대 입력',
    'prompt.metrics.maxOutput': '모델 최대 출력',
    'prompt.progress.aria': '응답 생성 진행 중',
    'prompt.generate': '생성',
    'prompt.openGeneratedEditor': '에디터에서 열기',
    'prompt.openGeneratedEditorOpened': '생성 결과 에디터를 열었습니다.',
    'prompt.preview.openPanel': '프리뷰에서 열기',
    'prompt.preview.openBrowser': '브라우저에서 열기',
    'prompt.preview.empty': '먼저 코드를 생성해야 프리뷰를 열 수 있습니다.',
    'prompt.preview.generating': '코드 생성이 아직 진행 중입니다. 완료 후 프리뷰를 여세요.',
    'prompt.preview.openingPanel': '프리뷰를 여는 중입니다...',
    'prompt.preview.openingBrowser': '브라우저 프리뷰를 여는 중입니다...',
    'prompt.preview.openedPanel': '프리뷰를 열었습니다.',
    'prompt.preview.openedBrowser':
      '브라우저 프리뷰를 열었습니다. 이후 생성 결과는 같은 페이지에 HMR로 반영됩니다.',
    'prompt.preview.browserFallback':
      '패키지 설치본에서는 브라우저 프리뷰를 사용할 수 없어 Preview Panel로 대신 열었습니다.',
    'prompt.cancel': '취소',
    'prompt.log.title': '요청 / 응답 로그',
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
