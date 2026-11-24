import React from 'react';
import { Scale, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';

interface DebtReportKpiCardsProps {
  baseCurrency: string;
  totalReceivables: number;
  totalPayables: number;
  netPosition: number;
  receivablesCount: number;
  payablesCount: number;
  totalActiveCount: number;
  receivablesRatio: number;
  activeCurrencies: string[];
}

export const DebtReportKpiCards: React.FC<DebtReportKpiCardsProps> = ({
  baseCurrency,
  totalReceivables,
  totalPayables,
  netPosition,
  receivablesCount,
  payablesCount,
  totalActiveCount,
  receivablesRatio,
  activeCurrencies,
}) => (
  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
    <div className="rounded-2xl border border-emerald-200/70 bg-[var(--app-surface)] p-4 shadow-sm dark:border-emerald-900/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">
          إجمالي مستحقات العملاء (عليه)
        </span>
        <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
          <TrendingUp size={16} />
        </div>
      </div>
      <div
        dir="ltr"
        className="mt-2.5 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white"
      >
        {formatCurrency(totalReceivables, baseCurrency)}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
        <Users size={13} />
        <span>{receivablesCount} عميل لديه رصيد نشط</span>
      </div>
    </div>

    <div className="rounded-2xl border border-rose-200/70 bg-[var(--app-surface)] p-4 shadow-sm dark:border-rose-900/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-rose-700 dark:text-rose-400">
          ديون مستحقة للموردين (له)
        </span>
        <div className="rounded-xl bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
          <TrendingDown size={16} />
        </div>
      </div>
      <div
        dir="ltr"
        className="mt-2.5 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white"
      >
        {formatCurrency(totalPayables, baseCurrency)}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
        <Users size={13} />
        <span>{payablesCount} مورد لديه رصيد نشط</span>
      </div>
    </div>

    <div
      className={cn(
        'rounded-2xl border p-4 shadow-sm',
        netPosition >= 0
          ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/30'
          : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30'
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-xs font-black',
            netPosition >= 0
              ? 'text-blue-700 dark:text-blue-300'
              : 'text-amber-700 dark:text-amber-300'
          )}
        >
          صافي المركز المالي
        </span>
        <div
          className={cn(
            'rounded-xl p-2',
            netPosition >= 0
              ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          )}
        >
          <Scale size={16} />
        </div>
      </div>
      <div
        dir="ltr"
        className="mt-2.5 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white"
      >
        {formatCurrency(Math.abs(netPosition), baseCurrency)}
      </div>
      <div className="mt-2 text-[11px] font-black">
        <span
          className={cn(
            'rounded-full px-2 py-0.5',
            netPosition >= 0 ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
          )}
        >
          {netPosition >= 0 ? 'فائض لصالح المنشأة' : 'التزامات على المنشأة'}
        </span>
      </div>
    </div>

    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-slate-700 dark:text-slate-200">
          إجمالي الذمم النشطة
        </span>
        <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {totalActiveCount} جهة
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-emerald-600 dark:text-emerald-400">
            عملاء {receivablesRatio}%
          </span>
          <span className="text-rose-600 dark:text-rose-400">
            موردين {100 - receivablesRatio}%
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/50">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${receivablesRatio}%` }}
          />
        </div>
      </div>
      <p className="mt-2.5 text-[10px] font-bold text-slate-400">
        العملات النشطة: {activeCurrencies.join(' • ')}
      </p>
    </div>
  </div>
);
