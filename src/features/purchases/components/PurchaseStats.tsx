import React, { useState, useMemo } from 'react';
import { TrendingDown, Wallet, RefreshCw, CreditCard, Filter, Coins } from 'lucide-react';
import StatCard from '../../../ui/common/StatCard';
import DualCurrencyStatCard from '../../../ui/common/DualCurrencyStatCard';
import { usePurchaseStats } from '../hooks';
import type { PurchaseStatsFilters } from '../service';
import { formatCurrency, formatNumberDisplay, cn } from '../../../core/utils';
import { useAnalyticsFilterStore } from '../../../core/store/analyticsFilterStore';
import type { DatePreset } from '@/core/types/invoiceSearch';
import { getDateRangeForPreset } from '@/core/utils/dateUtils';

export interface PurchaseStatsProps {
  filters?: PurchaseStatsFilters;
  datePreset?: DatePreset;
  onDatePresetChange?: (
    preset: DatePreset,
    range: { from?: string | undefined; to?: string | undefined }
  ) => void;
  currencyFilter?: string;
  onCurrencyFilterChange?: (currency: string) => void;
  showPeriodFilter?: boolean;
}

const STATS_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'this_year', label: 'الفترة الحالية' },
  { id: 'today', label: 'اليوم' },
  { id: 'this_week', label: 'آخر 7 أيام' },
  { id: 'this_month', label: 'هذا الشهر' },
  { id: 'last_month', label: 'الشهر السابق' },
  { id: 'all', label: 'كل الفترات' },
];

const CURRENCY_OPTIONS = [
  { id: 'ALL', label: 'الكل (ثنائي)' },
  { id: 'SAR', label: 'ر.س' },
  { id: 'YER', label: 'ر.ي' },
];

export const PurchaseStats: React.FC<PurchaseStatsProps> = ({
  filters: externalFilters,
  datePreset: externalPreset,
  onDatePresetChange,
  currencyFilter: externalCurrency,
  onCurrencyFilterChange,
  showPeriodFilter = true,
}) => {
  const globalStore = useAnalyticsFilterStore();
  const [internalPreset, setInternalPreset] = useState<DatePreset>('this_year');
  const [internalRange, setInternalRange] = useState<{
    from?: string | undefined;
    to?: string | undefined;
  }>(() => getDateRangeForPreset('this_year'));
  const [internalCurrency, setInternalCurrency] = useState<string>('ALL');

  const activePreset = externalPreset ?? internalPreset;
  const activeCurrency =
    externalCurrency !== undefined && externalCurrency !== 'all'
      ? externalCurrency.toUpperCase()
      : externalCurrency === 'all'
        ? 'ALL'
        : internalCurrency;

  const effectiveStartDate =
    externalFilters?.startDate !== undefined
      ? externalFilters.startDate
      : internalRange.from;

  const effectiveEndDate =
    externalFilters?.endDate !== undefined
      ? externalFilters.endDate
      : internalRange.to;

  const effectiveFilters = useMemo<PurchaseStatsFilters>(() => {
    return {
      branchId: externalFilters?.branchId ?? null,
      startDate: effectiveStartDate ?? null,
      endDate: effectiveEndDate ?? null,
      currency: (activeCurrency as any) ?? globalStore.currency,
      paymentType: externalFilters?.paymentType ?? globalStore.paymentType,
    };
  }, [externalFilters, effectiveStartDate, effectiveEndDate, activeCurrency, globalStore]);

  const { data: stats, isLoading } = usePurchaseStats(effectiveFilters);

  const handlePresetSelect = (preset: DatePreset) => {
    const range = getDateRangeForPreset(preset);
    if (onDatePresetChange) {
      onDatePresetChange(preset, range);
    } else {
      setInternalPreset(preset);
      setInternalRange(range);
    }
  };

  const handleCurrencySelect = (curr: string) => {
    if (onCurrencyFilterChange) {
      onCurrencyFilterChange(curr.toLowerCase());
    } else {
      setInternalCurrency(curr);
    }
  };

  const periodLabel = useMemo(() => {
    if (activePreset === 'this_year') return `الفترة الحالية (${new Date().getFullYear()})`;
    if (activePreset === 'all') return 'كل الفترات';
    if (activePreset === 'today') return 'اليوم';
    if (activePreset === 'this_week') return 'آخر 7 أيام';
    if (activePreset === 'this_month') return 'هذا الشهر';
    if (activePreset === 'last_month') return 'الشهر السابق';
    if (effectiveStartDate && effectiveEndDate) {
      return `${effectiveStartDate} ◄ ${effectiveEndDate}`;
    }
    return 'فترة مخصصة';
  }, [activePreset, effectiveStartDate, effectiveEndDate]);

  return (
    <div className="flex flex-col gap-2">
      {/* Interactive Quick Period & Currency Filter Bar */}
      {showPeriodFilter && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 shadow-2xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <Filter size={13} className="text-blue-500" />
            <span>فلترة بطائق المشتريات:</span>
            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
              {periodLabel}
            </span>
            {activeCurrency !== 'ALL' && (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                {activeCurrency}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Presets */}
            <div className="flex items-center gap-1">
              {STATS_PRESETS.map(p => {
                const isSelected = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetSelect(p.id)}
                    className={cn(
                      'rounded-lg px-2 py-0.5 text-[10px] font-bold transition-all',
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-500'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Currency toggles */}
            <div className="flex items-center gap-0.5 border-r border-slate-200 pr-2 dark:border-slate-700">
              <Coins size={12} className="text-amber-500 mr-0.5" />
              {CURRENCY_OPTIONS.map(c => {
                const isSelected = activeCurrency === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCurrencySelect(c.id)}
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all',
                      isSelected
                        ? 'bg-amber-600 text-white shadow-2xs dark:bg-amber-500'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="h-24 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {/* 1. Net Purchases (Dual Currency Aware, after Returns) */}
          <DualCurrencyStatCard
            title="صافي المشتريات"
            amountSAR={stats?.totalPurchasesSAR ?? 0}
            amountYER={stats?.totalPurchasesYER ?? 0}
            currencyMode={(activeCurrency as any) ?? globalStore.currency}
            countText={`${formatNumberDisplay(stats?.invoiceCount ?? 0)} فاتورة`}
            subtext={`بعد خصم المرتجعات (${periodLabel})`}
            icon={TrendingDown}
            colorClass="text-blue-600 dark:text-blue-400"
            iconBgClass="bg-blue-500"
          />

          {/* 2. Total Paid to Suppliers (Cash + Inline Paid + Payment/Disbursement Bonds) */}
          <StatCard
            title="المسدد للموردين (نقد + سندات)"
            value={formatCurrency(
              stats?.totalPaid ?? 0,
              externalCurrency && externalCurrency !== 'ALL' && externalCurrency !== 'all'
                ? externalCurrency
                : 'SAR'
            )}
            subtext={`شامل النقدي وسندات الصرف (${periodLabel})`}
            icon={Wallet}
            colorClass="text-emerald-600 dark:text-emerald-400"
            iconBgClass="bg-emerald-500"
          />

          {/* 3. Purchase Returns */}
          <StatCard
            title="مرتجعات المشتريات"
            value={formatCurrency(
              stats?.totalReturns ?? 0,
              externalCurrency && externalCurrency !== 'ALL' && externalCurrency !== 'all'
                ? externalCurrency
                : 'SAR'
            )}
            subtext={`${formatNumberDisplay(stats?.returnCount ?? 0)} فاتورة مرتجع`}
            icon={RefreshCw}
            colorClass="text-amber-600 dark:text-amber-400"
            iconBgClass="bg-amber-500"
          />

          {/* 4. Net Remaining Supplier Debt (Dual Currency Aware, after Bonds & Returns) */}
          <DualCurrencyStatCard
            title="صافي المتبقي للموردين"
            amountSAR={stats?.totalDebtSAR ?? 0}
            amountYER={stats?.totalDebtYER ?? 0}
            currencyMode={(activeCurrency as any) ?? globalStore.currency}
            countText={`${formatNumberDisplay(stats?.pendingPaymentCount ?? 0)} فاتورة آجلة`}
            subtext="بعد خصم السندات والمرتجعات"
            icon={CreditCard}
            colorClass="text-rose-600 dark:text-rose-400"
            iconBgClass="bg-rose-500"
          />
        </div>
      )}
    </div>
  );
};

export default PurchaseStats;
