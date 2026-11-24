import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Eye,
  ArrowUpDown,
  AlertTriangle,
  Percent,
  CheckCheck,
  Edit3,
  X,
} from 'lucide-react';
import { formatCurrency, formatLocalDate, cn } from '../../../core/utils';
import InvoiceDetailsModal from '../../sales/components/details/InvoiceDetailsModal';
import { usePartyInvoicesFilter } from '../hooks/usePartyInvoicesFilter';
import { PartyInvoicesToolbar } from './PartyInvoicesToolbar';
import type { InvoicePaymentPreset, SelectedInvoiceSnapshot } from '../hooks/useBondForm';
import type { InvoiceSettlementEvaluation } from '../invoiceAllocationGuard';

interface PartyInvoicesListProps {
  partyId: string;
  partyType: 'customer' | 'supplier';
  onSelectInvoice: (invoice: any) => void;
  selectedInvoiceId?: string | undefined;
  selectedInvoice?: SelectedInvoiceSnapshot | null | undefined;
  settlementPreview?: InvoiceSettlementEvaluation | null | undefined;
  onApplyPreset?: ((preset: InvoicePaymentPreset) => void) | undefined;
}

/* eslint-disable max-lines-per-function, complexity */
const PartyInvoicesList: React.FC<PartyInvoicesListProps> = ({
  partyId,
  partyType,
  onSelectInvoice,
  selectedInvoiceId,
  selectedInvoice,
  settlementPreview,
  onApplyPreset,
}) => {
  const {
    invoices,
    isLoading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    currencyFilter,
    setCurrencyFilter,
    availableCurrencies,
    handleSort,
    processedInvoices,
    totalsByCurrency,
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
          currencyFilter={currencyFilter}
          onCurrencyFilterChange={setCurrencyFilter}
          availableCurrencies={availableCurrencies}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />

        {/* Selected Invoice Partial/Full Settlement Control Panel */}
        {selectedInvoice && settlementPreview && (
          <div
            data-testid="selected-invoice-settlement-panel"
            className={cn(
              'space-y-2.5 border-b p-3 text-xs transition-colors',
              settlementPreview.mode === 'over_remaining' ||
                settlementPreview.mode === 'currency_mismatch'
                ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/20'
                : settlementPreview.mode === 'partial'
                  ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
                  : 'border-blue-200 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-blue-600 px-2 py-0.5 font-mono text-[11px] font-black text-white">
                  #{selectedInvoice.invoiceNumber}
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {selectedInvoice.currency}
                </span>
                {settlementPreview.mode === 'partial' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <Percent size={11} />
                    سداد جزئي (ستبقى الفاتورة مفتوحة بالمتبقي)
                  </span>
                )}
                {settlementPreview.mode === 'full' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <CheckCheck size={11} />
                    سداد كامل المتبقي (ستُغلق الفاتورة)
                  </span>
                )}
                {settlementPreview.mode === 'over_remaining' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                    <AlertTriangle size={11} />
                    المبلغ يتجاوز المتبقي على الفاتورة
                  </span>
                )}
                {settlementPreview.mode === 'currency_mismatch' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                    <AlertTriangle size={11} />
                    عملة السند ({settlementPreview.bondCurrency}) تختلف عن عملة الفاتورة (
                    {settlementPreview.invoiceCurrency})
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSelectInvoice(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                title="إلغاء ربط السند بفاتورة محددة"
              >
                <X size={11} />
                <span>إلغاء الربط</span>
              </button>
            </div>

            {/* Quick Settlement Mode Buttons */}
            {onApplyPreset && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  طريقة سداد الفاتورة:
                </span>
                <button
                  type="button"
                  onClick={() => onApplyPreset('full')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black transition-all',
                    settlementPreview.mode === 'full'
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  )}
                >
                  <CheckCheck size={11} />
                  <span>تسديد كامل المتبقي</span>
                </button>
                <button
                  type="button"
                  onClick={() => onApplyPreset('half')}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-black text-amber-700 transition-all hover:bg-amber-50 dark:border-amber-800/60 dark:bg-slate-800 dark:text-amber-300"
                >
                  <span>دفعة جزئية 50%</span>
                </button>
                <button
                  type="button"
                  onClick={() => onApplyPreset('quarter')}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-black text-amber-700 transition-all hover:bg-amber-50 dark:border-amber-800/60 dark:bg-slate-800 dark:text-amber-300"
                >
                  <span>دفعة جزئية 25%</span>
                </button>
                <button
                  type="button"
                  onClick={() => onApplyPreset('custom')}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[10px] font-black text-blue-700 transition-all hover:bg-blue-50 dark:border-blue-800/60 dark:bg-slate-800 dark:text-blue-300"
                >
                  <Edit3 size={11} />
                  <span>مبلغ جزئي مخصص</span>
                </button>
              </div>
            )}

            {/* Live Before/After Invoice Remaining Numbers */}
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/80 bg-white/90 p-2 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400">المتبقي حالياً</span>
                <span dir="ltr" className="font-mono text-xs font-black text-slate-800 dark:text-slate-100">
                  {formatCurrency(selectedInvoice.docRemaining, selectedInvoice.currency)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400">الدفعة الحالية</span>
                <span
                  dir="ltr"
                  className={cn(
                    'font-mono text-xs font-black',
                    settlementPreview.mode === 'over_remaining'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {formatCurrency(settlementPreview.enteredAmount, settlementPreview.bondCurrency)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400">المتبقي بعد السند</span>
                <span
                  dir="ltr"
                  className={cn(
                    'font-mono text-xs font-black',
                    settlementPreview.remainingAfter > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {formatCurrency(settlementPreview.remainingAfter, selectedInvoice.currency)}
                </span>
              </div>
            </div>
          </div>
        )}

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
                  const currency = inv._currency || inv.currency_code || inv.currency || 'SAR';

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
                          <span
                            className={cn(
                              'rounded px-1 py-0.2 font-mono text-[10px] font-black',
                              currency === 'YER'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            )}
                          >
                            {currency}
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
                        <div className="flex flex-col items-end leading-tight">
                          <span>{formatCurrency(inv._docTotal ?? inv._total, currency)}</span>
                          {inv._isForeign && (
                            <span className="text-[10px] font-normal text-slate-400">
                              ≈ {formatCurrency(inv._total, 'SAR')}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 text-left font-mono text-emerald-600 dark:border-slate-800/80 dark:text-emerald-400">
                        {inv._paid > 0 ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="font-bold">
                              {formatCurrency(inv._docPaid ?? inv._paid, currency)}
                            </span>
                            {inv._isForeign && (
                              <span className="text-[10px] font-normal text-emerald-600/75 dark:text-emerald-400/75">
                                ≈ {formatCurrency(inv._paid, 'SAR')}
                              </span>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 text-left font-mono font-black text-rose-600 dark:border-slate-800/80 dark:text-rose-400">
                        <div className="flex flex-col items-end leading-tight">
                          <span>{formatCurrency(inv._docRemaining ?? inv._remaining, currency)}</span>
                          {inv._isForeign && (
                            <span className="text-[10px] font-bold text-rose-500/80">
                              ≈ {formatCurrency(inv._remaining, 'SAR')}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2 text-center dark:border-slate-800/80">
                        {inv._isPartial ? (
                          <span className="inline-block rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/40 dark:text-amber-300">
                            مسدد جزئياً
                          </span>
                        ) : (
                          <span className="inline-block rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/40 dark:text-rose-300">
                            غير مسدد
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

        {/* Strict Per-Currency Summary Footer */}
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-850">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>عدد الفواتير المعروضة:</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {processedInvoices.length}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              اضغط على أي فاتورة لاختيار سدادها بالكامل أو تسديد دفعة جزئية منها
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {totalsByCurrency.map(ct => (
              <div
                key={ct.currency}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900"
              >
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[10px] font-black',
                    ct.currency === 'YER'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  )}
                >
                  {ct.currency} ({ct.count})
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-300" dir="ltr">
                  <span className="ml-1 font-sans text-[10px] text-slate-400">الإجمالي:</span>
                  {formatCurrency(ct.total, ct.currency)}
                </span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400" dir="ltr">
                  <span className="ml-1 font-sans text-[10px] text-slate-400">المسدد:</span>
                  {formatCurrency(ct.paid, ct.currency)}
                </span>
                <span className="font-mono font-black text-rose-600 dark:text-rose-400" dir="ltr">
                  <span className="ml-1 font-sans text-[10px] text-slate-400">المتبقي:</span>
                  {formatCurrency(ct.remaining, ct.currency)}
                </span>
              </div>
            ))}
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
/* eslint-enable max-lines-per-function, complexity */

export default PartyInvoicesList;
