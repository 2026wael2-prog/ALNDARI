import React, { useState } from 'react';
import {
  Calendar,
  Building2,
  Coins,
  CreditCard,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import {
  useAnalyticsFilterStore,
  type AnalyticsPeriod,
  type AnalyticsCurrency,
  type AnalyticsPaymentType,
} from '../../core/store/analyticsFilterStore';
import { useAuthStore } from '../../features/auth/store';
import { canUserSwitchBranches } from '../../features/branches/store';
import { useBranches } from '../../features/settings/hooks';
import { cn } from '../../core/utils';

export interface AnalyticsUnifiedFilterBarProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showBranchFilter?: boolean;
  showDateFilter?: boolean;
  showCurrencyFilter?: boolean;
  showPaymentFilter?: boolean;
  className?: string;
}

export const AnalyticsUnifiedFilterBar: React.FC<AnalyticsUnifiedFilterBarProps> = ({
  onRefresh,
  isRefreshing = false,
  showBranchFilter = true,
  showDateFilter = true,
  showCurrencyFilter = true,
  showPaymentFilter = true,
  className,
}) => {
  const { user } = useAuthStore();
  const isManager = canUserSwitchBranches(user);

  const {
    period,
    startDate,
    endDate,
    currency,
    paymentType,
    branchId,
    setPeriod,
    setCurrency,
    setPaymentType,
    setBranchId,
    resetFilters,
  } = useAnalyticsFilterStore();

  const branchesQuery = useBranches();
  const branches = (branchesQuery as any)?.data ?? (branchesQuery as any);
  const activeBranches = (Array.isArray(branches) ? branches : []).filter(
    (b: any) => b.status === 'active'
  );

  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const periodOptions: Array<{ id: AnalyticsPeriod; label: string }> = [
    { id: 'today', label: 'اليوم' },
    { id: 'week', label: 'الأسبوع' },
    { id: 'month', label: 'الشهر' },
    { id: 'quarter', label: 'الربع' },
    { id: 'year', label: 'السنة' },
    { id: 'custom', label: 'مخصص' },
  ];

  const currencyOptions: Array<{ id: AnalyticsCurrency; label: string }> = [
    { id: 'ALL', label: 'الكل (ثنائي)' },
    { id: 'SAR', label: 'ر.س' },
    { id: 'YER', label: 'ر.ي' },
  ];

  const paymentOptions: Array<{ id: AnalyticsPaymentType; label: string }> = [
    { id: 'ALL', label: 'الكل' },
    { id: 'cash', label: 'نقد' },
    { id: 'credit', label: 'آجل' },
  ];

  const handlePeriodChange = (p: AnalyticsPeriod) => {
    if (p === 'custom') {
      setShowCustomModal(true);
    } else {
      setShowCustomModal(false);
      setPeriod(p);
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      setPeriod('custom', { startDate: customStart, endDate: customEnd });
      setShowCustomModal(false);
    }
  };

  return (
    <div
      className={cn(
        'no-scrollbar relative flex flex-nowrap items-center justify-between gap-1 overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1 shadow-xs transition-colors sm:rounded-xl sm:p-1.5 md:flex-wrap md:gap-2 md:p-2',
        className
      )}
    >
      {/* Right side: Primary Segmented Filters */}
      <div className="flex shrink-0 flex-nowrap items-center gap-1 md:flex-wrap md:gap-1.5">
        {/* Branch Filter (Manager Only) */}
        {showBranchFilter && isManager && (
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 dark:border-slate-800 dark:bg-slate-900/50 sm:rounded-lg md:px-2 md:py-1">
            <Building2 className="h-3 w-3 shrink-0 text-slate-400 sm:h-3.5 sm:w-3.5" />
            <select
              value={branchId ?? 'ALL'}
              onChange={e =>
                setBranchId(e.target.value === 'ALL' ? null : e.target.value)
              }
              aria-label="تصفية حسب الفرع"
              className="cursor-pointer bg-transparent text-[10px] font-bold text-slate-700 outline-none dark:text-slate-200 sm:text-[11px]"
            >
              <option value="ALL">جميع الفروع</option>
              {activeBranches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date / Period Filter */}
        {showDateFilter && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900/50 sm:rounded-lg">
            <Calendar className="mx-0.5 h-3 w-3 shrink-0 text-slate-400 sm:mx-1" />
            {periodOptions.map(opt => {
              const isSelected = period === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handlePeriodChange(opt.id)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold transition-all sm:rounded-md sm:text-[10px] md:px-2',
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Currency Filter */}
        {showCurrencyFilter && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900/50 sm:rounded-lg">
            <Coins className="mx-0.5 h-3 w-3 shrink-0 text-amber-500 sm:mx-1" />
            {currencyOptions.map(opt => {
              const isSelected = currency === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCurrency(opt.id)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold transition-all sm:rounded-md sm:text-[10px] md:px-2',
                    isSelected
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Payment Type Filter */}
        {showPaymentFilter && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900/50 sm:rounded-lg">
            <CreditCard className="mx-0.5 h-3 w-3 shrink-0 text-emerald-500 sm:mx-1" />
            {paymentOptions.map(opt => {
              const isSelected = paymentType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPaymentType(opt.id)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold transition-all sm:rounded-md sm:text-[10px] md:px-2',
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Left side: Date Badge, Refresh & Reset Actions */}
      <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
        {/* Active Range Display Badge */}
        <span className="hidden rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 sm:inline-block">
          {startDate} ◄ {endDate}
        </span>

        {/* Refresh button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="تحديث البيانات"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 sm:h-7 sm:w-7 sm:rounded-lg"
          >
            <RefreshCw
              className={cn('h-3 w-3 sm:h-3.5 sm:w-3.5', isRefreshing && 'animate-spin text-blue-500')}
            />
          </button>
        )}

        {/* Reset Filters button */}
        <button
          type="button"
          onClick={resetFilters}
          title="إعادة ضبط الفلاتر"
          className="flex h-6 items-center gap-1 rounded-md border border-slate-200 px-1.5 text-[10px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 sm:h-7 sm:rounded-lg sm:px-2"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="hidden sm:inline">إعادة ضبط</span>
        </button>
      </div>

      {/* Custom Date Range Popover/Modal */}
      {showCustomModal && (
        <div className="absolute top-full z-30 mt-1 right-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 shadow-xl flex flex-col gap-2">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            تحديد فترة مخصصة:
          </span>
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-slate-400">من تاريخ:</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono outline-none"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-slate-400">إلى تاريخ:</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => setShowCustomModal(false)}
              className="rounded-md px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={applyCustomRange}
              className="rounded-md bg-blue-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-blue-700"
            >
              تطبيق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsUnifiedFilterBar;
