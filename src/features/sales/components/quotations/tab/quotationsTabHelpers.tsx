import React from 'react';
import { ArrowRightLeft, CheckCircle, CircleX, Clock, Send } from 'lucide-react';
import type { QuotationStatus } from '@/features/sales/types/quotation';

export const STATUS_CONFIG: Record<
  QuotationStatus,
  { label: string; color: string; dot: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'مسودة',
    color:
      'border border-slate-200 bg-slate-100/90 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-400',
    icon: <Clock size={11} />,
  },
  sent: {
    label: 'مُرسل',
    color:
      'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-300',
    dot: 'bg-blue-500',
    icon: <Send size={11} />,
  },
  pending: {
    label: 'قيد المراجعة',
    color:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    icon: <Clock size={11} />,
  },
  submitted: {
    label: 'مُقدم من المورد',
    color:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: <Send size={11} />,
  },
  accepted: {
    label: 'مقبول',
    color:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: <CheckCircle size={11} />,
  },
  rejected: {
    label: 'مرفوض',
    color:
      'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300',
    dot: 'bg-rose-500',
    icon: <CircleX size={11} />,
  },
  expired: {
    label: 'منتهي',
    color:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    icon: <Clock size={11} />,
  },
  converted: {
    label: 'تم التحويل',
    color:
      'border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-900/30 dark:text-indigo-300',
    dot: 'bg-indigo-500',
    icon: <ArrowRightLeft size={11} />,
  },
};

export const FILTER_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'draft', label: 'مسودة' },
  { key: 'sent', label: 'مُرسل' },
  { key: 'accepted', label: 'مقبول' },
  { key: 'rejected', label: 'مرفوض' },
  { key: 'converted', label: 'محوّل' },
];

export const currencyBadgeStyle = (code: string): string => {
  switch (code.toUpperCase()) {
    case 'SAR':
      return 'bg-amber-100/90 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'YER':
      return 'bg-sky-100/90 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
    case 'OMR':
      return 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
  }
};

export const getDaysRemaining = (validUntil: string | null): number | null => {
  if (!validUntil) return null;
  const ts = new Date(validUntil).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
};

export interface QuotationTabStats {
  totalCount: number;
  awaitingCount: number;
  expiringSoonCount: number;
  wonCount: number;
  conversionRate: number;
  countsByStatus: Record<string, number>;
  currencyTotals: Array<[string, number]>;
}

export function computeQuotationStats(quotations: any[]): QuotationTabStats {
  const countsByStatus: Record<string, number> = { all: quotations.length };
  const totalsByCurrency = new Map<string, number>();
  let awaitingCount = 0;
  let expiringSoonCount = 0;
  let wonCount = 0;

  for (const q of quotations) {
    const st = String(q.status || 'draft');
    countsByStatus[st] = (countsByStatus[st] ?? 0) + 1;

    if (st === 'draft' || st === 'sent' || st === 'pending') {
      awaitingCount += 1;
      const days = getDaysRemaining(q.valid_until);
      if (days !== null && days >= 0 && days <= 3) {
        expiringSoonCount += 1;
      }
    }
    if (st === 'accepted' || st === 'converted') {
      wonCount += 1;
    }

    const curr = String(q.currency_code || 'SAR').toUpperCase();
    const amount = Number(q.total_amount) || 0;
    if (st !== 'rejected') {
      totalsByCurrency.set(curr, (totalsByCurrency.get(curr) ?? 0) + amount);
    }
  }

  const currencyTotals = Array.from(totalsByCurrency.entries())
    .filter(([, total]) => total > 0)
    .sort(([a], [b]) => (a === 'SAR' ? -1 : b === 'SAR' ? 1 : a.localeCompare(b)));

  const conversionRate =
    quotations.length > 0 ? Math.round((wonCount / quotations.length) * 100) : 0;

  return {
    totalCount: quotations.length,
    awaitingCount,
    expiringSoonCount,
    wonCount,
    conversionRate,
    countsByStatus,
    currencyTotals,
  };
}
