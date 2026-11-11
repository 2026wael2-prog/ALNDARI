// Transfer Service - Handles stock transfer operations
import type { CreateTransferDTO } from '../types';
import { supabase } from '../../../lib/supabaseClient';

export const transferService = {
  /**
   * Create a new stock transfer
   */
  createTransfer: async (data: CreateTransferDTO) => {
    const { data: transfer, error } = await supabase.rpc('create_stock_transfer', {
      p_from_warehouse: data.from_warehouse_id,
      p_to_warehouse: data.to_warehouse_id,
      p_items: data.items,
      p_company_id: data.company_id,
      p_user_id: data.user_id,
      ...(data.notes !== undefined && { p_notes: data.notes }),
    });
    if (error) throw error;
    return transfer;
  },

  /**
   * Get all transfers for a company (optionally scoped to a specific branch or warehouse)
   */
  getTransfers: async (
    companyId: string,
    branchId?: string | null,
    warehouseId?: string | null
  ) => {
    const { data, error } = await supabase
      .from('stock_transfers')
      .select(
        `
                *,
                from_warehouse:warehouses!fk_stock_transfers_company_from_wh(name_ar, branch_id),
                to_warehouse:warehouses!fk_stock_transfers_company_to_wh(name_ar, branch_id),
                items:stock_transfer_items!fk_sti_company_transfer(*, product:products!fk_sti_company_product(name_ar, sku))
            `
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    let rows = data || [];
    if (branchId) {
      rows = rows.filter(row => {
        const fromBranch = (row.from_warehouse as { branch_id?: string | null } | null)?.branch_id;
        const toBranch = (row.to_warehouse as { branch_id?: string | null } | null)?.branch_id;
        return fromBranch === branchId || toBranch === branchId;
      });
    }
    if (warehouseId) {
      rows = rows.filter(
        row => row.from_warehouse_id === warehouseId || row.to_warehouse_id === warehouseId
      );
    }
    return rows;
  },
};

export default transferService;
