import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { treasuryApi, type CreateTreasuryInput } from '../api/treasuryApi';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

// ─── Cashboxes ────────────────────────────────────────────────────────────────

export const useCashboxes = (explicitBranchId?: string | null) => {
  const { user } = useAuthStore();
  const { branchId: activeBranchId } = useBranchFilter();
  const branchId = explicitBranchId !== undefined ? explicitBranchId : activeBranchId;

  return useQuery({
    queryKey: ['cashboxes', user?.company_id, branchId],
    queryFn: async () => {
      if (user?.company_id === undefined || user.company_id === '') return [];
      const { data, error } = await treasuryApi.getCashboxes(user.company_id, branchId);
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user?.company_id),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: prev => prev,
  });
};

// ─── Exchange Companies ────────────────────────────────────────────────────────

export const useExchangeCompanies = (explicitBranchId?: string | null) => {
  const { user } = useAuthStore();
  const { branchId: activeBranchId } = useBranchFilter();
  const branchId = explicitBranchId !== undefined ? explicitBranchId : activeBranchId;

  return useQuery({
    queryKey: ['exchange_companies', user?.company_id, branchId],
    queryFn: async () => {
      if (user?.company_id === undefined || user.company_id === '') return [];
      const { data, error } = await treasuryApi.getExchangeCompanies(user.company_id, branchId);
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user?.company_id),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: prev => prev,
  });
};

// ─── Mutations ────────────────────────────────────────────────────────────────

export const useTreasuryMutations = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { branchId } = useBranchFilter();

  const createCashbox = useMutation({
    mutationFn: (input: CreateTreasuryInput) => {
      if (user?.company_id === undefined || user.company_id === '') throw new Error('No Company ID');
      const effectiveBranch = input.branch_id ?? branchId;
      return treasuryApi.createCashbox(user.company_id, {
        ...input,
        ...(effectiveBranch !== null && effectiveBranch !== undefined && effectiveBranch !== ''
          ? { branch_id: effectiveBranch }
          : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cashboxes'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('تم إنشاء الصندوق وربطه بالحسابات المحاسبية بنجاح', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const createExchangeCompany = useMutation({
    mutationFn: (input: CreateTreasuryInput) => {
      if (user?.company_id === undefined || user.company_id === '') throw new Error('No Company ID');
      const effectiveBranch = input.branch_id ?? branchId;
      return treasuryApi.createExchangeCompany(user.company_id, {
        ...input,
        ...(effectiveBranch !== null && effectiveBranch !== undefined && effectiveBranch !== ''
          ? { branch_id: effectiveBranch }
          : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exchange_companies'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('تم إنشاء شركة الصرافة وربطها بالحسابات المحاسبية بنجاح', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const revalueCurrency = useMutation({
    mutationFn: (params: {
      accountId: string;
      closingRate: number;
      operator?: 'multiply' | 'divide';
      periodDate?: string;
    }) => {
      if (user?.company_id === undefined || user.company_id === '') throw new Error('No Company ID');
      return treasuryApi.revalueForeignCurrency({
        companyId: user.company_id,
        ...params,
      });
    },
    onSuccess: (data: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ['cashboxes'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['financials'] });
      void queryClient.invalidateQueries({ queryKey: ['trial_balance'] });
      const msg = typeof data === 'object' && data !== null && 'message' in data && typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : 'تمت إعادة تقييم العملة وإثبات قيد الفروق بنجاح';
      showToast(msg, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    createCashbox: createCashbox.mutate,
    isCreatingCashbox: createCashbox.isPending,
    createExchangeCompany: createExchangeCompany.mutate,
    isCreatingExchange: createExchangeCompany.isPending,
    revalueCurrency: revalueCurrency.mutateAsync,
    isRevaluing: revalueCurrency.isPending,
  };
};
