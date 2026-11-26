import type React from 'react';
import { Activity, AlertOctagon, Clock, Gauge, Scale, Wallet } from 'lucide-react';
import { cn, formatCurrency, formatNumberDisplay } from '@/core/utils';
import type { CustomerCreditSummary } from '../../utils/creditScoring';

interface CreditKpiStripProps {
  summary: CustomerCreditSummary;
  currency: string;
  onClickOverLimit: () => void;
  onClickOverdue: () => void;
}

interface KpiItem {
  key: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  boxCls: string;
  valCls: string;
  onClick?: () => void;
}

function buildPrimaryKpis(
  summary: CustomerCreditSummary,
  currency: string,
  onClickOverdue: () => void
): KpiItem[] {
  return [
    {
      key: 'receivable',
      label: `إجمالي الذمم (${currency})`,
      value: formatCurrency(summary.total_receivable, currency),
      sub: `${formatNumberDisplay(summary.debtors_count)} مدين • خالص ${formatNumberDisplay(summary.settled_count)}`,
      icon: <Wallet size={13} />,
      boxCls: 'border-blue-200/80 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20',
      valCls: 'text-blue-950 dark:text-blue-200',
    },
    {
      key: 'overdue',
      label: 'الديون المتأخرة',
      value: formatCurrency(summary.total_overdue, currency),
      sub: `${String(summary.overdue_percent)}% من المحفظة`,
      icon: <AlertOctagon size={13} />,
      boxCls:
        'cursor-pointer border-rose-200/80 bg-rose-50/50 hover:border-rose-400 dark:border-rose-900/50 dark:bg-rose-950/25',
      valCls: 'text-rose-800 dark:text-rose-300',
      onClick: onClickOverdue,
    },
    {
      key: 'dso',
      label: 'متوسط التحصيل (DSO)',
      value: `${String(summary.dso_days)} يوم`,
      sub: `مبيعات الفترة: ${formatCurrency(summary.period_credit_sales, currency)}`,
      icon: <Clock size={13} />,
      boxCls: 'border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20',
      valCls:
        summary.dso_days > 60
          ? 'text-rose-800 dark:text-rose-300'
          : 'text-amber-900 dark:text-amber-200',
    },
  ];
}

function buildGovernanceKpis(
  summary: CustomerCreditSummary,
  currency: string,
  onClickOverLimit: () => void
): KpiItem[] {
  return [
    {
      key: 'cei',
      label: 'كفاءة التحصيل (CEI)',
      value: `${String(summary.cei_percent)}%`,
      sub: `محصّل الفترة: ${formatCurrency(summary.period_collections, currency)}`,
      icon: <Activity size={13} />,
      boxCls:
        'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20',
      valCls:
        summary.cei_percent >= 75
          ? 'text-emerald-800 dark:text-emerald-300'
          : 'text-amber-800 dark:text-amber-300',
    },
    {
      key: 'overlimit',
      label: 'تجاوز السقف الائتماني',
      value: `${formatNumberDisplay(summary.over_limit_count)} عميل`,
      sub:
        summary.over_limit_amount > 0
          ? `قيمة التجاوز: ${formatCurrency(summary.over_limit_amount, currency)}`
          : 'لا توجد تجاوزات حالياً',
      icon: <Gauge size={13} />,
      boxCls:
        'cursor-pointer border-purple-200/80 bg-purple-50/40 hover:border-purple-400 dark:border-purple-900/50 dark:bg-purple-950/20',
      valCls:
        summary.over_limit_count > 0
          ? 'text-rose-800 dark:text-rose-300'
          : 'text-purple-900 dark:text-purple-200',
      onClick: onClickOverLimit,
    },
    {
      key: 'ecl',
      label: 'مخصص IFRS 9 ECL',
      value: formatCurrency(summary.ecl_provision, currency),
      sub: `تركّز أكبر 5 عملاء: ${String(summary.concentration_top5_percent)}%`,
      icon: <Scale size={13} />,
      boxCls: 'border-slate-200/90 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900',
      valCls: 'text-black dark:text-white',
    },
  ];
}

const KpiCardView: React.FC<{ card: KpiItem }> = ({ card }) => {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10.5px] font-black text-black/80 dark:text-slate-300">
          {card.label}
        </span>
        <span className="shrink-0 opacity-80">{card.icon}</span>
      </div>
      <div
        dir="ltr"
        className={cn(
          'mt-1 truncate text-right font-mono text-sm font-black tabular-nums',
          card.valCls
        )}
      >
        {card.value}
      </div>
      <div className="mt-0.5 truncate text-[10px] font-bold text-black/65 dark:text-slate-400">
        {card.sub}
      </div>
    </>
  );

  const cls = cn(
    'w-full min-w-0 rounded-xl border px-2.5 py-2 text-right shadow-2xs transition-all',
    card.boxCls
  );

  if (card.onClick !== undefined) {
    return (
      <button type="button" onClick={card.onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
};

export const CreditKpiStrip: React.FC<CreditKpiStripProps> = ({
  summary,
  currency,
  onClickOverLimit,
  onClickOverdue,
}) => {
  const items = [
    ...buildPrimaryKpis(summary, currency, onClickOverdue),
    ...buildGovernanceKpis(summary, currency, onClickOverLimit),
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
      {items.map(card => (
        <KpiCardView key={card.key} card={card} />
      ))}
    </div>
  );
};
