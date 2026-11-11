import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { useAuthStore } from '../../auth/store';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';
import { useFeedbackStore } from '../../feedback/store';
import { useCurrencies } from '../../settings/hooks';
import {
  useCommitDailyReconciliation,
  useDailyDrawerSummary,
  useReconciliationHistory,
} from '../hooks/useDailyReconciliation';
import { defaultFloatFor, resolveSummaryCurrency } from '../services/reconciliationService';
import type { CashCountsByCurrency, DailyDrawerSummary, ExistingReconciliationRecord } from '../types';
import type {
  CountMode,
  ReconciliationFormApi,
  ReconciliationModalsApi,
  ReconciliationView,
} from './DailyReconciliationPage.helpers';
import {
  buildCommitPayload,
  buildZeroCashConfirmMessage,
  collectCommitBlockers,
  deriveReconciliationView,
  planSummarySync,
  resolveShopName,
} from './DailyReconciliationPage.helpers';

const useReconciliationModals = (): ReconciliationModalsApi => {
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  return {
    isExpenseModalOpen,
    isPrintModalOpen,
    isHistoryModalOpen,
    openExpenseModal: () => {
      setIsExpenseModalOpen(true);
    },
    closeExpenseModal: () => {
      setIsExpenseModalOpen(false);
    },
    openPrintModal: () => {
      setIsPrintModalOpen(true);
    },
    closePrintModal: () => {
      setIsPrintModalOpen(false);
    },
    openHistoryModal: () => {
      setIsHistoryModalOpen(true);
    },
    closeHistoryModal: () => {
      setIsHistoryModalOpen(false);
    },
  };
};

/**
 * بناء خريطة أسعار التحويل من إعدادات المنشأة: رمز العملة ← `rate_to_base` الخام
 * (نفس ما يُمرَّر لدالة تحويل الخادم). عملة الأساس دائماً 1.
 */
const buildRateMap = (
  baseCurrency: string,
  rateRows: ReadonlyArray<{ currency_code: string; rate_to_base: number }>
): Record<string, number> => {
  const map = new Map<string, number>([[baseCurrency, 1]]);
  rateRows.forEach(row => {
    const code = row.currency_code.trim().toUpperCase();
    const value = row.rate_to_base;
    if (code !== '' && !map.has(code) && Number.isFinite(value) && value > 0) {
      map.set(code, value);
    }
  });
  return Object.fromEntries(map);
};

/** أسعار إعدادات المنشأة في شكل صفوف مستقرة (بلا إعادة إنشاء مع كل تصيير) */
const useRateRows = (
  serverRates?: Record<string, number>
): Array<{ currency_code: string; rate_to_base: number }> => {
  const { rates } = useCurrencies();
  return useMemo(() => {
    const merged = new Map<string, number>();
    if (Array.isArray(rates.data)) {
      rates.data.forEach(row => {
        const code = row.currency_code.toUpperCase().trim();
        if (code !== '' && Number.isFinite(row.rate_to_base) && row.rate_to_base > 0) {
          merged.set(code, row.rate_to_base);
        }
      });
    }
    // أسعار الخادم (أحدث سعر حتى تاريخ اليومية) تسبق صفوف الإعدادات العامة
    Object.entries(serverRates ?? {}).forEach(([code, rate]) => {
      const normalized = code.toUpperCase().trim();
      if (normalized !== '' && Number.isFinite(rate) && rate > 0) {
        merged.set(normalized, rate);
      }
    });
    return [...merged.entries()].map(([currency_code, rate_to_base]) => ({
      currency_code,
      rate_to_base,
    }));
  }, [rates.data, serverRates]);
};

/** عملات الجرد المتاحة: عملة الأساس أولاً ثم عملات الإعدادات */
const useAvailableCurrencies = (
  baseCurrency: string,
  rates: Record<string, number>
): string[] =>
  useMemo(() => {
    const codes = new Set<string>([baseCurrency]);
    Object.keys(rates).forEach(code => codes.add(code));
    return [...codes];
  }, [baseCurrency, rates]);

/**
 * حالة نموذج المطابقة: عدّ متعدد العملات + تقرير ماكينة لا يُفترض تلقائياً.
 * كائن مسطح يستهلكه ستة أقسام، ولذلك يُعطَّل حد طول الدالة (التعقيد الدوري = 1).
 */
// eslint-disable-next-line max-lines-per-function -- حاوية حالة مسطحة سببُ طولها توسيع المُنسِّق لا تعقيد المنطق
const useReconciliationFormState = (
  selectedDate: string,
  summary: DailyDrawerSummary | undefined,
  rateRows: ReadonlyArray<{ currency_code: string; rate_to_base: number }>
): ReconciliationFormApi => {
  const baseCurrency = summary ? resolveSummaryCurrency(summary) : 'SAR';
  const [countMode, setCountMode] = useState<CountMode>('quick');
  const [cashCountsByCurrency, setCashCountsByCurrency] = useState<CashCountsByCurrency>({});
  const [activeCurrency, setActiveCurrency] = useState<string>(baseCurrency);
  const [rates, setRates] = useState<Record<string, number>>(() => ({
    [baseCurrency]: 1,
  }));
  const [manualCashTotal, setManualCashTotal] = useState<number>(0);
  const [actualCard, setActualCardRaw] = useState<number>(0);
  const [cardEntered, setCardEntered] = useState<boolean>(false);
  const [cardTerminalRef, setCardTerminalRef] = useState<string>('');
  const [floatRetained, setFloatRetained] = useState<number>(() => defaultFloatFor(baseCurrency));
  const [varianceReason, setVarianceReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // أسعار الصرف من الإعدادات: تُملأ مرة لكل عملة دون تجاوز تعديل المستخدم اليدوي
  useEffect(() => {
    const nextRateMap = buildRateMap(baseCurrency, rateRows);
    setRates(previous => {
      const merged = new Map<string, number>(Object.entries(previous));
      let changed = merged.get(baseCurrency) !== 1;
      merged.set(baseCurrency, 1);
      Object.entries(nextRateMap).forEach(([code, rate]) => {
        if (!merged.has(code)) {
          merged.set(code, rate);
          changed = true;
        }
      });
      return changed ? Object.fromEntries(merged) : previous;
    });
  }, [baseCurrency, rateRows]);

  // عملة العرض الافتراضية = عملة المنشأة الأساسية
  useEffect(() => {
    setActiveCurrency(baseCurrency);
  }, [baseCurrency]);

  // تصفير النموذج عند تغيير التاريخ لمنع بيانات اليوم السابق
  useEffect(() => {
    setCashCountsByCurrency({});
    setManualCashTotal(0);
    setCountMode('quick');
    setActualCardRaw(0);
    setCardEntered(false);
    setCardTerminalRef('');
    setFloatRetained(defaultFloatFor(baseCurrency));
    setVarianceReason('');
    setNotes('');
    // baseCurrency غير مضافة عمداً: تغييرها يخص مزامنة اليومية لا تغيير التاريخ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // مزامنة النموذج مع اليومية القائمة (أو تركه فارغاً ليوم جديد)
  useEffect(() => {
    const plan = planSummarySync(summary);
    if (plan === null) return;
    if (plan.kind === 'fresh') return;
    setCashCountsByCurrency(plan.cashCountsByCurrency);
    setManualCashTotal(plan.manualCashTotal);
    setCountMode(plan.countMode);
    setActualCardRaw(plan.actualCard);
    setCardEntered(plan.cardEntered);
    setFloatRetained(plan.floatRetained);
    setVarianceReason(plan.varianceReason);
    setNotes(plan.notes);
  }, [summary]);

  /** أي إدخال صريح لرقم الماكينة يُعلّم الحقل مُدخلاً (ويُبطل «المطابقة الوهمية») */
  const setActualCard = useCallback(
    (next: SetStateAction<number>): void => {
      setActualCardRaw(previous => (typeof next === 'function' ? next(previous) : next));
      setCardEntered(true);
    },
    []
  );

  const setRate = useCallback((currency: string, rate: number): void => {
    const code = currency.toUpperCase().trim();
    if (code === '') return;
    const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
    setRates(previous => ({ ...previous, [code]: safeRate }));
  }, []);

  return {
    values: {
      countMode,
      cashCountsByCurrency,
      activeCurrency,
      rates,
      manualCashTotal,
      actualCard,
      cardEntered,
      cardTerminalRef,
      floatRetained,
      varianceReason,
      notes,
    },
    setCountMode,
    setCashCountsByCurrency,
    setActiveCurrency,
    setRate,
    setManualCashTotal,
    setActualCard,
    setCardEntered,
    setCardTerminalRef,
    setFloatRetained,
    setVarianceReason,
    setNotes,
  };
};

interface CommitHandlerParams {
  companyId: string | undefined;
  branchId: string | null | undefined;
  selectedDate: string;
  summary: DailyDrawerSummary | undefined;
  view: ReconciliationView;
  form: ReconciliationFormApi;
  commitReconciliation: ReturnType<typeof useCommitDailyReconciliation>['mutate'];
  showToast: (message: string, type: 'warning') => void;
}

const useReconciliationCommit = ({
  companyId,
  branchId,
  selectedDate,
  summary,
  view,
  form,
  commitReconciliation,
  showToast,
}: CommitHandlerParams): (() => void) => {
  const isSubmittingRef = useRef(false);

  return (): void => {
    if (companyId === undefined || companyId === '') return;
    if (isSubmittingRef.current) return;
    if (view.actualCashCounted === 0 && view.expectedCash > 0) {
      if (!confirm(buildZeroCashConfirmMessage(view.currency))) return;
    }

    const blockers = collectCommitBlockers({ view, varianceReason: form.values.varianceReason });
    if (blockers.length > 0) {
      showToast(blockers[0] ?? 'لا يمكن اعتماد اليومية', 'warning');
      return;
    }

    isSubmittingRef.current = true;
    commitReconciliation(
      buildCommitPayload(companyId, selectedDate, {
        branchId,
        summary,
        actualCashCounted: view.actualCashCounted,
        countMode: form.values.countMode,
        cashCountsByCurrency: form.values.cashCountsByCurrency,
        cashRates: form.values.rates,
        actualCard: form.values.actualCard,
        floatRetained: form.values.floatRetained,
        cashToOwner: view.cashToOwner,
        varianceReason: form.values.varianceReason,
        notes: form.values.notes,
      }),
      {
        onSettled: () => {
          isSubmittingRef.current = false;
        },
      }
    );
  };
};

export interface ReconciliationPageController {
  summary: DailyDrawerSummary | undefined;
  view: ReconciliationView;
  form: ReconciliationFormApi;
  modals: ReconciliationModalsApi;
  isLoading: boolean;
  isError: boolean;
  isCommitting: boolean;
  historyList: ExistingReconciliationRecord[] | undefined;
  isHistoryLoading: boolean;
  selectedDate: string;
  onDateChange: (date: string) => void;
  branchName: string | null | undefined;
  shopName: string;
  /** عملات الجرد المتاحة: عملة الأساس أولاً ثم عملات إعدادات المنشأة */
  availableCurrencies: string[];
  handleRetry: () => void;
  handleCommit: () => void;
}

/**
 * متحكّم صفحة المطابقة اليومية: يجمع الاستعلامات والحالة المشتقة ومعالجات الأحداث
 * في كائن واحد، لتبقى الصفحة طبقة عرض رقيقة قابلة للقراءة والمراجعة.
 */
export const useReconciliationPageController = (): ReconciliationPageController => {
  const { user } = useAuthStore();
  const { branchId, branchName } = useBranchFilter();
  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate());
  const modals = useReconciliationModals();
  const { showToast } = useFeedbackStore();
  const { data: summary, isLoading, isError, refetch } = useDailyDrawerSummary(selectedDate);
  const { mutate: commitReconciliation, isPending: isCommitting } = useCommitDailyReconciliation();
  const { data: historyList, isLoading: isHistoryLoading } = useReconciliationHistory(30);
  const rateRows = useRateRows(summary?.cash_rates);
  const form = useReconciliationFormState(selectedDate, summary, rateRows);
  const view = deriveReconciliationView(summary, form.values, user?.role);
  const handleCommit = useReconciliationCommit({
    companyId: user?.company_id,
    branchId,
    selectedDate,
    summary,
    view,
    form,
    commitReconciliation,
    showToast,
  });
  const handleRetry = (): void => {
    void refetch();
  };
  const availableCurrencies = useAvailableCurrencies(view.currency, form.values.rates);

  return {
    summary,
    view,
    form,
    modals,
    isLoading,
    isError,
    isCommitting,
    historyList,
    isHistoryLoading,
    selectedDate,
    onDateChange: setSelectedDate,
    branchName,
    shopName: resolveShopName(user?.company_name),
    availableCurrencies,
    handleRetry,
    handleCommit,
  };
};
