import { create } from 'zustand';

export type AnalyticsPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type AnalyticsCurrency = 'ALL' | 'SAR' | 'YER';
export type AnalyticsPaymentType = 'ALL' | 'cash' | 'credit' | 'bank' | 'network';

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Format Date as YYYY-MM-DD in local time
 */
export const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Resolve standard period keywords into concrete [startDate, endDate] ranges
 */
export const computePeriodDateRange = (period: AnalyticsPeriod): DateRange => {
  const now = new Date();
  const todayStr = formatLocalDate(now);

  switch (period) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };

    case 'yesterday': {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yStr = formatLocalDate(yesterday);
      return { startDate: yStr, endDate: yStr };
    }

    case 'week': {
      // Last 7 days including today
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { startDate: formatLocalDate(startOfWeek), endDate: todayStr };
    }

    case 'month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: formatLocalDate(startOfMonth), endDate: todayStr };
    }

    case 'quarter': {
      const currentMonth = now.getMonth();
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      const startOfQuarter = new Date(now.getFullYear(), quarterStartMonth, 1);
      return { startDate: formatLocalDate(startOfQuarter), endDate: todayStr };
    }

    case 'year': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { startDate: formatLocalDate(startOfYear), endDate: todayStr };
    }

    case 'custom':
    default:
      return { startDate: todayStr, endDate: todayStr };
  }
};

export interface AnalyticsFilterState {
  period: AnalyticsPeriod;
  startDate: string;
  endDate: string;
  currency: AnalyticsCurrency;
  paymentType: AnalyticsPaymentType;
  branchId: string | null; // null means 'all branches' or inherit active branch
  customRange: DateRange | null;

  // Actions
  setPeriod: (period: AnalyticsPeriod, customRange?: DateRange) => void;
  setCurrency: (currency: AnalyticsCurrency) => void;
  setPaymentType: (type: AnalyticsPaymentType) => void;
  setBranchId: (branchId: string | null) => void;
  resetFilters: () => void;
}

const initialDateRange = computePeriodDateRange('month');

export const useAnalyticsFilterStore = create<AnalyticsFilterState>(set => ({
  period: 'month',
  startDate: initialDateRange.startDate,
  endDate: initialDateRange.endDate,
  currency: 'ALL',
  paymentType: 'ALL',
  branchId: null,
  customRange: null,

  setPeriod: (period, customRange) => {
    if (period === 'custom' && customRange) {
      set({
        period: 'custom',
        startDate: customRange.startDate,
        endDate: customRange.endDate,
        customRange,
      });
    } else {
      const range = computePeriodDateRange(period);
      set({
        period,
        startDate: range.startDate,
        endDate: range.endDate,
      });
    }
  },

  setCurrency: currency => set({ currency }),
  setPaymentType: paymentType => set({ paymentType }),
  setBranchId: branchId => set({ branchId }),

  resetFilters: () => {
    const range = computePeriodDateRange('month');
    set({
      period: 'month',
      startDate: range.startDate,
      endDate: range.endDate,
      currency: 'ALL',
      paymentType: 'ALL',
      branchId: null,
      customRange: null,
    });
  },
}));

