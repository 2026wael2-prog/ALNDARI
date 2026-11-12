import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  AlertTriangle,
  Coins,
  Banknote,
  Calculator,
  Briefcase,
} from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import Card from '../../../../ui/base/Card';
import StatCard from '../../../../ui/common/StatCard';
import type { DailyDrawerSummary } from '../../types';
import type { ReconciliationPageController } from '../../pages/useReconciliationPageController';

/** أنماط حالة الفارق في بطاقات الأرقام — خرائط بدل سلاسل الشروط */
export type VarianceStatus = 'balanced' | 'surplus' | 'shortage';

export interface VarianceStatStyle {
  title: string;
  colorClass: string;
  iconBgClass: string;
  icon: LucideIcon;
}

export const VARIANCE_STAT_STYLE: Record<VarianceStatus, VarianceStatStyle> = {
  balanced: {
    title: 'لا يوجد فارق',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    iconBgClass: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  surplus: {
    title: 'فائض بالدرج',
    colorClass: 'text-amber-600 dark:text-amber-400',
    iconBgClass: 'bg-amber-500',
    icon: AlertTriangle,
  },
  shortage: {
    title: 'عجز بالدرج',
    colorClass: 'text-red-600 dark:text-red-400',
    iconBgClass: 'bg-red-500',
    icon: AlertTriangle,
  },
};

/** عنوان حالة الدرج — دالة صريحة بدل استدعاء دالة من خريطة بمفتاح ديناميكي */
export const resolveVarianceHeadline = (
  status: VarianceStatus,
  variance: number,
  currency: string
): string => {
  if (status === 'balanced') return 'الدرج مطابق تماماً';
  if (status === 'surplus') return `فائض ${formatCurrency(variance, currency)}`;
  return `عجز ${formatCurrency(variance, currency)}`;
};

/** حدّ إطار شريط الاعتماد حسب حالة الفارق */
export const resolveCommitBorder = (status: VarianceStatus): string => {
  if (status === 'balanced') return 'border-emerald-500/40';
  if (status === 'surplus') return 'border-amber-500/40';
  return 'border-red-500/40';
};

/** تلوين أيقونة حالة الفارق */
export const resolveCommitIconTone = (status: VarianceStatus): string => {
  if (status === 'balanced') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (status === 'surplus') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  return 'bg-red-500/15 text-red-600 dark:text-red-400';
};

/** شريط الأرقام الأربعة الحاسمة */
export const SummaryStats: React.FC<{ view: ReconciliationPageController['view'] }> = ({ view }) => {
  const { cashVarianceInfo } = view;
  const varianceStyle = VARIANCE_STAT_STYLE[cashVarianceInfo.status];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatCard
        variant="compact"
        title="المتوقع بالدرج"
        value={formatCurrency(view.expectedCash, view.currency)}
        subtext={`حد التسامح ±${formatCurrency(view.tolerance, view.currency)}`}
        icon={Banknote}
        colorClass="text-blue-600 dark:text-blue-400"
        iconBgClass="bg-blue-500"
      />
      <StatCard
        variant="compact"
        title="الكاش الفعلي المعدود"
        value={formatCurrency(view.actualCashCounted, view.currency)}
        subtext={view.hasForeignCurrencyCounts ? 'مجموع عدة عملات محوّل للأساس' : 'جرد بعملة الأساس'}
        icon={Calculator}
        colorClass="text-emerald-600 dark:text-emerald-400"
        iconBgClass="bg-emerald-500"
      />
      <StatCard
        variant="compact"
        title={varianceStyle.title}
        value={formatCurrency(cashVarianceInfo.variance, view.currency)}
        subtext={
          cashVarianceInfo.isWithinTolerance ? 'داخل حد التسامح' : 'خارج حد التسامح — يتطلب مبرراً'
        }
        icon={varianceStyle.icon}
        colorClass={varianceStyle.colorClass}
        iconBgClass={varianceStyle.iconBgClass}
      />
      <StatCard
        variant="compact"
        title="الصافي المورَّد للخزينة"
        value={formatCurrency(view.cashToOwner, view.currency)}
        subtext={
          view.netIsNegative ? '⚠️ عجز: الفكة أكبر من الكاش' : 'بعد استبقاء الفكة بالدرج'
        }
        icon={Briefcase}
        colorClass={
          view.netIsNegative
            ? 'text-red-600 dark:text-red-400'
            : 'text-indigo-600 dark:text-indigo-400'
        }
        iconBgClass={view.netIsNegative ? 'bg-red-500' : 'bg-indigo-500'}
      />
    </div>
  );
};

/** تفصيل مبيعات اليوم حسب عملة الفاتورة */
export const SalesCurrencyCard: React.FC<{ summary: DailyDrawerSummary }> = ({ summary }) => {
  const rows = summary.sales_by_currency ?? [];
  const otherSales = summary.other_sales ?? 0;
  if (rows.length <= 1 && otherSales === 0) return null;

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Coins className="h-4 w-4 text-blue-500" />
        <h3 className="text-xs font-bold text-[var(--app-text)]">مبيعات اليوم حسب عملة الفاتورة</h3>
        <span className="text-[11px] text-[var(--app-text-secondary)]">
          (المجاميع محوّلة إلى عملة الأساس بسعر الفاتورة)
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(row => (
          <div
            key={row.currency_code}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1 text-[11px]"
          >
            <span className="font-black text-[var(--app-text)]">{row.currency_code}</span>
            <span className="mx-1 text-[var(--app-text-secondary)]">•</span>
            <span className="text-[var(--app-text-secondary)]">
              {formatCurrency(row.raw_total, row.currency_code)} ({row.invoice_count} فاتورة) ≈{' '}
              <strong className="text-[var(--app-text)]">
                {formatCurrency(row.base_total, summary.base_currency ?? row.currency_code)}
              </strong>
            </span>
          </div>
        ))}
        {otherSales > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
            طرق دفع غير مصنّفة:{' '}
            {formatCurrency(otherSales, summary.base_currency ?? summary.currency ?? 'SAR')}
          </div>
        )}
      </div>
    </Card>
  );
};
