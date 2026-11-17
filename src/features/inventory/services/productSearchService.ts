import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';
import { normalizeArabic } from '../../../core/utils/search';

/** Shape returned by the product search RPC — minimal fields for dropdowns/rows. */
export interface SearchResultProduct {
  id: string;
  name?: string;
  name_ar?: string;
  part_number?: string | null;
  sku?: string | null;
  brand?: string | null;
  size?: string | null;
  warehouse_distribution?: Array<{ warehouse_id: string; quantity: number }>;
  stock_quantity?: number;
}

interface SearchRow {
  id: string;
  name_ar?: string | null;
  sku?: string | null;
  part_number?: string | null;
  brand?: string | null;
  size?: string | null;
  stock?: unknown;
}

function mapSearchRow(row: SearchRow): SearchResultProduct {
  const stockList = Array.isArray(row.stock) ? row.stock : [];
  const distribution = stockList.map(s => ({
    warehouse_id: s.warehouse_id,
    quantity: Number(s.quantity) || 0,
  }));
  const totalStock = distribution.reduce((sum, s) => sum + s.quantity, 0);

  return {
    id: row.id,
    name: row.name_ar ?? '',
    name_ar: row.name_ar ?? '',
    sku: row.sku ?? null,
    part_number: row.part_number ?? null,
    brand: row.brand ?? null,
    size: row.size ?? null,
    warehouse_distribution: distribution,
    stock_quantity: totalStock,
  };
}

async function searchProductsFallback(
  companyId: string,
  term: string,
  limit = 50,
  branchId?: string | null
): Promise<SearchResultProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name_ar, sku, part_number, brand, size, stock:product_stock(warehouse_id, quantity, warehouses(branch_id))'
    )
    .eq('company_id', companyId)
    .eq('status', 'active')
    .or(
      `normalized_search_text.ilike.%${term}%,` +
        `name_ar.ilike.%${term}%,sku.ilike.%${term}%,` +
        `part_number.ilike.%${term}%,alternative_numbers.ilike.%${term}%,` +
        `barcode.ilike.%${term}%`
    )
    .limit(limit);

  if (error) return [];
  return (data as unknown as SearchRow[]).map(row => {
    if (branchId && Array.isArray(row.stock)) {
      const filteredStock = (
        row.stock as Array<{
          warehouse_id: string;
          quantity: number;
          warehouses?: { branch_id?: string | null } | null;
        }>
      ).filter(s => !s.warehouses || s.warehouses.branch_id === branchId);
      return mapSearchRow({ ...row, stock: filteredStock });
    }
    return mapSearchRow(row);
  });
}

let isSimilarProductsRpcAvailable = true;

export const productSearchService = {
  /**
   * Search products using advanced database search with ILIKE fallback.
   */
  searchProducts: async (
    companyId: string,
    term: string,
    branchId?: string | null
  ): Promise<SearchResultProduct[]> => {
    const cleanTerm = normalizeArabic(term).trim();
    try {
      const { data, error } = await supabase.rpc('search_inventory_paginated', {
        p_company_id: companyId,
        p_term: cleanTerm,
        p_limit: 50,
        p_offset: 0,
        p_sort_key: 'updated_at',
        p_sort_dir: 'desc',
        ...(branchId ? { p_branch_id: branchId } : {}),
      });
      if (error) {
        logger.warn('inventory', 'searchProducts RPC error, falling back to ILIKE:', error.message);
        return await searchProductsFallback(companyId, cleanTerm, 50, branchId);
      }
      return (data as unknown as SearchRow[]).map(mapSearchRow);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('inventory', 'searchProducts failed, using fallback:', message);
      return searchProductsFallback(companyId, cleanTerm, 50, branchId);
    }
  },

  /**
   * Get products with similar names to detect potential duplicates.
   */
  getSimilarProducts: async (name: string, companyId: string) => {
    try {
      if (isSimilarProductsRpcAvailable) {
        const { data, error } = await supabase.rpc('get_similar_products', {
          p_name: name,
          p_company_id: companyId,
        });

        if (!error && data) {
          return data;
        }

        if (error) {
          const errCode = error.code ?? '';
          const errMsg = error.message ?? '';
          if (
            errCode === 'PGRST202' ||
            errCode === '404' ||
            errMsg.includes('not found') ||
            errMsg.includes('does not exist')
          ) {
            isSimilarProductsRpcAvailable = false;
          }
        }
      }

      const { data: fallbackData } = await supabase
        .from('products')
        .select('id, name_ar, sku')
        .eq('company_id', companyId)
        .ilike('name_ar', `%${name}%`)
        .limit(5);

      return (fallbackData || []).map(
        (product: { id: string; name_ar: string; sku: string | null }) => ({
          ...product,
          similarity: 0.5,
        })
      );
    } catch {
      return [];
    }
  },

  /**
   * Get all potential duplicate pairs in the company inventory.
   */
  getPotentialDuplicates: async (companyId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_potential_duplicates', {
        p_company_id: companyId,
      });
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  },
};
