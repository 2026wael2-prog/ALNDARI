import { create } from 'zustand';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';
export type ConnectionMode = 'cloud' | 'local_failover' | 'syncing';

const EDGE_URL_STORAGE_KEY = 'alndari_edge_url';
const EDGE_SECRET_STORAGE_KEY = 'alndari_edge_secret';

function readStorageItem(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore storage quota
  }
}

export function resolveInitialEdgeUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = readStorageItem(EDGE_URL_STORAGE_KEY);
    if (saved !== '' && /^https?:\/\//i.test(saved.trim())) {
      return saved.trim().replace(/\/+$/, '');
    }
    if (
      window.location.port === '8787' &&
      /^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.|172\.)/i.test(window.location.origin)
    ) {
      return window.location.origin;
    }
  }
  return 'http://127.0.0.1:8787';
}

export function resolveInitialEdgeSecret(): string {
  return readStorageItem(EDGE_SECRET_STORAGE_KEY).trim();
}

export interface EdgeHealthPayload {
  available: boolean;
  branchCode?: string | null;
  pendingOutboxCount?: number;
  failedOutboxCount?: number;
  lastMirrorSyncAt?: string | null;
}

interface ConnectionState {
  isUnstable: boolean;
  lastTimeoutAt: number | null;
  consecutiveFailures: number;

  /** Live-sync (Supabase Realtime) channel health */
  realtimeStatus: RealtimeStatus;
  realtimeLastEventAt: number | null;

  /** Branch Local Edge Failover & Outbox Replay state */
  connectionMode: ConnectionMode;
  edgeAvailable: boolean;
  edgeUrl: string;
  edgeSecret: string;
  edgeBranchCode: string | null;
  pendingOutboxCount: number;
  failedOutboxCount: number;
  lastMirrorSyncAt: string | null;

  // Actions
  reportTimeout: () => void;
  reportSuccess: () => void;
  reportFailure: () => void;
  setUnstable: (unstable: boolean) => void;
  setRealtimeStatus: (status: RealtimeStatus) => void;
  reportRealtimeEvent: () => void;
  setConnectionMode: (mode: ConnectionMode) => void;
  setEdgeHealth: (payload: EdgeHealthPayload) => void;
  setEdgeUrl: (url: string) => void;
  setEdgeSecret: (secret: string) => void;
}

function computeNextModeOnHealth(
  state: ConnectionState,
  available: boolean,
  pending: number
): ConnectionMode {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (available && (!isOnline || state.isUnstable)) {
    return 'local_failover';
  }
  if (!available && state.connectionMode === 'local_failover') {
    return 'cloud';
  }
  if (available && state.connectionMode === 'syncing' && pending === 0) {
    return 'cloud';
  }
  return state.connectionMode;
}

function computeModeAfterSuccess(state: ConnectionState): ConnectionMode {
  if (state.connectionMode === 'local_failover') {
    return state.pendingOutboxCount > 0 ? 'syncing' : 'cloud';
  }
  if (state.connectionMode === 'syncing' && state.pendingOutboxCount === 0) {
    return 'cloud';
  }
  return state.connectionMode;
}

type SetConnectionState = (
  partial:
    | Partial<ConnectionState>
    | ((state: ConnectionState) => Partial<ConnectionState> | ConnectionState)
) => void;

const createEdgeHealthHandlers = (
  set: SetConnectionState
): Pick<ConnectionState, 'setEdgeHealth' | 'setEdgeUrl' | 'setEdgeSecret'> => ({
  setEdgeHealth: payload => {
    set(state => {
      const pending = payload.pendingOutboxCount ?? state.pendingOutboxCount;
      const failed = payload.failedOutboxCount ?? state.failedOutboxCount;
      return {
        edgeAvailable: payload.available,
        edgeBranchCode: payload.branchCode !== undefined ? payload.branchCode : state.edgeBranchCode,
        pendingOutboxCount: pending,
        failedOutboxCount: failed,
        lastMirrorSyncAt:
          payload.lastMirrorSyncAt !== undefined ? payload.lastMirrorSyncAt : state.lastMirrorSyncAt,
        connectionMode: computeNextModeOnHealth(state, payload.available, pending),
      };
    });
  },
  setEdgeUrl: url => {
    const cleaned = url.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8787';
    writeStorageItem(EDGE_URL_STORAGE_KEY, cleaned);
    set({ edgeUrl: cleaned });
  },
  setEdgeSecret: secret => {
    const cleaned = secret.trim();
    writeStorageItem(EDGE_SECRET_STORAGE_KEY, cleaned);
    set({ edgeSecret: cleaned });
  },
});

const createConnectionHealthHandlers = (
  set: SetConnectionState
): Pick<
  ConnectionState,
  'reportTimeout' | 'reportSuccess' | 'reportFailure' | 'setUnstable' | 'setRealtimeStatus' | 'reportRealtimeEvent' | 'setConnectionMode'
> => ({
  reportTimeout: () => {
    set(state => ({
      isUnstable: true,
      lastTimeoutAt: Date.now(),
      consecutiveFailures: state.consecutiveFailures + 1,
      connectionMode: state.edgeAvailable ? 'local_failover' : state.connectionMode,
    }));
  },
  reportSuccess: () => {
    set(state => {
      const nextMode = computeModeAfterSuccess(state);
      if (!state.isUnstable && state.consecutiveFailures === 0 && nextMode === state.connectionMode) {
        return state;
      }
      return { isUnstable: false, consecutiveFailures: 0, connectionMode: nextMode };
    });
  },
  reportFailure: () => {
    set(state => {
      const failures = state.consecutiveFailures + 1;
      const unstable = failures >= 3;
      return {
        consecutiveFailures: failures,
        isUnstable: unstable,
        connectionMode: unstable && state.edgeAvailable ? 'local_failover' : state.connectionMode,
      };
    });
  },
  setUnstable: isUnstable => {
    set(state => ({
      isUnstable,
      connectionMode: isUnstable && state.edgeAvailable ? 'local_failover' : state.connectionMode,
    }));
  },
  setRealtimeStatus: realtimeStatus => {
    set({ realtimeStatus });
  },
  reportRealtimeEvent: () => {
    set({ realtimeLastEventAt: Date.now() });
  },
  setConnectionMode: connectionMode => {
    set({ connectionMode });
  },
});

export const useConnectionStore = create<ConnectionState>(set => ({
  isUnstable: false,
  lastTimeoutAt: null,
  consecutiveFailures: 0,
  realtimeStatus: 'connecting',
  realtimeLastEventAt: null,
  connectionMode: 'cloud',
  edgeAvailable: false,
  edgeUrl: resolveInitialEdgeUrl(),
  edgeSecret: resolveInitialEdgeSecret(),
  edgeBranchCode: null,
  pendingOutboxCount: 0,
  failedOutboxCount: 0,
  lastMirrorSyncAt: null,
  ...createConnectionHealthHandlers(set),
  ...createEdgeHealthHandlers(set),
}));
