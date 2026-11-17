import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';
import { parseError } from '../../../core/utils/errorUtils';
import type { InventoryMovementFeedItem, InventoryMovementsFilterParams } from '../types';

const isRpcUnavailableError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const record = err as { code?: unknown; message?: unknown };
  const errCode = String(record.code || '');
  const errMsg = String(record.message || '');
  return (
    errCode === 'PGRST202' ||
    errCode === '404' ||
    errCode === '42883' ||
    errMsg.includes('not found') ||
    errMsg.includes('does not exist')
  );
};

export const productMovementsService = {
  /**
   * Get item movement history with date filtering and detail resolution.
   */
  getItemMovement: async (
    productId: string,
    companyId: string,
    branchId?: string | null
  ) => {
    const [{ data, error }, { data: whRows }] = await Promise.all([
      supabase.rpc('get_item_movements_with_balance', {
        p_company_id: companyId,
        p_product_id: productId,
      }),
      branchId
        ? supabase
            .from('warehouses')
            .select('id, name_ar')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .is('deleted_at', null)
        : Promise.resolve({ data: null }),
    ]);

    if (error) throw parseError(error);

    const rows = data || [];
    if (branchId) {
      const branchWhIds = new Set((whRows || []).map(w => w.id));
      const branchWhNames = new Set((whRows || []).map(w => w.name_ar).filter(Boolean));
      return rows.filter((r: Record<string, unknown>) => {
        if (typeof r.branch_id === 'string') return r.branch_id === branchId;
        if (typeof r.warehouse_id === 'string' && branchWhIds.size > 0) {
          return branchWhIds.has(r.warehouse_id);
        }
        if (typeof r.warehouse_name === 'string' && branchWhNames.size > 0) {
          return branchWhNames.has(r.warehouse_name);
        }
        return true;
      });
    }

    return rows;
  },

  /**
   * Get global inventory movements feed combining invoices, adjustments, audits and transfers.
   */
  getMovementsFeed: async (
    companyId: string,
    params: InventoryMovementsFilterParams = {},
    branchId?: string | null
  ): Promise<InventoryMovementFeedItem[]> => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_inventory_movements_feed', {
        p_company_id: companyId,
        p_branch_id: branchId ?? null,
        p_limit: params.limit ?? 150,
        p_offset: params.offset ?? 0,
        p_search: params.search ?? null,
        p_movement_type: params.movementType ?? 'all',
        p_doc_type: params.docType ?? 'all',
        p_product_id: params.productId ?? null,
        p_start_date: params.startDate ?? null,
        p_end_date: params.endDate ?? null,
      });

      if (!error && data) {
        return data as InventoryMovementFeedItem[];
      }

      if (error) {
        if (isRpcUnavailableError(error)) {
          logger.warn(
            'productService',
            'get_inventory_movements_feed RPC unavailable, using fallback',
            error
          );
          return await productMovementsService.fallbackMovementsFeed(companyId, params, branchId);
        }
        throw parseError(error);
      }
      return [];
    } catch (err: unknown) {
      if (isRpcUnavailableError(err)) {
        logger.warn(
          'productService',
          'get_inventory_movements_feed caught unavailable, using fallback',
          err
        );
        return await productMovementsService.fallbackMovementsFeed(companyId, params, branchId);
      }
      throw parseError(err);
    }
  },

  /**
   * Fallback for inventory movements feed when get_inventory_movements_feed RPC is not installed.
   */
  fallbackMovementsFeed: async (
    companyId: string,
    params: InventoryMovementsFilterParams = {},
    branchId?: string | null
  ): Promise<InventoryMovementFeedItem[]> => {
    let query = supabase
      .from('invoices')
      .select(`
        id,
        type,
        invoice_number,
        created_at,
        issue_date,
        branch_id,
        notes,
        party:parties(name),
        invoice_items(
          id,
          product_id,
          quantity,
          unit_price,
          cost_price,
          product:products(id, name_ar, sku, part_number, brand)
        )
      `)
      .eq('company_id', companyId)
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 100);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    if (params.docType && params.docType !== 'all') {
      query = query.eq('type', params.docType);
    }
    if (params.startDate) {
      query = query.gte('issue_date', params.startDate);
    }
    if (params.endDate) {
      query = query.lte('issue_date', params.endDate);
    }

    const { data, error } = await query;
    if (error) throw parseError(error);

    const rows: InventoryMovementFeedItem[] = [];
    const searchLow = params.search?.toLowerCase().trim();

    for (const inv of (data || []) as any[]) {
      const isIncoming = inv.type === 'purchase' || inv.type === 'sale_return';
      const partyName = inv.party?.name || '---';
      const docNum = inv.invoice_number ? `فاتورة #${inv.invoice_number}` : 'فاتورة';

      for (const item of (inv.invoice_items || []) as any[]) {
        if (params.productId && item.product_id !== params.productId) continue;
        const prod = item.product;

        if (searchLow) {
          const matchSearch =
            docNum.toLowerCase().includes(searchLow) ||
            (prod?.name_ar && prod.name_ar.toLowerCase().includes(searchLow)) ||
            (prod?.sku && prod.sku.toLowerCase().includes(searchLow)) ||
            (prod?.part_number && prod.part_number.toLowerCase().includes(searchLow)) ||
            partyName.toLowerCase().includes(searchLow);
          if (!matchSearch) continue;
        }

        if (params.movementType && params.movementType !== 'all') {
          if (params.movementType === 'in' && !isIncoming) continue;
          if (params.movementType === 'out' && isIncoming) continue;
        }

        rows.push({
          id: item.id,
          date: inv.created_at || inv.issue_date,
          doc_type: inv.type,
          doc_number: docNum,
          reference_id: inv.id,
          product_id: item.product_id,
          product_name: prod?.name_ar || 'صنف',
          product_sku: prod?.sku || '',
          product_part_number: prod?.part_number ?? null,
          product_brand: prod?.brand ?? null,
          party_name: partyName,
          movement_type: isIncoming ? 'in' : 'out',
          quantity: Math.abs(Number(item.quantity || 0)),
          unit_cost: Number(item.cost_price || 0),
          unit_price: Number(item.unit_price || 0),
          user_name: 'النظام',
          notes: inv.notes ?? null,
          current_stock: 0,
        });
      }
    }
    return rows;
  },
};
