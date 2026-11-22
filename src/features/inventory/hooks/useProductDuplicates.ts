import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { assertPermission } from '../../../core/hooks/usePermission';
import { productMergeApi } from '../api/productMergeApi';

export function useDuplicateProductGroups(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const companyId = useAuthStore(s => s.user?.company_id) ?? '';
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim() || null;

  return useQuery({
    queryKey: ['duplicate_product_groups', companyId, search, limit, offset],
    queryFn: () => productMergeApi.findDuplicateGroups(companyId, { search, limit, offset }),
    enabled: Boolean(companyId),
    staleTime: 60 * 1000,
    placeholderData: prev => prev,
    refetchOnWindowFocus: false,
  });
}

export function useMergeDuplicateProduct() {
  const queryClient = useQueryClient();
  const companyId = useAuthStore(s => s.user?.company_id) ?? '';
  const { showToast } = useFeedbackStore();

  return useMutation({
    mutationFn: async ({ masterId, duplicateId }: { masterId: string; duplicateId: string }) => {
      if (!companyId) throw new Error('جلسة العمل منتهية');
      await assertPermission('inventory:update', 'دمج الأصناف المكررة');
      return productMergeApi.mergeProduct(companyId, masterId, duplicateId);
    },
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['duplicate_product_groups'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['products_paginated'] });
      const stockMsg =
        res.moved_stock_qty !== 0 ? ` ونقل ${res.moved_stock_qty} وحدة إلى نفس المستودعات` : '';
      const invMsg =
        res.moved_invoice_items > 0 ? ` وربط ${res.moved_invoice_items} بند فاتورة` : '';
      showToast(
        `تم دمج الصنف (${res.duplicate_sku}) في الرئيسي (${res.master_sku}) بنجاح${stockMsg}${invMsg}`,
        'success'
      );
    },
    onError: (err: Error) => {
      showToast(err.message || 'تعذر تنفيذ الدمج', 'error');
    },
  });
}
