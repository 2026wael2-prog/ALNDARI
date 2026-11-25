import React, { useState } from 'react';
import { Layers, AlertTriangle, ArrowLeftRight, ClipboardCheck, Building2, Tag } from 'lucide-react';
import { useInventoryBiAnalytics } from '../../hooks/useBiAnalytics';
import { BiFilterBar } from './BiFilterBar';
import type { BiDatePreset } from '../../types/biAnalytics';
import { formatCurrency, formatNumberDisplay } from '@/core/utils';
import { getBiDateRangeForPreset } from '@/core/utils/dateUtils';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';

export const InventoryBiView: React.FC = () => {
  const [datePreset, setDatePreset] = useState<BiDatePreset>('this_month');
  const [dateRange, setDateRange] = useState<{ from?: string | undefined; to?: string | undefined }>(() =>
    getBiDateRangeForPreset('this_month')
  );
  const [branchId, setBranchId] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useInventoryBiAnalytics(
    branchId,
    dateRange.from,
    dateRange.to
  );

  const summary = data?.summary;
  const byBranch = data?.by_branch || [];
  const byCategory = data?.by_category || [];
  const byBrand = data?.by_brand || [];
  const topProducts = data?.top_products_by_value || [];

  const handleExport = () => {
    if (!byBranch.length) return;
    void exportGenericTableToExcel({
      title: 'تقرير تحليلات المخزون والفروع (BI)',
      headers: ['الفرع', 'عدد الأصناف المتوفرة', 'إجمالي الكميات', 'القيمة بالتكلفة'],
      rows: byBranch.map(b => [b.branch_name, b.products_count, b.total_quantity, b.total_valuation]),
      fileName: 'inventory-bi-analytics.xlsx',
      colorTheme: 'indigo',
    });
  };

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
        <div className="grid grid-cols-4 gap-1 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50 sm:h-24 sm:rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1 sm:gap-3">
            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
              <div className="flex items-center justify-between gap-0.5">
                <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[11px]">قيمة المخزون</span>
                <div className="hidden rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-900/30 sm:block">
                  <Layers size={16} />
                </div>
              </div>
              <div dir="ltr" className="mt-1 truncate text-right font-mono text-[11px] font-black text-indigo-600 dark:text-indigo-400 sm:mt-2 sm:text-xl">
                {formatCurrency(summary?.total_valuation ?? 0, 'SAR')}
              </div>
              <div className="mt-1 hidden text-[10px] font-bold text-slate-400 sm:block">
                {formatNumberDisplay(summary?.total_quantity ?? 0)} قطعة • {summary?.total_products ?? 0} صنف
              </div>
            </div>

            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
              <div className="flex items-center justify-between gap-0.5">
                <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[11px]">النفاد</span>
                <div className="hidden rounded-xl bg-rose-50 p-2 text-rose-600 dark:bg-rose-900/30 sm:block">
                  <AlertTriangle size={16} />
                </div>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] font-black text-rose-600 dark:text-rose-400 sm:mt-2 sm:text-xl">
                {summary?.out_of_stock_count ?? 0} نافد
              </div>
              <div className="mt-1 hidden text-[10px] font-bold text-amber-600 sm:block">
                {summary?.low_stock_count ?? 0} صنف قريب من النفاد
              </div>
            </div>

            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
              <div className="flex items-center justify-between gap-0.5">
                <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[11px]">التحويلات</span>
                <div className="hidden rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 sm:block">
                  <ArrowLeftRight size={16} />
                </div>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] font-black text-slate-800 dark:text-slate-100 sm:mt-2 sm:text-xl">
                {summary?.transfers_count ?? 0}
              </div>
              <div className="mt-1 hidden text-[10px] font-bold text-slate-400 sm:block">
                {formatNumberDisplay(summary?.transfers_quantity ?? 0)} قطعة محولة (مستبعدة من المبيعات)
              </div>
            </div>

            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
              <div className="flex items-center justify-between gap-0.5">
                <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[11px]">فروقات الجرد</span>
                <div className="hidden rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30 sm:block">
                  <ClipboardCheck size={16} />
                </div>
              </div>
              <div dir="ltr" className="mt-1 truncate text-right font-mono text-[11px] font-black text-slate-800 dark:text-slate-100 sm:mt-2 sm:text-xl">
                {formatCurrency(summary?.audit_variance_value ?? 0, 'SAR')}
              </div>
              <div className="mt-1 hidden text-[10px] font-bold text-slate-400 sm:block">
                {summary?.audit_sessions_count ?? 0} جلسة جرد • فرق كمية: {summary?.audit_variance_qty ?? 0}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Building2 size={15} className="text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">المخزون حسب الفرع</h3>
              </div>
              <div className="space-y-2">
                {byBranch.map((b, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">{b.branch_name}</div>
                      <div className="text-[10px] text-slate-400">
                        {b.products_count} صنف • {formatNumberDisplay(b.total_quantity)} قطعة
                      </div>
                    </div>
                    <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(b.total_valuation, 'SAR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Layers size={15} className="text-blue-600" />
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">حسب التصنيف</h3>
              </div>
              <div className="space-y-2">
                {byCategory.map((c, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {c.category_name} <span className="text-[10px] text-slate-400">({formatNumberDisplay(c.total_quantity)})</span>
                    </span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(c.total_valuation, 'SAR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Tag size={15} className="text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">حسب الماركة</h3>
              </div>
              <div className="space-y-2">
                {byBrand.map((br, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {br.brand_name} <span className="text-[10px] text-slate-400">({formatNumberDisplay(br.total_quantity)})</span>
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(br.total_valuation, 'SAR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {topProducts.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Layers size={15} className="text-indigo-600" />
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    أعلى الأصناف قيمةً في المخزون (Top 10)
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-slate-400">بيانات فعلية بالتكلفة</span>
              </div>
              <div className="custom-scrollbar overflow-x-auto">
                <table className="w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700/80 [&_td]:border [&_td]:border-slate-200/80 dark:[&_td]:border-slate-800">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="py-2 px-3">الصنف</th>
                      <th className="py-2 px-3">رقم القطعة (Part No.)</th>
                      <th className="py-2 px-3">الشركة الصانعة</th>
                      <th className="py-2 px-3 text-center">الكمية المتوفرة</th>
                      <th className="py-2 px-3 text-left">القيمة بالتكلفة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {topProducts.map(tp => (
                      <tr key={tp.product_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-100">
                          {tp.product_name}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {tp.part_number || '—'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {tp.brand_name || 'غير محدد'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-200">
                          {formatNumberDisplay(tp.current_stock)}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-black text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(tp.stock_valuation, 'SAR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
