import { logger } from '../../../../core/utils/logger';
/**
 * POS Smart Search — database-backed lookups (RPC, ILIKE fallback, barcode).
 */
import { supabase } from '../../../../lib/supabaseClient';
import { scoreSearchResult } from '../../../../core/utils/search';
import { buildEqOrFilter, buildIlikeOrFilter } from '../../../../core/utils/postgrestFilter';
import type { BarcodeSearchRow, POSSearchFilters, POSSearchResult } from './types';

/** Stock entry nested inside a search row. */
interface SearchStockRow {
  quantity: number | string;
  warehouse_id: string;
  branch_id?: string | null;
  warehouses?: { name_ar?: string; branch_id?: string | null } | null;
}

/** Row shape returned by the `search_inventory_paginated` RPC. */
interface RpcSearchRow {
  id: string;
  name_ar: string | null;
  sku: string | null;
  part_number: string | null;
  brand: string | null;
  category_id: string | null;
  size: string | null;
  sale_price: number | string | null;
  purchase_price: number | string | null;
  unit: string | null;
  image_url: string | null;
  alternative_numbers: string | null;
  barcode: string | null;
  stock?: SearchStockRow[] | null;
  category?: { name?: string } | null;
  [key: string]: unknown;
}

/** Row shape returned by the ILIKE fallback query on `products`. */
interface FallbackSearchRow {
  id: string;
  name_ar: string | null;
  sku: string | null;
  part_number: string | null;
  brand: string | null;
  category_id: string | null;
  size: string | null;
  sale_price: number | string | null;
  purchase_price: number | string | null;
  unit: string | null;
  image_url: string | null;
  alternative_numbers: string | null;
  barcode: string | null;
  product_stock?: SearchStockRow[] | null;
  product_categories?: { name?: string } | null;
  [key: string]: unknown;
}

/**
 * Apply client-side POS filters (category / stock / brand) on RPC results.
 * The paginated RPC does not accept filter parameters, so this keeps the UI
 * requirements honoured while still benefiting from server-side search.
 */
function applyClientFilters(
  results: POSSearchResult[],
  filters?: POSSearchFilters
): POSSearchResult[] {
  if (!filters) return results;

  let filtered = results;
  if (filters.category_id !== undefined && filters.category_id !== '') {
    const wanted = filters.category_id;
    filtered = filtered.filter(r => r.category_id === wanted);
  }
  if (filters.min_stock != null && filters.min_stock > 0) {
    const min = filters.min_stock;
    // `stock_quantity` is a required number on POSSearchResult, so no ?? guard.
    filtered = filtered.filter(r => r.stock_quantity >= min);
  }
  if (filters.in_stock_only === true) {
    filtered = filtered.filter(r => r.stock_quantity > 0);
  }
  if (filters.brand !== undefined && filters.brand !== '') {
    const wantedBrand = filters.brand.toLowerCase();
    filtered = filtered.filter(r => (r.brand ?? '').toLowerCase().includes(wantedBrand));
  }
  return filtered;
}

/**
 * Search the database using the smart search RPC function.
 */
export async function searchDatabase(
  companyId: string,
  query: string,
  filters?: POSSearchFilters,
  limit = 20,
  branchId?: string | null
): Promise<POSSearchResult[]> {
  try {
    // Use the paginated search RPC for server-side normalized search
    const { data, error } = await supabase.rpc('search_inventory_paginated', {
      p_company_id: companyId,
      p_term: query,
      p_limit: limit,
      p_offset: 0,
      p_sort_key: 'updated_at',
      p_sort_dir: 'desc',
      ...(branchId ? { p_branch_id: branchId } : {}),
    });

    if (error) {
      logger.warn('database', 'POS Search RPC error, falling back to ILIKE:', error.message);
      return searchDatabaseFallback(companyId, query, filters, limit, branchId);
    }

    // Optimize: Skip fetching sales counts on every keystroke to resolve search slowness.
    // This avoids executing a heavy nested join query on invoice_items.
    const salesCounts = new Map<string, { count: number; last_date: string }>();

    const targetWarehouseId = filters?.warehouse_id;
    const results = ((data || []) as unknown as RpcSearchRow[]).map(row => {
      const stockList = Array.isArray(row.stock) ? row.stock : [];
      const scopedStock = targetWarehouseId
        ? stockList.filter(s => s.warehouse_id === targetWarehouseId)
        : branchId
          ? stockList.filter(s => {
              const bId = s.branch_id ?? s.warehouses?.branch_id;
              return !bId || bId === branchId;
            })
          : stockList;
      const totalStock = scopedStock.reduce(
        (sum: number, s: SearchStockRow) => sum + (Number(s.quantity) || 0),
        0
      );

      const salesInfo = salesCounts.get(row.id);

      return {
        id: row.id,
        type: 'product' as const,
        name: row.name_ar || '',
        name_ar: row.name_ar || '',
        sku: row.sku || '',
        part_number: row.part_number || '',
        brand: row.brand || '',
        category: row.category?.name || '',
        category_id: row.category_id || '',
        size: row.size || '',
        selling_price: Number(row.sale_price) || 0,
        cost_price: Number(row.purchase_price) || 0,
        stock_quantity: totalStock,
        unit: row.unit || 'pcs',
        image_url: row.image_url || null,
        alternative_numbers: row.alternative_numbers || null,
        barcode: row.barcode || null,
        warehouse_distribution: stockList.map((s: SearchStockRow) => ({
          warehouse_id: s.warehouse_id,
          warehouse_name: s.warehouses?.name_ar || '',
          quantity: Number(s.quantity) || 0,
        })),
        score: scoreSearchResult(
          query,
          {
            name_ar: row.name_ar || '',
            sku: row.sku || '',
            part_number: row.part_number || '',
            brand: row.brand || '',
            alternative_numbers: row.alternative_numbers || '',
          },
          salesInfo?.count,
          salesInfo?.last_date
        ),
        ...(salesInfo ? { sales_count: salesInfo.count, last_sale_date: salesInfo.last_date } : {}),
        match_type: 'exact' as const,
      };
    });

    return applyClientFilters(results, filters);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('database', 'POS Search failed, using fallback:', errMsg);
    return searchDatabaseFallback(companyId, query, filters, limit, branchId);
  }
}

/**
 * Fallback search using ILIKE when RPC is unavailable.
 */
export async function searchDatabaseFallback(
  companyId: string,
  query: string,
  _filters?: POSSearchFilters,
  limit = 20,
  branchId?: string | null
): Promise<POSSearchResult[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `
            id, name_ar, sku, part_number, brand, size, sale_price,
            purchase_price, unit, image_url, alternative_numbers, barcode,
            category_id, product_categories!inner(name),
            product_stock(quantity, warehouse_id, warehouses(name_ar, branch_id))
        `
    )
    .eq('company_id', companyId)
    .eq('status', 'active')
    // [FIX] buildIlikeOrFilter يلفّ النمط بعلامتي اقتباس — الفاصلة/الأقواس في
    // مدخل المستخدم كانت تكسر صيغة or() فيرمي PostgREST خطأ 400 ويتوقف
    // البحث عن العمل بصمت (كان الخطأ يُبتلع ويُرجع []).
    .or(
      buildIlikeOrFilter(
        [
          'normalized_search_text',
          'name_ar',
          'sku',
          'part_number',
          'alternative_numbers',
          'barcode',
        ],
        query
      )
    )
    .limit(limit);

  if (error) return [];

  const targetWarehouseId = _filters?.warehouse_id;
  return ((data || []) as unknown as FallbackSearchRow[]).map(row => {
    const stockList = Array.isArray(row.product_stock) ? row.product_stock : [];
    const scopedStock = targetWarehouseId
      ? stockList.filter(s => s.warehouse_id === targetWarehouseId)
      : branchId
        ? stockList.filter(s => !s.warehouses?.branch_id || s.warehouses.branch_id === branchId)
        : stockList;
    const totalStock = scopedStock.reduce(
      (sum: number, s: SearchStockRow) => sum + (Number(s.quantity) || 0),
      0
    );

    return {
      id: row.id,
      type: 'product' as const,
      name: row.name_ar || '',
      name_ar: row.name_ar || '',
      sku: row.sku || '',
      part_number: row.part_number || '',
      brand: row.brand || '',
      category: row.product_categories?.name || '',
      category_id: row.category_id || '',
      size: row.size || '',
      selling_price: Number(row.sale_price) || 0,
      cost_price: Number(row.purchase_price) || 0,
      stock_quantity: totalStock,
      unit: row.unit || 'pcs',
      image_url: row.image_url || null,
      alternative_numbers: row.alternative_numbers || null,
      barcode: row.barcode || null,
      warehouse_distribution: stockList.map((s: SearchStockRow) => ({
        warehouse_id: s.warehouse_id,
        warehouse_name: s.warehouses?.name_ar || '',
        quantity: Number(s.quantity) || 0,
      })),
      score: scoreSearchResult(query, {
        name_ar: row.name_ar || '',
        sku: row.sku || '',
        part_number: row.part_number || '',
        brand: row.brand || '',
        alternative_numbers: row.alternative_numbers || '',
      }),
      match_type: 'exact' as const,
    };
  });
}

/**
 * Quick search for barcode scanner input (exact match priority).
 */
export async function searchByBarcode(
  companyId: string,
  barcode: string,
  branchId?: string | null,
  warehouseId?: string | null
): Promise<POSSearchResult | null> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `
            id, name_ar, sku, part_number, brand, size, sale_price,
            purchase_price, unit, image_url, alternative_numbers, barcode,
            product_stock(quantity, warehouse_id, warehouses(name_ar, branch_id))
        `
    )
    .eq('company_id', companyId)
    .eq('status', 'active')
    // [FIX] قيم مساواة مقتبسة: باركود يحتوي فاصلة كان يكسر or() فيفشل
    // البحث بالباركود صامتاً ويعود كبحث نصي.
    .or(buildEqOrFilter(['barcode', 'sku', 'part_number'], barcode))
    .limit(1)
    .single();

  if (error || !data) return null;

  const row = data as unknown as BarcodeSearchRow;
  const stockList = Array.isArray(row.product_stock) ? row.product_stock : [];
  const scopedStock = warehouseId
    ? stockList.filter(s => s.warehouse_id === warehouseId)
    : branchId
      ? stockList.filter(
          (s: SearchStockRow) => !s.warehouses?.branch_id || s.warehouses.branch_id === branchId
        )
      : stockList;
  const totalStock = scopedStock.reduce((sum: number, s) => sum + (Number(s.quantity) || 0), 0);

  return {
    id: row.id,
    type: 'code',
    name: row.name_ar || '',
    name_ar: row.name_ar || '',
    sku: row.sku || '',
    part_number: row.part_number || '',
    brand: row.brand || '',
    size: row.size || '',
    selling_price: Number(row.sale_price) || 0,
    cost_price: Number(row.purchase_price) || 0,
    stock_quantity: totalStock,
    unit: row.unit || 'pcs',
    image_url: row.image_url || null,
    alternative_numbers: row.alternative_numbers || null,
    barcode: row.barcode || null,
    score: 100,
    match_type: 'barcode',
  };
}
