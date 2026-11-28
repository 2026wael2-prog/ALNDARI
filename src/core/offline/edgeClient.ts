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

export interface EdgeBackupRuntimeConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  retentionDays: number;
  cronHour: number;
  cronMinute: number;
}

const NETWORK_FAILURE_PATTERNS = [
  'network_offline',
  'failed to fetch',
  'err_failed',
  'networkerror',
  'load failed',
  'circuit open',
  'timeout',
  'econnrefused',
  'network request failed',
] as const;

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase();
  if (typeof err === 'string') return err.toLowerCase();
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const rawMsg = (err as { message?: unknown }).message;
    return typeof rawMsg === 'string' ? rawMsg.toLowerCase() : '';
  }
  return '';
}

export function isNetworkFailureError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err === null || err === undefined) return false;
  const msg = extractErrorMessage(err);
  if (msg === '') return false;
  return NETWORK_FAILURE_PATTERNS.some(pattern => msg.includes(pattern));
}

export function shouldUseLocalFailover(err?: unknown): boolean {
  const state = useConnectionStore.getState();
  if (!state.edgeAvailable) return false;
  if (state.connectionMode === 'local_failover' || state.isUnstable) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return err !== undefined ? isNetworkFailureError(err) : false;
}

async function resolveSupabaseJwt(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return typeof token === 'string' && token !== '' ? token : null;
  } catch {
    return null;
  }
}

async function buildEdgeHeaders(includeAuth: boolean, extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const { edgeSecret } = useConnectionStore.getState();
  if (edgeSecret !== '') {
    headers.set('X-Edge-Secret', edgeSecret);
  }
  const userId = useAuthStore.getState().user?.id;
  if (typeof userId === 'string' && userId !== '') {
    headers.set('x-edge-user-id', userId);
  }
  if (includeAuth) {
    const bearer = await resolveSupabaseJwt();
    if (bearer !== null) {
      headers.set('Authorization', `Bearer ${bearer}`);
    }
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
    const headers = await buildEdgeHeaders(options.includeAuth === true, options.headers);
    const resp = await fetch(`${edgeUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const text = await resp.text();
    const json = (text !== '' ? JSON.parse(text) : {}) as T & { error?: string };
    if (!resp.ok) {
      throw new Error(json.error ?? `Edge HTTP ${String(resp.status)}`);
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
        includeAuth: true,
        timeoutMs: 1500,
      });
      if (data.ok) {
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

  searchProducts: async (
    query: string,
    warehouseId?: string | null,
    limit = 30
  ): Promise<Array<Record<string, unknown>>> => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (typeof warehouseId === 'string' && warehouseId !== '') {
      params.set('warehouseId', warehouseId);
    }
    const data = await edgeFetch<{ rows?: Array<Record<string, unknown>> }>(
      `/mirror/products/search?${params.toString()}`,
      { method: 'GET', timeoutMs: 3000 }
    );
    return data.rows ?? [];
  },

  listParties: async (
    query = '',
    type?: string,
    limit = 100
  ): Promise<Array<Record<string, unknown>>> => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (typeof type === 'string' && type !== '') {
      params.set('type', type);
    }
    const data = await edgeFetch<{ rows?: Array<Record<string, unknown>> }>(
      `/mirror/parties?${params.toString()}`,
      { method: 'GET', timeoutMs: 3000 }
    );
    return data.rows ?? [];
  },

  getReference: async <T = unknown>(key: string): Promise<T | null> => {
    const data = await edgeFetch<{ key: string; value?: T | null }>(
      `/mirror/reference/${encodeURIComponent(key)}`,
      { method: 'GET', timeoutMs: 2500 }
    );
    return data.value ?? null;
  },

  enqueueSalesInvoice: async (
    rpcParams: Record<string, unknown>,
    userId?: string
  ): Promise<{
    id: string;
    offline_ref: string;
    invoice_number: string;
    idempotency_key: string;
    total_amount: number;
    total_document_amount: number;
    status: string;
  }> => {
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

  enqueueBond: async (
    rpcParams: Record<string, unknown>,
    userId?: string
  ): Promise<{
    id: string;
    offline_ref: string;
    payment_number: string;
    idempotency_key: string;
    status: string;
  }> => {
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

  enqueueRequisition: async (
    rpcParams: Record<string, unknown>,
    userId?: string
  ): Promise<{
    id: string;
    offline_ref: string;
    pr_number: string;
    idempotency_key: string;
    status: string;
  }> => {
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

  listOutbox: async (
    limit = 50
  ): Promise<{
    rows: EdgeOutboxRow[];
    stats: {
      pendingOutboxCount: number;
      failedOutboxCount: number;
      syncedOutboxCount: number;
      lastMirrorSyncAt: string | null;
    };
  }> => {
    return await edgeFetch(`/outbox/list?limit=${String(limit)}`, {
      method: 'GET',
      timeoutMs: 3000,
    });
  },

  retryOutboxItem: async (id: string): Promise<boolean> => {
    const res = await edgeFetch<{ ok: boolean }>(`/outbox/retry/${encodeURIComponent(id)}`, {
      method: 'POST',
      timeoutMs: 3000,
      body: JSON.stringify({}),
    });
    void edgeClient.checkHealth();
    return res.ok;
  },

  triggerSyncNow: async (): Promise<{
    skipped?: boolean;
    reason?: string;
    error?: string;
    outboxResult?: { synced: number; failed: number };
    stats?: EdgeHealthResponse;
  }> => {
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
        body: JSON.stringify({}),
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

  triggerBackupNow: async (): Promise<{
    status: string;
    file_name: string;
    compressed_bytes: number;
    total_rows: number;
    sha256: string;
    drive_web_link: string | null;
    local_path: string | null;
  }> => {
    return await edgeFetch('/backup/run', {
      method: 'POST',
      includeAuth: true,
      timeoutMs: 120_000,
      body: JSON.stringify({}),
    });
  },

  getBackupStatus: async (): Promise<{
    isRunning: boolean;
    driveConfigured: boolean;
    backupDir: string;
    lastRun: Record<string, unknown> | null;
  }> => {
    return await edgeFetch('/backup/status', { method: 'GET', timeoutMs: 3000 });
  },

  getBackupConfig: async (): Promise<EdgeBackupRuntimeConfig> => {
    return await edgeFetch('/config/backup', { method: 'GET', timeoutMs: 3000 });
  },

  saveBackupConfig: async (
    config: Partial<EdgeBackupRuntimeConfig>
  ): Promise<EdgeBackupRuntimeConfig> => {
    return await edgeFetch('/config/backup', {
      method: 'POST',
      timeoutMs: 4000,
      body: JSON.stringify(config),
    });
  },
};

function shouldTriggerAutoSync(
  health: EdgeHealthResponse | null,
  isOnline: boolean,
  isUnstable: boolean
): boolean {
  if (!isOnline || isUnstable || health?.ok !== true) return false;
  return health.pendingOutboxCount > 0 && !health.isSyncing;
}

function handleWindowOffline(): void {
  const store = useConnectionStore.getState();
  if (store.edgeAvailable) {
    store.setConnectionMode('local_failover');
  }
}

/**
 * Starts background health polling & automatic Cloud <-> Local Failover transitions.
 * Returns a cleanup function for unmount.
 */
export function startEdgeFailoverMonitor(intervalMs = 15_000): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let active = true;

  const probe = async (): Promise<void> => {
    if (!active) return;
    const health = await edgeClient.checkHealth();
    const store = useConnectionStore.getState();
    if (shouldTriggerAutoSync(health, navigator.onLine, store.isUnstable)) {
      void edgeClient.triggerSyncNow().catch(() => undefined);
    }
  };

  const onOnline = (): void => {
    useConnectionStore.getState().reportSuccess();
    void probe();
  };

  void probe();
  const timer = setInterval(() => {
    void probe();
  }, intervalMs);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', handleWindowOffline);

  return () => {
    active = false;
    clearInterval(timer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', handleWindowOffline);
  };
}
