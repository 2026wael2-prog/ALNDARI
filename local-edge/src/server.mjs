/**
 * Branch Local Edge HTTP Server & Scheduler (Node v24 ESM)
 * Serves LAN / Failover APIs + SPA static fallback (`dist/`) with < 90 MB RAM target.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { loadConfig, loadRuntimeBackupConfig, saveRuntimeBackupConfig } from './config.mjs';
import { SqliteMirror } from './sqliteMirror.mjs';
import { DeltaSyncWorker } from './deltaSyncWorker.mjs';
import { GoogleDriveBackupWorker } from './googleDriveBackupWorker.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (origin === 'https://alndari.vercel.app') return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(origin)) {
    return true;
  }
  return false;
}

function sendJson(res, status, data, origin = null) {
  const body = JSON.stringify(data);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (origin && isAllowedCorsOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(body);
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const err = new Error('payload_too_large');
      err.httpStatus = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function extractBearer(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

export function createEdgeServer({ config, mirror, syncWorker, backupWorker }) {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || null;

    if (origin && !isAllowedCorsOrigin(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'forbidden_origin' }));
      return;
    }

    if (req.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-edge-user-id, X-Edge-Secret',
        'Access-Control-Max-Age': '86400',
      };
      if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = reqUrl.pathname;

    const isProtectedApi =
      pathname.startsWith('/mirror/') ||
      pathname.startsWith('/outbox/') ||
      pathname.startsWith('/sync/') ||
      pathname.startsWith('/backup/') ||
      pathname.startsWith('/config/');

    if (config.edgeSharedSecret && isProtectedApi) {
      const provided = String(req.headers['x-edge-secret'] || '');
      if (provided !== config.edgeSharedSecret) {
        return sendJson(res, 401, { error: 'unauthorized_edge_secret' }, origin);
      }
    }

    if (req.method === 'POST' && isProtectedApi) {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('application/json')) {
        return sendJson(res, 415, { error: 'unsupported_media_type' }, origin);
      }
    }

    const token = extractBearer(req);
    const userId = req.headers['x-edge-user-id'] ? String(req.headers['x-edge-user-id']) : null;
    if (token) syncWorker.setBearerToken(token, userId);

    try {
      if (req.method === 'GET' && pathname === '/health') {
        const stats = mirror.getStats();
        return sendJson(
          res,
          200,
          {
            ok: true,
            branchId: config.branchId,
            branchCode: config.branchCode,
            branchName: config.branchName,
            companyId: config.companyId,
            edgeVersion: config.edgeVersion,
            authRequired: Boolean(config.edgeSharedSecret),
            isSyncing: syncWorker.isSyncing,
            lastError: syncWorker.lastError,
            lastCloudOkAt: syncWorker.lastCloudOkAt,
            driveConfigured: backupWorker.hasDriveCredentials(),
            runtimeBackupConfig: loadRuntimeBackupConfig(config),
            memoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
            ...stats,
          },
          origin
        );
      }

      if (req.method === 'GET' && pathname === '/mirror/products/search') {
        const q = reqUrl.searchParams.get('q') || '';
        const warehouseId = reqUrl.searchParams.get('warehouseId') || null;
        const limit = Number(reqUrl.searchParams.get('limit') || 30);
        const rows = mirror.searchProducts(q, { warehouseId, limit });
        return sendJson(res, 200, { rows }, origin);
      }

      if (req.method === 'GET' && pathname === '/mirror/parties') {
        const q = reqUrl.searchParams.get('q') || '';
        const type = reqUrl.searchParams.get('type') || null;
        const limit = Number(reqUrl.searchParams.get('limit') || 100);
        const rows = mirror.listParties({ query: q, type, limit });
        return sendJson(res, 200, { rows }, origin);
      }

      if (req.method === 'GET' && pathname.startsWith('/mirror/reference/')) {
        const key = pathname.slice('/mirror/reference/'.length);
        const value = mirror.getReference(key);
        return sendJson(res, 200, { key, value }, origin);
      }

      if (req.method === 'GET' && pathname === '/mirror/recent-invoices') {
        const limit = Number(reqUrl.searchParams.get('limit') || 50);
        return sendJson(res, 200, { rows: mirror.listRecentInvoices(limit) }, origin);
      }

      if (req.method === 'POST' && pathname === '/outbox/sales-invoice') {
        const body = await readJsonBody(req);
        const out = mirror.enqueueSalesInvoice(body.rpcParams || body, userId || body.userId || null);
        return sendJson(res, 200, out, origin);
      }

      if (req.method === 'POST' && pathname === '/outbox/payment') {
        const body = await readJsonBody(req);
        const out = mirror.enqueueBond(body.rpcParams || body, userId || body.userId || null);
        return sendJson(res, 200, out, origin);
      }

      if (req.method === 'POST' && pathname === '/outbox/requisition') {
        const body = await readJsonBody(req);
        const out = mirror.enqueueRequisition(body.rpcParams || body, userId || body.userId || null);
        return sendJson(res, 200, out, origin);
      }

      if (req.method === 'GET' && pathname === '/outbox/list') {
        const limit = Number(reqUrl.searchParams.get('limit') || 50);
        return sendJson(
          res,
          200,
          { rows: mirror.listOutbox(limit), stats: mirror.getStats() },
          origin
        );
      }

      if (req.method === 'POST' && pathname.startsWith('/outbox/retry/')) {
        const id = decodeURIComponent(pathname.slice('/outbox/retry/'.length));
        const ok = mirror.retryOutboxItem(id);
        return sendJson(res, ok ? 200 : 404, { ok }, origin);
      }

      if (req.method === 'POST' && pathname === '/sync/now') {
        const result = await syncWorker.runFullCycle(token, userId);
        return sendJson(res, 200, result, origin);
      }

      if (req.method === 'POST' && pathname === '/backup/run') {
        const result = await backupWorker.runBackup({ triggerType: 'manual', bearerToken: token, userId });
        return sendJson(res, 200, result, origin);
      }

      if (req.method === 'GET' && pathname === '/config/backup') {
        return sendJson(res, 200, loadRuntimeBackupConfig(config), origin);
      }

      if (req.method === 'POST' && pathname === '/config/backup') {
        const body = await readJsonBody(req);
        const saved = saveRuntimeBackupConfig(config, body);
        return sendJson(res, 200, saved, origin);
      }

      if (req.method === 'GET' && pathname === '/backup/status') {
        return sendJson(
          res,
          200,
          {
            isRunning: backupWorker.isRunning,
            driveConfigured: backupWorker.hasDriveCredentials(),
            backupDir: config.backupDir,
            lastRun: backupWorker.lastRun,
          },
          origin
        );
      }

      // Serve built SPA static assets from ../dist so LAN devices work 100% offline
      if (req.method === 'GET' && fs.existsSync(config.distDir)) {
        const distRoot = path.resolve(config.distDir);
        const rawRel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^[/\\]+/, '');
        let targetFile = path.resolve(distRoot, rawRel);
        if (targetFile !== distRoot && !targetFile.startsWith(distRoot + path.sep)) {
          return sendJson(res, 403, { error: 'forbidden_path' }, origin);
        }
        if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
          targetFile = path.join(distRoot, 'index.html');
        }
        if (fs.existsSync(targetFile)) {
          const ext = path.extname(targetFile).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
          fs.createReadStream(targetFile).pipe(res);
          return;
        }
      }

      return sendJson(res, 404, { error: 'not_found' }, origin);
    } catch (err) {
      const status = Number(err?.httpStatus) || (err instanceof SyntaxError ? 400 : 500);
      return sendJson(res, status, { error: err?.message || 'internal_error' }, origin);
    }
  });

  return server;
}

async function main() {
  const config = loadConfig();
  const mirror = new SqliteMirror(config.sqlitePath, config.branchCode);
  const syncWorker = new DeltaSyncWorker({ config, mirror });
  const backupWorker = new GoogleDriveBackupWorker({ config, mirror, syncWorker });

  if (process.argv.includes('--sync-once')) {
    const res = await syncWorker.runFullCycle();
    console.info('[Edge Sync]', JSON.stringify(res));
    mirror.close();
    return;
  }

  if (process.argv.includes('--backup-now')) {
    const res = await backupWorker.runBackup({ triggerType: 'manual' });
    console.info('[Edge Backup]', JSON.stringify(res));
    mirror.close();
    return;
  }

  const server = createEdgeServer({ config, mirror, syncWorker, backupWorker });
  server.listen(config.port, config.host, () => {
    console.info(
      `[AlNadary Edge ${config.branchCode}] Running on http://${config.host}:${config.port} (SQLite WAL: ${config.sqlitePath})`
    );
  });

  // Periodic background sync (every 2 minutes by default)
  const syncTimer = setInterval(() => {
    void syncWorker.runFullCycle();
  }, config.syncIntervalMs);
  syncTimer.unref?.();

  // Check every 60s whether scheduled daily/weekly/monthly backup hour:minute has arrived
  let lastBackupDay = '';
  const backupTimer = setInterval(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const runtimeCfg = loadRuntimeBackupConfig(config);
    if (!runtimeCfg.enabled) return;
    if (runtimeCfg.frequency === 'weekly' && now.getDay() !== 6) return;
    if (runtimeCfg.frequency === 'monthly' && now.getDate() !== 1) return;
    if (
      today !== lastBackupDay &&
      now.getHours() === runtimeCfg.cronHour &&
      now.getMinutes() >= runtimeCfg.cronMinute &&
      !backupWorker.isRunning
    ) {
      lastBackupDay = today;
      void backupWorker.runBackup({ triggerType: 'scheduled' }).catch(err => {
        console.error('[Edge Scheduled Backup Failed]', err?.message);
      });
    }
  }, 60_000);
  backupTimer.unref?.();

  const shutdown = () => {
    clearInterval(syncTimer);
    clearInterval(backupTimer);
    server.close(() => {
      mirror.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch(err => {
    console.error('[Edge Fatal]', err);
    process.exit(1);
  });
}
