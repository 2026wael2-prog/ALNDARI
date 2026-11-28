/**
 * Edge Failover Client (Branch Local Mirror & ACID Outbox Gateway)
 * Bridges the React UI with the Branch Local Edge Server (default http://127.0.0.1:8787)
 * only when reachable; fails silently in mobile/remote environments where no edge runs.
 */
import { useConnectionStore } from '@/core/store/connectionStore';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store';

export interface EdgeHealthResponse {
  ok: boolean;
  branchId: string;
  branchCode: string;
  branchName: string;
  companyId: string;
  edgeVersion: string;
  isSyncing: boolean;
  lastError: string | null;
  lastCloudOkAt: string | null;
  driveConfigured: boolean;
  memoryRssMb: number;
  productsCount: number;
  stockCount: number;
  partiesCount: number;
  pendingOutboxCount: number;
  failedOutboxCount: number;
  syncedOutboxCount: number;
  lastMirrorSyncAt: string | null;
}

export interface EdgeOutboxRow {
  id: string;
  idempotency_key: string;
  offline_ref: string;
  entity_type: 'sales_invoice' | 'bond' | 'requisition';
  rpc_name: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed_needs_review';
  attempts: number;
  official_id: string | null;
  official_ref: string | null;
  error_message: string | null;
  created_at: string;
  synced_at: string | null;
}

export function isNetworkFailureError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!err) return false;
  const msg = (
    err instanceof Error
      ? err.message
      : typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : String(err)
  ).toLowerCase();

  return (
    msg.includes('network_offline') ||
    msg.includes('failed to fetch') ||
    msg.includes('err_failed') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('circuit open') ||
    msg.includes('timeout') ||
    msg.includes('fetch') ||
    msg.includes('econnrefused')
  );
}

export function shouldUseLocalFailover(err?: unknown): boolean {
  const state = useConnectionStore.getState();
  if (!state.edgeAvailable) return false;
  if (state.connectionMode === 'local_failover' || state.isUnstable) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return err !== undefined ? isNetworkFailureError(err) : false;
}

async function getSessionHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const userId = useAuthStore.getState().user?.id;
  if (userId) headers['x-edge-user-id'] = userId;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Offline/session read failure — edge still works locally
  }
  return headers;
}

async function edgeFetch<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number; includeAuth?: boolean } = {}
): Promise<T> {
  const { edgeUrl } = useConnectionStore.getState();
  const timeoutMs = options.timeoutMs ?? 4000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort('edge-timeout');
  }, timeoutMs);

  try {
    const baseHeaders = options.includeAuth
      ? await getSessionHeaders()
      : { 'Content-Type': 'application/json' };
    const resp = await fetch(`${edgeUrl}${path}`, {
      ...options,
      headers: { ...baseHeaders, ...(options.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await resp.text();
    const json = (text ? JSON.parse(text) : {}) as T & { error?: string };
    if (!resp.ok) {
      throw new Error(json.error || `Edge HTTP ${resp.status}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export const edgeClient = {
  checkHealth: async (): Promise<EdgeHealthResponse | null> => {
    try {
      const data = await edgeFetch<EdgeHealthResponse>('/health', {
        method: 'GET',
        timeoutMs: 1500,
      });
      if (data?.ok) {
        useConnectionStore.getState().setEdgeHealth({
          available: true,
          branchCode: data.branchCode,
          pendingOutboxCount: data.pendingOutboxCount,
          failedOutboxCount: data.failedOutboxCount,
          lastMirrorSyncAt: data.lastMirrorSyncAt,
        });
        return data;
      }
      return null;
    } catch {
      useConnectionStore.getState().setEdgeHealth({ available: false });
      return null;
    }
  },

  searchProducts: async (query: string, warehouseId?: string | null, limit = 30) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (warehouseId) params.set('warehouseId', warehouseId);
    const data = await edgeFetch<{ rows: Array<Record<string, unknown>> }>(
      `/mirror/products/search?${params.toString()}`,
      { method: 'GET', timeoutMs: 3000 }
    );
    return data.rows ?? [];
  },

  listParties: async (query = '', type?: string, limit = 100) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (type) params.set('type', type);
    const data = await edgeFetch<{ rows: Array<Record<string, unknown>> }>(
      `/mirror/parties?${params.toString()}`,
      { method: 'GET', timeoutMs: 3000 }
    );
    return data.rows ?? [];
  },

  getReference: async <T = unknown>(key: string): Promise<T | null> => {
    const data = await edgeFetch<{ key: string; value: T | null }>(
      `/mirror/reference/${encodeURIComponent(key)}`,
      { method: 'GET', timeoutMs: 2500 }
    );
    return data.value ?? null;
  },

  enqueueSalesInvoice: async (rpcParams: Record<string, unknown>, userId?: string) => {
    const res = await edgeFetch<{
      id: string;
      offline_ref: string;
      invoice_number: string;
      idempotency_key: string;
      total_amount: number;
      total_document_amount: number;
      status: string;
    }>('/outbox/sales-invoice', {
      method: 'POST',
      includeAuth: true,
      timeoutMs: 4000,
      body: JSON.stringify({ rpcParams, userId }),
    });
    void edgeClient.checkHealth();
    return res;
  },

  enqueueBond: async (rpcParams: Record<string, unknown>, userId?: string) => {
    const res = await edgeFetch<{
      id: string;
      offline_ref: string;
      payment_number: string;
      idempotency_key: string;
      status: string;
    }>('/outbox/payment', {
      method: 'POST',
      includeAuth: true,
      timeoutMs: 4000,
      body: JSON.stringify({ rpcParams, userId }),
    });
    void edgeClient.checkHealth();
    return res;
  },

  enqueueRequisition: async (rpcParams: Record<string, unknown>, userId?: string) => {
    const res = await edgeFetch<{
      id: string;
      offline_ref: string;
      pr_number: string;
      idempotency_key: string;
      status: string;
    }>('/outbox/requisition', {
      method: 'POST',
      includeAuth: true,
      timeoutMs: 4000,
      body: JSON.stringify({ rpcParams, userId }),
    });
    void edgeClient.checkHealth();
    return res;
  },

  listOutbox: async (limit = 50) => {
    return await edgeFetch<{
      rows: EdgeOutboxRow[];
      stats: {
        pendingOutboxCount: number;
        failedOutboxCount: number;
        syncedOutboxCount: number;
        lastMirrorSyncAt: string | null;
      };
    }>(`/outbox/list?limit=${limit}`, { method: 'GET', timeoutMs: 3000 });
  },

  retryOutboxItem: async (id: string) => {
    const res = await edgeFetch<{ ok: boolean }>(`/outbox/retry/${encodeURIComponent(id)}`, {
      method: 'POST',
      timeoutMs: 3000,
    });
    void edgeClient.checkHealth();
    return res.ok;
  },

  triggerSyncNow: async () => {
    useConnectionStore.getState().setConnectionMode('syncing');
    try {
      const res = await edgeFetch<{
        skipped?: boolean;
        reason?: string;
        error?: string;
        outboxResult?: { synced: number; failed: number };
        stats?: EdgeHealthResponse;
      }>('/sync/now', {
        method: 'POST',
        includeAuth: true,
        timeoutMs: 45_000,
      });
      await edgeClient.checkHealth();
      return res;
    } finally {
      const state = useConnectionStore.getState();
      if (state.connectionMode === 'syncing') {
        state.setConnectionMode(state.isUnstable ? 'local_failover' : 'cloud');
      }
    }
  },

  triggerBackupNow: async () => {
    return await edgeFetch<{
      status: string;
      file_name: string;
      compressed_bytes: number;
      total_rows: number;
      sha256: string;
      drive_web_link: string | null;
      local_path: string | null;
    }>('/backup/run', {
      method: 'POST',
      includeAuth: true,
      timeoutMs: 120_000,
    });
  },

  getBackupStatus: async () => {
    return await edgeFetch<{
      isRunning: boolean;
      driveConfigured: boolean;
      backupDir: string;
      lastRun: Record<string, unknown> | null;
    }>('/backup/status', { method: 'GET', timeoutMs: 3000 });
  },
};

/**
 * Starts background health polling & automatic Cloud <-> Local Failover transitions.
 * Returns a cleanup function for unmount.
 */
export function startEdgeFailoverMonitor(intervalMs = 15_000): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let active = true;
  let wasOffline = !navigator.onLine;

  const probe = async () => {
    if (!active) return;
    const health = await edgeClient.checkHealth();
    const store = useConnectionStore.getState();
    const isOnline = navigator.onLine;

    if (wasOffline && isOnline && health?.ok && health.pendingOutboxCount > 0) {
      void edgeClient.triggerSyncNow().catch(() => undefined);
    }
    if (isOnline && !store.isUnstable && health?.ok && health.pendingOutboxCount > 0 && !health.isSyncing) {
      void edgeClient.triggerSyncNow().catch(() => undefined);
    }
    wasOffline = !isOnline;
  };

  const onOnline = () => {
    useConnectionStore.getState().reportSuccess();
    void probe();
  };
  const onOffline = () => {
    const store = useConnectionStore.getState();
    if (store.edgeAvailable) {
      store.setConnectionMode('local_failover');
    }
    wasOffline = true;
  };

  void probe();
  const timer = setInterval(() => {
    void probe();
  }, intervalMs);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    active = false;
    clearInterval(timer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
