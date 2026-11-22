import React from 'react';
import { cn } from '../../core/utils';

export type AccountingStatusTone =
  | 'confirmed'
  | 'paid'
  | 'collected'
  | 'loss'
  | 'deficit'
  | 'critical'
  | 'pending'
  | 'partial'
  | 'review'
  | 'active'
  | 'recommended'
  | 'draft'
  | 'inactive'
  | 'info';

interface ToneStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
  defaultLabel: string;
}

const TONE_MAP: Record<AccountingStatusTone, ToneStyle> = {
  // الأخضر (#059669) — للعمليات الإيجابية المؤكدة والتحصيل
  confirmed: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-[#059669] dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    dot: 'bg-[#059669]',
    defaultLabel: 'مؤكد',
  },
  paid: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-[#059669] dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    dot: 'bg-[#059669]',
    defaultLabel: 'مدفوع',
  },
  collected: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-[#059669] dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    dot: 'bg-[#059669]',
    defaultLabel: 'محصّل',
  },

  // الأحمر (#e11d48) — للخسائر والعجز والأخطاء المالية والحالات الحرجة
  loss: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-[#e11d48] dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800/60',
    dot: 'bg-[#e11d48]',
    defaultLabel: 'خسارة',
  },
  deficit: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-[#e11d48] dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800/60',
    dot: 'bg-[#e11d48]',
    defaultLabel: 'عجز',
  },
  critical: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-[#e11d48] dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800/60',
    dot: 'bg-[#e11d48]',
    defaultLabel: 'حرج',
  },

  // الكهرماني (#f59e0b) — للعمليات المعلقة والتنبيهات التي تحتاج إلى مراجعة
  pending: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/60',
    dot: 'bg-[#f59e0b]',
    defaultLabel: 'معلّق',
  },
  partial: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/60',
    dot: 'bg-[#f59e0b]',
    defaultLabel: 'مدفوع جزئياً',
  },
  review: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/60',
    dot: 'bg-[#f59e0b]',
    defaultLabel: 'قيد المراجعة',
  },

  // النيلي (#4f46e5) — للإجراءات الرئيسية والعناصر النشطة والتوصيات غير المؤكدة
  active: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-[#4f46e5] dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800/60',
    dot: 'bg-[#4f46e5]',
    defaultLabel: 'نشط',
  },
  recommended: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-[#4f46e5] dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800/60',
    dot: 'bg-[#4f46e5]',
    defaultLabel: 'توصية',
  },

  // السماوي (#0ea5e9) — للمعلومات الإرشادية
  info: {
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800/60',
    dot: 'bg-[#0ea5e9]',
    defaultLabel: 'معلومة',
  },

  // الرمادي (#64748b) — للبيانات المحايدة والمسودات والمعلومات غير النشطة
  draft: {
    bg: 'bg-slate-100 dark:bg-slate-800/70',
    text: 'text-[#64748b] dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    dot: 'bg-[#64748b]',
    defaultLabel: 'مسودة',
  },
  inactive: {
    bg: 'bg-slate-100 dark:bg-slate-800/70',
    text: 'text-[#64748b] dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    dot: 'bg-[#64748b]',
    defaultLabel: 'غير نشط',
  },
};

export interface AccountingStatusBadgeProps {
  tone: AccountingStatusTone;
  /** تسمية نصية إلزامية أو افتراضية — لا تُستخدم الألوان وحدها أبداً */
  label?: string;
  showDot?: boolean;
  className?: string;
}

export const AccountingStatusBadge: React.FC<AccountingStatusBadgeProps> = ({
  tone,
  label,
  showDot = true,
  className,
}) => {
  const style = TONE_MAP[tone];
  const resolvedLabel = label || style.defaultLabel;

  return (
    <span
      role="status"
      aria-label={resolvedLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold leading-tight',
        style.bg,
        style.text,
        style.border,
        className
      )}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />}
      <span>{resolvedLabel}</span>
    </span>
  );
};

export default AccountingStatusBadge;
