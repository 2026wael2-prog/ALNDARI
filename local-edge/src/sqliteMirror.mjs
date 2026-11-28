/**
 * SQLite WAL + FTS5 Local Mirror & ACID Outbox Store (Node v24 native `node:sqlite`)
 * Keeps memory footprint tiny (< 25 MB SQLite page cache) while enabling < 15ms
 * search over 44,749+ spare parts and guaranteeing ACID persistence of offline operations.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { buildFtsMatchQuery, normalizeArabic } from './arabicNormalize.mjs';

export class SqliteMirror {
  /** @param {string} dbPath @param {string} branchCode */
  constructor(dbPath, branchCode = 'B1') {
    this.dbPath = dbPath;
    this.branchCode = (branchCode || 'B1').toUpperCase();
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -16000;
      PRAGMA temp_store = MEMORY;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS mirror_products (
        id TEXT PRIMARY KEY,
        name_ar TEXT NOT NULL,
        name_norm TEXT NOT NULL,
        sku TEXT DEFAULT '',
        part_number TEXT DEFAULT '',
        brand TEXT DEFAULT '',
        sale_price REAL DEFAULT 0,
        purchase_price REAL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        min_stock_level REAL DEFAULT 0,
        unit TEXT DEFAULT 'حبة',
        alternative_numbers TEXT DEFAULT '',
        barcode TEXT DEFAULT '',
        is_core INTEGER DEFAULT 0,
        updated_at TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS mirror_products_fts USING fts5(
        product_id UNINDEXED,
        name_norm,
        part_number,
        sku,
        brand,
        alternative_numbers,
        barcode
      );

      CREATE TABLE IF NOT EXISTS mirror_stock (
        product_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        weighted_avg_cost REAL NOT NULL DEFAULT 0,
        local_delta_qty REAL NOT NULL DEFAULT 0,
        updated_at TEXT,
        PRIMARY KEY (product_id, warehouse_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mirror_stock_wh ON mirror_stock (warehouse_id);

      CREATE TABLE IF NOT EXISTS mirror_parties (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_norm TEXT NOT NULL,
        type TEXT NOT NULL,
        phone TEXT DEFAULT '',
        credit_limit REAL DEFAULT 0,
        payment_terms_days INTEGER DEFAULT 0,
        balances_json TEXT NOT NULL DEFAULT '{}',
        local_delta_sar REAL NOT NULL DEFAULT 0,
        local_delta_yer REAL NOT NULL DEFAULT 0,
        local_delta_usd REAL NOT NULL DEFAULT 0,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mirror_parties_type ON mirror_parties (type);
      CREATE INDEX IF NOT EXISTS idx_mirror_parties_name ON mirror_parties (name_norm);

      CREATE TABLE IF NOT EXISTS mirror_reference (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mirror_recent_invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT,
        offline_reference TEXT,
        issue_date TEXT,
        party_id TEXT,
        party_name TEXT,
        payment_method TEXT,
        currency_code TEXT DEFAULT 'SAR',
        total_amount REAL DEFAULT 0,
        total_document_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'posted',
        payload_json TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mirror_recent_inv_date ON mirror_recent_invoices (issue_date DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS offline_outbox (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        offline_ref TEXT UNIQUE NOT NULL,
        entity_type TEXT NOT NULL,
        rpc_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        auth_user_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed_needs_review')),
        attempts INTEGER NOT NULL DEFAULT 0,
        official_id TEXT,
        official_ref TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON offline_outbox (status, created_at ASC);

      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        entity TEXT PRIMARY KEY,
        last_synced_at TEXT,
        row_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_sequence (
        seq_date TEXT PRIMARY KEY,
        last_seq INTEGER NOT NULL DEFAULT 0
      );
    `);

    const partyCols = this.db.prepare('PRAGMA table_info(mirror_parties)').all();
    if (!partyCols.some(c => c.name === 'local_delta_usd')) {
      this.db.exec('ALTER TABLE mirror_parties ADD COLUMN local_delta_usd REAL NOT NULL DEFAULT 0');
    }
    this.ensureFtsRowidAlignment();
    this.recoverStuckSyncing();
  }

  ensureFtsRowidAlignment() {
    const ftsCount = this.db.prepare('SELECT COUNT(*) AS c FROM mirror_products_fts').get()?.c || 0;
    const prodCount = this.db.prepare('SELECT COUNT(*) AS c FROM mirror_products').get()?.c || 0;
    const misaligned = this.db
      .prepare(
        `SELECT 1 FROM mirror_products_fts f
         LEFT JOIN mirror_products p ON p.rowid = f.rowid
         WHERE p.rowid IS NULL LIMIT 1`
      )
      .get();
    if (misaligned || (prodCount > 0 && ftsCount !== prodCount)) {
      this.runInTransaction(() => {
        this.db.exec('DELETE FROM mirror_products_fts');
        this.db.exec(`
          INSERT INTO mirror_products_fts (
            rowid, product_id, name_norm, part_number, sku, brand, alternative_numbers, barcode
          )
          SELECT rowid, id, name_norm, part_number, sku, brand, alternative_numbers, barcode
          FROM mirror_products
        `);
      });
    }
  }

  recoverStuckSyncing() {
    const res = this.db
      .prepare("UPDATE offline_outbox SET status = 'pending' WHERE status = 'syncing'")
      .run();
    return res.changes || 0;
  }

  close() {
    this.db.close();
  }

  runInTransaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  nextOfflineReference(dateStr) {
    const compactDate = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '').slice(0, 8);
    this.db
      .prepare(
        `INSERT INTO offline_sequence (seq_date, last_seq) VALUES (?, 1)
         ON CONFLICT(seq_date) DO UPDATE SET last_seq = offline_sequence.last_seq + 1`
      )
      .run(compactDate);
    const row = this.db.prepare('SELECT last_seq FROM offline_sequence WHERE seq_date = ?').get(compactDate);
    const seq = String(row?.last_seq ?? 1).padStart(4, '0');
    return `OFF-${this.branchCode}-${compactDate}-${seq}`;
  }

  upsertProducts(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const upsertMain = this.db.prepare(`
      INSERT INTO mirror_products (
        id, name_ar, name_norm, sku, part_number, brand, sale_price,
        purchase_price, cost_price, min_stock_level, unit, alternative_numbers,
        barcode, is_core, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name_ar = excluded.name_ar,
        name_norm = excluded.name_norm,
        sku = excluded.sku,
        part_number = excluded.part_number,
        brand = excluded.brand,
        sale_price = excluded.sale_price,
        purchase_price = excluded.purchase_price,
        cost_price = excluded.cost_price,
        min_stock_level = excluded.min_stock_level,
        unit = excluded.unit,
        alternative_numbers = excluded.alternative_numbers,
        barcode = excluded.barcode,
        is_core = excluded.is_core,
        updated_at = excluded.updated_at
    `);
    const getRowId = this.db.prepare('SELECT rowid FROM mirror_products WHERE id = ?');
    const deleteMain = this.db.prepare('DELETE FROM mirror_products WHERE id = ?');
    const deleteFtsByRowid = this.db.prepare('DELETE FROM mirror_products_fts WHERE rowid = ?');
    const insertFts = this.db.prepare(`
      INSERT INTO mirror_products_fts (
        rowid, product_id, name_norm, part_number, sku, brand, alternative_numbers, barcode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return this.runInTransaction(() => {
      for (const r of rows) {
        const strId = String(r.id);
        const existing = getRowId.get(strId);
        if (existing?.rowid) {
          deleteFtsByRowid.run(existing.rowid);
        }
        if (r.deleted_at) {
          deleteMain.run(strId);
          continue;
        }
        const nameAr = String(r.name_ar || '');
        const nameNorm = normalizeArabic(nameAr);
        const sku = String(r.sku || '');
        const partNumber = String(r.part_number || '');
        const brand = String(r.brand || '');
        const alt = String(r.alternative_numbers || '');
        const barcode = String(r.barcode || '');
        upsertMain.run(
          strId,
          nameAr,
          nameNorm,
          sku,
          partNumber,
          brand,
          Number(r.sale_price || 0),
          Number(r.purchase_price || 0),
          Number(r.cost_price || 0),
          Number(r.min_stock_level || 0),
          String(r.unit || 'حبة'),
          alt,
          barcode,
          r.is_core ? 1 : 0,
          r.updated_at ? String(r.updated_at) : null
        );
        const saved = existing?.rowid ? existing : getRowId.get(strId);
        if (saved?.rowid) {
          insertFts.run(
            saved.rowid,
            strId,
            nameNorm,
            normalizeArabic(partNumber),
            normalizeArabic(sku),
            normalizeArabic(brand),
            normalizeArabic(alt),
            normalizeArabic(barcode)
          );
        }
      }
      return rows.length;
    });
  }

  upsertStock(rows, { resetLocalDelta = false } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO mirror_stock (product_id, warehouse_id, quantity, weighted_avg_cost, local_delta_qty, updated_at)
      VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(product_id, warehouse_id) DO UPDATE SET
        quantity = excluded.quantity,
        weighted_avg_cost = excluded.weighted_avg_cost,
        local_delta_qty = ${resetLocalDelta ? '0' : 'mirror_stock.local_delta_qty'},
        updated_at = excluded.updated_at
    `);
    return this.runInTransaction(() => {
      for (const r of rows) {
        stmt.run(
          String(r.product_id),
          String(r.warehouse_id),
          Number(r.quantity || 0),
          Number(r.weighted_avg_cost || 0),
          r.updated_at ? String(r.updated_at) : null
        );
      }
      return rows.length;
    });
  }

  upsertParties(rows, { resetLocalDelta = false } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const deleteStmt = this.db.prepare('DELETE FROM mirror_parties WHERE id = ?');
    const stmt = this.db.prepare(`
      INSERT INTO mirror_parties (
        id, name, name_norm, type, phone, credit_limit, payment_terms_days,
        balances_json, local_delta_sar, local_delta_yer, local_delta_usd, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        name_norm = excluded.name_norm,
        type = excluded.type,
        phone = excluded.phone,
        credit_limit = excluded.credit_limit,
        payment_terms_days = excluded.payment_terms_days,
        balances_json = excluded.balances_json,
        local_delta_sar = ${resetLocalDelta ? '0' : 'mirror_parties.local_delta_sar'},
        local_delta_yer = ${resetLocalDelta ? '0' : 'mirror_parties.local_delta_yer'},
        local_delta_usd = ${resetLocalDelta ? '0' : 'mirror_parties.local_delta_usd'},
        updated_at = excluded.updated_at
    `);
    return this.runInTransaction(() => {
      for (const r of rows) {
        if (r.deleted_at) {
          deleteStmt.run(String(r.id));
          continue;
        }
        const name = String(r.name || '');
        const balancesStr =
          typeof r.balances_json === 'string'
            ? r.balances_json
            : JSON.stringify(r.balances_json || {});
        stmt.run(
          String(r.id),
          name,
          normalizeArabic(name),
          String(r.type || 'customer'),
          String(r.phone || ''),
          Number(r.credit_limit || 0),
          Number(r.payment_terms_days || 0),
          balancesStr,
          r.updated_at ? String(r.updated_at) : null
        );
      }
      return rows.length;
    });
  }

  upsertRecentInvoices(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO mirror_recent_invoices (
        id, invoice_number, offline_reference, issue_date, party_id, party_name,
        payment_method, currency_code, total_amount, total_document_amount, status, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        invoice_number = COALESCE(excluded.invoice_number, mirror_recent_invoices.invoice_number),
        offline_reference = COALESCE(excluded.offline_reference, mirror_recent_invoices.offline_reference),
        status = excluded.status,
        total_amount = excluded.total_amount,
        total_document_amount = excluded.total_document_amount
    `);
    return this.runInTransaction(() => {
      for (const r of rows) {
        stmt.run(
          String(r.id),
          r.invoice_number ? String(r.invoice_number) : null,
          r.offline_reference ? String(r.offline_reference) : null,
          r.issue_date ? String(r.issue_date) : null,
          r.party_id ? String(r.party_id) : null,
          r.party_name ? String(r.party_name) : null,
          r.payment_method ? String(r.payment_method) : null,
          String(r.currency_code || 'SAR'),
          Number(r.total_amount || 0),
          Number(r.total_document_amount ?? r.total_amount ?? 0),
          String(r.status || 'posted'),
          r.payload_json ? String(r.payload_json) : null,
          r.created_at ? String(r.created_at) : null
        );
      }
      return rows.length;
    });
  }

  setReference(key, value) {
    this.db
      .prepare(
        `INSERT INTO mirror_reference (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value ?? null), new Date().toISOString());
  }

  getReference(key) {
    const row = this.db.prepare('SELECT value_json FROM mirror_reference WHERE key = ?').get(key);
    if (!row) return null;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return null;
    }
  }

  setCheckpoint(entity, timestamp, rowCount = 0) {
    this.db
      .prepare(
        `INSERT INTO sync_checkpoints (entity, last_synced_at, row_count) VALUES (?, ?, ?)
         ON CONFLICT(entity) DO UPDATE SET last_synced_at = excluded.last_synced_at, row_count = excluded.row_count`
      )
      .run(entity, timestamp, rowCount);
  }

  getCheckpoint(entity) {
    return this.db.prepare('SELECT * FROM sync_checkpoints WHERE entity = ?').get(entity) || null;
  }

  resetAllLocalDeltas() {
    this.runInTransaction(() => {
      this.db.exec('UPDATE mirror_stock SET local_delta_qty = 0 WHERE local_delta_qty <> 0');
      this.db.exec(
        'UPDATE mirror_parties SET local_delta_sar = 0, local_delta_yer = 0, local_delta_usd = 0 WHERE local_delta_sar <> 0 OR local_delta_yer <> 0 OR local_delta_usd <> 0'
      );
    });
  }

  searchProducts(query, { warehouseId = null, limit = 30 } = {}) {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 30), 100);
    const ftsQuery = buildFtsMatchQuery(query);
    const clean = normalizeArabic(query);

    let productRows = [];
    if (ftsQuery) {
      try {
        productRows = this.db
          .prepare(
            `SELECT p.* FROM mirror_products p
             JOIN mirror_products_fts f ON f.rowid = p.rowid
             WHERE mirror_products_fts MATCH ?
             ORDER BY rank
             LIMIT ?`
          )
          .all(ftsQuery, safeLimit);
      } catch {
        productRows = [];
      }
    }

    if (productRows.length === 0 && clean) {
      const like = `%${clean}%`;
      productRows = this.db
        .prepare(
          `SELECT * FROM mirror_products
           WHERE name_norm LIKE ?
              OR UPPER(part_number) LIKE UPPER(?)
              OR UPPER(sku) LIKE UPPER(?)
              OR UPPER(alternative_numbers) LIKE UPPER(?)
              OR UPPER(barcode) LIKE UPPER(?)
              OR UPPER(brand) LIKE UPPER(?)
           ORDER BY name_ar ASC
           LIMIT ?`
        )
        .all(like, like, like, like, like, like, safeLimit);
    }

    if (productRows.length === 0) return [];

    const warehouses = this.getReference('warehouses') || [];
    const whMap = new Map(warehouses.map(w => [String(w.id), w]));
    const stockStmt = warehouseId
      ? this.db.prepare('SELECT warehouse_id, (quantity + local_delta_qty) AS qty FROM mirror_stock WHERE product_id = ? AND warehouse_id = ?')
      : this.db.prepare('SELECT warehouse_id, (quantity + local_delta_qty) AS qty FROM mirror_stock WHERE product_id = ?');

    return productRows.map(p => {
      const stockRows = warehouseId ? stockStmt.all(p.id, warehouseId) : stockStmt.all(p.id);
      return {
        id: p.id,
        name_ar: p.name_ar,
        sku: p.sku || '',
        part_number: p.part_number || '',
        brand: p.brand || '',
        sale_price: Number(p.sale_price || 0),
        purchase_price: Number(p.purchase_price || 0),
        alternative_numbers: p.alternative_numbers || undefined,
        is_core: Boolean(p.is_core),
        quantity: stockRows.map(s => {
          const wh = whMap.get(String(s.warehouse_id));
          return {
            quantity: Number(s.qty || 0),
            warehouse_id: s.warehouse_id,
            warehouses: wh ? { branch_id: wh.branch_id, name_ar: wh.name_ar } : null,
          };
        }),
      };
    });
  }

  listParties({ query = '', type = null, limit = 100 } = {}) {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 500);
    const clean = normalizeArabic(query);
    const clauses = [];
    const params = [];
    if (type) {
      clauses.push('type = ?');
      params.push(type);
    }
    if (clean) {
      clauses.push('(name_norm LIKE ? OR phone LIKE ?)');
      params.push(`%${clean}%`, `%${clean}%`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM mirror_parties ${where} ORDER BY name ASC LIMIT ?`)
      .all(...params, safeLimit);

    return rows.map(r => {
      let balances = {};
      try {
        balances = JSON.parse(r.balances_json || '{}');
      } catch {
        balances = {};
      }
      const sar = Number(balances.SAR || 0) + Number(r.local_delta_sar || 0);
      const yer = Number(balances.YER || 0) + Number(r.local_delta_yer || 0);
      const usd = Number(balances.USD || 0) + Number(r.local_delta_usd || 0);
      const mergedBalances = { ...balances, SAR: sar, YER: yer };
      if (usd !== 0 || balances.USD !== undefined) {
        mergedBalances.USD = usd;
      }
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        phone: r.phone || null,
        credit_limit: Number(r.credit_limit || 0),
        payment_terms_days: Number(r.payment_terms_days || 0),
        balances: mergedBalances,
      };
    });
  }

  listRecentInvoices(limit = 50) {
    return this.db
      .prepare('SELECT * FROM mirror_recent_invoices ORDER BY COALESCE(issue_date, created_at) DESC, created_at DESC LIMIT ?')
      .all(Math.min(Math.max(1, Number(limit) || 50), 200));
  }

  getDefaultBranchWarehouseId() {
    const warehouses = this.getReference('warehouses') || [];
    const primary = warehouses.find(w => w.is_primary) || warehouses[0];
    return primary?.id ? String(primary.id) : null;
  }

  /**
   * Atomically enqueues a Sales Invoice into offline_outbox, updates local stock & credit balance delta,
   * and records a recent invoice preview so the cashier can print immediately.
   */
  enqueueSalesInvoice(rpcPayload, authUserId = null) {
    const idempotencyKey =
      rpcPayload.p_idempotency_key || `${this.branchCode.toLowerCase()}_inv_${crypto.randomUUID()}`;

    const existing = this.db
      .prepare('SELECT * FROM offline_outbox WHERE idempotency_key = ?')
      .get(idempotencyKey);
    if (existing) {
      return {
        id: existing.id,
        offline_ref: existing.offline_ref,
        idempotency_key: existing.idempotency_key,
        status: existing.status,
        duplicate: true,
      };
    }

    const id = crypto.randomUUID();
    const issueDate = String(rpcPayload.p_invoice_date || new Date().toISOString().slice(0, 10));
    const offlineRef = this.nextOfflineReference(issueDate);
    const now = new Date().toISOString();
    const currency = String(rpcPayload.p_currency_code || 'SAR').toUpperCase();
    const exRate = Number(rpcPayload.p_exchange_rate || 1);
    const isCash = (rpcPayload.p_payment_type || 'cash') !== 'credit';
    const items = Array.isArray(rpcPayload.p_items) ? rpcPayload.p_items : [];
    const defaultWhId = this.getDefaultBranchWarehouseId();

    const docTotal = items.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      const disc = Number(item.discount_amount || 0);
      const taxRate = Number(item.tax_rate || 0);
      const net = Math.max(0, qty * price - disc);
      const tax = net * (taxRate / 100);
      return sum + net + tax;
    }, 0);
    const effRate = currency === 'YER' && exRate > 1 ? 1 / exRate : exRate > 0 ? exRate : 1;
    const baseTotal = Math.round(docTotal * effRate * 100) / 100;

    const payloadToStore = {
      ...rpcPayload,
      p_idempotency_key: idempotencyKey,
      p_notes: [rpcPayload.p_notes, `[مرجع محلي: ${offlineRef}]`].filter(Boolean).join(' '),
    };

    return this.runInTransaction(() => {
      this.db
        .prepare(
          `INSERT INTO offline_outbox (
            id, idempotency_key, offline_ref, entity_type, rpc_name, payload_json, auth_user_id, status, created_at
          ) VALUES (?, ?, ?, 'sales_invoice', 'commit_sales_invoice_v2', ?, ?, 'pending', ?)`
        )
        .run(id, idempotencyKey, offlineRef, JSON.stringify(payloadToStore), authUserId, now);

      const stockStmt = this.db.prepare(`
        INSERT INTO mirror_stock (product_id, warehouse_id, quantity, weighted_avg_cost, local_delta_qty, updated_at)
        VALUES (?, ?, 0, 0, ?, ?)
        ON CONFLICT(product_id, warehouse_id) DO UPDATE SET
          local_delta_qty = mirror_stock.local_delta_qty + excluded.local_delta_qty
      `);

      for (const item of items) {
        const whId = item.warehouse_id || defaultWhId;
        if (whId && item.product_id) {
          stockStmt.run(String(item.product_id), String(whId), -Math.abs(Number(item.quantity || 0)), now);
        }
      }

      let partyName = 'عميل نقدي';
      if (rpcPayload.p_party_id) {
        const partyRow = this.db
          .prepare('SELECT name FROM mirror_parties WHERE id = ?')
          .get(String(rpcPayload.p_party_id));
        if (partyRow?.name) partyName = partyRow.name;

        if (!isCash) {
          const unpaidDoc = Math.max(0, docTotal - Number(rpcPayload.p_paid_amount || 0));
          if (currency === 'YER') {
            this.db
              .prepare('UPDATE mirror_parties SET local_delta_yer = local_delta_yer + ? WHERE id = ?')
              .run(unpaidDoc, String(rpcPayload.p_party_id));
          } else if (currency === 'USD') {
            this.db
              .prepare('UPDATE mirror_parties SET local_delta_usd = local_delta_usd + ? WHERE id = ?')
              .run(unpaidDoc, String(rpcPayload.p_party_id));
          } else {
            const unpaidBase = Math.round(unpaidDoc * effRate * 100) / 100;
            this.db
              .prepare('UPDATE mirror_parties SET local_delta_sar = local_delta_sar + ? WHERE id = ?')
              .run(unpaidBase, String(rpcPayload.p_party_id));
          }
        }
      }

      this.db
        .prepare(
          `INSERT INTO mirror_recent_invoices (
            id, invoice_number, offline_reference, issue_date, party_id, party_name,
            payment_method, currency_code, total_amount, total_document_amount, status, payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline_queued', ?, ?)`
        )
        .run(
          id,
          offlineRef,
          offlineRef,
          issueDate,
          rpcPayload.p_party_id ? String(rpcPayload.p_party_id) : null,
          partyName,
          String(rpcPayload.p_payment_type || 'cash'),
          currency,
          baseTotal,
          Math.round(docTotal * 100) / 100,
          JSON.stringify(payloadToStore),
          now
        );

      return {
        id,
        offline_ref: offlineRef,
        invoice_number: offlineRef,
        idempotency_key: idempotencyKey,
        total_amount: baseTotal,
        total_document_amount: Math.round(docTotal * 100) / 100,
        status: 'offline_queued',
        duplicate: false,
      };
    });
  }

  enqueueBond(rpcPayload, authUserId = null) {
    const idempotencyKey =
      rpcPayload.p_idempotency_key || `${this.branchCode.toLowerCase()}_pay_${crypto.randomUUID()}`;

    const existing = this.db
      .prepare('SELECT * FROM offline_outbox WHERE idempotency_key = ?')
      .get(idempotencyKey);
    if (existing) {
      return {
        id: existing.id,
        offline_ref: existing.offline_ref,
        payment_number: existing.offline_ref,
        idempotency_key: existing.idempotency_key,
        status: existing.status,
        duplicate: true,
      };
    }

    const id = crypto.randomUUID();
    const dateStr = String(rpcPayload.p_date || new Date().toISOString().slice(0, 10));
    const offlineRef = this.nextOfflineReference(dateStr);
    const now = new Date().toISOString();
    const payloadToStore = {
      ...rpcPayload,
      p_idempotency_key: idempotencyKey,
      p_description: [rpcPayload.p_description, `[مرجع محلي: ${offlineRef}]`].filter(Boolean).join(' '),
    };

    return this.runInTransaction(() => {
      this.db
        .prepare(
          `INSERT INTO offline_outbox (
            id, idempotency_key, offline_ref, entity_type, rpc_name, payload_json, auth_user_id, status, created_at
          ) VALUES (?, ?, ?, 'bond', 'create_financial_bond', ?, ?, 'pending', ?)`
        )
        .run(id, idempotencyKey, offlineRef, JSON.stringify(payloadToStore), authUserId, now);

      if (rpcPayload.p_counterparty_type === 'party' && rpcPayload.p_counterparty_id) {
        const partyRow = this.db
          .prepare('SELECT type FROM mirror_parties WHERE id = ?')
          .get(String(rpcPayload.p_counterparty_id));
        const isSupplier = partyRow?.type === 'supplier';
        const currency = String(rpcPayload.p_currency_code || 'SAR').toUpperCase();
        const sign = isSupplier
          ? rpcPayload.p_bond_type === 'receipt'
            ? 1
            : -1
          : rpcPayload.p_bond_type === 'receipt'
            ? -1
            : 1;
        if (currency === 'YER') {
          const amt = Number(rpcPayload.p_foreign_amount || rpcPayload.p_amount || 0);
          this.db
            .prepare('UPDATE mirror_parties SET local_delta_yer = local_delta_yer + ? WHERE id = ?')
            .run(sign * amt, String(rpcPayload.p_counterparty_id));
        } else if (currency === 'USD') {
          const amt = Number(rpcPayload.p_foreign_amount || rpcPayload.p_amount || 0);
          this.db
            .prepare('UPDATE mirror_parties SET local_delta_usd = local_delta_usd + ? WHERE id = ?')
            .run(sign * amt, String(rpcPayload.p_counterparty_id));
        } else {
          const amt = Number(rpcPayload.p_amount || 0);
          this.db
            .prepare('UPDATE mirror_parties SET local_delta_sar = local_delta_sar + ? WHERE id = ?')
            .run(sign * amt, String(rpcPayload.p_counterparty_id));
        }
      }

      return {
        id,
        offline_ref: offlineRef,
        payment_number: offlineRef,
        idempotency_key: idempotencyKey,
        status: 'offline_queued',
        duplicate: false,
      };
    });
  }

  enqueueRequisition(rpcArgs, authUserId = null) {
    const idempotencyKey =
      rpcArgs?.p_data?.idempotency_key || `${this.branchCode.toLowerCase()}_req_${crypto.randomUUID()}`;

    const existing = this.db
      .prepare('SELECT * FROM offline_outbox WHERE idempotency_key = ?')
      .get(idempotencyKey);
    if (existing) {
      return {
        id: existing.id,
        offline_ref: existing.offline_ref,
        pr_number: existing.offline_ref,
        idempotency_key: existing.idempotency_key,
        status: existing.status,
        duplicate: true,
      };
    }

    const id = crypto.randomUUID();
    const offlineRef = this.nextOfflineReference(new Date().toISOString().slice(0, 10));
    const now = new Date().toISOString();
    const payloadToStore = {
      ...rpcArgs,
      p_data: {
        ...(rpcArgs?.p_data || {}),
        idempotency_key: idempotencyKey,
      },
    };

    this.db
      .prepare(
        `INSERT INTO offline_outbox (
          id, idempotency_key, offline_ref, entity_type, rpc_name, payload_json, auth_user_id, status, created_at
        ) VALUES (?, ?, ?, 'requisition', 'commit_sales_requisition', ?, ?, 'pending', ?)`
      )
      .run(id, idempotencyKey, offlineRef, JSON.stringify(payloadToStore), authUserId, now);

    return {
      id,
      offline_ref: offlineRef,
      pr_number: offlineRef,
      idempotency_key: idempotencyKey,
      status: 'offline_queued',
      duplicate: false,
    };
  }

  getPendingOutbox() {
    return this.db
      .prepare("SELECT * FROM offline_outbox WHERE status = 'pending' ORDER BY created_at ASC, rowid ASC")
      .all();
  }

  listOutbox(limit = 50) {
    return this.db
      .prepare('SELECT * FROM offline_outbox ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(Math.min(Math.max(1, Number(limit) || 50), 200));
  }

  markOutboxSyncing(id) {
    this.db
      .prepare("UPDATE offline_outbox SET status = 'syncing', attempts = attempts + 1 WHERE id = ?")
      .run(id);
  }

  markOutboxSynced(id, officialId, officialRef) {
    const now = new Date().toISOString();
    this.runInTransaction(() => {
      this.db
        .prepare(
          `UPDATE offline_outbox
           SET status = 'synced',
               official_id = ?,
               official_ref = ?,
               error_message = NULL,
               synced_at = ?
           WHERE id = ?`
        )
        .run(officialId ? String(officialId) : null, officialRef ? String(officialRef) : null, now, id);

      if (officialId && officialId !== id) {
        const prev = this.db.prepare('SELECT * FROM mirror_recent_invoices WHERE id = ?').get(id);
        if (prev) {
          this.db
            .prepare(
              `INSERT INTO mirror_recent_invoices (
                id, invoice_number, offline_reference, issue_date, party_id, party_name,
                payment_method, currency_code, total_amount, total_document_amount, status, payload_json, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                invoice_number = COALESCE(excluded.invoice_number, mirror_recent_invoices.invoice_number),
                offline_reference = COALESCE(excluded.offline_reference, mirror_recent_invoices.offline_reference),
                status = 'posted'`
            )
            .run(
              String(officialId),
              officialRef ? String(officialRef) : prev.invoice_number,
              prev.offline_reference,
              prev.issue_date,
              prev.party_id,
              prev.party_name,
              prev.payment_method,
              prev.currency_code,
              prev.total_amount,
              prev.total_document_amount,
              prev.payload_json,
              prev.created_at
            );
          this.db.prepare('DELETE FROM mirror_recent_invoices WHERE id = ?').run(id);
        }
      } else if (officialRef) {
        this.db
          .prepare(
            `UPDATE mirror_recent_invoices
             SET invoice_number = ?, status = 'posted'
             WHERE id = ?`
          )
          .run(String(officialRef), id);
      }
    });
  }

  markOutboxFailed(id, errorMessage, isFatal = false) {
    const nextStatus = isFatal ? 'failed_needs_review' : 'pending';
    this.db
      .prepare('UPDATE offline_outbox SET status = ?, error_message = ? WHERE id = ?')
      .run(nextStatus, String(errorMessage || 'Unknown sync error').slice(0, 1000), id);
  }

  retryOutboxItem(id) {
    const res = this.db
      .prepare("UPDATE offline_outbox SET status = 'pending', error_message = NULL WHERE id = ? AND status IN ('failed_needs_review', 'syncing')")
      .run(id);
    return res.changes > 0;
  }

  getStats() {
    const counts = this.db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM mirror_products) AS products_count,
          (SELECT COUNT(*) FROM mirror_stock) AS stock_count,
          (SELECT COUNT(*) FROM mirror_parties) AS parties_count,
          (SELECT COUNT(*) FROM offline_outbox WHERE status = 'pending') AS pending_outbox_count,
          (SELECT COUNT(*) FROM offline_outbox WHERE status = 'failed_needs_review') AS failed_outbox_count,
          (SELECT COUNT(*) FROM offline_outbox WHERE status = 'synced') AS synced_outbox_count`
      )
      .get();
    const lastMirror = this.db
      .prepare("SELECT MAX(last_synced_at) AS ts FROM sync_checkpoints")
      .get();

    return {
      productsCount: Number(counts?.products_count || 0),
      stockCount: Number(counts?.stock_count || 0),
      partiesCount: Number(counts?.parties_count || 0),
      pendingOutboxCount: Number(counts?.pending_outbox_count || 0),
      failedOutboxCount: Number(counts?.failed_outbox_count || 0),
      syncedOutboxCount: Number(counts?.synced_outbox_count || 0),
      lastMirrorSyncAt: lastMirror?.ts || null,
    };
  }
}
