import { supabase } from '../../../lib/supabaseClient';
import type { InventoryIntelligenceSnapshot } from '../types';
import { aggregateFallbackSnapshot, type FallbackRawInputs } from './fallbackAggregator';

const PAGE_SIZE = 1000;

async function fetchPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function getInventorySummary(
  companyId: string,
  lookbackDays = 365,
  branchId?: string | null
) {
  const { data, error } = await (supabase.rpc as Function)(
    'fn_get_inventory_intelligence_summary',
    {
      p_company_id: companyId,
      p_lookback_days: lookbackDays,
      p_branch_id: branchId ?? null,
    }
  );
  if (error) throw new Error(error.message || 'تعذر تحميل ملخص ذكاء المخزون');
  return data;
}

export async function getInventoryProductsPage(
  companyId: string,
  opts: { lookbackDays?: number; branchId?: string | null; search?: string | null; limit?: number; offset?: number } = {}
) {
  const { data, error } = await (supabase.rpc as Function)(
    'fn_get_inventory_intelligence_products_page',
    {
      p_company_id: companyId,
      p_lookback_days: opts.lookbackDays ?? 365,
      p_branch_id: opts.branchId ?? null,
      p_search: opts.search ?? null,
      p_limit: opts.limit ?? 50,
      p_offset: opts.offset ?? 0,
    }
  );
  if (error) throw new Error(error.message || 'تعذر تحميل صفحة منتجات ذكاء المخزون');
  return data;
}

export async function getInventorySnapshot(
  companyId: string,
  lookbackDays = 365
): Promise<InventoryIntelligenceSnapshot> {
  const { data, error } = await (supabase.rpc as Function)(
    'fn_get_inventory_intelligence_snapshot',
    {
      p_company_id: companyId,
      p_lookback_days: lookbackDays,
    }
  );

  if (!error && data) {
    return data as InventoryIntelligenceSnapshot;
  }

  const isMissingRpc =
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    (error?.message ?? '').includes('Could not find the function');

  if (error && !isMissingRpc) {
    throw new Error(error.message || 'تعذر تحميل لقطة ذكاء المخزون من الخادم');
  }

  const [branchesRes, warehousesRes, products, stockRows, salesRows, suppliersRes, openPoRes, crossRefRes] =
    await Promise.all([
      supabase
        .from('branches')
        .select('id, name, code, is_main')
        .eq('company_id', companyId)
        .order('is_main', { ascending: false }),
      supabase
        .from('warehouses')
        .select('id, branch_id, name_ar, is_primary')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      fetchPaginated<Record<string, unknown>>((from, to) =>
        supabase
          .from('products')
          .select(
            'id, name_ar, sku, part_number, alternative_numbers, brand, item_type, min_stock_level, cost_price, purchase_price, sale_price, category_id'
          )
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .neq('item_type', 'service')
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchPaginated<Record<string, unknown>>((from, to) =>
        supabase
          .from('product_stock')
          .select('product_id, warehouse_id, quantity, weighted_avg_cost')
          .eq('company_id', companyId)
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchPaginated<Record<string, unknown>>((from, to) =>
        supabase
          .from('invoice_items')
          .select(
            'product_id, quantity, unit_price, cost_price, total, invoice:invoices!inner(id, company_id, branch_id, type, status, issue_date, party_id, deleted_at)'
          )
          .eq('invoice.company_id', companyId)
          .is('invoice.deleted_at', null)
          .in('invoice.status', ['posted', 'paid', 'partially_paid'])
          .gte(
            'invoice.issue_date',
            new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10)
          )
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchPaginated<Record<string, unknown>>((from, to) =>
        supabase
          .from('parties')
          .select('id, name')
          .eq('company_id', companyId)
          .in('type', ['supplier', 'both'])
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchPaginated<Record<string, unknown>>((from, to) =>
        supabase
          .from('prc_purchase_order_items')
          .select('product_id, quantity, received_quantity, po:prc_purchase_orders!inner(company_id, status, expected_delivery_date)')
          .eq('po.company_id', companyId)
          .in('po.status', ['approved', 'issued', 'confirmed', 'partially_received'])
          .order('po_item_id', { ascending: true })
          .range(from, to)
      ),
      fetchPaginated<Record<string, unknown>>((from, to) =>
        (supabase as unknown as { from: (t: string) => any })
          .from('product_cross_references')
          .select('id, base_product_id, alternative_product_id, match_quality, relationship_type, status, confidence, source, notes')
          .eq('company_id', companyId)
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

  return aggregateFallbackSnapshot({
    branchesRaw: (branchesRes.data ?? []) as FallbackRawInputs['branchesRaw'],
    warehousesRaw: (warehousesRes.data ?? []) as FallbackRawInputs['warehousesRaw'],
    productsRaw: products,
    stockRows,
    salesRows,
    suppliersRaw: suppliersRes as unknown as FallbackRawInputs['suppliersRaw'],
    openPoRaw: openPoRes as unknown as FallbackRawInputs['openPoRaw'],
    crossRefsRaw: crossRefRes as unknown as FallbackRawInputs['crossRefsRaw'],
  });
}
