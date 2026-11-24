import React from 'react';
import { AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';

interface EditInvoiceConfirmDialogProps {
  customerName: string;
  paymentMethod: 'cash' | 'credit';
  itemsCount: number;
  total: number;
  currencyCode: string;
  isUpdating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const EditInvoiceConfirmDialog: React.FC<EditInvoiceConfirmDialogProps> = ({
  customerName,
  paymentMethod,
  itemsCount,
  total,
  currencyCode,
  isUpdating,
  onCancel,
  onConfirm,
}) => (
  <div className="animate-in fade-in fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 duration-100">
    <div
      style={{ backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
      className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 text-right shadow-2xl"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertCircle size={22} />
        </div>
        <div>
          <h3 className="text-sm font-black text-[var(--app-text)]">تأكيد تعديل الفاتورة</h3>
          <p className="text-xs font-medium text-[var(--app-text-secondary)]">
            يرجى مراجعة تفاصيل التعديل قبل الاعتماد
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--app-text-secondary)]">العميل:</span>
          <span className="font-bold text-[var(--app-text)]">{customerName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--app-text-secondary)]">طريقة الدفع:</span>
          <span className="font-bold text-[var(--app-text)]">
            {paymentMethod === 'cash' ? 'نقداً (كاش)' : 'آجل (ذمم)'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--app-text-secondary)]">عدد الأصناف:</span>
          <span className="font-mono font-bold text-[var(--app-text)]">{itemsCount}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--app-border)] pt-2 font-bold">
          <span className="text-[var(--app-text)]">الإجمالي الجديد:</span>
          <span className="font-mono text-emerald-600 dark:text-emerald-400" dir="ltr">
            {formatCurrency(total, currencyCode)}
          </span>
        </div>
      </div>

      <p className="text-[11px] font-medium leading-relaxed text-[var(--app-text-secondary)]">
        سيتم تنفيذ تسوية المخزون وإعادة إنشاء بنود القيود المحاسبية تلقائياً في معاملة واحدة غير قابلة للتجزئة.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isUpdating}
          className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
        >
          تراجع
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isUpdating}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isUpdating ? 'جاري الحفظ والترحيل...' : 'تأكيد الحفظ والترحيل'}
        </button>
      </div>
    </div>
  </div>
);
