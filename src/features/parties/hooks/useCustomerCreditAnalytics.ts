import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { useFeedbackStore } from '@/features/feedback/store';
import { partyCache } from '../lib/party-cache';
import {
  enrichCreditCustomer,
  type CustomerCreditAnalyticsResponse,
  type CustomerCreditSummary,
  type EnrichedCustomerCreditRow,
} from '../utils/creditScoring';

async function fetchCreditAnalyticsRpc(
  companyId: string,
  branchId: string | null,
  currency: 'SAR' | 'YER',
  periodDays: number
): Promise<CustomerCreditAnalyticsResponse | null> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const { data, error } = await client.rpc('get_customer_credit_analytics_v1', {
    p_company_id: companyId,
    p_branch_id: branchId,
    p_currency: currency,
    p_period_days: periodDays,
  });

  if (error !== null) {
    throw new Error(error.message ?? 'تعذر جلب تحليلات الائتمان');
  }
  if (data === null || data === undefined || typeof data !== 'object') {
    return null;
  }
  return data as CustomerCreditAnalyticsResponse;
}

export interface UseCustomerCreditAnalyticsResult {
  data: CustomerCreditAnalyticsResponse | null;
  summary: CustomerCreditSummary | null;
  customers: EnrichedCustomerCreditRow[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useCustomerCreditAnalytics(params: {
  currency: 'SAR' | 'YER';
  periodDays: number;
  enabled?: boolean;
}): UseCustomerCreditAnalyticsResult {
  const companyId = useAuthStore(s => s.user?.company_id ?? '');
  const { branchId } = useBranchFilter();
  const { currency, periodDays, enabled = true } = params;

  const query = useQuery<CustomerCreditAnalyticsResponse | null>({
    queryKey: ['customer_credit_analytics_v1', companyId, branchId ?? 'all', currency, periodDays],
    enabled: enabled && companyId.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchCreditAnalyticsRpc(companyId, branchId ?? null, currency, periodDays),
  });

  const enrichedCustomers = useMemo<EnrichedCustomerCreditRow[]>(() => {
    const rawList = query.data?.customers;
    if (!Array.isArray(rawList)) return [];
    return rawList.map(enrichCreditCustomer);
  }, [query.data?.customers]);

  return {
    data: query.data ?? null,
    summary: query.data?.summary ?? null,
    customers: enrichedCustomers,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface UpdateCreditPolicyInput {
  partyId: string;
  creditLimit: number;
  paymentTermsDays: number;
  status: 'active' | 'blocked';
}

export function useUpdatePartyCreditPolicy(): UseMutationResult<
  boolean,
  Error,
  UpdateCreditPolicyInput
> {
  const queryClient = useQueryClient();
  const companyId = useAuthStore(s => s.user?.company_id ?? '');
  const { showToast } = useFeedbackStore();

  return useMutation<boolean, Error, UpdateCreditPolicyInput>({
    mutationFn: async input => {
      if (companyId.length === 0) throw new Error('جلسة العمل غير صالحة');
      const { error } = await supabase
        .from('parties')
        .update({
          credit_limit: Math.max(0, input.creditLimit),
          payment_terms_days: Math.max(1, Math.round(input.paymentTermsDays)),
          status: input.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.partyId)
        .eq('company_id', companyId);

      if (error !== null) throw error;
      return true;
    },
    onSuccess: () => {
      partyCache.clearAll();
      void queryClient.invalidateQueries({ queryKey: ['customer_credit_analytics_v1'] });
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      void queryClient.invalidateQueries({ queryKey: ['customer_credit_alert'] });
      showToast('تم تحديث السياسة الائتمانية للعميل بنجاح', 'success');
    },
    onError: err => {
      showToast(`تعذر تحديث السياسة الائتمانية: ${err.message}`, 'error');
    },
  });
}

export interface LogCreditPromiseInput {
  customerId: string;
  subject: string;
  description: string;
  scheduledDate: string;
  priority: 'normal' | 'high' | 'urgent';
}

export function useLogCreditPromise(): UseMutationResult<boolean, Error, LogCreditPromiseInput> {
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const { showToast } = useFeedbackStore();

  return useMutation<boolean, Error, LogCreditPromiseInput>({
    mutationFn: async input => {
      const companyId = user?.company_id ?? '';
      if (companyId.length === 0) throw new Error('جلسة العمل غير صالحة');
      const { error } = await supabase.from('customer_activities').insert({
        company_id: companyId,
        customer_id: input.customerId,
        activity_type: 'call',
        subject: input.subject.trim(),
        description: input.description.trim(),
        scheduled_at: new Date(`${input.scheduledDate}T12:00:00`).toISOString(),
        status: 'pending',
        priority: input.priority,
        created_by: user?.id ?? null,
      });

      if (error !== null) throw error;
      return true;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer_credit_analytics_v1'] });
      showToast('تم تسجيل وعد السداد والمتابعة في سجل العميل بنجاح', 'success');
    },
    onError: err => {
      showToast(`تعذر تسجيل وعد السداد: ${err.message}`, 'error');
    },
  });
}
