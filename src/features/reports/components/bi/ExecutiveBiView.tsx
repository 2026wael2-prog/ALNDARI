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

      {/* Main Executive KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Sales */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-slate-400">صافي المبيعات (Net Sales)</span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="font-mono text-2xl font-black text-blue-600 dark:text-blue-400">
              {formatCurrency(curr?.net_sales ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-400">
                السابق: {formatCurrency(prev?.net_sales ?? 0, 'SAR')}
              </span>
              {renderGrowthBadge(growth?.sales_growth_pct)}
            </div>
          </div>
        </div>

        {/* Gross Profit & Margin */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">إجمالي الربح المحقق</span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(curr?.gross_profit ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-slate-500">
                هامش الربح: {curr?.gross_margin_percent ?? 0}%
              </span>
              {renderGrowthBadge(growth?.profit_growth_pct)}
            </div>
          </div>
        </div>

        {/* Purchases */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-slate-400">إجمالي المشتريات والتوريد</span>
            <div className="rounded-xl bg-purple-50 p-2 text-purple-600 dark:bg-purple-900/30">
              <ShoppingBag size={16} />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="font-mono text-2xl font-black text-purple-600 dark:text-purple-400">
              {formatCurrency(curr?.purchases ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-400">
                السابق: {formatCurrency(prev?.purchases ?? 0, 'SAR')}
              </span>
              {renderGrowthBadge(growth?.purchases_growth_pct)}
            </div>
          </div>
        </div>

        {/* Cash Liquidity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">السيولة النقدية المتاحة</span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/30">
              <Wallet size={16} />
            </div>
          </div>
          <div className="mt-2">
            <h3 className="font-mono text-2xl font-black text-amber-600 dark:text-amber-400">
              {formatCurrency(curr?.cash_liquidity ?? 0, 'SAR')}
            </h3>
            <div className="mt-1 text-[10px] text-slate-400">
              أرصدة الصناديق والبنوك الحية
            </div>
          </div>
        </div>
      </div>

      {/* Financial Position & Operational Health Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Stock Valuation */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">قيمة المخزون بالتكلفة</span>
            <Layers size={14} className="text-slate-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-black text-slate-800 dark:text-slate-100">
            {formatCurrency(curr?.stock_valuation ?? 0, 'SAR')}
          </div>
          <div className="text-[10px] text-slate-400">أصول مخزنية مقيمة</div>
        </div>

        {/* Receivables */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">ديون العملاء (مستحقة لنا)</span>
            <Users size={14} className="text-blue-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-black text-blue-600 dark:text-blue-400">
            {formatCurrency(curr?.receivables ?? 0, 'SAR')}
          </div>
          <div className="text-[10px] text-slate-400">ذمم مدينة</div>
        </div>

        {/* Payables */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">مستحقات الموردين (التزام)</span>
            <ShoppingBag size={14} className="text-rose-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-black text-rose-600 dark:text-rose-400">
            {formatCurrency(curr?.payables ?? 0, 'SAR')}
          </div>
          <div className="text-[10px] text-slate-400">ذمم دائنة</div>
        </div>

        {/* Active Parties */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">العملاء والموردين النشطين</span>
            <ShieldCheck size={14} className="text-emerald-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between font-mono text-lg font-black text-slate-800 dark:text-slate-100">
            <span>{curr?.active_customers ?? 0} عميل</span>
            <span className="text-slate-400 text-sm">/ {curr?.active_suppliers ?? 0} مورد</span>
          </div>
          <div className="text-[10px] text-slate-400">علاقات تجارية نشطة</div>
        </div>
      </div>

      {/* Quick Navigation Cards to Deep Centers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          onClick={() => onNavigateToTab?.('customer_bi')}
          className="group cursor-pointer rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-4 transition-all hover:border-blue-300 hover:shadow-md dark:border-blue-900/30 dark:from-blue-950/20 dark:to-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
              <Users size={18} />
            </div>
            <ArrowUpRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:text-blue-600" />
          </div>
          <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">مركز تحليلات العملاء</h4>
          <p className="mt-1 text-[11px] text-slate-500">
            ترتيب العملاء، تصنيف الولاء RFM، كفاءة التحصيل، وأعمار الديون.
          </p>
        </div>

        <div
          onClick={() => onNavigateToTab?.('supplier_bi')}
          className="group cursor-pointer rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/50 to-white p-4 transition-all hover:border-purple-300 hover:shadow-md dark:border-purple-900/30 dark:from-purple-950/20 dark:to-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-purple-100 p-2 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300">
              <ShoppingBag size={18} />
            </div>
            <ArrowUpRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:text-purple-600" />
          </div>
          <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">مركز تحليلات الموردين</h4>
          <p className="mt-1 text-[11px] text-slate-500">
            ترتيب الموردين، تاريخ الأسعار، نسب السداد، وتنوع الأصناف.
          </p>
        </div>

        <div
          onClick={() => onNavigateToTab?.('product_bi')}
          className="group cursor-pointer rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white p-4 transition-all hover:border-emerald-300 hover:shadow-md dark:border-emerald-900/30 dark:from-emerald-950/20 dark:to-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300">
              <Layers size={18} />
            </div>
            <ArrowUpRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:text-emerald-600" />
          </div>
          <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">مركز تحليلات المنتجات والركود</h4>
          <p className="mt-1 text-[11px] text-slate-500">
            الأكثر مبيعاً وربحية، دوران المخزون، الراكد وبطيء الحركة، والمرتجعات.
          </p>
        </div>
      </div>
    </div>
  );
};
