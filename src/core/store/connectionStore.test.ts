import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from './connectionStore';

describe('connectionStore', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      isUnstable: false,
      lastTimeoutAt: null,
      consecutiveFailures: 0,
      realtimeStatus: 'connecting',
      realtimeLastEventAt: null,
      connectionMode: 'cloud',
      edgeAvailable: false,
      edgeUrl: 'http://127.0.0.1:8787',
      edgeBranchCode: null,
      pendingOutboxCount: 0,
      failedOutboxCount: 0,
      lastMirrorSyncAt: null,
    });
  });

  describe('request instability tracking', () => {
    it('marks connection unstable on timeout and flips to local_failover if edge is available', () => {
      useConnectionStore.getState().setEdgeHealth({ available: true, branchCode: 'B1' });
      useConnectionStore.getState().reportTimeout();
      const state = useConnectionStore.getState();
      expect(state.isUnstable).toBe(true);
      expect(state.consecutiveFailures).toBe(1);
      expect(state.lastTimeoutAt).not.toBeNull();
      expect(state.connectionMode).toBe('local_failover');
    });

    it('marks unstable only after 3 consecutive failures', () => {
      const { reportFailure } = useConnectionStore.getState();
      reportFailure();
      reportFailure();
      expect(useConnectionStore.getState().isUnstable).toBe(false);
      useConnectionStore.getState().reportFailure();
      expect(useConnectionStore.getState().isUnstable).toBe(true);
    });

    it('resets instability on success and returns to cloud when no pending outbox', () => {
      useConnectionStore.getState().setEdgeHealth({ available: true, pendingOutboxCount: 0 });
      useConnectionStore.getState().reportTimeout();
      expect(useConnectionStore.getState().connectionMode).toBe('local_failover');
      useConnectionStore.getState().reportSuccess();
      const state = useConnectionStore.getState();
      expect(state.isUnstable).toBe(false);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.connectionMode).toBe('cloud');
    });

    it('transitions through syncing when pending outbox items exist on recovery', () => {
      useConnectionStore.getState().setEdgeHealth({ available: true, pendingOutboxCount: 2 });
      useConnectionStore.getState().reportTimeout();
      useConnectionStore.getState().reportSuccess();
      expect(useConnectionStore.getState().connectionMode).toBe('syncing');
    });
  });

  describe('realtime channel status', () => {
    it('starts in connecting state', () => {
      expect(useConnectionStore.getState().realtimeStatus).toBe('connecting');
    });

    it('transitions to connected', () => {
      useConnectionStore.getState().setRealtimeStatus('connected');
      expect(useConnectionStore.getState().realtimeStatus).toBe('connected');
    });

    it('transitions to disconnected when channel drops', () => {
      useConnectionStore.getState().setRealtimeStatus('connected');
      useConnectionStore.getState().setRealtimeStatus('disconnected');
      expect(useConnectionStore.getState().realtimeStatus).toBe('disconnected');
    });

    it('records last realtime event timestamp', () => {
      const before = Date.now();
      useConnectionStore.getState().reportRealtimeEvent();
      const ts = useConnectionStore.getState().realtimeLastEventAt;
      expect(ts).not.toBeNull();
      expect(ts!).toBeGreaterThanOrEqual(before);
    });
  });
});
