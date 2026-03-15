import { SessionSummary } from '../types';

export const LIVE_SESSION_WINDOW_MS = 3 * 60 * 1000;

export function isSessionLatest(session: SessionSummary, sessions: SessionSummary[]): boolean {
  if (sessions.length === 0) {
    return false;
  }

  const latestModifiedMs = sessions.reduce((latest, candidate) => {
    const candidateMs = Date.parse(candidate.modifiedAt);
    return Number.isFinite(candidateMs) ? Math.max(latest, candidateMs) : latest;
  }, 0);
  const sessionModifiedMs = Date.parse(session.modifiedAt);

  if (!Number.isFinite(sessionModifiedMs) || latestModifiedMs === 0) {
    return false;
  }

  return sessionModifiedMs === latestModifiedMs;
}

export function isSessionLikelyLive(
  session: SessionSummary,
  sessions: SessionSummary[],
  nowMs = Date.now(),
): boolean {
  const sessionModifiedMs = Date.parse(session.modifiedAt);

  if (!isSessionLatest(session, sessions) || !Number.isFinite(sessionModifiedMs)) {
    return false;
  }

  return nowMs - sessionModifiedMs <= LIVE_SESSION_WINDOW_MS;
}
