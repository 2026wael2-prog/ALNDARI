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
  const isManager = user?.role === 'owner' || user?.role === 'admin';

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
        'relative flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-xs transition-colors',
        className
      )}
    >
      {/* Right side: Primary Segmented Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Branch Filter (Manager Only) */}
        {showBranchFilter && isManager && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-2 py-1">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={branchId ?? 'ALL'}
              onChange={e =>
                setBranchId(e.target.value === 'ALL' ? null : e.target.value)
              }
              aria-label="تصفية حسب الفرع"
              className="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
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
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-0.5">
            <Calendar className="h-3 w-3 text-slate-400 mx-1 shrink-0" />
            {periodOptions.map(opt => {
              const isSelected = period === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handlePeriodChange(opt.id)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold transition-all',
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
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-0.5">
            <Coins className="h-3 w-3 text-amber-500 mx-1 shrink-0" />
            {currencyOptions.map(opt => {
              const isSelected = currency === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCurrency(opt.id)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold transition-all',
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
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-0.5">
            <CreditCard className="h-3 w-3 text-emerald-500 mx-1 shrink-0" />
            {paymentOptions.map(opt => {
              const isSelected = paymentType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPaymentType(opt.id)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold transition-all',
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
      <div className="flex items-center gap-1.5">
        {/* Active Range Display Badge */}
        <span className="hidden sm:inline-block rounded-md bg-slate-100 dark:bg-slate-800/80 px-2 py-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
          {startDate} ◄ {endDate}
        </span>

        {/* Refresh button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="تحديث البيانات"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin text-blue-500')}
            />
          </button>
        )}

        {/* Reset Filters button */}
        <button
          type="button"
          onClick={resetFilters}
          title="إعادة ضبط الفلاتر"
          className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          <span>إعادة ضبط</span>
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
