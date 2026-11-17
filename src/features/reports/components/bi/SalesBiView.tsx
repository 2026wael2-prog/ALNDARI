import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Building2,
  CreditCard,
  Users,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useSalesBiAnalytics } from '../../hooks/useBiAnalytics';
import { BiFilterBar } from './BiFilterBar';
import type { BiDatePreset } from '../../types/biAnalytics';
import { formatCurrency, formatNumberDisplay, cn } from '@/core/utils';
import { getBiDateRangeForPreset } from '@/core/utils/dateUtils';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';

export const SalesBiView: React.FC = () => {
  const [datePreset, setDatePreset] = useState<BiDatePreset>('this_month');
  const [dateRange, setDateRange] = useState<{ from?: string | undefined; to?: string | undefined }>(() =>
    getBiDateRangeForPreset('this_month')
  );
  const [branchId, setBranchId] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useSalesBiAnalytics(
    branchId,
    dateRange.from,
    dateRange.to
  );

  const summary = data?.summary;
  const byBranch = data?.by_branch || [];
  const byPayment = data?.by_payment_method || [];
  const byEmployee = data?.by_employee || [];
  const byHour = data?.by_hour || [];
  const dailyTrend = data?.daily_trend || [];

  const maxTrend = dailyTrend.reduce((acc, d) => Math.max(acc, Math.abs(d.net_sales)), 1);

  const handleExport = () => {
    if (!byBranch.length && !dailyTrend.length) return;
    void exportGenericTableToExcel({
      title: 'تقرير تحليلات المبيعات المتقدمة (BI)',
      headers: ['الفرع', 'عدد الفواتير', 'صافي المبيعات', 'متوسط الفاتورة'],
      rows: byBranch.map(b => [b.branch_name, b.invoices_count, b.net_sales, b.avg_invoice]),
      fileName: 'sales-bi-analytics.xlsx',
      colorTheme: 'blue',
    });
  };

  const growthPct = summary?.growth_pct;
  const isPositive = (growthPct ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <BiFilterBar
        datePreset={datePreset}
        onPresetChange={(preset, range) => {
          setDatePreset(preset);
          setDateRange(range);
        }}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        onDateRangeChange={(from, to) => {
          setDatePreset('custom');
          setDateRange({ from, to });
        }}
        branchId={branchId}
        onBranchChange={setBranchId}
        onRefresh={() => refetch()}
        onExportExcel={handleExport}
        onExportPdf={() => window.print()}
        lastUpdatedAt={dataUpdatedAt}
        isLoading={isLoading}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">صافي المبيعات</span>
                <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30">
                  <DollarSign size={16} />
                </div>
              </div>
              <div className="mt-2 font-mono text-xl font-black text-blue-600 dark:text-blue-400">
                {formatCurrency(summary?.net_sales ?? 0, 'SAR')}
              </div>
              {growthPct !== undefined && (
                <div
                  className={cn(
                    'mt-1.5 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono',
                    isPositive
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                      : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30'
                  )}
                >
                  {isPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  <span>{growthPct > 0 ? `+${growthPct}` : growthPct}%</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">عدد الفواتير ومتوسطها</span>
                <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30">
                  <Receipt size={16} />
                </div>
              </div>
              <div className="mt-2 font-mono text-xl font-black text-slate-800 dark:text-slate-100">
                {formatNumberDisplay(summary?.invoices_count ?? 0)} فاتورة
              </div>
              <div className="mt-1 text-[10px] font-bold text-slate-400">
                المتوسط: {formatCurrency(summary?.avg_invoice ?? 0, 'SAR')}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">نقدي مقابل آجل</span>
                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-900/30">
                  <CreditCard size={16} />
                </div>
              </div>
              <div className="mt-2 font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                نقدي: {formatCurrency(summary?.cash_sales ?? 0, 'SAR')}
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                آجل: {formatCurrency(summary?.credit_sales ?? 0, 'SAR')}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">المرتجعات والخصومات</span>
                <div className="rounded-xl bg-rose-50 p-2 text-rose-600 dark:bg-rose-900/30">
                  <TrendingUp size={16} />
                </div>
              </div>
              <div className="mt-2 font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                مرتجعات: {formatCurrency(summary?.returns_amount ?? 0, 'SAR')}
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-slate-500">
                خصومات: {formatCurrency(summary?.total_discount ?? 0, 'SAR')}
              </div>
            </div>
          </div>

          {/* Daily Trend Chart */}
          {dailyTrend.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                الاتجاه اليومي لصافي المبيعات
              </h3>
              <div className="flex h-32 items-end gap-1.5 overflow-x-auto pb-1">
                {dailyTrend.map(d => {
                  const pct = Math.max(8, Math.round((Math.abs(d.net_sales) / maxTrend) * 100));
                  return (
                    <div key={d.date} className="group flex min-w-[26px] flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-mono font-bold text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                        {formatNumberDisplay(d.net_sales)}
                      </span>
                      <div
                        className="w-full max-w-[28px] rounded-t-md bg-blue-500 transition-all hover:bg-blue-600"
                        style={{ height: `${pct}%` }}
                        title={`${d.date}: ${formatCurrency(d.net_sales, 'SAR')} (${d.invoices_count} فاتورة)`}
                      />
                      <span className="text-[10px] font-mono text-slate-400">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Breakdowns Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* By Branch */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Building2 size={15} className="text-blue-600" />
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">أداء الفروع</h3>
              </div>
              <div className="space-y-2">
                {byBranch.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">لا توجد بيانات فروع</p>
                ) : (
                  byBranch.map((b, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100">{b.branch_name}</div>
                        <div className="text-[10px] text-slate-400">
                          {b.invoices_count} فاتورة • متوسط {formatCurrency(b.avg_invoice, 'SAR')}
                        </div>
                      </div>
                      <span className="font-mono font-black text-blue-600 dark:text-blue-400">
                        {formatCurrency(b.net_sales, 'SAR')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* By Employee & Payment Method */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <Users size={15} className="text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">المبيعات حسب الموظف</h3>
                </div>
                <div className="space-y-2">
                  {byEmployee.length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-400">لا توجد بيانات</p>
                  ) : (
                    byEmployee.map((e, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {e.employee_name} <span className="text-[10px] text-slate-400">({e.invoices_count})</span>
                        </span>
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(e.net_sales, 'SAR')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <Clock size={15} className="text-amber-600" />
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    ساعات الذروة وطرق الدفع
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {byPayment.map((pm, idx) => (
                    <span
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {pm.payment_method === 'cash' ? 'نقدي' : pm.payment_method === 'credit' ? 'آجل' : pm.payment_method}:{' '}
                      <span className="font-mono text-blue-600">{formatCurrency(pm.total_amount, 'SAR')}</span>
                    </span>
                  ))}
                  {byHour.slice(0, 4).map(h => (
                    <span
                      key={h.hour_of_day}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    >
                      الساعة {h.hour_of_day}:00 ({h.invoices_count} فاتورة)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
