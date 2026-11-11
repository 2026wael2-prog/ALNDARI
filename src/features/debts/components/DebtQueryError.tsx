import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface DebtQueryErrorProps {
  /** سطر توضيحي: ما الذي لم يُحمّل وما أثره على ما تراه في الشاشة. */
  message: string;
  /** إعادة المحاولة (تُخفى إن لم يكن هناك دالة refetch). */
  onRetry?: (() => void) | undefined;
}

/**
 * تنبيه فشل قراءة بيانات الديون.
 * السبب في وجوده: جداول الديون كانت تعرض «لا توجد بيانات» عند فشل الاستعلام،
 * فيقرأه المستخدم كحقيقة (صفر مدينين) بينما الحقيقة أن القراءة فشلت.
 */
const DebtQueryError: React.FC<DebtQueryErrorProps> = ({ message, onRetry }) => (
  <div
    role="alert"
    className="flex items-start gap-3 rounded-2xl border border-rose-300/60 bg-rose-50 p-3 text-rose-800 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 max-md:p-2.5"
  >
    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-xs font-bold">تعذّر تحميل البيانات من الخادم</p>
      <p className="mt-0.5 text-[11px] leading-relaxed">{message}</p>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white/70 px-2.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-white dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
      >
        <RefreshCw size={12} />
        <span>إعادة المحاولة</span>
      </button>
    )}
  </div>
);

export default DebtQueryError;
