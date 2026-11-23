import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesService } from '../service';
import { useAuthStore } from '@/features/auth/store';
import { useFeedbackStore } from '@/features/feedback/store';
import { invalidateByPreset } from '@/lib/invalidation';
import { shouldRetryQuery } from '@/lib/queryClient';
import { syncStore } from '@/core/lib/sync-store';
import type { CreateInvoiceDTO, UpdateInvoicePayload } from '../types';
import { invoicesApi } from '../api/invoicesApi';

import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';

export interface UseInvoicesOptions {
  searchTerm?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  status?: string | undefined;
  paymentMethod?: string | undefined;
  type?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export const useInvoices = (options?: UseInvoicesOptions) => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();

  const isSearchMode = Boolean(
    (options?.searchTerm && options.searchTerm.trim() !== '') ||
    options?.dateFrom ||
    options?.dateTo ||
    options?.status ||
    options?.paymentMethod
  );

  return useQuery({
    queryKey: ['invoices', companyId, branchId, options],
    queryFn: () => {
      if (!companyId) return Promise.resolve([]);
      const effectiveLimit = options?.limit ?? 50;
      if (isSearchMode) {
        return salesService.searchSalesInvoices(companyId, {
          query: options?.searchTerm,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          status: options?.status,
          paymentMethod: options?.paymentMethod,
          type: options?.type ?? 'sale',
          branchId,
          page: options?.page ?? 0,
          limit: effectiveLimit,
        });
      }
      return salesService.fetchSalesLog(
        companyId,
        options?.page ?? 0,
        branchId,
        effectiveLimit
      );
    },
    enabled: !!companyId,
    staleTime: isSearchMode ? 60 * 1000 : 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: prev => prev,
    retry: (failureCount, error) => shouldRetryQuery(failureCount, error),
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
    // منع إعادة الجلب التلقائية عند التبديل بين نوافذ المتصفح (مكلف للـ RPC)
    refetchOnWindowFocus: false,
  });
};

export const useSalesStats = (filters?: {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}) => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();
  return useQuery({
    queryKey: ['sales_stats', companyId, branchId, filters?.dateFrom, filters?.dateTo],
    queryFn: () =>
      companyId
        ? salesService.getStats(companyId, branchId, filters?.dateFrom, filters?.dateTo)
        : Promise.resolve(null),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: prev => prev,
    refetchOnWindowFocus: false,
  });
};

export const useCreateInvoice = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { branchId } = useBranchFilter();

  return useMutation({
    mutationFn: async (data: CreateInvoiceDTO) => {
      if (!user?.company_id || !user?.id) throw new Error('Missing auth context');
      const finalData = { ...data, branchId: data.branchId ?? branchId };
      return await salesService.processNewSale(user.company_id, user.id, finalData);
    },
    onSuccess: () => {
      showToast(`تم اعتماد الفاتورة بنجاح`, 'success');
      invalidateByPreset(queryClient, 'sale');
    },
    onError: (error, variables) => {
      const err = error as { message?: string; status?: number };
      const isFetchError =
        typeof err?.message === 'string' && err.message.includes('Failed to fetch');
      const isNetworkError = err?.status === 0;

      if (!navigator.onLine || isFetchError || isNetworkError) {
        // Unified offline queue (sync-store): replayed by ReactQueryProvider's
        // useSyncQueue via processSyncMutation(['sales', 'create']).
        void syncStore.enqueue({
          mutationKey: ['sales', 'create'],
          variables: {
            ...variables,
            branchId: variables.branchId ?? branchId,
            company_id: user?.company_id,
            user_id: user?.id,
          },
        });
        showToast('تم حفظ الفاتورة محلياً. سيتم مزامنتها عند عودة الاتصال.', 'info');
        return;
      }

      showToast(err?.message || 'فشل في إصدار الفاتورة', 'error');
    },
  });
};

export const useUpdateInvoice = () => {
  const queryClient = useQueryClient();
  const { showToast } = useFeedbackStore();

  return useMutation({
    mutationFn: async (payload: UpdateInvoicePayload) => {
      return await invoicesApi.updateInvoice(payload);
    },
    onSuccess: (res, vars) => {
      showToast('تم تعديل الفاتورة وتحديث القيود والمخزون بنجاح', 'success');

      // Immediate cache patch so Sales Log & details show the new total without waiting for network
      const rpcRes = (res ?? {}) as {
        total_amount?: number;
        total_document_amount?: number;
        status?: string;
      };
      const newBaseTotal = Number(rpcRes.total_amount);
      const newDocTotal = Number(rpcRes.total_document_amount);
      const hasNewTotal = Number.isFinite(newBaseTotal) && newBaseTotal >= 0;

      if (hasNewTotal) {
        queryClient.setQueriesData<unknown>({ queryKey: ['invoices'] }, (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.map((row: Record<string, unknown>) => {
            if (row?.id !== vars.invoiceId) return row;
            const isForeign = String(row.currencyCode || row.currency_code || 'SAR') !== 'SAR';
            const displayTotal =
              isForeign && Number.isFinite(newDocTotal) && newDocTotal > 0
                ? newDocTotal
                : newBaseTotal;
            return {
              ...row,
              total: displayTotal,
              baseTotal: newBaseTotal,
              total_amount: newBaseTotal,
              total_document_amount:
                Number.isFinite(newDocTotal) && newDocTotal > 0 ? newDocTotal : newBaseTotal,
              ...(rpcRes.status ? { status: rpcRes.status } : {}),
              paymentMethod: vars.paymentMethod,
              payment_method: vars.paymentMethod,
            };
          });
        });
      }

      // Drop stale invoice_details cache so re-opening details/edit fetches fresh items & totals
      queryClient.removeQueries({ queryKey: ['invoice_details', vars.invoiceId] });

      invalidateByPreset(queryClient, 'sale');
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.refetchQueries({ queryKey: ['invoices'], type: 'active' });
      void queryClient.invalidateQueries({ queryKey: ['party_statement_v4'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      void queryClient.invalidateQueries({ queryKey: ['party_balances'] });
      void queryClient.invalidateQueries({ queryKey: ['sales_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['customer_credit_alert'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product_stock'] });
      void queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
    },
    onError: (error: any) => {
      showToast(error?.message || 'فشل في تعديل الفاتورة', 'error');
    },
  });
};
