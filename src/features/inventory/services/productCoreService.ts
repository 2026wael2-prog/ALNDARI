import { supabase } from '../../../lib/supabaseClient';
import { inventoryApi } from '../api';
import { logger } from '../../../core/utils/logger';
import { parseError } from '../../../core/utils/errorUtils';

export const productCoreService = {
  /**
   * Toggle is_core status for a product (backbone/strategic product).
   */
  toggleCoreProduct: async (id: string, isCore: boolean) => {
    const { data, error } = await inventoryApi.toggleCoreProduct(id, isCore);
    if (error) throw parseError(error);
    return data;
  },

  /**
   * Bulk set is_core status for multiple products.
   */
  bulkSetCoreProducts: async (ids: string[], isCore: boolean) => {
    const { error } = await inventoryApi.bulkSetCoreProducts(ids, isCore);
    if (error) throw parseError(error);
  },

  /**
   * Get accurate aggregate counts for favorite products (total, critical, out_of_stock, safe).
   */
  getCoreProductsStats: async (
    companyId: string,
    branchId?: string | null
  ): Promise<{
    total: number;
    critical: number;
    outOfStock: number;
    safe: number;
  }> => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, min_stock_level, stock:product_stock(quantity, warehouses(branch_id))')
        .eq('company_id', companyId)
        .eq('is_core', true)
        .is('deleted_at', null)
        .or('status.eq.active,status.is.null');

      if (error) throw parseError(error);

      let critical = 0;
      let outOfStock = 0;
      let safe = 0;
      const total = data?.length ?? 0;

      interface CoreProductRow {
        id: string;
        min_stock_level: number | null;
        stock?: Array<{
          quantity: number | string | null;
          warehouses?: { branch_id?: string | null } | null;
        }> | null;
      }

      ((data || []) as unknown as CoreProductRow[]).forEach(row => {
        const filteredStock = branchId
          ? (row.stock || []).filter(s => !s.warehouses || s.warehouses.branch_id === branchId)
          : row.stock || [];
        const stockQty = filteredStock.reduce(
          (sum: number, s) => sum + (Number(s.quantity) || 0),
          0
        );
        const minLevel = Number(row.min_stock_level) || 0;
        const effectiveMinLevel = minLevel > 0 ? minLevel : 3;
        if (stockQty <= 0) {
          outOfStock++;
        } else if (stockQty <= effectiveMinLevel) {
          critical++;
        } else {
          safe++;
        }
      });

      return { total, critical, outOfStock, safe };
    } catch (err) {
      logger.error('productService.getCoreProductsStats', 'Failed to fetch stats', err);
      return { total: 0, critical: 0, outOfStock: 0, safe: 0 };
    }
  },
};
