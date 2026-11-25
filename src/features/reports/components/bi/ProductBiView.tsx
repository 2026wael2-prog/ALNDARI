import React, { useState } from 'react';
import { TrendingUp, DollarSign, Wallet, Layers, Eye } from 'lucide-react';
import { useProductBiAnalytics } from '../../hooks/useBiAnalytics';
import { BiFilterBar } from './BiFilterBar';
import { Entity360Drawer } from './Entity360Drawer';
import type { ProductViewType, BiDatePreset } from '../../types/biAnalytics';
import { formatCurrency, formatNumberDisplay, cn } from '@/core/utils';
import { getBiDateRangeForPreset } from '@/core/utils/dateUtils';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';

export const ProductBiView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [datePreset, setDatePreset] = useState<BiDatePreset>('this_month');
  const [dateRange, setDateRange] = useState<{ from?: string | undefined; to?: string | undefined }>(() =>
    getBiDateRangeForPreset('this_month')
  );
  const [viewType, setViewType] = useState<ProductViewType>('profitability');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Selected Product for 360 Drawer
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useProductBiAnalytics({
    datePreset,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    branchId,
    viewType,
    page,
    pageSize,
    search: searchTerm,
    brand: brandFilter || undefined,
  });

  const records = data?.data || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Server-computed aggregate KPIs across all matching products
  const summaryRev = data?.summary?.totalRevenue ?? 0;
  const summaryCogs = data?.summary?.totalCogs ?? 0;
  const summaryProfit = data?.summary?.totalProfit ?? 0;
  const summaryValuation = data?.summary?.stockValuation ?? 0;

  const handleExport = () => {
    if (!records.length) return;
    void exportGenericTableToExcel({
      title: 'تقرير تحليلات حركة وربحية المنتجات (BI)',
      headers: [
        'رقم القطعة (Part No.)',
        'الأرقام البديلة',
        'الرمز / SKU',
        'الصنف',
        'الشركة الصانعة',
        'الوحدة',
        'حالة الحركة',
        'مرات البيع',
        'الكمية الصافية',
        'إجمالي المبيعات',
        'التكلفة (COGS)',
        'الربح المحقق',
        'نسبة الهامش %',
        'المخزون الحالي',
      ],
      rows: records.map(r => [
        r.part_number || '-',
        r.alternative_numbers || '-',
        r.product_sku || '-',
        r.product_name,
        r.brand_name,
        r.unit || 'قطعة',
        r.movement_classification,
        r.times_sold,
        r.net_quantity_sold,
        r.total_revenue,
        r.total_cogs,
        r.gross_profit,
        `${r.gross_margin_percent}%`,
        r.current_stock,
      ]),
      fileName: 'product-bi-analytics.xlsx',
      colorTheme: 'green',
    });
  };

  const viewOptions = [
    { id: 'profitability', label: 'الأعلى ربحية ومساهمة' },
    { id: 'movement', label: 'الأكثر مبيعاً بالكميات' },
    { id: 'velocity', label: 'الأكثر طلباً وتكراراً في الفواتير' },
    { id: 'slow_moving', label: 'بطيء الحركة (Slow Moving)' },
    { id: 'dead_stock', label: 'الراكد غير المباع (Dead Stock)' },
    { id: 'returns', label: 'الأعلى إرجاعاً (Returns)' },
  ];

  const getMovementBadge = (mov: string) => {
    switch (mov) {
      case 'fast':
        return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">سريع ⚡</span>;
      case 'slow':
        return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">بطيء 🐢</span>;
      case 'dead':
        return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-300">راكد ⛔</span>;
      case 'stockout_risk':
        return <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300">خطر نفاد ⚠️</span>;
      case 'service':
        return <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300">خدمي 🛠️</span>;
      default:
        return <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300">معتدل</span>;
    }
  };

  return (
    <div className="space-y-3">
      {/* KPI Cards Row — 4-per-row on mobile */}
      <div className="grid grid-cols-4 gap-1 sm:gap-3">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[10px] sm:uppercase">المبيعات</span>
            <div className="hidden rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/30 sm:block">
              <DollarSign size={15} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-blue-600 dark:text-blue-400 sm:text-lg">
              {formatCurrency(summaryRev, 'SAR')}
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold text-slate-400 sm:inline">{totalCount} صنف</span>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-[10px] sm:uppercase">
              الربح
            </span>
            <div className="hidden rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-900/30 sm:block">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-emerald-600 dark:text-emerald-400 sm:text-lg">
              {formatCurrency(summaryProfit, 'SAR')}
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold text-slate-400 sm:inline">
              إجمالي الشريحة
            </span>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-0.5">
            <span className="truncate text-[10px] font-bold text-slate-400 sm:text-[10px] sm:uppercase">التكلفة</span>
            <div className="hidden rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-900/30 sm:block">
              <Wallet size={15} />
            </div>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1 sm:mt-1">
            <span dir="ltr" className="truncate font-mono text-[10.5px] font-black text-slate-700 dark:text-slate-200 sm:text-lg">
              {formatCurrency(summaryCogs, 'SAR')}
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold text-slate-400 sm:inline">التكلفة المعتمدة</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400">
              قيمة المخزون الحالي بالتكلفة
            </span>
            <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-900/30">
              <Layers size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-indigo-600 dark:text-indigo-400">
              {formatCurrency(summaryValuation, 'SAR')}
            </span>
            <span className="text-[10px] font-bold text-slate-400">أصول مخزنية</span>
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
        metric={viewType}
        onMetricChange={m => {
          setViewType(m as ProductViewType);
          setPage(1);
        }}
        metricOptions={viewOptions}
        onRefresh={() => refetch()}
        onExportExcel={handleExport}
        onExportPdf={() => window.print()}
        lastUpdatedAt={dataUpdatedAt}
        isLoading={isLoading}
      />

      {/* Brand / Manufacturer Filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">تصفية حسب الشركة الصانعة:</span>
        <input
          type="text"
          value={brandFilter}
          onChange={e => {
            setBrandFilter(e.target.value);
            setPage(1);
          }}
          placeholder="مثال: TOYOTA, DENSO, BOSCH..."
          className="h-7 w-56 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        {brandFilter && (
          <button
            type="button"
            onClick={() => {
              setBrandFilter('');
              setPage(1);
            }}
            className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
          >
            مسح
          </button>
        )}
      </div>

      {/* Product Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700/80 [&_td]:border [&_td]:border-slate-200/80 dark:[&_td]:border-slate-800">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">الصنف / رقم القطعة</th>
                <th className="py-2.5 px-3">الشركة الصانعة</th>
                <th className="py-2.5 px-3">حالة الحركة</th>
                <th className="py-2.5 px-3 text-center">مرات البيع</th>
                <th className="py-2.5 px-3 text-center">الكمية الصافية</th>
                <th className="py-2.5 px-3">إجمالي المبيعات</th>
                <th className="py-2.5 px-3">التكلفة (COGS)</th>
                <th className="py-2.5 px-3">الربح المحقق</th>
                <th className="py-2.5 px-3">الهامش %</th>
                <th className="py-2.5 px-3 text-center">المخزون الحالي</th>
                <th className="py-2.5 px-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      <span>جاري معالجة تحليلات حركة وربحية المنتجات...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    لا توجد منتجات مطابقة لمعايير التصفية الحالية
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => (
                  <tr
                    key={r.product_id}
                    onClick={() => setSelectedProduct(r.product_id)}
                    className="cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
                  >
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-400">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{r.product_name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-400">
                        {r.part_number && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            P/N: {r.part_number}
                          </span>
                        )}
                        {r.product_sku && <span>SKU: {r.product_sku}</span>}
                        {r.alternative_numbers && (
                          <span className="text-slate-500">بديل: {r.alternative_numbers}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {r.brand_name || 'غير محدد'}
                      </span>
                    </td>
                    <td className="py-2 px-3">{getMovementBadge(r.movement_classification)}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                      {formatNumberDisplay(r.times_sold)}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-100">
                      {formatNumberDisplay(r.net_quantity_sold)}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(r.total_revenue, 'SAR')}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-500">
                      {formatCurrency(r.total_cogs, 'SAR')}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(r.gross_profit, 'SAR')}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] font-bold">
                      {r.total_cogs === 0 && r.total_revenue > 0 ? (
                        <span
                          title="لا توجد تكلفة مسجلة للصنف وقت البيع"
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          بدون تكلفة
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5',
                            r.gross_margin_percent >= 25
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : r.gross_margin_percent >= 10
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                          )}
                        >
                          {r.gross_margin_percent}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold">
                      <span
                        title={r.current_stock < 0 ? 'عجز مخزني (تم البيع قبل إدخال المشتريات في الفرع)' : undefined}
                        className={r.current_stock <= 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}
                      >
                        {formatNumberDisplay(r.current_stock)}
                      </span>
                      {r.unit && <span className="mr-1 text-[10px] font-normal text-slate-400">{r.unit}</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedProduct(r.product_id);
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
              عرض الصفحة <span className="font-bold">{page}</span> من <span className="font-bold">{totalPages}</span> (إجمالي {totalCount} صنف)
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

      {/* Product 360 Drawer */}
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
