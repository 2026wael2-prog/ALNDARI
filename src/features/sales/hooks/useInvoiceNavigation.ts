/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { salesApi, type InvoiceNavSummary } from '../api';
import { useAuthStore } from '@/features/auth/store';
import { useFeedbackStore } from '@/features/feedback/store';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';

export interface UseInvoiceNavigationResult {
  currentViewingInvoice: InvoiceNavSummary | null;
  setCurrentViewingInvoice: (inv: InvoiceNavSummary | null) => void;
  firstInvoice: InvoiceNavSummary | null;
  lastInvoice: InvoiceNavSummary | null;
  prevInvoice: InvoiceNavSummary | null;
  nextInvoice: InvoiceNavSummary | null;
  isNavigating: boolean;
  canGoFirst: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  canGoLast: boolean;
  goToFirst: () => void;
  goToLast: () => void;
  goToPrev: () => void;
  goToNext: () => void;
  jumpToInvoiceNumber: (num: string) => Promise<boolean>;
  exitViewingMode: () => void;
}

export const useInvoiceNavigation = (): UseInvoiceNavigationResult => {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';
  const { branchId } = useBranchFilter();
  const { showToast } = useFeedbackStore();

  const [currentViewingInvoice, setCurrentViewingInvoice] = useState<InvoiceNavSummary | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // 1. جلب أول وآخر فاتورة في النظام / الفرع (Boundaries)
  const { data: boundaries, isLoading: isBoundariesLoading } = useQuery({
    queryKey: ['invoice_nav_boundaries', companyId, branchId],
    queryFn: async (): Promise<{ first: InvoiceNavSummary | null; last: InvoiceNavSummary | null }> => {
      if (!companyId) return { first: null, last: null };
      return salesApi.getInvoiceNavigatorBoundaries(companyId, branchId);
    },
    enabled: Boolean(companyId),
    staleTime: 1000 * 30,
  });

  const firstInvoice = boundaries?.first ?? null;
  const lastInvoice = boundaries?.last ?? null;

  // 2. جلب الفاتورة السابقة والتالية للفاتورة المعروضة حالياً
  const currentCreatedAt = currentViewingInvoice?.created_at;
  const currentId = currentViewingInvoice?.id;

  const { data: adjacent, isLoading: isAdjacentLoading } = useQuery({
    queryKey: ['invoice_nav_adjacent', companyId, branchId, currentCreatedAt, currentId],
    queryFn: async (): Promise<{ prev: InvoiceNavSummary | null; next: InvoiceNavSummary | null }> => {
      if (!companyId || !currentCreatedAt || !currentId) {
        return { prev: null, next: null };
      }
      return salesApi.getAdjacentInvoices(companyId, currentCreatedAt, currentId, branchId);
    },
    enabled: Boolean(companyId && currentCreatedAt && currentId),
    staleTime: 1000 * 30,
  });

  // إذا كنا في وضع الفاتورة الجديدة: الفاتورة السابقة هي أحدث فاتورة في النظام (lastInvoice)
  const effectivePrev = currentViewingInvoice ? (adjacent?.prev ?? null) : lastInvoice;
  // في وضع الفاتورة الجديدة: لا توجد فاتورة تالية
  const effectiveNext = currentViewingInvoice ? (adjacent?.next ?? null) : null;

  // إمكانية التنقل
  const canGoFirst = Boolean(firstInvoice && currentViewingInvoice?.id !== firstInvoice.id);
  const canGoPrev = Boolean(effectivePrev && currentViewingInvoice?.id !== effectivePrev.id);
  const canGoNext = Boolean(effectiveNext);
  const canGoLast = Boolean(lastInvoice && currentViewingInvoice?.id !== lastInvoice.id);

  const goToFirst = useCallback((): void => {
    if (firstInvoice) {
      setCurrentViewingInvoice(firstInvoice);
    }
  }, [firstInvoice]);

  const goToLast = useCallback((): void => {
    if (lastInvoice) {
      setCurrentViewingInvoice(lastInvoice);
    }
  }, [lastInvoice]);

  const goToPrev = useCallback((): void => {
    if (effectivePrev) {
      setCurrentViewingInvoice(effectivePrev);
    }
  }, [effectivePrev]);

  const goToNext = useCallback((): void => {
    if (effectiveNext) {
      setCurrentViewingInvoice(effectiveNext);
    }
  }, [effectiveNext]);

  const exitViewingMode = useCallback((): void => {
    setCurrentViewingInvoice(null);
  }, []);

  const jumpToInvoiceNumber = useCallback(
    async (invoiceNumber: string): Promise<boolean> => {
      const clean = invoiceNumber.trim();
      if (!clean) {
        showToast('يرجى إدخال رقم الفاتورة للبحث', 'warning');
        return false;
      }

      if (!companyId) return false;

      setIsSearching(true);
      try {
        const found = await salesApi.searchInvoiceForNavigation(companyId, clean, branchId);
        if (found) {
          setCurrentViewingInvoice(found);
          showToast(`تم الانتقال إلى الفاتورة #${found.invoice_number}`, 'success');
          return true;
        } else {
          showToast(`لم يتم العثور على أي فاتورة مبيعات برقم "${clean}"`, 'error');
          return false;
        }
      } catch {
        showToast('تعذر البحث عن الفاتورة، يرجى المحاولة مرة أخرى', 'error');
        return false;
      } finally {
        setIsSearching(false);
      }
    },
    [companyId, branchId, showToast]
  );

  return {
    currentViewingInvoice,
    setCurrentViewingInvoice,
    firstInvoice,
    lastInvoice,
    prevInvoice: effectivePrev,
    nextInvoice: effectiveNext,
    isNavigating: isBoundariesLoading || isAdjacentLoading || isSearching,
    canGoFirst,
    canGoPrev,
    canGoNext,
    canGoLast,
    goToFirst,
    goToLast,
    goToPrev,
    goToNext,
    jumpToInvoiceNumber,
    exitViewingMode,
  };
};
