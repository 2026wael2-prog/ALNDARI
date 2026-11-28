import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConnectionStore } from '../store/connectionStore';
import { edgeClient, isNetworkFailureError, shouldUseLocalFailover } from './edgeClient';

describe('edgeClient', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      isUnstable: false,
      consecutiveFailures: 0,
      connectionMode: 'cloud',
      edgeAvailable: false,
      edgeUrl: 'http://127.0.0.1:8787',
      edgeBranchCode: null,
      pendingOutboxCount: 0,
      failedOutboxCount: 0,
    });
    vi.restoreAllMocks();
  });

  it('recognizes network failure messages cleanly without over-matching business errors', () => {
    expect(isNetworkFailureError(new Error('network_offline'))).toBe(true);
    expect(isNetworkFailureError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailureError(new Error('Circuit open'))).toBe(true);
    expect(isNetworkFailureError(new Error('validation error: missing customer'))).toBe(false);
    expect(isNetworkFailureError(new Error('Could not fetch permission for invoice'))).toBe(false);
  });

  it('activates local failover only when edgeAvailable is true', () => {
    expect(shouldUseLocalFailover(new Error('Failed to fetch'))).toBe(false);

    useConnectionStore.getState().setEdgeHealth({ available: true, branchCode: 'B1' });
    expect(shouldUseLocalFailover(new Error('Failed to fetch'))).toBe(true);
    expect(shouldUseLocalFailover()).toBe(false);

    useConnectionStore.getState().setConnectionMode('local_failover');
    expect(shouldUseLocalFailover()).toBe(true);
  });

  it('updates connectionStore from /health probe cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          branchCode: 'B1',
          pendingOutboxCount: 3,
          failedOutboxCount: 1,
          lastMirrorSyncAt: '2026-11-28T10:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const health = await edgeClient.checkHealth();
    expect(health?.branchCode).toBe('B1');
    const state = useConnectionStore.getState();
    expect(state.edgeAvailable).toBe(true);
    expect(state.edgeBranchCode).toBe('B1');
    expect(state.pendingOutboxCount).toBe(3);
    expect(state.failedOutboxCount).toBe(1);
  });
});
