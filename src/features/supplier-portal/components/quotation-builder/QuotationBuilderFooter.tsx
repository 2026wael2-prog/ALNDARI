import React from 'react';
import { Loader2, Send } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';

interface QuotationBuilderTermsFieldsProps {
  terms: string;
  onTermsChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}

export const QuotationBuilderTermsFields: React.FC<QuotationBuilderTermsFieldsProps> = ({
  terms,
  onTermsChange,
  notes,
  onNotesChange,
}) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <div>
      <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
        الشروط والأحكام
      </label>
      <textarea
        rows={2}
        value={terms}
        onChange={e => {
          onTermsChange(e.target.value);
        }}
        className="w-full rounded-lg border border-slate-200 bg-[var(--app-surface)] p-2 text-xs focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
        placeholder="شروط التسليم والدفع..."
      />
    </div>
    <div>
      <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
        ملاحظات إضافية
      </label>
      <textarea
        rows={2}
        value={notes}
        onChange={e => {
          onNotesChange(e.target.value);
        }}
        className="w-full rounded-lg border border-slate-200 bg-[var(--app-surface)] p-2 text-xs focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
        placeholder="أي توضيحات للمشتري..."
      />
    </div>
  </div>
);

interface QuotationBuilderFooterProps {
  currency: string;
  subtotal: number;
  discountAmount: number;
  grandTotal: number;
  revisionNumber: number;
  itemsCount: number;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export const QuotationBuilderFooter: React.FC<QuotationBuilderFooterProps> = ({
  currency,
  subtotal,
  discountAmount,
  grandTotal,
  revisionNumber,
  itemsCount,
  isSubmitting,
  onClose,
  onSubmit,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center gap-4">
      <div>
        <span className="block text-[10px] text-slate-400">المجموع الفرعي</span>
        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200" dir="ltr">
          {formatCurrency(subtotal, currency)}
        </span>
      </div>
      {discountAmount > 0 && (
        <div>
          <span className="block text-[10px] text-rose-500">الخصم</span>
          <span className="font-mono text-xs font-bold text-rose-500" dir="ltr">
            -{formatCurrency(discountAmount, currency)}
          </span>
        </div>
      )}
      <div className="border-l border-slate-200 pl-3 dark:border-slate-700">
        <span className="block text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
          الإجمالي الصافي
        </span>
        <span
          className="font-mono text-base font-bold text-indigo-600 dark:text-indigo-400"
          dir="ltr"
        >
          {formatCurrency(grandTotal, currency)}
        </span>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        إلغاء
      </button>

      <button
        type="button"
        onClick={onSubmit}
        disabled={itemsCount === 0 || isSubmitting}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        <span>إرسال واعتماد المراجعة (#{revisionNumber})</span>
      </button>
    </div>
  </div>
);
