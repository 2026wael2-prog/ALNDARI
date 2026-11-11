// ============================================
// useWarehouses — إدارة المستودعات
// ============================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '../service';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { inventoryApi } from '../api';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

/** جلب قائمة المستودعات (مفلترة تلقائياً حسب الفرع النشط ما لم يُمرر فرع محدد أو null) */
export const useWarehouses = (branchId?: string | null) => {
  const { user } = useAuthStore();
  const { branchId: activeBranchId } = useBranchFilter();
  const effectiveBranchId = branchId !== undefined ? branchId : activeBranchId;

  return useQuery({
    queryKey: ['warehouses', user?.company_id, effectiveBranchId],
    queryFn: () =>
      user?.company_id
        ? inventoryService.getWarehouses(user.company_id, effectiveBranchId)
        : Promise.resolve([] as any[]),
    enabled: !!user?.company_id,
    staleTime: 5 * 60 * 1000,
  });
};

/** جلب منتجات مستودع محدد */
export const useWarehouseProducts = (warehouseId: string | null) => {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['warehouse_products', warehouseId],
    queryFn: () =>
      user?.company_id && warehouseId
        ? inventoryService.getProductsForWarehouse(user.company_id, warehouseId)
        : Promise.resolve([] as any[]),
    enabled: !!user?.company_id && !!warehouseId,
    staleTime: 5 * 60 * 1000,
  });
};

/** mutations الخاصة بإنشاء/تعديل/حذف المستودعات */
export const useWarehouseMutations = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { branchId: activeBranchId } = useBranchFilter();

  const save = useMutation({
    mutationFn: async (data: {
      id?: string;
      name_ar: string;
      location: string;
      branch_id?: string | null;
      code?: string | null;
    }) => {
      if (user?.company_id === undefined || user.company_id === '') throw new Error('Auth error');
      const res = await inventoryApi.saveWarehouse(user.company_id, {
        ...data,
        branch_id:
          data.branch_id !== undefined && data.branch_id !== null && String(data.branch_id).trim() !== ''
            ? data.branch_id
            : activeBranchId ?? null,
      });
      if (res.error) throw res.error;
      return res;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      showToast('تم حفظ بيانات المستودع بنجاح', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'فشل حفظ المستودع', 'error');
    },
  });

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return await inventoryApi.deleteWarehouse(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      showToast('تم حذف المستودع', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    saveWarehouse: save.mutate,
    deleteWarehouse: remove.mutate,
    isSaving: save.isPending,
  };
};
