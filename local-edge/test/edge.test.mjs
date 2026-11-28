import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import http from 'node:http';
import { SqliteMirror } from '../src/sqliteMirror.mjs';
import { DeltaSyncWorker } from '../src/deltaSyncWorker.mjs';
import { GoogleDriveBackupWorker } from '../src/googleDriveBackupWorker.mjs';
import { createEdgeServer } from '../src/server.mjs';
import { loadConfig, loadRuntimeBackupConfig } from '../src/config.mjs';

test('Arabic FTS5 search returns normalized spare parts quickly', () => {
  const mirror = new SqliteMirror(':memory:', 'B1');
  try {
    mirror.setReference('warehouses', [
      { id: 'wh-1', name_ar: 'ووائل المحل', is_primary: true, branch_id: 'b1' },
    ]);
    mirror.upsertProducts([
      {
        id: 'prod-1',
        name_ar: 'فحمات فرامل أمامي هايلكس أصلية',
        part_number: '04465-0K240',
        sku: 'SKU-1',
        brand: 'تويوتا',
        sale_price: 185,
        purchase_price: 130,
        alternative_numbers: '04465-0K360',
      },
      {
        id: 'prod-2',
        name_ar: 'فلتر زيت مكينة',
        part_number: '90915-YZZD2',
        sku: 'SKU-2',
        brand: 'دنسو',
        sale_price: 25,
        purchase_price: 14,
      },
    ]);
    mirror.upsertStock([{ product_id: 'prod-1', warehouse_id: 'wh-1', quantity: 10 }]);

    // Normalized Arabic search (أصلية vs اصليه, أمامي vs امامي)
    const byArabic = mirror.searchProducts('فحمات امامي اصليه');
    assert.equal(byArabic.length, 1);
    assert.equal(byArabic[0].id, 'prod-1');
    assert.equal(byArabic[0].quantity[0].quantity, 10);

    // Search by part number
    const byPart = mirror.searchProducts('04465-0K240');
    assert.equal(byPart.length, 1);
    assert.equal(byPart[0].part_number, '04465-0K240');
  } finally {
    mirror.close();
  }
});

test('Offline invoice enqueue updates stock & party balance delta and enforces idempotency', () => {
  const mirror = new SqliteMirror(':memory:', 'B1');
  try {
    mirror.setReference('warehouses', [
      { id: 'wh-1', name_ar: 'ووائل المحل', is_primary: true, branch_id: 'b1' },
    ]);
    mirror.upsertProducts([
      { id: 'p-1', name_ar: 'بوجيه إشعال', part_number: 'SK20R11', sale_price: 50 },
    ]);
    mirror.upsertStock([{ product_id: 'p-1', warehouse_id: 'wh-1', quantity: 12 }]);
    mirror.upsertParties([
      {
        id: 'cust-1',
        name: 'ورشة النجم',
        type: 'customer',
        balances_json: { SAR: 1000, YER: 0 },
      },
    ]);

    const payload = {
      p_party_id: 'cust-1',
      p_invoice_date: '2026-11-28',
      p_payment_type: 'credit',
      p_currency_code: 'SAR',
      p_exchange_rate: 1,
      p_paid_amount: 50,
      p_idempotency_key: 'b1_inv_fixed_key',
      p_items: [{ product_id: 'p-1', quantity: 3, unit_price: 50, tax_rate: 0 }],
    };

    const first = mirror.enqueueSalesInvoice(payload, 'user-1');
    assert.match(first.offline_ref, /^OFF-B1-20261128-0001$/);
    assert.equal(first.duplicate, false);
    assert.equal(first.total_amount, 150);

    // Replay same idempotency_key must not double-enqueue or double-decrement stock
    const second = mirror.enqueueSalesInvoice(payload, 'user-1');
    assert.equal(second.duplicate, true);
    assert.equal(second.offline_ref, first.offline_ref);

    const prod = mirror.searchProducts('SK20R11')[0];
    assert.equal(prod.quantity[0].quantity, 9); // 12 - 3

    const party = mirror.listParties({ query: 'ورشة النجم' })[0];
    assert.equal(party.balances.SAR, 1100); // 1000 + (150 - 50 unpaid)
  } finally {
    mirror.close();
  }
});

test('FIFO outbox replay syncs valid items, stops cleanly on 5xx, and flags fatal 422 for review', async () => {
  const mirror = new SqliteMirror(':memory:', 'B1');
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    calls.push({ url: req.url, body });

    if (req.url?.includes('/rpc/commit_sales_invoice_v2')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify('official-inv-uuid'));
      return;
    }
    if (req.url?.includes('/rest/v1/invoices')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ id: 'official-inv-uuid', invoice_number: 'INV-B1-0099' }]));
      return;
    }
    if (req.url?.includes('/rpc/create_financial_bond')) {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: '23514', message: 'تجاوز سقف التحقق' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server_time: '2026-11-28T00:00:00Z', has_more: false, rows: [], data: {} }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const config = loadConfig({
      supabaseUrl: `http://127.0.0.1:${port}`,
      supabaseAnonKey: 'anon-test',
    });
    const syncWorker = new DeltaSyncWorker({ config, mirror });
    syncWorker.setBearerToken('user.jwt.token.placeholder.123456789');

    const inv = mirror.enqueueSalesInvoice({
      p_invoice_date: '2026-11-28',
      p_items: [{ product_id: 'p1', quantity: 1, unit_price: 20 }],
    });
    const bond = mirror.enqueueBond({
      p_bond_type: 'receipt',
      p_amount: 100,
      p_date: '2026-11-28',
    });

    const result = await syncWorker.replayOutbox();
    assert.equal(result.synced, 1);
    assert.equal(result.failed, 1);

    const outbox = mirror.listOutbox();
    const invRow = outbox.find(r => r.id === inv.id);
    const bondRow = outbox.find(r => r.id === bond.id);
    assert.equal(invRow.status, 'synced');
    assert.equal(invRow.official_ref, 'INV-B1-0099');
    assert.equal(bondRow.status, 'failed_needs_review');
    assert.ok(mirror.retryOutboxItem(bond.id));
    assert.equal(mirror.getPendingOutbox().length, 1);
  } finally {
    server.close();
    mirror.close();
  }
});

test('Streaming gzip + SHA-256 backup works offline & over HTTP gateway', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alndari-edge-test-'));
  const config = loadConfig({
    dataDir: path.join(tmpDir, 'data'),
    sqlitePath: path.join(tmpDir, 'data', 'test.sqlite'),
    backupDir: path.join(tmpDir, 'backups'),
  });
  const mirror = new SqliteMirror(config.sqlitePath, 'B1');
  mirror.upsertProducts([{ id: 'p-1', name_ar: 'سير مكينة', part_number: 'B-100', sale_price: 40 }]);
  const syncWorker = new DeltaSyncWorker({ config, mirror });
  const backupWorker = new GoogleDriveBackupWorker({ config, mirror, syncWorker });
  const server = createEdgeServer({ config, mirror, syncWorker, backupWorker });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const healthResp = await fetch(`http://127.0.0.1:${port}/health`);
    const health = await healthResp.json();
    assert.equal(health.ok, true);
    assert.equal(health.branchCode, 'B1');
    assert.equal(health.productsCount, 1);

    const runSummary = await backupWorker.runBackup({ triggerType: 'manual' });
    assert.equal(runSummary.status, 'success');
    assert.ok(fs.existsSync(runSummary.local_path));

    const gzBuf = fs.readFileSync(runSummary.local_path);
    const expectedSha = crypto.createHash('sha256').update(gzBuf).digest('hex');
    assert.equal(runSummary.sha256, expectedSha);

    const parsed = JSON.parse(zlib.gunzipSync(gzBuf).toString('utf8'));
    assert.equal(parsed.branchCode, 'B1');
    assert.equal(parsed.tables.mirror_products.length, 1);
  } finally {
    server.close();
    mirror.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Crash recovery resets syncing rows, 401 stays pending, and recent_invoices avoids duplicates', async () => {
  const mirror = new SqliteMirror(':memory:', 'B1');
  const inv = mirror.enqueueSalesInvoice({
    p_invoice_date: '2026-11-28',
    p_items: [{ product_id: 'p1', quantity: 2, unit_price: 30 }],
  });
  mirror.markOutboxSyncing(inv.id);
  assert.equal(mirror.getPendingOutbox().length, 0);

  // Simulate restart crash recovery
  const recovered = mirror.recoverStuckSyncing();
  assert.equal(recovered, 1);
  assert.equal(mirror.getPendingOutbox().length, 1);

  // HTTP 401 / 42501 Authentication required must keep item pending (NOT failed_needs_review)
  let attempts = 0;
  const server = http.createServer(async (req, res) => {
    attempts += 1;
    if (req.url?.includes('/rpc/commit_sales_invoice_v2')) {
      if (attempts === 1) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: '42501', message: 'Authentication required' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify('official-uuid-999'));
      return;
    }
    if (req.url?.includes('/rest/v1/invoices')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ id: 'official-uuid-999', invoice_number: 'INV-B1-2026-0099' }]));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const config = loadConfig({
      supabaseUrl: `http://127.0.0.1:${server.address().port}`,
      supabaseAnonKey: 'anon-test',
    });
    const syncWorker = new DeltaSyncWorker({ config, mirror });
    syncWorker.setBearerToken('expired.jwt.token.placeholder.123456', 'user-1');

    const firstTry = await syncWorker.replayOutbox();
    assert.equal(firstTry.synced, 0);
    assert.equal(mirror.getPendingOutbox().length, 1);
    assert.equal(mirror.listOutbox()[0].status, 'pending');

    // Fresh token recovers and promotes recent_invoices row ID without creating duplicate
    syncWorker.setBearerToken('fresh.jwt.token.placeholder.123456', 'user-1');
    const secondTry = await syncWorker.replayOutbox();
    assert.equal(secondTry.synced, 1);

    mirror.upsertRecentInvoices([
      {
        id: 'official-uuid-999',
        invoice_number: 'INV-B1-2026-0099',
        issue_date: '2026-11-28',
        status: 'posted',
        total_amount: 60,
      },
    ]);
    assert.equal(mirror.listRecentInvoices(10).length, 1);
    assert.equal(mirror.listRecentInvoices(10)[0].id, 'official-uuid-999');
  } finally {
    server.close();
    mirror.close();
  }
});

test('Soft-delete tombstones, USD/supplier delta math, security guards, and Drive pruning work', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alndari-edge-sec-'));
  const config = loadConfig({
    dataDir: path.join(tmpDir, 'data'),
    sqlitePath: path.join(tmpDir, 'data', 'sec.sqlite'),
    backupDir: path.join(tmpDir, 'backups'),
    distDir: path.join(tmpDir, 'dist'),
    edgeSharedSecret: 'secret-b1-token',
  });
  fs.mkdirSync(config.distDir, { recursive: true });
  fs.writeFileSync(path.join(config.distDir, 'index.html'), '<h1>OK</h1>', 'utf8');

  const mirror = new SqliteMirror(config.sqlitePath, 'B1');
  mirror.upsertProducts([
    { id: 'p-live', name_ar: 'شمعات احتراق', part_number: 'P-1', sale_price: 20 },
    { id: 'p-del', name_ar: 'محذوف', part_number: 'P-DEL', sale_price: 10, deleted_at: '2026-11-28T09:00:00Z' },
  ]);
  assert.equal(mirror.searchProducts('محذوف').length, 0);

  mirror.upsertParties([
    { id: 'sup-1', name: 'شركة المورد الأول', type: 'supplier', balances_json: { SAR: 500, USD: 100 } },
    { id: 'cust-del', name: 'عميل محذوف', type: 'customer', deleted_at: '2026-11-28T09:00:00Z' },
  ]);
  assert.equal(mirror.listParties({ query: 'محذوف' }).length, 0);

  // Payment voucher to supplier decreases supplier balance; USD handled separately
  mirror.enqueueBond({
    p_bond_type: 'disbursement',
    p_counterparty_type: 'party',
    p_counterparty_id: 'sup-1',
    p_currency_code: 'USD',
    p_foreign_amount: 40,
    p_amount: 150,
    p_date: '2026-11-28',
  });
  const supAfter = mirror.listParties({ query: 'المورد' })[0];
  assert.equal(supAfter.balances.USD, 60);
  assert.equal(supAfter.balances.SAR, 500);

  const deletedDriveIds = [];
  const backupWorker = new GoogleDriveBackupWorker({
    config: {
      ...config,
      gdriveClientId: 'cid',
      gdriveClientSecret: 'csec',
      gdriveRefreshToken: 'rtok',
    },
    mirror,
    syncWorker: new DeltaSyncWorker({ config, mirror }),
    fetchImpl: async (url, init = {}) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'mock-access' }), { status: 200 });
      }
      if (u.includes('files?q=') && u.includes('vnd.google-apps.folder')) {
        return new Response(JSON.stringify({ files: [{ id: 'folder-1', name: '2026-10' }] }), { status: 200 });
      }
      if (u.includes('files?q=')) {
        return new Response(
          JSON.stringify({
            files: [
              { id: 'old-id', name: 'AlNadary_B1_2026-09-10_2330.json.gz', createdTime: '2026-09-10T23:30:00Z' },
              { id: 'monthly-keep', name: 'AlNadary_B1_2026-09-01_2330.json.gz', createdTime: '2026-09-01T23:30:00Z' },
            ],
          }),
          { status: 200 }
        );
      }
      if (init.method === 'DELETE') {
        deletedDriveIds.push(u.split('/').pop());
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    },
  });

  const pruned = await backupWorker.pruneOldDriveBackups('mock-access', 'root-1', 30);
  assert.equal(pruned, 1);
  assert.deepEqual(deletedDriveIds, ['old-id']);

  const syncWorker = new DeltaSyncWorker({ config, mirror });
  const server = createEdgeServer({ config, mirror, syncWorker, backupWorker });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Disallowed Origin blocked -> 403
    const evilOrigin = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(evilOrigin.status, 403);

    // Missing X-Edge-Secret -> 401
    const unauth = await fetch(`${baseUrl}/outbox/list`);
    assert.equal(unauth.status, 401);

    // Wrong Content-Type CSRF -> 415
    const csrfPost = await fetch(`${baseUrl}/config/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-Edge-Secret': 'secret-b1-token' },
      body: '{"enabled":false}',
    });
    assert.equal(csrfPost.status, 415);

    // Authorized runtime config persistence
    const saveCfg = await fetch(`${baseUrl}/config/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Edge-Secret': 'secret-b1-token' },
      body: JSON.stringify({ enabled: true, frequency: 'weekly', retentionDays: 45 }),
    });
    assert.equal(saveCfg.status, 200);
    assert.equal(loadRuntimeBackupConfig(config).frequency, 'weekly');
    assert.equal(loadRuntimeBackupConfig(config).retentionDays, 45);
  } finally {
    server.close();
    mirror.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
