/**
 * Streaming Gzip + SHA-256 Backup & Google Drive Resumable Upload Worker.
 * Streams paginated tenant tables to `gzip -9` on disk so memory stays < 40 MB
 * even with 500,000+ rows, then uploads via Drive API v3 Resumable Upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { loadRuntimeBackupConfig } from './config.mjs';

const BACKUP_TABLES = [
  { table: 'companies', orderBy: 'id.asc', filterType: 'id' },
  { table: 'branches', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'warehouses', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'fiscal_years', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'supported_currencies', orderBy: 'code.asc', filterType: 'none' },
  { table: 'exchange_rates', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'accounts', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'party_categories', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'parties', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'party_opening_balances', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'product_categories', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'products', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'product_uoms', orderBy: 'id.asc', filterType: 'none' },
  { table: 'product_stock', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'stock_transfers', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'stock_transfer_items', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'expense_categories', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'expenses', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'invoices', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'invoice_items', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'payments', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'payment_allocations', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'journal_entries', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'journal_entry_lines', orderBy: 'id.asc', filterType: 'company_id' },
  { table: 'prc_purchase_requests', orderBy: 'pr_id.asc', filterType: 'company_id' },
  { table: 'prc_purchase_request_items', orderBy: 'pr_item_id.asc', filterType: 'company_id' },
];

export class GoogleDriveBackupWorker {
  /**
   * @param {{ config: ReturnType<import('./config.mjs').loadConfig>, mirror: import('./sqliteMirror.mjs').SqliteMirror, syncWorker: import('./deltaSyncWorker.mjs').DeltaSyncWorker, fetchImpl?: typeof fetch }} deps
   */
  constructor({ config, mirror, syncWorker, fetchImpl = fetch }) {
    this.config = config;
    this.mirror = mirror;
    this.syncWorker = syncWorker;
    this.fetchImpl = fetchImpl;
    this.isRunning = false;
    this.lastRun = null;
    this.progress = null;
  }

  hasDriveCredentials() {
    return Boolean(
      this.config.gdriveClientId &&
      this.config.gdriveClientSecret &&
      this.config.gdriveRefreshToken
    );
  }

  async getGoogleAccessToken() {
    const body = new URLSearchParams({
      client_id: this.config.gdriveClientId,
      client_secret: this.config.gdriveClientSecret,
      refresh_token: this.config.gdriveRefreshToken,
      grant_type: 'refresh_token',
    });
    const resp = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = await resp.json();
    if (!resp.ok || !json.access_token) {
      throw new Error(json.error_description || json.error || 'Failed to refresh Google OAuth token');
    }
    return json.access_token;
  }

  async ensureDriveFolder(accessToken, name, parentId = null) {
    const qParts = [
      `mimeType = 'application/vnd.google-apps.folder'`,
      `name = '${name.replace(/'/g, "\\'")}'`,
      'trashed = false',
    ];
    if (parentId) qParts.push(`'${parentId}' in parents`);

    const searchUrl =
      'https://www.googleapis.com/drive/v3/files?' +
      new URLSearchParams({ q: qParts.join(' and '), fields: 'files(id,name)', pageSize: '5' });
    const searchResp = await this.fetchImpl(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (searchResp.ok) {
      const searchJson = await searchResp.json();
      if (Array.isArray(searchJson.files) && searchJson.files[0]?.id) {
        return searchJson.files[0].id;
      }
    }

    const createResp = await this.fetchImpl('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    const createJson = await createResp.json();
    if (!createResp.ok || !createJson.id) {
      throw new Error(createJson.error?.message || `Failed to create Drive folder ${name}`);
    }
    return createJson.id;
  }

  /** Uploads a gzip archive in 4 MB chunks with per-chunk retry for unstable links. */
  async uploadFileResumable(accessToken, filePath, fileName, parentFolderId) {
    const stat = fs.statSync(filePath);
    const totalBytes = stat.size;

    const initResp = await this.fetchImpl(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'application/gzip',
          'X-Upload-Content-Length': String(totalBytes),
        },
        body: JSON.stringify({
          name: fileName,
          parents: parentFolderId ? [parentFolderId] : undefined,
        }),
      }
    );
    if (!initResp.ok) {
      const errText = await initResp.text();
      throw new Error(`Drive upload init failed (${initResp.status}): ${errText}`);
    }
    const sessionUri = initResp.headers.get('location');
    if (!sessionUri) throw new Error('Drive upload did not return resumable session Location header');

    const CHUNK_SIZE = 4 * 1024 * 1024;
    const fd = fs.openSync(filePath, 'r');
    let offset = 0;
    let uploadedJson = null;

    try {
      while (offset < totalBytes) {
        const end = Math.min(offset + CHUNK_SIZE, totalBytes);
        const len = end - offset;
        const buf = Buffer.allocUnsafe(len);
        fs.readSync(fd, buf, 0, len, offset);

        let chunkOk = false;
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const putResp = await this.fetchImpl(sessionUri, {
              method: 'PUT',
              headers: {
                'Content-Length': String(len),
                'Content-Range': `bytes ${offset}-${end - 1}/${totalBytes}`,
              },
              body: buf,
            });
            if (putResp.status === 308) {
              chunkOk = true;
              break;
            }
            if (putResp.ok) {
              uploadedJson = await putResp.json();
              chunkOk = true;
              break;
            }
            lastErr = new Error(`Drive chunk PUT HTTP ${putResp.status}`);
          } catch (e) {
            lastErr = e;
          }
        }
        if (!chunkOk) throw lastErr || new Error('Drive chunk upload failed');
        offset = end;
      }
    } finally {
      fs.closeSync(fd);
    }

    return uploadedJson || { id: null, webViewLink: null };
  }

  async pruneOldLocalBackups(retentionDaysOverride = null) {
    const retention = retentionDaysOverride ?? this.config.backupRetentionDays;
    const cutoff = Date.now() - retention * 86_400_000;
    if (!fs.existsSync(this.config.backupDir)) return;
    for (const entry of fs.readdirSync(this.config.backupDir, { withFileTypes: true })) {
      const full = path.join(this.config.backupDir, entry.name);
      if (entry.isDirectory()) {
        for (const f of fs.readdirSync(full)) {
          // Keep 1st of month backups permanently
          if (/_\d{4}-\d{2}-01_/.test(f)) continue;
          const fp = path.join(full, f);
          const st = fs.statSync(fp);
          if (st.mtimeMs < cutoff) {
            fs.unlinkSync(fp);
          }
        }
      }
    }
  }

  async pruneOldDriveBackups(accessToken, rootFolderId, retentionDaysOverride = null) {
    const retention = retentionDaysOverride ?? this.config.backupRetentionDays;
    const cutoff = Date.now() - retention * 86_400_000;
    const prefix = `AlNadary_${this.config.branchCode}_`;

    const foldersUrl =
      'https://www.googleapis.com/drive/v3/files?' +
      new URLSearchParams({
        q: `mimeType = 'application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed = false`,
        fields: 'files(id,name)',
        pageSize: '100',
      });
    const foldersResp = await this.fetchImpl(foldersUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!foldersResp.ok) return 0;
    const foldersJson = await foldersResp.json();
    const folders = Array.isArray(foldersJson.files) ? foldersJson.files : [];

    let deletedCount = 0;
    for (const folder of folders) {
      const filesUrl =
        'https://www.googleapis.com/drive/v3/files?' +
        new URLSearchParams({
          q: `'${folder.id}' in parents and trashed = false and name contains '${prefix}'`,
          fields: 'files(id,name,createdTime)',
          pageSize: '200',
        });
      const filesResp = await this.fetchImpl(filesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!filesResp.ok) continue;
      const filesJson = await filesResp.json();
      const files = Array.isArray(filesJson.files) ? filesJson.files : [];
      for (const file of files) {
        if (!file.name || !String(file.name).endsWith('.json.gz')) continue;
        if (/_\d{4}-\d{2}-01_/.test(file.name)) continue;
        const createdMs = file.createdTime ? Date.parse(file.createdTime) : NaN;
        if (Number.isFinite(createdMs) && createdMs < cutoff) {
          const delResp = await this.fetchImpl(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (delResp.ok) deletedCount += 1;
        }
      }
    }
    return deletedCount;
  }

  async fetchPageWithRetry(url, headers, maxAttempts = 4) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('backup-page-timeout'), 30_000);
      try {
        const resp = await this.fetchImpl(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        if (resp.ok) {
          return await resp.json();
        }
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
          throw new Error(`HTTP ${resp.status}`);
        }
        lastErr = new Error(`HTTP ${resp.status}`);
      } catch (err) {
        lastErr = err;
        if (err instanceof Error && /^HTTP 4\d\d$/.test(err.message)) {
          throw err;
        }
      } finally {
        clearTimeout(timer);
      }
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, Math.min(8000, 1000 * 2 ** (attempt - 1))));
      }
    }
    throw lastErr || new Error('fetch failed');
  }

  async *streamSnapshotChunks(headers) {
    let totalRows = 0;
    const exportedAt = new Date().toISOString();
    yield `{"version":"3.0-stream","companyId":${JSON.stringify(this.config.companyId)},"branchCode":${JSON.stringify(this.config.branchCode)},"exportedAt":${JSON.stringify(exportedAt)},"tables":{`;

    if (headers) {
      const PAGE_SIZE = 1000;
      let firstTable = true;
      for (const entry of BACKUP_TABLES) {
        const table = entry.table;
        const pkCol = entry.orderBy.split('.')[0];
        this.progress = { table, exportedRows: totalRows };
        if (!firstTable) yield ',';
        firstTable = false;
        yield `${JSON.stringify(table)}:[`;

        let lastPk = null;
        let firstRow = true;
        while (true) {
          const params = new URLSearchParams({
            select: '*',
            order: entry.orderBy,
            limit: String(PAGE_SIZE),
          });
          if (entry.filterType === 'id') {
            params.set('id', `eq.${this.config.companyId}`);
          } else if (entry.filterType === 'company_id') {
            params.set('company_id', `eq.${this.config.companyId}`);
          }
          if (lastPk !== null && lastPk !== undefined) {
            params.set(pkCol, `gt.${String(lastPk)}`);
          }

          let batch;
          try {
            batch = await this.fetchPageWithRetry(
              `${this.config.supabaseUrl}/rest/v1/${table}?${params}`,
              headers
            );
          } catch (err) {
            throw new Error(`Export table ${table} failed (${err?.message || 'fetch failed'})`);
          }

          if (!Array.isArray(batch) || batch.length === 0) break;
          for (const row of batch) {
            if (!firstRow) yield ',';
            firstRow = false;
            yield JSON.stringify(row);
            totalRows += 1;
          }
          this.progress = { table, exportedRows: totalRows };
          lastPk = batch[batch.length - 1]?.[pkCol] ?? null;
          if (batch.length < PAGE_SIZE || lastPk === null) break;
        }
        yield ']';
      }
    } else {
      // Offline local mirror fallback snapshot
      const offlineTables = {
        mirror_products: this.mirror.db.prepare('SELECT * FROM mirror_products').all(),
        mirror_stock: this.mirror.db.prepare('SELECT * FROM mirror_stock').all(),
        mirror_parties: this.mirror.db.prepare('SELECT * FROM mirror_parties').all(),
        mirror_recent_invoices: this.mirror.db.prepare('SELECT * FROM mirror_recent_invoices').all(),
        offline_outbox: this.mirror.db.prepare('SELECT * FROM offline_outbox').all(),
      };
      let firstTable = true;
      for (const [k, rows] of Object.entries(offlineTables)) {
        if (!firstTable) yield ',';
        firstTable = false;
        yield `${JSON.stringify(k)}:${JSON.stringify(rows)}`;
        totalRows += rows.length;
      }
    }

    yield `},"totalRows":${totalRows}}`;
    this._lastExportedRowCount = totalRows;
  }

  async logBackupRun(payload) {
    const headers = this.syncWorker.getAuthHeaders();
    if (!headers) return;
    try {
      await this.fetchImpl(`${this.config.supabaseUrl}/rest/v1/system_backup_runs`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-fatal if offline or wave48 not yet migrated
    }
  }

  async runBackup({ triggerType = 'manual', bearerToken = null, userId = null } = {}) {
    if (bearerToken) this.syncWorker.setBearerToken(bearerToken, userId);
    if (this.isRunning) {
      throw new Error('عملية نسخ احتياطي قيد التشغيل حالياً');
    }
    this.isRunning = true;
    const runtimeCfg = loadRuntimeBackupConfig(this.config);
    const retentionDays = runtimeCfg.retentionDays ?? this.config.backupRetentionDays;
    const startedAt = new Date().toISOString();
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const stamp = `${ym}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `AlNadary_${this.config.branchCode}_${stamp}.json.gz`;
    const monthDir = path.join(this.config.backupDir, ym);
    fs.mkdirSync(monthDir, { recursive: true });
    const localPath = path.join(monthDir, fileName);

    let driveFileId = null;
    let driveWebLink = null;
    let destination = 'local_disk';

    try {
      const headers = this.syncWorker.getAuthHeaders();
      this._lastExportedRowCount = 0;

      const source = Readable.from(this.streamSnapshotChunks(headers));
      const gzip = zlib.createGzip({ level: 9 });
      const hash = crypto.createHash('sha256');
      const hashTap = new Transform({
        transform(chunk, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const out = fs.createWriteStream(localPath);
      await pipeline(source, gzip, hashTap, out);

      const compressedBytes = fs.statSync(localPath).size;
      const sha256 = hash.digest('hex');

      if (this.hasDriveCredentials()) {
        const accessToken = await this.getGoogleAccessToken();
        const rootFolderId = await this.ensureDriveFolder(accessToken, this.config.gdriveFolderName);
        const monthFolderId = await this.ensureDriveFolder(accessToken, ym, rootFolderId);
        const uploaded = await this.uploadFileResumable(accessToken, localPath, fileName, monthFolderId);
        driveFileId = uploaded.id || null;
        driveWebLink = uploaded.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null);
        destination = 'both';
        try {
          await this.pruneOldDriveBackups(accessToken, rootFolderId, retentionDays);
        } catch {
          // Non-fatal: uploaded archive already succeeded
        }
      }

      await this.pruneOldLocalBackups(retentionDays);

      const completedAt = new Date().toISOString();
      const summary = {
        company_id: this.config.companyId,
        branch_id: this.config.branchId,
        trigger_type: triggerType,
        destination,
        status: 'success',
        file_name: fileName,
        compressed_bytes: compressedBytes,
        total_rows: this._lastExportedRowCount,
        sha256,
        drive_file_id: driveFileId,
        drive_web_link: driveWebLink,
        local_path: localPath,
        started_at: startedAt,
        completed_at: completedAt,
      };
      this.lastRun = summary;
      await this.logBackupRun(summary);
      return summary;
    } catch (err) {
      if (fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
        } catch {
          // ignore cleanup failure
        }
      }
      const failedSummary = {
        company_id: this.config.companyId,
        branch_id: this.config.branchId,
        trigger_type: triggerType,
        destination,
        status: 'failed',
        file_name: fileName,
        local_path: null,
        error_message: err.message,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };
      this.lastRun = failedSummary;
      await this.logBackupRun(failedSummary);
      throw err;
    } finally {
      this.isRunning = false;
      this.progress = null;
    }
  }
}
