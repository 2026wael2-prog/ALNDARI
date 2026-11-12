import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesService } from './service';
import { useAuthStore } from '../auth/store';
import { useFeedbackStore } from '../feedback/store';
import type { ExpenseFormData } from './types';
import { useMemo } from 'react';
import { assertPermission } from '../../core/hooks/usePermission';
import { invalidateByPreset } from '../../lib/invalidation';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import { syncStore } from '../../core/lib/sync-store';
import { useBranchFilter } from '../branches/hooks/useBranchFilter';

export const useNextExpenseNumber = () => {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['next_expense_number', user?.company_id],
    queryFn: () =>
      user?.company_id
        ? expensesService.getNextExpenseNumber(user.company_id)
        : Promise.resolve('---'),
    enabled: !!user?.company_id,
    staleTime: 0,
  });
};

export const useExpenseCategories = () => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['expense_categories', companyId],
    queryFn: () =>
      companyId ? expensesService.getExpenseCategories(companyId) : Promise.resolve([]),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: prev => prev,
    select: data => (Array.isArray(data) ? data : []),
  });
};

export const useExpenseCategoryMutation = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!user?.company_id) throw new Error('Authentication required');
      return expensesService.createCategory(user.company_id, name);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expense_categories'] });
      showToast('تمت إضافة التصنيف بنجاح', 'success');
    },
  });
};

export const useExpensesData = (searchTerm = '') => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();

  const query = useQuery({
    queryKey: ['expenses', companyId, branchId],
    queryFn: () =>
      Boolean(companyId) ? expensesService.getExpensesList(companyId ?? '', branchId) : Promise.resolve([]),
    enabled: Boolean(companyId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: prev => prev,
  });

  const filteredExpenses = useMemo(() => {
    if (!query.data) return [];
    if (!searchTerm.trim()) return query.data;
    const term = searchTerm.toLowerCase().trim();
    return query.data.filter(e => {
      const haystack = [
        e.description ?? '',
        e.voucher_number ?? '',
        e.category_name ?? '',
        String(e.amount),
        e.currency_code,
        e.payment_method,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [query.data, searchTerm]);

  const stats = useMemo(() => {
    return expensesService.calculateStats(query.data ?? []);
  }, [query.data]);

  return { ...query, expenses: filteredExpenses, stats };
};

export const useExpenseActions = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { isOnline } = useNetworkStatus();
  const { branchId } = useBranchFilter();

  const create = useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      if (user?.company_id === undefined || user.company_id === '' || user.id === '') {
        throw new Error('جلسة العمل منتهية');
      }
      await assertPermission('expenses:create', 'تسجيل مصروفات');
      const finalData = { ...data, branch_id: data.branch_id ?? branchId };
      return expensesService.processNewExpense(finalData, user.company_id, user.id);
    },
    onSuccess: () => {
      invalidateByPreset(queryClient, 'expense');
      showToast('تم تسجيل المصروف وترحيله بنجاح', 'success');
    },
    onError: (error: Error, variables) => {
      if (!isOnline || error.message.includes('Failed to fetch')) {
        void syncStore.enqueue({
          mutationKey: ['expenses', 'create'],
          variables: {
            ...variables,
            branch_id: variables.branch_id ?? branchId,
            company_id: user?.company_id,
            user_id: user?.id,
          },
        });
        showToast('تم حفظ المصروف محلياً (وضع عدم الاتصال). سيتم المزامنة تلقائياً.', 'info');
        return;
      }
      showToast(error.message, 'error', { error });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => expensesService.deleteExpense(id),
    onSuccess: () => {
      invalidateByPreset(queryClient, 'expense');
      showToast('تم إلغاء المصروف وإنشاء القيد العكسي بنجاح', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  return {
    createExpense: create.mutate,
    isCreating: create.isPending,
    error: create.error,
    deleteExpense: remove.mutate,
    isDeleting: remove.isPending,
  };
};
