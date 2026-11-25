import React, { useEffect } from 'react';
import { CheckCircle2, X, ShieldCheck } from 'lucide-react';
import { getDefaultExchangeOperator } from '../../core/utils/currencyUtils';
import Spinner from '../base/Spinner';
import { ConfirmationMetadataCards } from './confirmation/ConfirmationMetadataCards';
import {
  ConfirmationItemsAndTotals,
  type ConfirmationItem,
} from './confirmation/ConfirmationItemsAndTotals';

export type { ConfirmationItem };

export interface InvoiceConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean | undefined;
  mode: 'sale' | 'purchase';
  invoiceNumber?: string | undefined;
  partyName: string;
  invoiceType: 'cash' | 'credit';
  currency: string;
  exchangeRate: number;
  exchangeOperator?: ('multiply' | 'divide') | undefined;
  cashboxName?: string | undefined;
  warehouseName?: string | undefined;
  items: ConfirmationItem[];
  subtotal: number;
  discount?: number | undefined;
  tax?: number | undefined;
  total: number;
  paidAmount?: number | undefined;
  notes?: string | undefined;
  onSwitchToYER?: (() => void) | undefined;
}

export const InvoiceConfirmationModal: React.FC<InvoiceConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  mode,
  invoiceNumber,
  partyName,
  invoiceType,
  currency,
  exchangeRate,
  exchangeOperator,
  cashboxName,
  warehouseName,
  items,
  subtotal,
  discount = 0,
  tax = 0,
  total,
  paidAmount = 0,
  notes,
  onSwitchToYER,
}) => {
  // إغلاق بمفتاح Escape إذا لم تكن الفاتورة قيد الحفظ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const isSale = mode === 'sale';
  const isCredit = invoiceType === 'credit';
  const isForeign = currency !== 'SAR';
  const hasPartialPayment = isCredit && paidAmount > 0;
  const remainingCredit = Math.max(0, total - paidAmount);

  // إجمالي عدد القطع
  const totalPieces = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // حساب المعامل الفعلي وسعر الصرف والمعادل بالريال السعودي
  const effectiveOperator = exchangeOperator ?? getDefaultExchangeOperator(currency);
  const effectiveRate =
    effectiveOperator === 'divide' && exchangeRate < 1 ? 1 / exchangeRate : exchangeRate;
  const baseTotal = isForeign
    ? effectiveOperator === 'divide'
      ? total / effectiveRate
      : total * effectiveRate
    : total;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 md:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* الخلفية المظلمة الشفافة */}
      <div
        className="backdrop-blur-xs animate-in fade-in fixed inset-0 bg-slate-950/70 transition-opacity"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      {/* نافذة التأكيد */}
      <div className="animate-in zoom-in-95 relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:pb-0">
        {/* شريط العنوان العلوي */}
        <div
          className={`flex items-center justify-between border-b px-3.5 py-2.5 sm:px-5 sm:py-3.5 ${
            isSale
              ? 'border-emerald-100 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
              : 'border-blue-100 bg-blue-50/70 text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`rounded-xl p-2 ${
                isSale ? 'bg-emerald-500 text-white shadow-xs' : 'bg-blue-600 text-white shadow-xs'
              }`}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-base font-black leading-tight">
                <span>
                  {isSale ? 'تأكيد اعتماد فاتورة المبيعات' : 'تأكيد اعتماد فاتورة المشتريات'}
                </span>
                {invoiceNumber && (
                  <span className="rounded-md border border-slate-200/60 bg-white/60 px-2 py-0.5 font-mono text-xs dark:border-slate-800 dark:bg-slate-800/60">
                    #{invoiceNumber}
                  </span>
                )}
              </h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                يرجى مراجعة البنود والمبالغ قبل التأكيد النهائي والترحيل
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title="إلغاء وإغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* محتوى النافذة القابل للتمرير */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <ConfirmationMetadataCards
            isSale={isSale}
            isCredit={isCredit}
            isForeign={isForeign}
            hasPartialPayment={hasPartialPayment}
            partyName={partyName}
            currency={currency}
            effectiveOperator={effectiveOperator}
            effectiveRate={effectiveRate}
            cashboxName={cashboxName}
            warehouseName={warehouseName}
            total={total}
            paidAmount={paidAmount}
            remainingCredit={remainingCredit}
            onSwitchToYER={onSwitchToYER}
          />
          <ConfirmationItemsAndTotals
            items={items}
            totalPieces={totalPieces}
            currency={currency}
            subtotal={subtotal}
            discount={discount}
            tax={tax}
            total={total}
            baseTotal={baseTotal}
            isForeign={isForeign}
            isSale={isSale}
            isCredit={isCredit}
            paidAmount={paidAmount}
            remainingCredit={remainingCredit}
            notes={notes}
          />
        </div>

        {/* أزرار الإجراءات السفلية */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200/80 bg-slate-100/60 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            تعديل الفاتورة
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className={`active:scale-98 flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-black text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              isSale
                ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
                : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" />
                <span>جاري الترحيل والحفظ...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>تأكيد وحفظ الفاتورة</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceConfirmationModal;
