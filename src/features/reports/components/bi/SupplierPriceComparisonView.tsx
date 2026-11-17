import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { useSupplierPriceComparison } from '../../hooks/useBiAnalytics';
import { BiFilterBar } from './BiFilterBar';
import { Entity360Drawer } from './Entity360Drawer';
import type { BiDatePreset } from '../../types/biAnalytics';
import { formatCurrency, formatNumberDisplay } from '@/core/utils';
import { getBiDateRangeForPreset } from '@/core/utils/dateUtils';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';

export const SupplierPriceComparisonView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [datePreset, setDatePreset] = useState<BiDatePreset>('last_3_months');
  const [dateRange, setDateRange] = useState<{ from?: string | undefined; to?: string | undefined }>(() =>
    getBiDateRangeForPreset('last_3_months')
  );
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const pageSize = 20;

  const { data, isLoading, refetch, dataUpdatedAt } = useSupplierPriceComparison({
    datePreset,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    page,
    pageSize,
    search: searchTerm,
  });

  const records = data?.data || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleExport = () => {
    if (!records.length) return;
    void exportGenericTableToExcel({
      title: 'مقارنة أسعار الشراء بين الموردين (BI)',
      headers: [
        'الصنف',
        'رقم القطعة (Part No.)',
        'الشركة الصانعة',
        'SKU',
        'المورد',
        'فواتير الشراء',
        'الكمية المشتراة',
        'آخر سعر شراء',
        'أقل سعر',
        'أعلى سعر',
        'متوسط السعر',
        'تاريخ آخر شراء',
      ],
      rows: records.map(r => [
        r.product_name,
        r.part_number || '-',
        r.brand_name || 'غير محدد',
        r.product_sku || '-',
        r.supplier_name,
        r.invoices_count,
        r.total_qty_purchased,
        r.last_purchase_price,
        r.min_price,
        r.max_price,
        r.avg_price,
        r.last_purchase_date || '-',
      ]),
      fileName: 'supplier-price-comparison.xlsx',
      colorTheme: 'amber',
    });
  };

  return (
    <div className="space-y-3">
      <BiFilterBar
        searchTerm={searchTerm}
        onSearchChange={s => {
          setSearchTerm(s);
          setPage(1);
        }}
        datePreset={datePreset}
        onPresetChange={(preset, range) => {
          setDatePreset(preset);
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
        onRefresh={() => refetch()}
        onExportExcel={handleExport}
        onExportPdf={() => window.print()}
        lastUpdatedAt={dataUpdatedAt}
        isLoading={isLoading}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Scale size={15} className="text-amber-600" />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
              مقارنة أسعار الموردين التاريخية للأصناف
            </h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{totalCount} سجل</span>
        </div>

        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700/80 [&_td]:border [&_td]:border-slate-200/80 dark:[&_td]:border-slate-800">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="p-3">الصنف</th>
                <th className="p-3">المورد</th>
                <th className="p-3 text-center">الفواتير / الكمية</th>
                <th className="p-3 text-left">آخر سعر</th>
                <th className="p-3 text-left">أقل سعر</th>
                <th className="p-3 text-left">أعلى سعر</th>
                <th className="p-3 text-left">متوسط السعر</th>
                <th className="p-3 text-center">فرق السعر</th>
                <th className="p-3 text-center">آخر شراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    جاري مقارنة الأسعار من قاعدة البيانات...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    لا توجد بيانات مشتريات مطابقة في الفترة المحددة.
                  </td>
                </tr>
              ) : (
                records.map(r => {
                  const priceSpread = Math.max(0, r.max_price - r.min_price);
                  return (
                  <tr
                    key={`${r.product_id}-${r.supplier_id}`}
                    onClick={() => setSelectedProduct(r.product_id)}
                    className="cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
                  >
                    <td className="p-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{r.product_name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-400">
                        {r.part_number && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            P/N: {r.part_number}
                          </span>
                        )}
                        {r.brand_name && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-sans font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {r.brand_name}
                          </span>
                        )}
                        {r.product_sku && <span>SKU: {r.product_sku}</span>}
                      </div>
                    </td>
                    <td className="p-3 font-bold text-slate-700 dark:text-slate-200">{r.supplier_name}</td>
                    <td className="p-3 text-center font-mono">
                      {r.invoices_count} / {formatNumberDisplay(r.total_qty_purchased)}
                    </td>
                    <td className="p-3 text-left font-mono font-black text-blue-600 dark:text-blue-400">
                      {formatCurrency(r.last_purchase_price, 'SAR')}
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-600">
                      {formatCurrency(r.min_price, 'SAR')}
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-rose-600">
                      {formatCurrency(r.max_price, 'SAR')}
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.avg_price, 'SAR')}
                    </td>
                    <td className="p-3 text-center font-mono text-[11px] font-bold">
                      {priceSpread > 0 ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {formatCurrency(priceSpread, 'SAR')}
                        </span>
                      ) : (
                        <span className="text-slate-400">ثابت</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono text-[10px] text-slate-400">
                      {r.last_purchase_date || '-'}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/30">
            <span className="text-[11px] font-bold text-slate-500">
              صفحة {page} من {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      <Entity360Drawer
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        entityType="product"
        entityId={selectedProduct}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
      />
    </div>
  );
};
