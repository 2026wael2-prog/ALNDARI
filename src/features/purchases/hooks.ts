import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { purchasesService, type PurchaseStatsFilters } from './service';
import { useAuthStore } from '../auth/store';
import { useFeedbackStore } from '../feedback/store';
import type { CreatePurchaseDTO, CreatePaymentDTO, PurchaseStats } from './types';
import { purchasesApi } from './api';
import { usePartySearch } from '../parties/hooks';
import { invalidateByPreset } from '../../lib/invalidation';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import { syncStore } from '../../core/lib/sync-store';
import { useBranchFilter } from '../branches/hooks/useBranchFilter';
import { useAnalyticsFilterStore } from '../../core/store/analyticsFilterStore';

type PurchaseList = Awaited<ReturnType<typeof purchasesService.getPurchases>>;
type PurchaseAnalytics = Awaited<ReturnType<typeof purchasesService.getAnalytics>>;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return fallback;
};

export interface UsePurchasesOptions {
  searchTerm?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  status?: string | undefined;
  paymentMethod?: string | undefined;
  type?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  enabled?: boolean | undefined;
}

// Fix: Enhanced usePurchases hook to support server-side historical search across items/products/dates
export const usePurchases = (options?: UsePurchasesOptions): UseQueryResult<PurchaseList> => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();
  const hasCompany = companyId !== undefined && companyId !== '';

  const isSearchMode = Boolean(
    (options?.searchTerm && options.searchTerm.trim() !== '') ||
    options?.dateFrom ||
    options?.dateTo ||
    options?.status ||
    options?.paymentMethod
  );

  return useQuery<PurchaseList>({
    queryKey: ['purchases', companyId, branchId, options],
    queryFn: async (): Promise<PurchaseList> => {
      if (!hasCompany) return [];
      const effectiveLimit = options?.limit ?? 100;
      if (isSearchMode) {
        return (await purchasesService.searchPurchases(companyId, {
          query: options?.searchTerm,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          status: options?.status,
          paymentMethod: options?.paymentMethod,
          type: options?.type,
          branchId,
          page: options?.page ?? 0,
          limit: effectiveLimit,
        })) as unknown as PurchaseList;
      }
      return purchasesService.getPurchases(companyId, branchId, effectiveLimit);
    },
    enabled: hasCompany && (options?.enabled ?? true),
    staleTime: isSearchMode ? 60 * 1000 : 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: prev => prev,
  });
};

// Fix: Added missing usePurchaseStats hook for dashboard summary
export const usePurchaseStats = (
  customFilters?: PurchaseStatsFilters
): UseQueryResult<PurchaseStats | null> => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId: contextBranchId } = useBranchFilter();

  const globalFilters = useAnalyticsFilterStore();
  const effectiveBranchId =
    customFilters?.branchId !== undefined
      ? customFilters.branchId
      : globalFilters.branchId !== null
        ? globalFilters.branchId
        : contextBranchId;

  const filters: PurchaseStatsFilters = {
    branchId: effectiveBranchId,
    startDate: customFilters?.startDate ?? globalFilters.startDate,
    endDate: customFilters?.endDate ?? globalFilters.endDate,
    currency: customFilters?.currency ?? globalFilters.currency,
    paymentType: customFilters?.paymentType ?? globalFilters.paymentType,
  };

  const hasCompany = companyId !== undefined && companyId !== '';
  return useQuery({
    queryKey: ['purchase_stats', companyId, filters],
    queryFn: (): Promise<PurchaseStats | null> => {
      if (!hasCompany) return Promise.resolve(null);
      return purchasesService.getStats(companyId, filters);
    },
    enabled: hasCompany,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: previousData => previousData,
  });
};

// Fix: Added missing usePurchaseDetails hook for viewing a single invoice
export const usePurchaseDetails = (
  purchaseId: string | null
): UseQueryResult<Awaited<ReturnType<typeof purchasesApi.getPurchaseDetails>>['data'] | null> => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['purchase_details', purchaseId],
    queryFn: async (): Promise<
      Awaited<ReturnType<typeof purchasesApi.getPurchaseDetails>>['data'] | null
    > => {
      if (purchaseId === null || purchaseId === '') return null;
      const { data, error } = await purchasesApi.getPurchaseDetails(purchaseId, companyId);
      if (error) throw error;
      return data; // Cast to unknown to bypass strict Supabase join types without losing safety
    },
    enabled: purchaseId !== null && purchaseId !== '',
    staleTime: 1000 * 60 * 5,
    placeholderData: previousData => {
      if (previousData) return previousData;
      if (!purchaseId) return undefined;

      const allQueries = queryClient.getQueriesData<any[]>({ queryKey: ['purchases'] });
      for (const [, list] of allQueries) {
        if (Array.isArray(list)) {
          const found = list.find((inv: any) => inv?.id === purchaseId);
          if (found) {
            return {
              ...found,
              party: found.party ? found.party : undefined,
              invoice_items: found.invoice_items || [],
            } as any;
          }
        }
      }
      return undefined;
    },
  });
};

export const useCreatePurchase = (): UseMutationResult<
  Awaited<ReturnType<typeof purchasesService.processPurchase>>,
  Error,
  CreatePurchaseDTO
> => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { isOnline } = useNetworkStatus();
  const { branchId } = useBranchFilter();

  return useMutation({
    mutationFn: async (
      data: CreatePurchaseDTO
    ): Promise<Awaited<ReturnType<typeof purchasesService.processPurchase>>> => {
      const companyId = user?.company_id;
      const userId = user?.id;
      if (companyId === undefined || companyId === '' || userId === undefined || userId === '')
        throw new Error('Authentication failed');

      // نرسل الفاتورة بحالة 'posted' لتفعيل الـ Trigger المخزني والمحاسبي في SQL
      return purchasesService.processPurchase(
        { ...data, branchId: data.branchId || branchId },
        companyId,
        userId
      );
    },
    onSuccess: (): void => {
      showToast(`تم توريد الفاتورة بنجاح وتحديث الأرصدة المخزنية والمالية`, 'success');
      invalidateByPreset(queryClient, 'purchase');
    },
    onError: (err: Error, variables): void => {
      if (!isOnline || getErrorMessage(err, '').includes('Failed to fetch')) {
        void syncStore.enqueue({
          mutationKey: ['purchases', 'create'],
          variables: {
            ...variables,
            branchId: variables.branchId || branchId,
            company_id: user?.company_id,
            user_id: user?.id,
          },
        });
        showToast(
          'تم حفظ فاتورة المشتريات محلياً (وضع عدم الاتصال). سيتم المزامنة تلقائياً.',
          'info'
        );
        return;
      }
      showToast(getErrorMessage(err, 'فشل توريد الفاتورة'), 'error');
    },
  });
};

// Fix: Added missing useCreatePayment hook for supplier payments
export const useCreatePayment = (): UseMutationResult<
  Awaited<ReturnType<typeof purchasesApi.createSupplierPayment>>,
  Error,
  CreatePaymentDTO
> => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { isOnline } = useNetworkStatus();
  const { branchId } = useBranchFilter();
  return useMutation({
    mutationFn: async (
      data: CreatePaymentDTO
    ): Promise<Awaited<ReturnType<typeof purchasesApi.createSupplierPayment>>> => {
      const companyId = user?.company_id;
      const userId = user?.id;
      if (companyId === undefined || companyId === '' || userId === undefined || userId === '')
        throw new Error('Authentication failed');
      return purchasesApi.createSupplierPayment(
        { ...data, branchId: data.branchId || branchId },
        companyId,
        userId
      );
    },
    onSuccess: (): void => {
      showToast('تم تسجيل سند الصرف بنجاح', 'success');
      invalidateByPreset(queryClient, 'purchase');
    },
    onError: (err: Error, variables): void => {
      if (!isOnline || getErrorMessage(err, '').includes('Failed to fetch')) {
        void syncStore.enqueue({
          mutationKey: ['purchases', 'payment'],
          variables: {
            ...variables,
            branchId: variables.branchId || branchId,
            company_id: user?.company_id,
            user_id: user?.id,
          },
        });
        showToast('تم حفظ السند محلياً (وضع عدم الاتصال). سيتم المزامنة تلقائياً.', 'info');
        return;
      }
      showToast(getErrorMessage(err, 'فشل تسجيل السند'), 'error');
    },
  });
};

// Fix: Added missing usePurchasesAnalytics hook for charting
export const usePurchasesAnalytics = (
  customFilters?: PurchaseStatsFilters
): UseQueryResult<PurchaseAnalytics | null> => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId: contextBranchId } = useBranchFilter();

  const globalFilters = useAnalyticsFilterStore();
  const effectiveBranchId =
    customFilters?.branchId !== undefined
      ? customFilters.branchId
      : globalFilters.branchId !== null
        ? globalFilters.branchId
        : contextBranchId;

  const filters: PurchaseStatsFilters = {
    branchId: effectiveBranchId,
    startDate: customFilters?.startDate ?? globalFilters.startDate,
    endDate: customFilters?.endDate ?? globalFilters.endDate,
    currency: customFilters?.currency ?? globalFilters.currency,
    paymentType: customFilters?.paymentType ?? globalFilters.paymentType,
  };

  return useQuery({
    queryKey: ['purchases_analytics', companyId, filters],
    queryFn: (): Promise<PurchaseAnalytics | null> =>
      companyId !== undefined && companyId !== ''
        ? purchasesService.getAnalytics(companyId, filters)
        : Promise.resolve(null),
    enabled: companyId !== undefined && companyId !== '',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: previousData => previousData,
  });
};

// Fix: Added missing useSupplierSearch hook for purchase forms
export const useSupplierSearch = (query: string): ReturnType<typeof usePartySearch> => {
  return usePartySearch('supplier', query);
};

export const useDeletePurchase = (): UseMutationResult<string, unknown, string> => {
  const queryClient = useQueryClient();
  const { showToast } = useFeedbackStore();

  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { error } = await purchasesApi.deletePurchase(id);
      if (error) throw error;
      return id;
    },
    onSuccess: (): void => {
      showToast('تم حذف فاتورة الشراء بنجاح', 'success');
      invalidateByPreset(queryClient, 'purchase');
    },
    onError: (error: unknown): void => {
      showToast(getErrorMessage(error, 'فشل في حذف فاتورة الشراء'), 'error');
    },
  });
};
