/**
 * Cloud <-> Local Mirror Sync & FIFO Outbox Replay Worker.
 * Never posts accounting journal rows directly: replays queued user actions through
 * official Supabase RPCs with idempotency_key and user JWT (or service key if configured).
 */

function isFatalRpcStatus(httpStatus, errorPayload) {
  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 403 || httpStatus === 422) {
    return true;
  }
  const pgCode = String(errorPayload?.code || '');
  if (pgCode.startsWith('23') || pgCode === '42501' || pgCode === 'PGRST202') {
    return true;
  }
  return false;
}

export class DeltaSyncWorker {
  /**
   * @param {{ config: ReturnType<import('./config.mjs').loadConfig>, mirror: import('./sqliteMirror.mjs').SqliteMirror, fetchImpl?: typeof fetch }} deps
   */
  constructor({ config, mirror, fetchImpl = fetch }) {
    this.config = config;
    this.mirror = mirror;
    this.fetchImpl = fetchImpl;
    this.inMemoryBearerToken = null;
    this.isSyncing = false;
    this.lastError = null;
    this.lastCloudOkAt = null;
  }

  /** Stores latest user JWT in memory only (never persisted to disk). */
  setBearerToken(token) {
    if (typeof token === 'string' && token.trim().length > 20) {
      this.inMemoryBearerToken = token.trim();
    }
  }

  getAuthHeaders() {
    const token = this.inMemoryBearerToken || this.config.supabaseServiceRoleKey;
    const apiKey = this.config.supabaseAnonKey || this.config.supabaseServiceRoleKey;
    if (!token || !apiKey) return null;
    return {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
    };
  }

  async callRpc(rpcName, args, timeoutMs = 20_000) {
    const headers = this.getAuthHeaders();
    if (!headers) {
      const err = new Error('auth_token_unavailable');
      err.isAuthMissing = true;
      throw err;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
      const resp = await this.fetchImpl(`${this.config.supabaseUrl}/rest/v1/rpc/${rpcName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(args),
        signal: controller.signal,
      });

      const text = await resp.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }

      if (!resp.ok) {
        const err = new Error(
          (typeof json === 'object' && json?.message) || `RPC ${rpcName} HTTP ${resp.status}`
        );
        err.httpStatus = resp.status;
        err.payload = json;
        throw err;
      }

      this.lastCloudOkAt = new Date().toISOString();
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async resolveOfficialInvoiceNumber(invoiceId) {
    const headers = this.getAuthHeaders();
    if (!headers || !invoiceId) return null;
    try {
      const resp = await this.fetchImpl(
        `${this.config.supabaseUrl}/rest/v1/invoices?select=id,invoice_number&id=eq.${encodeURIComponent(invoiceId)}&limit=1`,
        { method: 'GET', headers }
      );
      if (!resp.ok) return null;
      const rows = await resp.json();
      return Array.isArray(rows) && rows[0]?.invoice_number ? String(rows[0].invoice_number) : null;
    } catch {
      return null;
    }
  }

  async replayOutbox() {
    const pending = this.mirror.getPendingOutbox();
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      let args;
      try {
        args = JSON.parse(item.payload_json);
      } catch (parseErr) {
        this.mirror.markOutboxFailed(item.id, 'Invalid stored JSON payload', true);
        failed += 1;
        continue;
      }

      this.mirror.markOutboxSyncing(item.id);
      try {
        const res = await this.callRpc(item.rpc_name, args);

        let officialId = null;
        let officialRef = null;
        if (item.rpc_name === 'commit_sales_invoice_v2') {
          officialId = typeof res === 'string' ? res : res?.id || null;
          officialRef =
            (typeof res === 'object' && res?.invoice_number) ||
            (await this.resolveOfficialInvoiceNumber(officialId)) ||
            officialId;
        } else if (item.rpc_name === 'create_financial_bond') {
          officialId = res?.id || res?.payment_id || null;
          officialRef = res?.payment_number || officialId;
        } else if (item.rpc_name === 'commit_sales_requisition') {
          officialId = res?.id || null;
          officialRef = res?.pr_number || officialId;
        }

        this.mirror.markOutboxSynced(item.id, officialId, officialRef);
        synced += 1;
      } catch (err) {
        if (err.isAuthMissing) {
          // Keep pending until browser sends user JWT or service key is configured
          this.mirror.markOutboxFailed(item.id, 'بانتظار جلسة مستخدم نشطة لإتمام المزامنة', false);
          break;
        }
        const fatal = isFatalRpcStatus(err.httpStatus, err.payload);
        this.mirror.markOutboxFailed(item.id, err.message, fatal);
        failed += 1;
        if (!fatal) {
          // Network/5xx transient outage: stop FIFO loop to preserve order
          this.lastError = err.message;
          break;
        }
      }
    }

    return { pendingTotal: pending.length, synced, failed };
  }

  async pullEntityPages(entity, pageSize = 2000) {
    const checkpoint = this.mirror.getCheckpoint(entity);
    const since = checkpoint?.last_synced_at || null;
    let offset = 0;
    let totalFetched = 0;
    let serverTime = new Date().toISOString();

    while (true) {
      const res = await this.callRpc('get_branch_mirror_delta', {
        p_company_id: this.config.companyId,
        p_branch_id: this.config.branchId,
        p_since: since,
        p_entity: entity,
        p_limit: pageSize,
        p_offset: offset,
      });

      if (res?.server_time) serverTime = String(res.server_time);

      if (entity === 'reference') {
        const refData = res?.data || {};
        for (const [k, v] of Object.entries(refData)) {
          this.mirror.setReference(k, v);
        }
        totalFetched = Object.keys(refData).length;
        break;
      }

      const rows = Array.isArray(res?.rows) ? res.rows : [];
      if (entity === 'products') this.mirror.upsertProducts(rows);
      else if (entity === 'stock') this.mirror.upsertStock(rows);
      else if (entity === 'parties') this.mirror.upsertParties(rows);
      else if (entity === 'recent_invoices') this.mirror.upsertRecentInvoices(rows);

      totalFetched += rows.length;
      if (!res?.has_more || rows.length < pageSize) break;
      offset += pageSize;
    }

    this.mirror.setCheckpoint(entity, serverTime, totalFetched);
    return totalFetched;
  }

  async pullMirrorDelta() {
    const results = {};
    results.reference = await this.pullEntityPages('reference');
    results.products = await this.pullEntityPages('products');
    results.stock = await this.pullEntityPages('stock');
    results.parties = await this.pullEntityPages('parties');
    results.recent_invoices = await this.pullEntityPages('recent_invoices');

    const stats = this.mirror.getStats();
    if (stats.pendingOutboxCount === 0) {
      this.mirror.resetAllLocalDeltas();
    }
    return results;
  }

  async sendHeartbeat(status = 'online') {
    const headers = this.getAuthHeaders();
    if (!headers) return;
    const stats = this.mirror.getStats();
    const rssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
    try {
      await this.callRpc('upsert_branch_edge_heartbeat', {
        p_company_id: this.config.companyId,
        p_branch_id: this.config.branchId,
        p_branch_code: this.config.branchCode,
        p_payload: {
          hostname: this.config.hostname,
          edge_version: this.config.edgeVersion,
          status: stats.failedOutboxCount > 0 ? 'degraded' : status,
          pending_outbox_count: stats.pendingOutboxCount,
          failed_outbox_count: stats.failedOutboxCount,
          mirror_products_count: stats.productsCount,
          mirror_parties_count: stats.partiesCount,
          last_mirror_sync_at: stats.lastMirrorSyncAt,
          memory_rss_mb: rssMb,
        },
      });
    } catch {
      // Heartbeat failure is non-fatal (for example before wave48 migration is applied)
    }
  }

  async runFullCycle(bearerToken = null) {
    if (bearerToken) this.setBearerToken(bearerToken);
    if (this.isSyncing) {
      return { skipped: true, reason: 'sync_in_progress' };
    }
    if (!this.getAuthHeaders()) {
      return { skipped: true, reason: 'no_auth_token' };
    }

    this.isSyncing = true;
    this.lastError = null;
    try {
      const outboxResult = await this.replayOutbox();
      let mirrorResult = null;
      if (this.mirror.getStats().pendingOutboxCount === 0) {
        mirrorResult = await this.pullMirrorDelta();
      }
      await this.sendHeartbeat('online');
      return { skipped: false, outboxResult, mirrorResult, stats: this.mirror.getStats() };
    } catch (err) {
      this.lastError = err.message;
      return { skipped: false, error: err.message, stats: this.mirror.getStats() };
    } finally {
      this.isSyncing = false;
    }
  }
}
