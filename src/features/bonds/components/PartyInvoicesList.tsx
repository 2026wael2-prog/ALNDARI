import React, { useState } from 'react';
import { FileText, CheckCircle2, Eye, ArrowUpDown } from 'lucide-react';
import { formatCurrency, formatLocalDate, cn } from '../../../core/utils';
import InvoiceDetailsModal from '../../sales/components/details/InvoiceDetailsModal';
import { usePartyInvoicesFilter } from '../hooks/usePartyInvoicesFilter';
import { PartyInvoicesToolbar } from './PartyInvoicesToolbar';

interface PartyInvoicesListProps {
  partyId: string;
  partyType: 'customer' | 'supplier';
  onSelectInvoice: (invoice: any) => void;
  selectedInvoiceId?: string | undefined;
}

const PartyInvoicesList: React.FC<PartyInvoicesListProps> = ({
  partyId,
  partyType,
  onSelectInvoice,
  selectedInvoiceId,
}) => {
  const {
    invoices,
    isLoading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    handleSort,
    processedInvoices,
    totals,
  } = usePartyInvoicesFilter(partyId, partyType);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-36 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            جاري جلب جدول الفواتير الآجلة...
          </span>
        </div>
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-100 bg-emerald-50/40 p-5 text-center dark:border-emerald-900/30 dark:bg-emerald-900/10">
        <div className="rounded-full bg-emerald-100 p-2.5 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle2 size={22} />
        </div>
        <div>
          <h3 className="text-xs font-black text-emerald-800 dark:text-emerald-300">
            لا توجد فواتير آجلة
          </h3>
          <p className="mt-0.5 text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80">
            لا توجد فواتير غير مسددة مسجلة على هذه الجهة في السجلات.
          </p>
        </div>
      </div>
    );
  }

  const headerTitle = partyType === 'customer' ? 'فواتير العميل الآجلة' : 'فواتير المورد الآجلة';

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <PartyInvoicesToolbar
          headerTitle={headerTitle}
          count={processedInvoices.length}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />

        {/* Excel Spreadsheet Table */}
        <div className="custom-scrollbar max-h-72 overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse border border-slate-200 text-right text-xs dark:border-slate-800">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 text-[10px] font-black uppercase text-slate-600 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-300">
              <tr>
                <th className="w-10 border border-slate-200 px-2.5 py-2 text-center dark:border-slate-700">
                  تحديد
                </th>
                <th
                  onClick={() => {
                    handleSort('invoice_number');
                  }}
                  className="cursor-pointer border border-slate-200 px-3 py-2 transition-colors hover:text-blue-600 dark:border-slate-700"
                >
                  <div className="flex items-center gap-1">
                    <span>رقم الفاتورة</span>
                    <ArrowUpDown size={11} className="opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    handleSort('issue_date');
                  }}
                  className="cursor-pointer border border-slate-200 px-3 py-2 transition-colors hover:text-blue-600 dark:border-slate-700"
                >
                  <div className="flex items-center gap-1">
                    <span>تاريخ الإصدار</span>
                    <ArrowUpDown size={11} className="opacity-60" />
                  </div>
                </th>
                <th className="border border-slate-200 px-3 py-2 dark:border-slate-700">
                  البيان والملاحظات
                </th>
                <th
                  onClick={() => {
                    handleSort('total_amount');
                  }}
                  className="cursor-pointer border border-slate-200 px-3 py-2 text-left transition-colors hover:text-blue-600 dark:border-slate-700"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>الإجمالي</span>
                    <ArrowUpDown size={11} className="opacity-60" />
                  </div>
                </th>
                <th className="border border-slate-200 px-3 py-2 text-left dark:border-slate-700">
                  المسدد
                </th>
                <th
                  onClick={() => {
                    handleSort('remaining_amount');
                  }}
                  className="cursor-pointer border border-slate-200 px-3 py-2 text-left transition-colors hover:text-blue-600 dark:border-slate-700"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>المتبقي</span>
                    <ArrowUpDown size={11} className="opacity-60" />
                  </div>
                </th>
                <th className="border border-slate-200 px-3 py-2 text-center dark:border-slate-700">
                  الحالة
                </th>
                <th className="w-16 border border-slate-200 px-3 py-2 text-center dark:border-slate-700">
                  معاينة
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans dark:divide-slate-800">
              {processedInvoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-slate-200 py-8 text-center text-xs font-bold text-slate-400 dark:border-slate-800"
                  >
                    لا توجد فواتير تطابق معايير البحث
                  </td>
                </tr>
              ) : (
                processedInvoices.map((inv: any, idx: number) => {
                  const isSelected = selectedInvoiceId === inv.id;
                  const currency = inv.currency_code || inv.currency || 'SAR';

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => {
                        onSelectInvoice(isSelected ? null : inv);
                      }}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-blue-50/60 dark:hover:bg-blue-900/20',
                        isSelected
                          ? 'bg-blue-50/90 font-medium text-blue-950 dark:bg-blue-900/30 dark:text-blue-100'
                          : idx % 2 === 0
                            ? 'bg-white dark:bg-slate-900'
                            : 'bg-slate-50/40 dark:bg-slate-850/40'
                      )}
                    >
                      <td
                        className="border border-slate-200/80 px-2.5 py-2 text-center dark:border-slate-800/80"
                        onClick={e => {
                          e.stopPropagation();
                        }}
                      >
                        <input
                          type="radio"
                          name="selected_invoice"
                          checked={isSelected}
                          onChange={() => {
                            onSelectInvoice(isSelected ? null : inv);
                          }}
                          className="h-3.5 w-3.5 cursor-pointer accent-blue-600"
                        />
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 font-mono font-bold dark:border-slate-800/80">
                        <div className="flex items-center gap-1.5">
                          <FileText size={13} className="text-slate-400" />
                          <span
                            className={cn(
                              isSelected
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-slate-800 dark:text-slate-200'
                            )}
                          >
                            {inv.invoice_number}
                          </span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 font-mono text-[11px] text-slate-600 dark:border-slate-800/80 dark:text-slate-400">
                        {formatLocalDate(inv.issue_date)}
                      </td>

                      <td className="max-w-[180px] truncate border border-slate-200/80 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
                        {inv.notes ||
                          (inv.invoice_items?.length
                            ? `${inv.invoice_items.length} صنف`
                            : 'فاتورة آجلة')}
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 text-left font-mono font-bold text-slate-700 dark:border-slate-800/80 dark:text-slate-300">
                        {formatCurrency(inv._total, currency)}
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 text-left font-mono text-emerald-600 dark:border-slate-800/80 dark:text-emerald-400">
                        {inv._paid > 0 ? formatCurrency(inv._paid, currency) : '-'}
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 text-left font-mono font-black text-rose-600 dark:border-slate-800/80 dark:text-rose-400">
                        {formatCurrency(inv._remaining, currency)}
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 text-center dark:border-slate-800/80">
                        {inv._isPartial ? (
                          <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            جزئي
                          </span>
                        ) : (
                          <span className="inline-block rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                            معلق
                          </span>
                        )}
                      </td>

                      <td
                        className="border border-slate-200/80 px-3 py-2 text-center dark:border-slate-800/80"
                        onClick={e => {
                          e.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewInvoiceId(inv.id);
                          }}
                          title="معاينة الفاتورة بجميع تفاصيلها وأصنافها"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-600 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Excel Summary Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-850">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <span>عدد الفواتير المعروضة:</span>
            <span className="font-mono text-slate-900 dark:text-white">
              {processedInvoices.length}
            </span>
            {selectedInvoiceId && (
              <span className="mr-2 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                تم تحديد فاتورة للسداد
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1 font-mono">
              <span className="text-[10px] font-bold text-slate-400">الإجمالي:</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {formatCurrency(totals.total)}
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono">
              <span className="text-[10px] font-bold text-slate-400">المسدد:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totals.paid)}
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono">
              <span className="text-[10px] font-bold text-slate-400">المتبقي:</span>
              <span className="font-black text-rose-600 dark:text-rose-400">
                {formatCurrency(totals.remaining)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {previewInvoiceId && (
        <InvoiceDetailsModal
          invoiceId={previewInvoiceId}
          onClose={() => {
            setPreviewInvoiceId(null);
          }}
        />
      )}
    </>
  );
};

export default PartyInvoicesList;
