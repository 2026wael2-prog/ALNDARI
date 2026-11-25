import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Wallet,
  ShoppingBag,
  Users,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
} from 'lucide-react';
import { useExecutiveBiSummary } from '../../hooks/useBiAnalytics';
import { BiFilterBar } from './BiFilterBar';
import type { BiDatePreset } from '../../types/biAnalytics';
import { formatCurrency, cn } from '@/core/utils';
import { getBiDateRangeForPreset } from '@/core/utils/dateUtils';

interface ExecutiveBiViewProps {
  onNavigateToTab?: ((tab: string) => void) | undefined;
}

export const ExecutiveBiView: React.FC<ExecutiveBiViewProps> = ({ onNavigateToTab }) => {
  const [datePreset, setDatePreset] = useState<BiDatePreset>('this_month');
  const [dateRange, setDateRange] = useState<{ from?: string | undefined; to?: string | undefined }>(() =>
    getBiDateRangeForPreset('this_month')
  );

  const { data: summary, isLoading, refetch, dataUpdatedAt } = useExecutiveBiSummary(
    undefined,
    dateRange.from,
    dateRange.to
  );

  const curr = summary?.current;
  const prev = summary?.previous;
  const growth = summary?.growth;

  const renderGrowthBadge = (pct: number | undefined) => {
    if (pct === undefined || isNaN(pct)) return null;
    const isPositive = pct >= 0;
    return (
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono',
          isPositive
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
        )}
      >
        {isPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
        <span>{pct > 0 ? `+${pct}` : pct}%</span>
        <span className="text-[10px] font-normal text-slate-400">مقارنة بالسابق</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <BiFilterBar
        datePreset={datePreset}
        onPresetChange={(p, range) => {
          setDatePreset(p);
          setDateRange(range);
        }}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        onDateRangeChange={(from, to) => {
          setDatePreset('custom');
          setDateRange({ from, to });
        }}
        onRefresh={() => refetch()}
        onExportPdf={() => window.print()}
        lastUpdatedAt={dataUpdatedAt}
        isLoading={isLoading}
      />

      {/* Main Executive KPI Cards — 4-per-row on mobile */}
      <div className="grid grid-cols-4 gap-1 sm:gap-3">
        {/* Net Sales */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px] sm:uppercase">صافي المبيعات</span>
            <div className="hidden rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 sm:block">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-1 sm:mt-2">
            <h3 dir="ltr" className="truncate text-right font-mono text-[11px] font-black text-blue-600 dark:text-blue-400 sm:text-2xl">
              {formatCurrency(curr?.net_sales ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 hidden items-center justify-between sm:flex">
              <span className="font-mono text-[10px] text-slate-400">
                السابق: {formatCurrency(prev?.net_sales ?? 0, 'SAR')}
              </span>
              {renderGrowthBadge(growth?.sales_growth_pct)}
            </div>
          </div>
        </div>

        {/* Gross Profit & Margin */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-[11px] sm:uppercase">الربح المحقق</span>
            <div className="hidden rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30 sm:block">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="mt-1 sm:mt-2">
            <h3 dir="ltr" className="truncate text-right font-mono text-[11px] font-black text-emerald-600 dark:text-emerald-400 sm:text-2xl">
              {formatCurrency(curr?.gross_profit ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 hidden items-center justify-between sm:flex">
              <span className="font-mono text-[10px] font-bold text-slate-500">
                هامش الربح: {curr?.gross_margin_percent ?? 0}%
              </span>
              {renderGrowthBadge(growth?.profit_growth_pct)}
            </div>
          </div>
        </div>

        {/* Purchases */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px] sm:uppercase">المشتريات</span>
            <div className="hidden rounded-xl bg-purple-50 p-2 text-purple-600 dark:bg-purple-900/30 sm:block">
              <ShoppingBag size={16} />
            </div>
          </div>
          <div className="mt-1 sm:mt-2">
            <h3 dir="ltr" className="truncate text-right font-mono text-[11px] font-black text-purple-600 dark:text-purple-400 sm:text-2xl">
              {formatCurrency(curr?.purchases ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 hidden items-center justify-between sm:flex">
              <span className="font-mono text-[10px] text-slate-400">
                السابق: {formatCurrency(prev?.purchases ?? 0, 'SAR')}
              </span>
              {renderGrowthBadge(growth?.purchases_growth_pct)}
            </div>
          </div>
        </div>

        {/* Cash Liquidity */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-amber-600 dark:text-amber-400 sm:text-[11px] sm:uppercase">السيولة</span>
            <div className="hidden rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/30 sm:block">
              <Wallet size={16} />
            </div>
          </div>
          <div className="mt-1 sm:mt-2">
            <h3 dir="ltr" className="truncate text-right font-mono text-[11px] font-black text-amber-600 dark:text-amber-400 sm:text-2xl">
              {formatCurrency(curr?.cash_liquidity ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 hidden text-[10px] text-slate-400 sm:block">
              أرصدة الصناديق والبنوك الحية
            </div>
          </div>
        </div>
      </div>

      {/* Financial Position & Operational Health Row — 4-per-row on mobile */}
      <div className="grid grid-cols-4 gap-1 sm:gap-3">
        {/* Stock Valuation */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[10px] sm:uppercase">قيمة المخزون</span>
            <Layers size={12} className="hidden shrink-0 text-slate-400 sm:inline" />
          </div>
          <div dir="ltr" className="mt-0.5 truncate text-right font-mono text-[10.5px] font-black text-slate-800 dark:text-slate-100 sm:mt-1 sm:text-lg">
            {formatCurrency(curr?.stock_valuation ?? 0, 'SAR')}
          </div>
          <div className="hidden text-[10px] text-slate-400 sm:block">أصول مخزنية مقيمة</div>
        </div>

        {/* Receivables */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[10px] sm:uppercase">ديون العملاء</span>
            <Users size={12} className="hidden shrink-0 text-blue-500 sm:inline" />
          </div>
          <div dir="ltr" className="mt-0.5 truncate text-right font-mono text-[10.5px] font-black text-blue-600 dark:text-blue-400 sm:mt-1 sm:text-lg">
            {formatCurrency(curr?.receivables ?? 0, 'SAR')}
          </div>
          <div className="hidden text-[10px] text-slate-400 sm:block">ذمم مدينة</div>
        </div>

        {/* Payables */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[10px] sm:uppercase">للموردين</span>
            <ShoppingBag size={12} className="hidden shrink-0 text-rose-500 sm:inline" />
          </div>
          <div dir="ltr" className="mt-0.5 truncate text-right font-mono text-[10.5px] font-black text-rose-600 dark:text-rose-400 sm:mt-1 sm:text-lg">
            {formatCurrency(curr?.payables ?? 0, 'SAR')}
          </div>
          <div className="hidden text-[10px] text-slate-400 sm:block">ذمم دائنة</div>
        </div>

        {/* Active Parties */}
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[10px] sm:uppercase">النشطين</span>
            <ShieldCheck size={12} className="hidden shrink-0 text-emerald-500 sm:inline" />
          </div>
          <div className="mt-0.5 truncate font-mono text-[10.5px] font-black text-slate-800 dark:text-slate-100 sm:mt-1 sm:flex sm:items-baseline sm:justify-between sm:text-lg">
            <span>{curr?.active_customers ?? 0}</span>
            <span className="text-[10px] text-slate-400 sm:text-sm"> / {curr?.active_suppliers ?? 0}</span>
          </div>
          <div className="hidden text-[10px] text-slate-400 sm:block">علاقات تجارية نشطة</div>
        </div>
      </div>

      {/* Quick Navigation Cards to Deep Centers — 3-up on mobile */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
        <div
          onClick={() => onNavigateToTab?.('customer_bi')}
          className="group min-w-0 cursor-pointer rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-2 transition-all hover:border-blue-300 hover:shadow-md dark:border-blue-900/30 dark:from-blue-950/20 dark:to-slate-900 sm:rounded-2xl sm:p-4"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-blue-100 p-1.5 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300 sm:rounded-xl sm:p-2">
              <Users size={14} className="sm:h-[18px] sm:w-[18px]" />
            </div>
            <ArrowUpRight size={14} className="text-slate-400 transition-transform group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:text-blue-600 sm:h-4 sm:w-4" />
          </div>
          <h4 className="mt-1.5 truncate text-[10.5px] font-bold text-slate-800 dark:text-slate-100 sm:mt-3 sm:text-sm">تحليلات العملاء</h4>
          <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">
            ترتيب العملاء، تصنيف الولاء RFM، كفاءة التحصيل، وأعمار الديون.
          </p>
        </div>

        <div
          onClick={() => onNavigateToTab?.('supplier_bi')}
          className="group min-w-0 cursor-pointer rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50/50 to-white p-2 transition-all hover:border-purple-300 hover:shadow-md dark:border-purple-900/30 dark:from-purple-950/20 dark:to-slate-900 sm:rounded-2xl sm:p-4"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-purple-100 p-1.5 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300 sm:rounded-xl sm:p-2">
              <ShoppingBag size={14} className="sm:h-[18px] sm:w-[18px]" />
            </div>
            <ArrowUpRight size={14} className="text-slate-400 transition-transform group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:text-purple-600 sm:h-4 sm:w-4" />
          </div>
          <h4 className="mt-1.5 truncate text-[10.5px] font-bold text-slate-800 dark:text-slate-100 sm:mt-3 sm:text-sm">تحليلات الموردين</h4>
          <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">
            ترتيب الموردين، تاريخ الأسعار، نسب السداد، وتنوع الأصناف.
          </p>
        </div>

        <div
          onClick={() => onNavigateToTab?.('product_bi')}
          className="group min-w-0 cursor-pointer rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white p-2 transition-all hover:border-emerald-300 hover:shadow-md dark:border-emerald-900/30 dark:from-emerald-950/20 dark:to-slate-900 sm:rounded-2xl sm:p-4"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-emerald-100 p-1.5 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300 sm:rounded-xl sm:p-2">
              <Layers size={14} className="sm:h-[18px] sm:w-[18px]" />
            </div>
            <ArrowUpRight size={14} className="text-slate-400 transition-transform group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:text-emerald-600 sm:h-4 sm:w-4" />
          </div>
          <h4 className="mt-1.5 truncate text-[10.5px] font-bold text-slate-800 dark:text-slate-100 sm:mt-3 sm:text-sm">المنتجات والركود</h4>
          <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">
            الأكثر مبيعاً وربحية، دوران المخزون، الراكد وبطيء الحركة، والمرتجعات.
          </p>
        </div>
      </div>
    </div>
  );
};
