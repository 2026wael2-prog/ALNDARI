import { supabase } from '../../../lib/supabaseClient';

export interface DuplicateBranchStock {
  branch_name: string;
  warehouse_name: string;
  quantity: number;
}

export interface DuplicateProductItem {
  id: string;
  sku: string;
  name_ar: string;
  part_number: string;
  brand: string;
  size?: string | null;
  sale_price: number;
  cost_price: number;
  total_stock: number;
  invoice_count: number;
  stock_by_branch: DuplicateBranchStock[];
}

export interface DuplicateProductGroup {
  norm_pn: string;
  norm_brand: string;
  group_count: number;
  items: DuplicateProductItem[];
}

export interface DuplicateGroupsResponse {
  total_groups: number;
  limit: number;
  offset: number;
  groups: DuplicateProductGroup[];
}

export interface MergeDuplicateResult {
  success: boolean;
  master_id: string;
  master_sku: string;
  duplicate_id: string;
  duplicate_sku: string;
  moved_stock_qty: number;
  moved_invoice_items: number;
}

export const productMergeApi = {
  findDuplicateGroups: async (
    companyId: string,
    opts: { search?: string | null; limit?: number; offset?: number } = {}
  ): Promise<DuplicateGroupsResponse> => {
    const { data, error } = await (supabase.rpc as Function)(
      'fn_find_duplicate_products_by_part_brand',
      {
        p_company_id: companyId,
        p_search: opts.search || null,
        p_limit: opts.limit ?? 20,
        p_offset: opts.offset ?? 0,
      }
    );
    if (error) {
      throw new Error(error.message || 'تعذر تحميل مجموعات الأصناف المكررة');
    }
    return (data ?? { total_groups: 0, limit: 20, offset: 0, groups: [] }) as DuplicateGroupsResponse;
  },

  mergeProduct: async (
    companyId: string,
    masterId: string,
    duplicateId: string
  ): Promise<MergeDuplicateResult> => {
    const { data, error } = await (supabase.rpc as Function)('fn_merge_duplicate_product', {
      p_company_id: companyId,
      p_master_id: masterId,
      p_duplicate_id: duplicateId,
    });
    if (error) {
      throw new Error(error.message || 'تعذر دمج الصنف المكرر');
    }
    return data as MergeDuplicateResult;
  },
};
