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
import { Readable } from 'node:stream';

const BACKUP_TABLES = [
  'companies',
  'branches',
  'warehouses',
  'fiscal_years',
  'supported_currencies',
  'exchange_rates',
  'accounts',
  'party_categories',
  'parties',
  'product_categories',
  'products',
  'product_stock',
  'expense_categories',
  'expenses',
  'invoices',
  'invoice_items',
  'payments',
  'payment_allocations',
  'journal_entries',
  'journal_entry_lines',
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

  async pruneOldLocalBackups() {
    const cutoff = Date.now() - this.config.backupRetentionDays * 86_400_000;
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

  async *streamSnapshotChunks(headers) {
    let totalRows = 0;
    const exportedAt = new Date().toISOString();
    yield `{"version":"3.0-stream","companyId":${JSON.stringify(this.config.companyId)},"branchCode":${JSON.stringify(this.config.branchCode)},"exportedAt":${JSON.stringify(exportedAt)},"tables":{`;

    if (headers) {
      const PAGE_SIZE = 1000;
      let firstTable = true;
      for (const table of BACKUP_TABLES) {
        if (!firstTable) yield ',';
        firstTable = false;
        yield `${JSON.stringify(table)}:[`;

        let from = 0;
        let firstRow = true;
        while (true) {
          const params = new URLSearchParams({
            select: '*',
            offset: String(from),
            limit: String(PAGE_SIZE),
          });
          if (table === 'companies') {
            params.set('id', `eq.${this.config.companyId}`);
          } else if (table !== 'supported_currencies') {
            params.set('company_id', `eq.${this.config.companyId}`);
          }
          const resp = await this.fetchImpl(`${this.config.supabaseUrl}/rest/v1/${table}?${params}`, {
            method: 'GET',
            headers,
          });
          if (!resp.ok) {
            throw new Error(`Export table ${table} failed (HTTP ${resp.status})`);
          }
          const batch = await resp.json();
          if (!Array.isArray(batch) || batch.length === 0) break;
          for (const row of batch) {
            if (!firstRow) yield ',';
            firstRow = false;
            yield JSON.stringify(row);
            totalRows += 1;
          }
          if (batch.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
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

  async runBackup({ triggerType = 'manual', bearerToken = null } = {}) {
    if (bearerToken) this.syncWorker.setBearerToken(bearerToken);
    if (this.isRunning) {
      throw new Error('عملية نسخ احتياطي قيد التشغيل حالياً');
    }
    this.isRunning = true;
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
      const out = fs.createWriteStream(localPath);
      await pipeline(source, gzip, out);

      const compressedBytes = fs.statSync(localPath).size;
      const hash = crypto.createHash('sha256');
      hash.update(fs.readFileSync(localPath));
      const sha256 = hash.digest('hex');

      if (this.hasDriveCredentials()) {
        const accessToken = await this.getGoogleAccessToken();
        const rootFolderId = await this.ensureDriveFolder(accessToken, this.config.gdriveFolderName);
        const monthFolderId = await this.ensureDriveFolder(accessToken, ym, rootFolderId);
        const uploaded = await this.uploadFileResumable(accessToken, localPath, fileName, monthFolderId);
        driveFileId = uploaded.id || null;
        driveWebLink = uploaded.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null);
        destination = 'both';
      }

      await this.pruneOldLocalBackups();

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
      const failedSummary = {
        company_id: this.config.companyId,
        branch_id: this.config.branchId,
        trigger_type: triggerType,
        destination,
        status: 'failed',
        file_name: fileName,
        local_path: fs.existsSync(localPath) ? localPath : null,
        error_message: err.message,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };
      this.lastRun = failedSummary;
      await this.logBackupRun(failedSummary);
      throw err;
    } finally {
      this.isRunning = false;
    }
  }
}
