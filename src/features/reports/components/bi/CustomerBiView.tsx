import React, { useState } from 'react';
import { Users, TrendingUp, DollarSign, Award, Eye } from 'lucide-react';
import { useCustomerBiAnalytics } from '../../hooks/useBiAnalytics';
import { BiFilterBar } from './BiFilterBar';
import { Entity360Drawer } from './Entity360Drawer';
import type { CustomerMetric, CustomerLoyaltySegment, BiDatePreset } from '../../types/biAnalytics';
import { formatCurrency, formatNumberDisplay, cn } from '@/core/utils';
import { getBiDateRangeForPreset } from '@/core/utils/dateUtils';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';

export const CustomerBiView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [datePreset, setDatePreset] = useState<BiDatePreset>('this_month');
  const [dateRange, setDateRange] = useState<{ from?: string | undefined; to?: string | undefined }>(() =>
    getBiDateRangeForPreset('this_month')
  );
  const [metric, setMetric] = useState<CustomerMetric>('revenue');
  const [segment, setSegment] = useState<CustomerLoyaltySegment>('all');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Selected Customer for 360 Drawer
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useCustomerBiAnalytics({
    datePreset,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    branchId,
    metric,
    segment,
    page,
    pageSize,
    search: searchTerm,
  });

  const records = data?.data || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Server-computed aggregate KPIs across the full matching segment (zero client math)
  const summaryTotalRev = data?.summary?.totalRevenue ?? 0;
  const summaryTotalProf = data?.summary?.totalProfit ?? 0;
  const summaryChampionsCount = data?.summary?.championsCount ?? 0;

  const handleExport = () => {
    if (!records.length) return;
    void exportGenericTableToExcel({
      title: 'تقرير تحليلات العملاء والولاء (BI)',
      headers: [
        'العميل',
        'الهاتف',
        'الولاء',
        'عدد الفواتير',
        'إجمالي المشتريات',
        'الربح المحقق',
        'نسبة الهامش %',
        'الرصيد الدفتري',
        'نسبة التحصيل %',
      ],
      rows: records.map(r => [
        r.party_name,
        r.phone,
        r.loyalty_segment,
        r.invoices_count,
        r.total_revenue,
        r.gross_profit,
        `${r.margin_percent}%`,
        r.current_balance,
        `${r.collection_rate}%`,
      ]),
      fileName: 'customer-bi-analytics.xlsx',
      colorTheme: 'blue',
    });
  };

  const metricOptions = [
    { id: 'revenue', label: 'قيمة المشتريات' },
    { id: 'invoices', label: 'عدد الفواتير' },
    { id: 'profit', label: 'المساهمة في الأرباح' },
    { id: 'growth', label: 'معدل النمو' },
    { id: 'loyalty', label: 'حداثة الشراء (الولاء)' },
  ];

  const segmentOptions = [
    { id: 'all', label: 'كل الشرائح' },
    { id: 'champions', label: 'العملاء الأبطال (Champions)' },
    { id: 'loyal', label: 'العملاء الدائمون (Loyal)' },
    { id: 'new', label: 'العملاء الجدد (New)' },
    { id: 'returning', label: 'العائدون بعد انقطاع (Returning)' },
    { id: 'at_risk', label: 'المعرضون للتراجع (At Risk)' },
    { id: 'churned', label: 'المنقطعون (Churned)' },
  ];

  const getLoyaltyBadge = (seg: string) => {
    switch (seg) {
      case 'champions':
        return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">أبطال 🌟</span>;
      case 'loyal':
        return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">دائمون ✅</span>;
      case 'new':
        return <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">جديد ✨</span>;
      case 'returning':
        return <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300">عائد 🔄</span>;
      case 'at_risk':
        return <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300">تراجع ⚠️</span>;
      case 'churned':
        return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-300">منقطع ⛔</span>;
      default:
        return <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300">نشط</span>;
    }
  };

  return (
    <div className="space-y-3">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">إجمالي المبيعات للشريحة</span>
            <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/30">
              <DollarSign size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-blue-600 dark:text-blue-400">
              {formatCurrency(summaryTotalRev, 'SAR')}
            </span>
            <span className="text-[10px] font-bold text-slate-400">{totalCount} عميل</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
              المساهمة في الأرباح
            </span>
            <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-900/30">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summaryTotalProf, 'SAR')}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              إجمالي الشريحة
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
              العملاء الأبطال (Champions)
            </span>
            <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-900/30">
              <Award size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-amber-600 dark:text-amber-400">
              {summaryChampionsCount}
            </span>
            <span className="text-[10px] font-bold text-slate-400">ولاء استثنائي</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">إجمالي السجلات المطابقة</span>
            <div className="rounded-lg bg-purple-50 p-1.5 text-purple-600 dark:bg-purple-900/30">
              <Users size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-lg font-black text-purple-600 dark:text-purple-400">
              {totalCount}
            </span>
            <span className="text-[10px] font-bold text-slate-400">عميل مسجل</span>
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
          setMetric(m as CustomerMetric);
          setPage(1);
        }}
        metricOptions={metricOptions}
        segment={segment}
        onSegmentChange={s => {
          setSegment(s as CustomerLoyaltySegment);
          setPage(1);
        }}
        segmentOptions={segmentOptions}
        onRefresh={() => refetch()}
        onExportExcel={handleExport}
        onExportPdf={() => window.print()}
        lastUpdatedAt={dataUpdatedAt}
        isLoading={isLoading}
      />

      {/* Customer Ranking & Analytics Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700/80 [&_td]:border [&_td]:border-slate-200/80 dark:[&_td]:border-slate-800">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">العميل</th>
                <th className="py-2.5 px-3">شريحة الولاء</th>
                <th className="py-2.5 px-3 text-center">الفواتير</th>
                <th className="py-2.5 px-3">إجمالي المشتريات</th>
                <th className="py-2.5 px-3">الربح المحقق</th>
                <th className="py-2.5 px-3">الهامش %</th>
                <th className="py-2.5 px-3">الرصيد الدفتري</th>
                <th className="py-2.5 px-3">نسبة التحصيل</th>
                <th className="py-2.5 px-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      <span>جاري معالجة تحليلات العملاء...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    لا توجد بيانات مطابقة لمعايير التصفية الحالية
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => (
                  <tr
                    key={r.party_id}
                    onClick={() => setSelectedCustomer(r.party_id)}
                    className="cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
                  >
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-400">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{r.party_name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.phone || 'بدون هاتف'}</div>
                    </td>
                    <td className="py-2 px-3">{getLoyaltyBadge(r.loyalty_segment)}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                      {formatNumberDisplay(r.invoices_count)}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(r.total_revenue, 'SAR')}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(r.gross_profit, 'SAR')}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] font-bold">
                      {r.total_cost === 0 && r.total_revenue > 0 ? (
                        <span
                          title="لا توجد تكلفة مسجلة لفواتير هذا العميل"
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          بدون تكلفة
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5',
                            r.margin_percent >= 25
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : r.margin_percent >= 10
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                          )}
                        >
                          {r.margin_percent}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold">
                      <span
                        className={
                          r.current_balance > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : r.current_balance < 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500'
                        }
                      >
                        {formatCurrency(r.current_balance, 'SAR')}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              r.collection_rate >= 80 ? 'bg-emerald-500' : r.collection_rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, r.collection_rate))}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">{r.collection_rate}%</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedCustomer(r.party_id);
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
              عرض الصفحة <span className="font-bold">{page}</span> من <span className="font-bold">{totalPages}</span> (إجمالي {totalCount} عميل)
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

      {/* Customer 360 Drawer */}
      <Entity360Drawer
        isOpen={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        entityType="customer"
        entityId={selectedCustomer}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
      />
    </div>
  );
};
