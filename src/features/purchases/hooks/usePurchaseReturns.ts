import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { purchasesService, purchasesApi } from '../service';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { parseError } from '../../../core/utils/errorUtils';
import type { CreatePurchaseDTO } from '../types';
import type { PurchaseListRow } from '../service';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

const hasCompanyId = (companyId: string | null | undefined): companyId is string =>
  typeof companyId === 'string' && companyId.length > 0;

export const usePurchaseReturns = (): UseQueryResult<PurchaseListRow[]> => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();
  return useQuery({
    queryKey: ['purchase_returns', companyId, branchId],
    queryFn: () =>
      hasCompanyId(companyId)
        ? purchasesService.getPurchaseReturns(companyId, branchId)
        : Promise.resolve([]),
    enabled: hasCompanyId(companyId),
  });
};

export const usePurchaseReturnsStats = (): UseQueryResult<{
  returnCount: number;
  totalReturns: number;
  pendingCount: number;
} | null> => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();
  return useQuery({
    queryKey: ['purchase_returns_stats', companyId, branchId],
    queryFn: () =>
      hasCompanyId(companyId)
        ? purchasesService.getPurchaseReturnsStats(companyId, branchId)
        : Promise.resolve(null),
    enabled: hasCompanyId(companyId),
  });
};

export const useCreatePurchaseReturn = (): UseMutationResult<unknown, unknown, CreatePurchaseDTO> => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { branchId } = useBranchFilter();
  return useMutation({
    mutationFn: async (data: CreatePurchaseDTO) => {
      const companyId = user?.company_id;
      const userId = user?.id;
      if (!hasCompanyId(companyId) || !hasCompanyId(userId))
        throw new Error('جلسة العمل منتهية — يرجى تسجيل الدخول مجدداً');
      return purchasesService.processPurchaseReturn(
        {
          ...data,
          branchId:
            data.branchId !== null && data.branchId !== undefined && data.branchId !== ''
              ? data.branchId
              : branchId,
        },
        companyId,
        userId
      );
    },
    onSuccess: () => {
      showToast('تم إنشاء مرتجع المشتريات بنجاح', 'success');
      void queryClient.invalidateQueries({ queryKey: ['purchase_returns'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase_returns_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: unknown) => {
      showToast(parseError(error).message, 'error');
    },
  });
};

type PurchaseInvoicesForReturnResponse = Awaited<
  ReturnType<typeof purchasesApi.getPurchaseInvoicesForReturn>
>;
export type PurchaseInvoicesForReturnRow = NonNullable<
  PurchaseInvoicesForReturnResponse['data']
>[number];

export const usePurchaseInvoicesForReturn = (
  supplierId: string | null,
  options?: { enabled?: boolean }
): UseQueryResult<PurchaseInvoicesForReturnRow[] | null> => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();
  const isEnabled = (options?.enabled ?? true) && hasCompanyId(companyId);
  return useQuery({
    queryKey: ['purchase_invoices_for_return', companyId, branchId, supplierId],
    queryFn: async () => {
      if (!hasCompanyId(companyId)) return [];
      const { data, error } = await purchasesApi.getPurchaseInvoicesForReturn(
        companyId,
        supplierId,
        branchId
      );
      if (error) throw error;
      return data;
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 3,
  });
};
