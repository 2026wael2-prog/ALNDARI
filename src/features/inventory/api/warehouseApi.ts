import { supabase } from '../../../lib/supabaseClient';
import type { Database } from '@/core/database.types';
import type { TableInsert } from '@/core/types/supabase-helpers';
import { edgeClient, shouldUseLocalFailover } from '@/core/offline/edgeClient';

/** Warehouse and stock management */
export const warehouseApi = {
  getWarehouses: async (companyId: string, branchId?: string | null) => {
    const loadFromEdge = async () => {
      const refs = await edgeClient.getReference<
        Database['public']['Functions']['get_warehouses_with_stats']['Returns']
      >('warehouses');
      return { data: refs ?? [], error: null };
    };

    if (shouldUseLocalFailover()) {
      try {
        return await loadFromEdge();
      } catch {
        // fallback to cloud below
      }
    }

    try {
      const res = await supabase.rpc('get_warehouses_with_stats', {
        p_company_id: companyId,
        ...(branchId ? { p_branch_id: branchId } : {}),
      });
      if (res.error && shouldUseLocalFailover(res.error)) {
        return await loadFromEdge();
      }
      return res;
    } catch (err) {
      if (shouldUseLocalFailover(err)) {
        return await loadFromEdge();
      }
      throw err;
    }
  },

  createInventoryTransactions: async (
    transactions: Array<TableInsert<'inventory_transactions'>>
  ) => {
    return await supabase.from('inventory_transactions').insert(transactions);
  },

  getProductMovements: async (productId: string, from?: string, to?: string) => {
    let query = supabase
      .from('inventory_transactions')
      .select('*') // Fix: removed invalid created_by(*) relation
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toDate.toISOString());
    }

    return await query;
  },

  recordTransaction: async (
    companyId: string,
    userId: string,
    tx: Omit<TableInsert<'inventory_transactions'>, 'company_id' | 'created_by'>
  ) => {
    return await supabase.from('inventory_transactions').insert({
      ...tx,
      company_id: companyId,
      created_by: userId,
    });
  },

  initializeStock: async (
    companyId: string,
    _userId: string,
    stockData: { product_id: string; warehouse_id: string; quantity: number; unit_cost?: number }
  ) => {
    return await (supabase.rpc as Function)('initialize_product_stock_atomic', {
      p_company_id: companyId,
      p_product_id: stockData.product_id,
      p_warehouse_id: stockData.warehouse_id,
      p_quantity: stockData.quantity,
      p_unit_cost: Number(stockData.unit_cost) || 0,
    });
  },

  updateStock: async (
    target: { companyId: string; productId: string; warehouseId: string },
    quantity: number,
    userId?: string
  ) => {
    const { companyId, productId, warehouseId } = target;
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>;
    return await rpc('adjust_stock_atomic', {
      p_company_id: companyId,
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_target_quantity: quantity,
      p_user_id: userId ?? null,
    });
  },

  saveWarehouse: async (
    companyId: string,
    data: {
      id?: string;
      name_ar: string;
      location: string;
      branch_id?: string | null;
      code?: string | null;
      is_primary?: boolean;
    }
  ) => {
    const { id, code: _code, ...formData } = data;
    const cleanBranchId =
      formData.branch_id && formData.branch_id.trim() !== ''
        ? formData.branch_id
        : null;
    const sanitizedData = {
      name_ar: formData.name_ar,
      location: formData.location,
      branch_id: cleanBranchId,
      ...(formData.is_primary !== undefined ? { is_primary: formData.is_primary } : {}),
    };

    if (id) {
      return await supabase.from('warehouses').update(sanitizedData).eq('id', id);
    } else {
      let isPrimary = Boolean(formData.is_primary);
      if (cleanBranchId && formData.is_primary === undefined) {
        const { data: existingBranchWh } = await supabase
          .from('warehouses')
          .select('id')
          .eq('company_id', companyId)
          .eq('branch_id', cleanBranchId)
          .is('deleted_at', null)
          .limit(1);
        if (!existingBranchWh || existingBranchWh.length === 0) {
          isPrimary = true;
        }
      }
      return await supabase.from('warehouses').insert({
        ...sanitizedData,
        company_id: companyId,
        is_primary: isPrimary,
        status: 'active',
      });
    }
  },

  /** Simple warehouse list (settings forms/dropdowns) — no stats. */
  fetchWarehouses: async (companyId: string) => {
    return await supabase
      .from('warehouses')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name_ar', { ascending: true });
  },

  upsertWarehouse: async (data: Record<string, unknown>) => {
    return await supabase
      .from('warehouses')
      .upsert(data as TableInsert<'warehouses'>)
      .select()
      .single();
  },

  deleteWarehouse: async (id: string) => {
    return await supabase
      .from('warehouses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
  },

  /** مخزون منتج عبر كل المستودعات/الفروع (مع فلتر company_id صريح). */
  getProductStockByCompany: async (companyId: string, productId: string) => {
    return await supabase
      .from('product_stock')
      .select(
        `
                quantity,
                warehouse_id,
                warehouses!inner(
                    id,
                    name_ar,
                    branch_id,
                    branches(id, name)
                )
            `
      )
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .gt('quantity', 0);
  },

  /** كل المستودعات مع معلومات فروعها (لفلاتر POS) — مع فلتر company_id صريح. */
  getWarehousesWithBranchesData: async (companyId: string) => {
    return await supabase
      .from('warehouses')
      .select(
        `
                id,
                name_ar,
                location,
                branch_id,
                branches(id, name)
            `
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name_ar', { ascending: true });
  },
};
