import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Download,
  Layers,
  ChevronLeft,
  Package,
} from 'lucide-react';
import { cn, formatNumberDisplay } from '../../../../core/utils';
import { exportToCSV } from '@/lib/exportUtils';
import type { InventoryMovementsFilterParams } from '../../types';
import { useInventoryMovementsFeed } from '../../hooks';

interface GeneralMovementsFeedProps {
  onSelectProduct: (product: {
    id: string;
    name_ar?: string | undefined;
    sku?: string | undefined;
    part_number?: string | null | undefined;
    brand?: string | null | undefined;
  }) => void;
}

const DOC_TYPE_LABELS: Record<string, { label: string; badge: string }> = {
  sale: {
    label: 'فاتورة بيع',
    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50',
  },
  purchase: {
    label: 'فاتورة شراء',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  },
  sale_return: {
    label: 'مردود مبيعات',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  },
  purchase_return: {
    label: 'مردود مشتريات',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
  },
  transfer: {
    label: 'مناقلة مستودعية',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  },
  stock_audit: {
    label: 'تسوية جردية',
    badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/50',
  },
  adjustment: {
    label: 'تسوية مخزنية',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50',
  },
};

export const GeneralMovementsFeed: React.FC<GeneralMovementsFeedProps> = ({ onSelectProduct }) => {
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState<'all' | 'in' | 'out'>('all');
  const [docType, setDocType] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const filterParams = useMemo<InventoryMovementsFilterParams>(() => {
    return {
      search: search.trim() || undefined,
      movementType,
      docType: docType !== 'all' ? docType : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 200,
    };
  }, [search, movementType, docType, startDate, endDate]);

  const { data: movements = [], isLoading, isRefetching, refetch } = useInventoryMovementsFeed(filterParams);

  // Quick statistics
  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const m of movements) {
      if (m.movement_type === 'in') totalIn += Number(m.quantity || 0);
      else totalOut += Number(m.quantity || 0);
    }
    return {
      count: movements.length,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [movements]);

  const handleExport = () => {
    if (!movements.length) return;
    const headers = [
      'التاريخ والوقت',
      'نوع المستند',
      'رقم المستند',
      'اسم الصنف',
      'كود الصنف (SKU)',
      'رقم القطعة',
      'الماركة',
      'نوع الحركة',
      'الكمية',
      'الرصيد الحالي',
      'الطرف المقابل',
      'المستخدم',
      'ملاحظات',
    ];

    const exportRows = movements.map(m => ({
      date: new Date(m.date).toLocaleString('ar-SA'),
      docType: DOC_TYPE_LABELS[m.doc_type]?.label || m.doc_type,
      docNumber: m.doc_number,
      productName: m.product_name,
      productSku: m.product_sku,
      productPartNumber: m.product_part_number || '',
      productBrand: m.product_brand || '',
      movementType: m.movement_type === 'in' ? 'وارد' : 'صادر',
      quantity: m.quantity,
      currentStock: m.current_stock,
      partyName: m.party_name,
      userName: m.user_name?.split('@')[0] || 'النظام',
      notes: m.notes || '',
    }));

    exportToCSV(exportRows, `سجل_حركات_المخزون_${new Date().toISOString().split('T')[0]}`, headers);
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* ── Top Bar: Search, Filters, Stats & Actions ── */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-[var(--app-surface)] p-4 shadow-sm dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                سجل الحركات المخزنية المباشر (Stock Movements Log)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                تدفق لحظي لكافة الحركات من فواتير بيع وشراء ومردودات ومناقلات وتسويات
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void refetch();
              }}
              disabled={isLoading || isRefetching}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="تحديث البيانات لحظياً"
            >
              <RefreshCw size={13} className={cn((isLoading || isRefetching) && 'animate-spin text-blue-600')} />
              <span>تحديث</span>
            </button>

            <button
              onClick={handleExport}
              disabled={movements.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="تصدير السجل إلى ملف Excel/CSV"
            >
              <Download size={13} />
              <span>تصدير</span>
            </button>
          </div>
        </div>

        {/* ── Filter Controls ── */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          {/* Search Box */}
          <div className="relative sm:col-span-2 lg:col-span-5">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث برقم الفاتورة، اسم الصنف، رقم القطعة، الماركة، أو الطرف..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pr-9 pl-3 text-xs font-bold text-slate-800 placeholder-slate-400 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <Search size={14} className="absolute top-2.5 right-3 text-slate-400" />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute top-2 left-2.5 rounded-md px-1.5 text-xs font-black text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Movement Type Filter */}
          <div className="flex items-center gap-1 lg:col-span-3">
            <button
              onClick={() => setMovementType('all')}
              className={cn(
                'flex-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all',
                movementType === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              الكل
            </button>
            <button
              onClick={() => setMovementType('in')}
              className={cn(
                'flex-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all',
                movementType === 'in'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              + وارد
            </button>
            <button
              onClick={() => setMovementType('out')}
              className={cn(
                'flex-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all',
                movementType === 'out'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              - صادر
            </button>
          </div>

          {/* Document Type Dropdown */}
          <div className="sm:col-span-1 lg:col-span-2">
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-bold text-slate-700 transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">كل المستندات</option>
              <option value="sale">فواتير البيع</option>
              <option value="purchase">فواتير الشراء</option>
              <option value="sale_return">مردود مبيعات</option>
              <option value="purchase_return">مردود مشتريات</option>
              <option value="transfer">المناقلات</option>
              <option value="stock_audit">التسويات الجردية</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5 sm:col-span-2 lg:col-span-2">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/70 px-2 py-1.5 text-[11px] font-mono text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="من تاريخ"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/70 px-2 py-1.5 text-[11px] font-mono text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="إلى تاريخ"
            />
          </div>
        </div>

        {/* ── KPI Summary Cards ── */}
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
            <span className="block text-[10px] font-bold text-slate-400">عدد العمليات</span>
            <span className="font-mono text-sm font-black text-slate-800 dark:text-slate-200">
              {formatNumberDisplay(stats.count)} حركة
            </span>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 dark:border-emerald-950/40 dark:bg-emerald-950/20">
            <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400">إجمالي الوارد (+)</span>
            <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">
              +{formatNumberDisplay(stats.totalIn)}
            </span>
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5 dark:border-rose-950/40 dark:bg-rose-950/20">
            <span className="block text-[10px] font-bold text-rose-600 dark:text-rose-400">إجمالي الصادر (-)</span>
            <span className="font-mono text-sm font-black text-rose-700 dark:text-rose-300">
              -{formatNumberDisplay(stats.totalOut)}
            </span>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5 dark:border-blue-950/40 dark:bg-blue-950/20">
            <span className="block text-[10px] font-bold text-blue-600 dark:text-blue-400">صافي الحركة</span>
            <span
              className={cn(
                'font-mono text-sm font-black',
                stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'
              )}
            >
              {stats.net >= 0 ? '+' : ''}
              {formatNumberDisplay(stats.net)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Movements Table ── */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-[var(--app-surface)] shadow-sm dark:border-slate-800">
        <div className="custom-scrollbar h-full overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[980px] border-collapse border border-slate-200 text-right text-xs dark:border-slate-800">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 text-[10px] font-black uppercase tracking-wider text-slate-600 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300">
              <tr>
                <th className="w-12 border border-slate-200 px-3 py-3 text-center dark:border-slate-800">#</th>
                <th className="w-36 border border-slate-200 px-3 py-3 dark:border-slate-800">التاريخ والوقت</th>
                <th className="w-44 border border-slate-200 px-3 py-3 dark:border-slate-800">نوع ورقم المستند</th>
                <th className="border border-slate-200 px-4 py-3 dark:border-slate-800">بيانات الصنف (الاسم / رقم القطعة / SKU)</th>
                <th className="w-44 border border-slate-200 px-3 py-3 dark:border-slate-800">الطرف المقابل / الفرع</th>
                <th className="w-24 border border-slate-200 px-3 py-3 text-center dark:border-slate-800">نوع الحركة</th>
                <th className="w-28 border border-slate-200 px-3 py-3 text-left dark:border-slate-800">الكمية</th>
                <th className="w-28 border border-slate-200 px-3 py-3 text-left dark:border-slate-800">الرصيد اللحظي</th>
                <th className="w-32 border border-slate-200 px-3 py-3 dark:border-slate-800">المستخدم</th>
                <th className="w-20 border border-slate-200 px-2 py-3 text-center dark:border-slate-800">كشف الصنف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-600" />
                      <p className="text-xs font-bold text-slate-400">جاري تحميل سجل الحركات المخزنية المباشر...</p>
                    </div>
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Package size={36} className="opacity-30" />
                      <p className="text-xs font-bold">لا توجد حركات مخزنية تطابق معايير البحث المحددة</p>
                      <button
                        onClick={() => {
                          setSearch('');
                          setMovementType('all');
                          setDocType('all');
                          setStartDate('');
                          setEndDate('');
                        }}
                        className="mt-1 text-xs font-black text-blue-600 hover:underline dark:text-blue-400"
                      >
                        إعادة تعيين الفلاتر
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                movements.map((m, idx) => {
                  const isIncoming = m.movement_type === 'in';
                  const docMeta = DOC_TYPE_LABELS[m.doc_type] || {
                    label: m.doc_type,
                    badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
                  };

                  return (
                    <tr
                      key={m.id || idx}
                      className="group cursor-pointer transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                      onClick={() =>
                        onSelectProduct({
                          id: m.product_id,
                          name_ar: m.product_name,
                          sku: m.product_sku,
                          part_number: m.product_part_number,
                          brand: m.product_brand,
                        })
                      }
                      title="انقر لعرض كشف الحساب والمسار التراكمي الكامل لهذا الصنف"
                    >
                      {/* # Index */}
                      <td className="border border-slate-200/80 px-3 py-2.5 text-center font-mono text-[11px] font-bold text-slate-400 dark:border-slate-800/80">
                        {idx + 1}
                      </td>

                      {/* Date & Time */}
                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:border-slate-800/80 dark:text-slate-400">
                        {new Date(m.date).toLocaleString('en-GB', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </td>

                      {/* Document Type & Number */}
                      <td className="border border-slate-200/80 px-3 py-2.5 dark:border-slate-800/80">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              'inline-block w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-black',
                              docMeta.badge
                            )}
                          >
                            {docMeta.label}
                          </span>
                          <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-100">
                            {m.doc_number}
                          </span>
                        </div>
                      </td>

                      {/* Product Details */}
                      <td className="border border-slate-200/80 px-4 py-2.5 dark:border-slate-800/80">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-black text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                            {m.product_name}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                              SKU: {m.product_sku}
                            </span>
                            {m.product_part_number && (
                              <span className="font-mono">P/N: {m.product_part_number}</span>
                            )}
                            {m.product_brand && (
                              <span className="rounded bg-slate-100 px-1 py-0.2 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {m.product_brand}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Counterparty / Party */}
                      <td className="border border-slate-200/80 px-3 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-800/80 dark:text-slate-300">
                        <span className="block max-w-[180px] truncate" title={m.party_name}>
                          {m.party_name || '---'}
                        </span>
                      </td>

                      {/* Movement Type */}
                      <td className="border border-slate-200/80 px-3 py-2.5 text-center dark:border-slate-800/80">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black',
                            isIncoming
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          )}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft size={10} strokeWidth={3} />
                          ) : (
                            <ArrowUpRight size={10} strokeWidth={3} />
                          )}
                          {isIncoming ? 'وارد' : 'صادر'}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td
                        dir="ltr"
                        className={cn(
                          'border border-slate-200/80 px-3 py-2.5 text-left font-mono text-xs font-black dark:border-slate-800/80',
                          isIncoming ? 'text-emerald-600' : 'text-rose-600'
                        )}
                      >
                        {isIncoming ? '+' : '-'}
                        {formatNumberDisplay(m.quantity)}
                      </td>

                      {/* Current Stock */}
                      <td
                        dir="ltr"
                        className="border border-slate-200/80 px-3 py-2.5 text-left font-mono text-xs font-bold text-slate-700 dark:border-slate-800/80 dark:text-slate-300"
                      >
                        {formatNumberDisplay(m.current_stock)}
                      </td>

                      {/* User */}
                      <td className="border border-slate-200/80 px-3 py-2.5 dark:border-slate-800/80">
                        <span className="block max-w-[120px] truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {m.user_name?.split('@')[0] || 'النظام'}
                        </span>
                      </td>

                      {/* Action */}
                      <td
                        className="border border-slate-200/80 px-2 py-2.5 text-center dark:border-slate-800/80"
                        onClick={e => {
                          e.stopPropagation();
                          onSelectProduct({
                            id: m.product_id,
                            name_ar: m.product_name,
                            sku: m.product_sku,
                            part_number: m.product_part_number,
                            brand: m.product_brand,
                          });
                        }}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-900/30"
                          title="عرض كشف حساب هذا الصنف بالتفصيل"
                        >
                          <ChevronLeft size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GeneralMovementsFeed;

