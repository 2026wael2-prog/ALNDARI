/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition */
import React, { useRef } from 'react';
import {
  Printer,
  Copy,
  X,
  FileCheck2,
  Calendar,
  User,
  CreditCard,
  Package,
  ArrowRight,
} from 'lucide-react';
import { useInvoiceDetails } from '../../hooks/index';
import type { InvoiceDetailItem } from '../../api';
import { useCompany } from '@/features/settings/hooks';
import PrintableInvoice from '../PrintableInvoice';
import { useReactToPrint } from 'react-to-print';
import { useSalesStore, type SalesCartItem } from '../../store';
import { useFeedbackStore } from '@/features/feedback/store';
import { formatCurrency, getDisplayItemName } from '@/core/utils';
import PageLoader from '@/ui/base/PageLoader';

interface PreviousInvoiceViewProps {
  invoiceId: string;
  onClose: () => void;
  onCopiedToNewInvoice?: () => void;
}

export const PreviousInvoiceView: React.FC<PreviousInvoiceViewProps> = ({
  invoiceId,
  onClose,
  onCopiedToNewInvoice,
}) => {
  const { data: invoice, isLoading, error } = useInvoiceDetails(invoiceId);
  const { data: company } = useCompany();
  const { loadCartState } = useSalesStore();
  const { showToast } = useFeedbackStore();

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `فاتورة_${invoice?.invoice_number ?? 'معاينة'}`,
  });

  const handleCopyItemsToCart = (): void => {
    if (!invoice || !invoice.invoice_items || invoice.invoice_items.length === 0) {
      showToast('لا توجد أصناف في هذه الفاتورة للنسخ', 'warning');
      return;
    }

    const newCartItems: SalesCartItem[] = invoice.invoice_items.map((item: InvoiceDetailItem) => ({
      id: crypto.randomUUID(),
      productId: item.id ?? item.product?.sku ?? '',
      sku: item.product?.sku ?? '',
      name: getDisplayItemName(item, 'صنف'),
      partNumber: item.product?.part_number ?? '',
      brand: item.product?.brand ?? '',
      quantity: item.quantity > 0 ? item.quantity : 1,
      basePrice: item.unit_price,
      price: item.unit_price,
      discount: 0,
      costPrice: item.product?.cost_price ?? 0,
    }));

    loadCartState({
      items: newCartItems,
      selectedCustomer: invoice.parties
        ? {
            id: invoice.parties.id,
            name: invoice.parties.name,
            phone: invoice.parties.phone ?? '',
            type: 'customer',
          }
        : null,
      currency: invoice.currency_code ?? 'SAR',
      exchangeRate: invoice.exchange_rate ? invoice.exchange_rate : 1,
      invoiceType: invoice.payment_method === 'credit' ? 'credit' : 'cash',
      notes: invoice.notes ? `منسوخة من الفاتورة #${invoice.invoice_number ?? ''}` : '',
    });

    showToast(`تم نسخ ${String(newCartItems.length)} صنف إلى فاتورة مبيعات جديدة`, 'success');
    onClose();
    if (onCopiedToNewInvoice) {
      onCopiedToNewInvoice();
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <PageLoader />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <p className="font-bold">تعذر تحميل بيانات الفاتورة السابقة</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700"
        >
          <ArrowRight size={14} /> العودة للفاتورة الجديدة
        </button>
      </div>
    );
  }

  const items = invoice.invoice_items ?? [];
  const currencyCode = invoice.currency_code ?? 'SAR';
  const totalAmount = invoice.total_amount ?? 0;

  const invoiceForPrint = {
    company: company,
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    party_name: invoice.parties?.name ?? 'عميل نقدي',
    items: items.map((i: InvoiceDetailItem) => ({
      name: getDisplayItemName(i),
      quantity: i.quantity,
      price: i.unit_price,
    })),
    total_amount: totalAmount,
    tax_amount: 0,
    currency_code: currencyCode,
  };

  return (
    <div className="space-y-3">
      {/* الشريط العلوي للتحكم وتنبيه المعاينة */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50/40 to-slate-50 p-3 shadow-sm dark:border-blue-900/60 dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow">
            <FileCheck2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-950 dark:text-blue-200">
                استعراض فاتورة سابقة:
              </span>
              <span className="rounded bg-blue-600/10 px-2 py-0.5 font-mono text-xs font-black text-blue-700 dark:bg-blue-400/20 dark:text-blue-300">
                #{invoice.invoice_number}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                معتمدة ({invoice.status})
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar size={12} /> {invoice.issue_date}
              </span>
              <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                <User size={12} /> {invoice.parties?.name ?? 'عميل نقدي'}
              </span>
              <span className="flex items-center gap-1 font-medium">
                <CreditCard size={12} />
                {invoice.payment_method === 'credit' ? 'آجل' : 'نقدي'}
              </span>
            </div>
          </div>
        </div>

        {/* أزرار العمليات على الفاتورة السابقة */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyItemsToCart}
            title="نسخ محتويات هذه الفاتورة إلى فاتورة مبيعات جديدة بيضاء"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50 active:scale-95 dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            <Copy size={14} />
            <span>نسخ إلى فاتورة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handlePrint();
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Printer size={14} />
            <span>طباعة</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title="العودة للفاتورة الجديدة"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-200 px-3 text-xs font-bold text-slate-800 transition hover:bg-slate-300 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <X size={14} />
            <span>إغلاق المعاينة</span>
          </button>
        </div>
      </div>

      {/* جدول الأصناف للفاتورة السابقة بتنسيق عالي الكثافة */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Package size={14} className="text-blue-600" />
              أصناف الفاتورة ({items.length} صنف)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">الإجمالي الصافي:</span>
              <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalAmount, currencyCode)}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-100/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400">
              <tr>
                <th className="py-2.5 pr-4">#</th>
                <th className="py-2.5">اسم الصنف / البيان</th>
                <th className="py-2.5">رقم القطعة / الماركة</th>
                <th className="py-2.5 text-center">الكمية</th>
                <th className="py-2.5 text-left">سعر الوحدة</th>
                <th className="py-2.5 pl-4 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {items.map((item: InvoiceDetailItem, idx: number) => {
                const rowTotal = item.total ? item.total : item.quantity * item.unit_price;
                return (
                  <tr key={item.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pr-4 font-mono text-[10px] text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 font-bold text-slate-900 dark:text-white">
                      {getDisplayItemName(item)}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.product?.part_number ?? '-'} {item.product?.brand ? `(${item.product.brand})` : ''}
                    </td>
                    <td className="py-2.5 text-center font-bold text-slate-800 dark:text-slate-200">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 text-left font-mono text-slate-700 dark:text-slate-300">
                      {formatCurrency(item.unit_price, currencyCode)}
                    </td>
                    <td className="py-2.5 pl-4 text-left font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(rowTotal, currencyCode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* قسم الطباعة المخفي */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          <PrintableInvoice invoice={invoiceForPrint} />
        </div>
      </div>
    </div>
  );
};

export default PreviousInvoiceView;
