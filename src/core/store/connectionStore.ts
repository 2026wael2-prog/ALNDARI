import { create } from 'zustand';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';
export type ConnectionMode = 'cloud' | 'local_failover' | 'syncing';

const EDGE_URL_STORAGE_KEY = 'alndari_edge_url';

export function resolveInitialEdgeUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(EDGE_URL_STORAGE_KEY);
      if (saved && /^https?:\/\//i.test(saved.trim())) {
        return saved.trim().replace(/\/+$/, '');
      }
      if (
        window.location?.port === '8787' &&
        /^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.|172\.)/i.test(window.location.origin)
      ) {
        return window.location.origin;
      }
    } catch {
      // ignore storage errors
    }
  }
  return 'http://127.0.0.1:8787';
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
}

export const useConnectionStore = create<ConnectionState>(set => ({
  isUnstable: false,
  lastTimeoutAt: null,
  consecutiveFailures: 0,
  realtimeStatus: 'connecting',
  realtimeLastEventAt: null,
  connectionMode: 'cloud',
  edgeAvailable: false,
  edgeUrl: resolveInitialEdgeUrl(),
  edgeBranchCode: null,
  pendingOutboxCount: 0,
  failedOutboxCount: 0,
  lastMirrorSyncAt: null,

  reportTimeout: () => {
    set(state => {
      const now = Date.now();
      return {
        isUnstable: true,
        lastTimeoutAt: now,
        consecutiveFailures: state.consecutiveFailures + 1,
        connectionMode: state.edgeAvailable ? 'local_failover' : state.connectionMode,
      };
    });
  },

  reportSuccess: () => {
    set(state => {
      const nextMode: ConnectionMode =
        state.connectionMode === 'local_failover'
          ? state.pendingOutboxCount > 0
            ? 'syncing'
            : 'cloud'
          : state.connectionMode === 'syncing' && state.pendingOutboxCount === 0
            ? 'cloud'
            : state.connectionMode;
      if (!state.isUnstable && state.consecutiveFailures === 0 && nextMode === state.connectionMode) {
        return state;
      }
      return {
        isUnstable: false,
        consecutiveFailures: 0,
        connectionMode: nextMode,
      };
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

  setEdgeHealth: payload => {
    set(state => {
      const pending = payload.pendingOutboxCount ?? state.pendingOutboxCount;
      const failed = payload.failedOutboxCount ?? state.failedOutboxCount;
      const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
      let nextMode = state.connectionMode;
      if (payload.available && (!isOnline || state.isUnstable)) {
        nextMode = 'local_failover';
      } else if (!payload.available && state.connectionMode === 'local_failover') {
        nextMode = 'cloud';
      } else if (payload.available && state.connectionMode === 'syncing' && pending === 0) {
        nextMode = 'cloud';
      }
      return {
        edgeAvailable: payload.available,
        edgeBranchCode: payload.branchCode !== undefined ? payload.branchCode : state.edgeBranchCode,
        pendingOutboxCount: pending,
        failedOutboxCount: failed,
        lastMirrorSyncAt:
          payload.lastMirrorSyncAt !== undefined ? payload.lastMirrorSyncAt : state.lastMirrorSyncAt,
        connectionMode: nextMode,
      };
    });
  },

  setEdgeUrl: url => {
    const cleaned = url.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8787';
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(EDGE_URL_STORAGE_KEY, cleaned);
      } catch {
        // ignore storage quota
      }
    }
    set({ edgeUrl: cleaned });
  },
}));
