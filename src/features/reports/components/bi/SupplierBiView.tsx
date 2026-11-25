import React, { useState } from 'react';
import { ShoppingBag, TrendingUp, DollarSign, Wallet, Eye } from 'lucide-react';
import { useSupplierBiAnalytics } from '../../hooks/useBiAnalytics';
import { BiFilterBar } from './BiFilterBar';
import { Entity360Drawer } from './Entity360Drawer';
import type { SupplierMetric, BiDatePreset } from '../../types/biAnalytics';
import { formatCurrency, formatNumberDisplay, cn } from '@/core/utils';
import { getBiDateRangeForPreset } from '@/core/utils/dateUtils';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';

export const SupplierBiView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [datePreset, setDatePreset] = useState<BiDatePreset>('this_month');
  const [dateRange, setDateRange] = useState<{ from?: string | undefined; to?: string | undefined }>(() =>
    getBiDateRangeForPreset('this_month')
  );
  const [metric, setMetric] = useState<SupplierMetric>('spend');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Selected Supplier for 360 Drawer
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useSupplierBiAnalytics({
    datePreset,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    branchId,
    metric,
    page,
    pageSize,
    search: searchTerm,
  });

  const records = data?.data || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Server-computed aggregate KPIs across all matching suppliers
  const summaryTotalPurchases = data?.summary?.totalPurchases ?? 0;
  const summaryTotalDues = data?.summary?.totalDues ?? 0;
  const summaryAvgPaymentRatio = data?.summary?.avgPaymentRatio ?? 100;

  const handleExport = () => {
    if (!records.length) return;
    void exportGenericTableToExcel({
      title: 'تقرير تحليلات الموردين والتوريد (BI)',
      headers: [
        'المورد',
        'الهاتف',
        'فواتير التوريد',
        'أصناف متنوعة',
        'إجمالي المشتريات',
        'المسدد له',
        'المتبقي له',
        'نسبة السداد %',
      ],
      rows: records.map(r => [
        r.supplier_name,
        r.phone,
        r.invoices_count,
        r.distinct_products_count,
        r.total_purchases,
        r.total_paid,
        Math.abs(r.current_balance),
        `${r.payment_ratio}%`,
      ]),
      fileName: 'supplier-bi-analytics.xlsx',
      colorTheme: 'indigo',
    });
  };

  const metricOptions = [
    { id: 'spend', label: 'قيمة المشتريات والتوريد' },
    { id: 'invoices', label: 'عدد فواتير التوريد' },
    { id: 'products_count', label: 'تنوع الأصناف الموردة' },
    { id: 'growth', label: 'معدل النمو' },
  ];

  return (
    <div className="space-y-3">
      {/* KPI Cards Row — 4-per-row on mobile */}
      <div className="grid grid-cols-4 gap-1 sm:gap-3">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[10px] sm:uppercase">المشتريات</span>
            <div className="hidden rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/30 sm:block">
              <DollarSign size={15} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-blue-600 dark:text-blue-400 sm:text-lg">
              {formatCurrency(summaryTotalPurchases, 'SAR')}
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold text-slate-400 sm:inline">{totalCount} مورد</span>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-rose-600 dark:text-rose-400 sm:text-[10px] sm:uppercase">
              الالتزامات
            </span>
            <div className="hidden rounded-lg bg-rose-50 p-1.5 text-rose-600 dark:bg-rose-900/30 sm:block">
              <Wallet size={15} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-rose-600 dark:text-rose-400 sm:text-lg">
              {formatCurrency(summaryTotalDues, 'SAR')}
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold text-slate-400 sm:inline">مستحقات واجبة السداد</span>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-[10px] sm:uppercase">
              نسبة السداد
            </span>
            <div className="hidden rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-900/30 sm:block">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 sm:text-lg">
              {summaryAvgPaymentRatio}%
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold text-slate-400 sm:inline">انتظام السداد</span>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">إجمالي الموردين</span>
            <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-900/30">
              <ShoppingBag size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-indigo-600 dark:text-indigo-400">
              {totalCount}
            </span>
            <span className="text-[10px] font-bold text-slate-400">مورد نشط</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <BiFilterBar
        searchTerm={searchTerm}
        onSearchChange={t => {
          setSearchTerm(t);
          setPage(1);
        }}
        datePreset={datePreset}
        onPresetChange={(p, range) => {
          setDatePreset(p);
          setDateRange(range);
          setPage(1);
        }}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        onDateRangeChange={(from, to) => {
          setDatePreset('custom');
          setDateRange({ from, to });
          setPage(1);
        }}
        branchId={branchId}
        onBranchChange={id => {
          setBranchId(id);
          setPage(1);
        }}
        metric={metric}
        onMetricChange={m => {
          setMetric(m as SupplierMetric);
          setPage(1);
        }}
        metricOptions={metricOptions}
        onRefresh={() => refetch()}
        onExportExcel={handleExport}
        onExportPdf={() => window.print()}
        lastUpdatedAt={dataUpdatedAt}
        isLoading={isLoading}
      />

      {/* Supplier Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700/80 [&_td]:border [&_td]:border-slate-200/80 dark:[&_td]:border-slate-800">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">المورد</th>
                <th className="py-2.5 px-3 text-center">فواتير التوريد</th>
                <th className="py-2.5 px-3 text-center">أصناف متنوعة</th>
                <th className="py-2.5 px-3">إجمالي المشتريات</th>
                <th className="py-2.5 px-3">المسدد له</th>
                <th className="py-2.5 px-3">المتبقي له (الالتزام)</th>
                <th className="py-2.5 px-3">نسبة السداد</th>
                <th className="py-2.5 px-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      <span>جاري معالجة تحليلات الموردين...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    لا توجد بيانات مطابقة لمعايير التصفية الحالية
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => (
                  <tr
                    key={r.supplier_id}
                    onClick={() => setSelectedSupplier(r.supplier_id)}
                    className="cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
                  >
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-400">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{r.supplier_name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.phone || 'بدون هاتف'}</div>
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                      {formatNumberDisplay(r.invoices_count)}
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold dark:bg-slate-800">
                        {r.distinct_products_count} صنف
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(r.total_purchases, 'SAR')}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(r.total_paid, 'SAR')}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold">
                      <span className={r.current_balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
                        {formatCurrency(Math.abs(r.current_balance), 'SAR')}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              r.payment_ratio >= 80 ? 'bg-emerald-500' : r.payment_ratio >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, r.payment_ratio))}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">{r.payment_ratio}%</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedSupplier(r.supplier_id);
                        }}
                        className="rounded-lg p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-800"
                        title="عرض الملف التحليلي 360°"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800">
            <div>
              عرض الصفحة <span className="font-bold">{page}</span> من <span className="font-bold">{totalPages}</span> (إجمالي {totalCount} مورد)
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold transition-all hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold transition-all hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Supplier 360 Drawer */}
      <Entity360Drawer
        isOpen={!!selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
        entityType="supplier"
        entityId={selectedSupplier}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
      />
    </div>
  );
};
