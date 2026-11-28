import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

describe('Wave 41 & Wave 42 SQL Migration Contracts', () => {
  const wave41Path = path.join(
    migrationsDir,
    '20261126170000_wave41_remediate_rpc_overloads_bond_accounting_and_branch_isolation.sql'
  );
  const wave42Path = path.join(
    migrationsDir,
    '20261126173000_wave42_db_indexes_dedup_precision_and_search_optimization.sql'
  );

  it('Wave 41 drops colliding RPC overloads and avoids brittle pg_get_functiondef patching', () => {
    const sql = fs.readFileSync(wave41Path, 'utf8');
    const executableSql = sql
      .split(/\r?\n/)
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // DB-09: never patch functions dynamically via string replace on pg_get_functiondef
    expect(executableSql).not.toMatch(/pg_get_functiondef/i);

    // DB-01..DB-06: colliding overloads are explicitly dropped
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.create_financial_bond\(/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.post_manual_journal\(/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.report_account_balances\(uuid,\s*uuid,\s*date\)/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.generate_invoice_number\(uuid,\s*text\)/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.get_top_selling_products\(uuid,\s*integer,\s*integer\)/i);

    // DB-06 & DB-08: branch isolation enforced via fn_resolve_authorized_branch
    const branchCalls = sql.match(/fn_resolve_authorized_branch\s*\(/g) ?? [];
    expect(branchCalls.length).toBeGreaterThanOrEqual(4);

    // DB-09: explicit canonical update_sales_invoice_v2 definition
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.update_sales_invoice_v2\(/i);
  });

  it('Wave 42 adds composite indexes, deduplicates redundant indexes, and widens FX precision', () => {
    const sql = fs.readFileSync(wave42Path, 'utf8');

    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_jel_company_branch_account_active/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_payments_company_ref_active/i);
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.idx_fk_invoices_company_account/i);
    expect(sql).toMatch(/ALTER COLUMN exchange_rate TYPE numeric\(19,\s*6\)/i);
    expect(sql).toMatch(/ALTER COLUMN foreign_amount TYPE numeric\(19,\s*4\)/i);
    expect(sql).toMatch(/item_agg AS \(/i);
  });

  it('Wave 49 syncs currency, exchange_rate, and totals atomically in update_sales_invoice_v2', () => {
    const wave49Path = path.join(
      migrationsDir,
      '20261128150000_wave49_fix_update_sales_invoice_currency_conversion.sql'
    );
    const sql = fs.readFileSync(wave49Path, 'utf8');
    const executableSql = sql
      .split(/\r?\n/)
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    expect(executableSql).not.toMatch(/pg_get_functiondef/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.update_sales_invoice_v2\(/i);
    expect(sql).toMatch(/v_resolved_payment_account_id/);
    expect(sql).toMatch(/v_effective_due_date/);

    const step11bMatch = sql.match(
      /IF v_currency <> v_old_currency[\s\S]*?UPDATE public\.invoices[\s\S]*?WHERE id = p_invoice_id;/
    );
    expect(step11bMatch).not.toBeNull();
    expect(step11bMatch?.[0]).toMatch(/total_document_amount\s*=\s*v_doc_total/);
    expect(step11bMatch?.[0]).toMatch(/total_amount\s*=\s*v_base_total/);
    expect(step11bMatch?.[0]).toMatch(/currency_code\s*=\s*v_currency/);
    expect(step11bMatch?.[0]).toMatch(/exchange_rate\s*=\s*v_eff_rate/);
  });

  it('Wave 50 adds merge_sales_invoices_v1, bulk_convert_sales_invoices_currency_v1, and get_item_movements_with_balance_v2', () => {
    const wave50Path = path.join(
      migrationsDir,
      '20261128160000_wave50_merge_invoices_bulk_currency_and_movement_refs.sql'
    );
    const sql = fs.readFileSync(wave50Path, 'utf8');
    const executableSql = sql
      .split(/\r?\n/)
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    expect(executableSql).not.toMatch(/pg_get_functiondef/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.merge_sales_invoices_v1\(/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bulk_convert_sales_invoices_currency_v1\(/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_item_movements_with_balance_v2\(/i);
    expect(sql).toMatch(/reference_id\s+uuid/i);
    expect(sql).toMatch(/doc_type\s+text/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,\s*anon/i);
  });

  it('keeps supabase/migrations strictly free of non-SQL documentation files', () => {
    const nonSqlFiles = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && !entry.name.endsWith('.sql'))
      .map(entry => entry.name);

    expect(nonSqlFiles).toEqual([]);
  });
});
