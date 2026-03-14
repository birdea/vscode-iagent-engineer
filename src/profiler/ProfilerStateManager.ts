import {
  ProfilerAggregate,
  ProfilerDetailState,
  ProfilerOverviewState,
  ProfilerStatus,
  SessionDetail,
} from '../types';

const EMPTY_AGGREGATE: ProfilerAggregate = {
  totalSessions: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCachedTokens: 0,
  totalTokens: 0,
  totalFileSizeBytes: 0,
};

function createEmptyOverview(): ProfilerOverviewState {
  return {
    status: 'idle',
    selectedAgent: 'claude',
    aggregate: { ...EMPTY_AGGREGATE },
    sessionsByAgent: {
      claude: [],
      codex: [],
      gemini: [],
    },
  };
}

function createEmptyDetail(): ProfilerDetailState {
  return {
    status: 'idle',
    live: {
      active: false,
      status: 'idle',
      messages: [],
    },
  };
}

export class ProfilerStateManager {
  private overviewState = createEmptyOverview();
  private detailState = createEmptyDetail();
  private overviewListeners = new Set<(state: ProfilerOverviewState) => void>();
  private detailListeners = new Set<(state: ProfilerDetailState) => void>();

  getOverviewState(): ProfilerOverviewState {
    return this.overviewState;
  }

  getDetailState(): ProfilerDetailState {
    return this.detailState;
  }

  setOverviewState(state: ProfilerOverviewState) {
    this.overviewState = state;
    this.emitOverview();
  }

  setOverviewStatus(status: ProfilerStatus, message?: string) {
    this.overviewState = {
      ...this.overviewState,
      status,
      message,
    };
    this.emitOverview();
  }

  setSelectedAgent(agent: ProfilerOverviewState['selectedAgent']) {
    this.overviewState = {
      ...this.overviewState,
      selectedAgent: agent,
    };
    this.emitOverview();
  }

  setSelectedSession(agent: ProfilerOverviewState['selectedAgent'], sessionId?: string) {
    this.overviewState = {
      ...this.overviewState,
      selectedAgent: agent,
      selectedSessionId: sessionId,
    };
    this.emitOverview();
  }

  setDetailLoading(sessionId?: string, message?: string) {
    this.detailState = {
      status: 'loading',
      sessionId,
      message,
      detail: undefined,
      live: this.detailState.live,
    };
    this.emitDetail();
  }

  setDetailState(state: ProfilerDetailState) {
    this.detailState = state;
    this.emitDetail();
  }

  setDetail(detail: SessionDetail) {
    this.detailState = {
      status: 'ready',
      sessionId: detail.summary.id,
      detail,
      live: this.detailState.live,
    };
    this.emitDetail();
  }

  resetDetail(message?: string) {
    this.detailState = {
      status: 'idle',
      message,
      live: {
        active: false,
        status: 'idle',
        messages: [],
      },
    };
    this.emitDetail();
  }

  onOverviewChange(callback: (state: ProfilerOverviewState) => void) {
    this.overviewListeners.add(callback);
    return {
      dispose: () => {
        this.overviewListeners.delete(callback);
      },
    };
  }

  onDetailChange(callback: (state: ProfilerDetailState) => void) {
    this.detailListeners.add(callback);
    return {
      dispose: () => {
        this.detailListeners.delete(callback);
      },
    };
  }

  private emitOverview() {
    this.overviewListeners.forEach((callback) => callback(this.overviewState));
  }

  private emitDetail() {
    this.detailListeners.forEach((callback) => callback(this.detailState));
  }
}
