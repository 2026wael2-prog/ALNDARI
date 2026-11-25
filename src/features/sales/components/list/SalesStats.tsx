import React, { useState, useMemo } from 'react';
import { DollarSign, Wallet, CreditCard, RefreshCw, Filter } from 'lucide-react';
import StatCard from '../../../../ui/common/StatCard';
import { useSalesStats } from '../../hooks/index';
import { formatCurrency, formatNumberDisplay, cn } from '../../../../core/utils';
import ErrorDisplay from '../../../../ui/base/ErrorDisplay';
import type { DatePreset } from '@/core/types/invoiceSearch';
import { getDateRangeForPreset } from '@/core/utils/dateUtils';

export interface SalesStatsProps {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  datePreset?: DatePreset | undefined;
  onDatePresetChange?: (
    preset: DatePreset,
    range: { from?: string | undefined; to?: string | undefined }
  ) => void;
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

export const SalesStats: React.FC<SalesStatsProps> = ({
  dateFrom: externalDateFrom,
  dateTo: externalDateTo,
  datePreset: externalPreset,
  onDatePresetChange,
  showPeriodFilter = true,
}) => {
  const [internalPreset, setInternalPreset] = useState<DatePreset>('this_year');
  const [internalRange, setInternalRange] = useState<{
    from?: string | undefined;
    to?: string | undefined;
  }>(() => getDateRangeForPreset('this_year'));

  const activePreset = externalPreset ?? internalPreset;
  const effectiveDateFrom = externalDateFrom !== undefined ? externalDateFrom : internalRange.from;
  const effectiveDateTo = externalDateTo !== undefined ? externalDateTo : internalRange.to;

  const statsFilters = useMemo(
    () => ({
      dateFrom: effectiveDateFrom,
      dateTo: effectiveDateTo,
    }),
    [effectiveDateFrom, effectiveDateTo]
  );

  const { data: stats, isLoading, error, refetch } = useSalesStats(statsFilters);

  const handlePresetSelect = (preset: DatePreset) => {
    const range = getDateRangeForPreset(preset);
    if (onDatePresetChange) {
      onDatePresetChange(preset, range);
    } else {
      setInternalPreset(preset);
      setInternalRange(range);
    }
  };

  const periodLabel = useMemo(() => {
    if (activePreset === 'this_year') return `الفترة الحالية (${new Date().getFullYear()})`;
    if (activePreset === 'all') return 'كل الفترات';
    if (activePreset === 'today') return 'اليوم';
    if (activePreset === 'this_week') return 'آخر 7 أيام';
    if (activePreset === 'this_month') return 'هذا الشهر';
    if (activePreset === 'last_month') return 'الشهر السابق';
    if (effectiveDateFrom && effectiveDateTo) {
      return `${effectiveDateFrom} ◄ ${effectiveDateTo}`;
    }
    return 'فترة مخصصة';
  }, [activePreset, effectiveDateFrom, effectiveDateTo]);

  if (error) {
    return <ErrorDisplay error={error?.message || null} variant="mini" onRetry={refetch} />;
  }

  const growth = stats?.monthlyGrowth;
  const salesSubtext =
    growth !== null && growth !== undefined
      ? `${formatNumberDisplay(stats?.invoiceCount ?? 0)} فاتورة • نمو ${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`
      : `${formatNumberDisplay(stats?.invoiceCount ?? 0)} فاتورة (${periodLabel})`;

  return (
    <div className="flex flex-col gap-1.5 md:gap-2">
      {/* Interactive Quick Period Filter Bar (Desktop only — InvoiceSearchToolbar already provides date presets below on mobile) */}
      {showPeriodFilter && (
        <div className="hidden flex-wrap items-center justify-between gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 shadow-2xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/80 md:flex">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <Filter size={13} className="text-emerald-500" />
            <span>فلترة بطائق المبيعات:</span>
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              {periodLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
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
                      ? 'bg-emerald-600 text-white shadow-xs dark:bg-emerald-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-1 sm:gap-2 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="h-14 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] sm:h-24 sm:rounded-2xl"
            />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-4 gap-1 sm:gap-2">
          <StatCard
            title="صافي المبيعات"
            value={formatCurrency(stats.netSales ?? stats.totalSales)}
            subtext={salesSubtext}
            icon={DollarSign}
            colorClass="text-emerald-600 dark:text-emerald-400"
            iconBgClass="bg-emerald-500"
          />
          <StatCard
            title="المحصّل الفعلي (نقد + سندات)"
            value={formatCurrency(stats.totalCollected ?? 0)}
            subtext={`مبيعات نقدية + سندات قبض (${periodLabel})`}
            icon={Wallet}
            colorClass="text-blue-600 dark:text-blue-400"
            iconBgClass="bg-blue-500"
          />
          <StatCard
            title="متبقي ذمم الآجل"
            value={formatCurrency(stats.totalRemainingCredit ?? 0)}
            subtext="آجل فقط بعد خصم السندات والمرتجعات"
            icon={CreditCard}
            colorClass="text-rose-600 dark:text-rose-400"
            iconBgClass="bg-rose-500"
          />
          <StatCard
            title="مرتجعات المبيعات"
            value={formatCurrency(stats.totalReturns ?? 0)}
            subtext={`${formatNumberDisplay(stats.returnCount ?? 0)} فاتورة مرتجع`}
            icon={RefreshCw}
            colorClass="text-amber-600 dark:text-amber-400"
            iconBgClass="bg-amber-500"
          />
        </div>
      ) : null}
    </div>
  );
};

export default SalesStats;
