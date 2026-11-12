import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { salesQuotationsApi, type QuotationDetailRow } from '@/features/sales/api/quotationsApi';
import { parseError } from '@/core/utils/errorUtils';

export interface QuotationState {
  quotation: QuotationDetailRow | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export const useQuotationDetails = (quotationId: string): QuotationState => {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['sales-quotation-details', quotationId],
    queryFn: async (): Promise<QuotationDetailRow> => {
      const result = await salesQuotationsApi.getQuotationDetails(quotationId);
      if (result.error !== null) throw result.error;
      if (result.data === null) throw new Error('لم يُعثر على عرض السعر المطلوب');
      return result.data;
    },
    enabled: quotationId !== '',
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const reload = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  return {
    quotation: data ?? null,
    loading: isPending,
    error: error === null ? null : parseError(error).message,
    reload,
  };
};
