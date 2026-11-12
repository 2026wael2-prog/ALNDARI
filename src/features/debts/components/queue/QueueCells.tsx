/**
 * QueueCells — خلايا شبكة طابور التحصيل (عرض فقط، بلا منطق أعمال).
 *
 * التفكيك يُبقي ملف الأعمدة تعريفاً صرفاً، ويُسهّل اختبار المنطق النقي في
 * `lib/queueGrid.ts` بلا DOM.
 */
import React from 'react';
import { ArrowUpRight, Handshake, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../../../core/utils';
import { formatCurrency } from '../../../../core/utils/currencyUtils';
import { ROUTES } from '../../../../core/routes/paths';
import { escalationBadgeMeta } from '../../lib/constants';
import {
  coverageShare,
  heatClasses,
  heatLevel,
  queueTaskLabel,
  scoreBand,
  scoreBandClasses,
  scoreBarWidth,
} from '../../lib/queueGrid';
import type { DebtPriorityQueueRow } from '../../types';

const barClass = (band: 'critical' | 'high' | 'normal'): string => {
  if (band === 'critical') return 'bg-rose-500';
  if (band === 'high') return 'bg-amber-500';
  return 'bg-sky-500';
};

const driversTitle = (drivers: string[] | null): string =>
  drivers !== null && drivers.length > 0 ? `أسباب الدرجة: ${drivers.join(' • ')}` : 'لا أسباب مسجلة';

/** الدرجة + شريط نسبي + أسبابها في التلميح (شفافية الترتيب داخل الجدول). */
export const QueueScoreCell: React.FC<{ score: number; drivers: string[] | null }> = ({
  score,
  drivers,
}) => {
  const band = scoreBand(score);
  return (
    <div className="flex items-center gap-1.5" title={driversTitle(drivers)}>
      <span
        className={cn(
          'w-8 shrink-0 rounded-md border px-1 py-0.5 text-center font-mono text-[11px] font-extrabold tabular-nums',
          scoreBandClasses(band)
        )}
      >
        {String(Math.round(score))}
      </span>
      <span className="h-1.5 w-9 shrink-0 overflow-hidden rounded-full bg-[var(--app-border)]">
        <span
          className={cn('block h-full rounded-full', barClass(band))}
          style={{ width: scoreBarWidth(score) }}
        />
      </span>
    </div>
  );
};

/** المبلغ بعملته الأصلية — لا تحويل في الواجهة. */
export const QueueAmountCell: React.FC<{ row: DebtPriorityQueueRow }> = ({ row }) => {
  if (row.amount === null) {
    return <span className="text-[11px] text-[var(--app-text-secondary)]">—</span>;
  }
  return (
    <span className="whitespace-nowrap font-mono text-[11px] font-bold tabular-nums" dir="ltr">
      {formatCurrency(row.amount, row.currency_code ?? 'SAR')}
    </span>
  );
};

interface BaseCellProps {
  row: DebtPriorityQueueRow;
  baseTotal: number;
  maxBase: number;
}

/** المبلغ بالعملة الأساس + حصته من الطابور (تلوين حراري يقود العين للأثقل). */
export const QueueBaseCell: React.FC<BaseCellProps> = ({ row, baseTotal, maxBase }) => (
  <span
    className={cn(
      'flex flex-col items-start gap-0.5 rounded px-1 py-0.5',
      heatClasses(heatLevel(row.amount_base, maxBase))
    )}
    title={`${String(coverageShare(row.amount_base, baseTotal))}% من إجمالي الطابور (بالعملة الأساس)`}
  >
    <span className="whitespace-nowrap font-mono text-[11px] font-bold tabular-nums" dir="ltr">
      {row.amount_base.toLocaleString('en-US', { maximumFractionDigits: 0 })}
    </span>
    <span className="font-mono text-[10px] tabular-nums opacity-80" dir="ltr">
      {String(coverageShare(row.amount_base, baseTotal))}%
    </span>
  </span>
);

/** أيام التأخير مع تلوين حراري نسبي. */
export const QueueDaysCell: React.FC<{ days: number; maxDays: number }> = ({ days, maxDays }) => {
  if (days <= 0) {
    return <span className="text-[11px] text-[var(--app-text-secondary)]">—</span>;
  }
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[11px] font-extrabold tabular-nums',
        heatClasses(heatLevel(days, maxDays))
      )}
    >
      {String(days)}
    </span>
  );
};

/** أيام منذ آخر تواصل فعلي — «لا سجل» يعني انقطاعاً كاملاً. */
export const QueueContactCell: React.FC<{ days: number | null }> = ({ days }) => {
  if (days === null) {
    return (
      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
        لا سجل
      </span>
    );
  }
  return (
    <span
      className={cn(
        'font-mono text-[11px] tabular-nums',
        days >= 7 ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-[var(--app-text)]'
      )}
    >
      {String(days)}
    </span>
  );
};

/** العميل: الاسم + نوع المهمة + الهاتف — عمود واحد بكثافة إكسل. */
export const QueuePartyCell: React.FC<{ row: DebtPriorityQueueRow }> = ({ row }) => (
  <div className="min-w-0">
    <div className="flex items-center gap-1.5">
      <span className="truncate text-[11px] font-bold text-[var(--app-text)]" title={row.party_name}>
        {row.party_name}
      </span>
      <span className="shrink-0 rounded bg-[var(--app-surface-hover)] px-1 py-0.5 text-[10px] font-bold text-[var(--app-text-secondary)]">
        {queueTaskLabel(row.task_type)}
      </span>
    </div>
    <span className="block font-mono text-[10px] text-[var(--app-text-secondary)]" dir="ltr">
      {(row.party_phone ?? '') === '' ? 'بلا هاتف' : row.party_phone}
    </span>
  </div>
);

/** مرحلة التصعيد المقترحة (مراقبة/تذكير/اتصال/زيارة/قانوني). */
export const QueueStageCell: React.FC<{ stage: string | null }> = ({ stage }) => {
  const meta = escalationBadgeMeta(stage);
  if (meta.label === '') {
    return <span className="text-[11px] text-[var(--app-text-secondary)]">—</span>;
  }
  return (
    <span
      title="مرحلة التصعيد المقترحة حسب أيام التأخير"
      className={cn(
        'whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold',
        meta.badgeClass
      )}
    >
      {meta.label}
    </span>
  );
};

/** الأمر التنفيذي التالي — أزرق لأنه «افعل هذا الآن»، لا معلومة للقراءة. */
export const QueueNextActionCell: React.FC<{ row: DebtPriorityQueueRow }> = ({ row }) => (
  <span
    className="line-clamp-2 whitespace-normal text-[11px] font-bold leading-relaxed text-blue-700 dark:text-blue-400"
    title={`${row.next_action}${row.reference_info !== null ? ` • ${row.reference_info}` : ''}`}
  >
    {row.next_action}
  </span>
);

interface QueueActionsProps {
  row: DebtPriorityQueueRow;
  canRemind: boolean;
  canManage: boolean;
  hasDashboardRow?: boolean;
  onRemind: (row: DebtPriorityQueueRow) => void;
  onPromise: (row: DebtPriorityQueueRow) => void;
}

const iconButton =
  'rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 text-[var(--app-text-secondary)] transition-colors hover:border-blue-500/50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40';

const remindHint = (canRemind: boolean, hasPhone: boolean): string => {
  if (!canRemind) return 'تحتاج صلاحية debts:remind';
  if (!hasPhone) return 'العميل لا يملك رقم هاتف مسجل';
  return 'إرسال تذكير واتساب';
};

interface IconActionProps {
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/**
 * زر أيقونة موحّد داخل خلية الإجراءات (بلا نص — كثافة جدول)، ويوقف انتشار
 * النقر كي لا يُحدَّد الصف أو يتحرك مؤشر الخلية عند ضغط زر.
 */
const IconAction: React.FC<IconActionProps> = ({
  label,
  title,
  disabled = false,
  onClick,
  children,
}) => (
  <button
    type="button"
    className={iconButton}
    onClick={event => {
      event.stopPropagation();
      onClick();
    }}
    disabled={disabled}
    title={title}
    aria-label={label}
  >
    {children}
  </button>
);

/** إجراءات الصف: تذكير / وعد / فتح الملف — أيقونات مضغوطة كأزرار الجدول. */
export const QueueActionsCell: React.FC<QueueActionsProps> = ({
  row,
  canRemind,
  canManage,
  onRemind,
  onPromise,
}) => {
  const hasPhone = (row.party_phone ?? '').trim() !== '';
  return (
    <div className="flex items-center justify-center gap-1">
      <IconAction
        label="إرسال تذكير"
        title={remindHint(canRemind, hasPhone)}
        disabled={!canRemind || !hasPhone}
        onClick={() => {
          onRemind(row);
        }}
      >
        <MessageSquare size={13} />
      </IconAction>
      <IconAction
        label="تسجيل وعد دفع"
        title={canManage ? 'تسجيل وعد دفع' : 'تحتاج صلاحية debts:manage'}
        disabled={!canManage}
        onClick={() => {
          onPromise(row);
        }}
      >
        <Handshake size={13} />
      </IconAction>
      <Link
        to={`${ROUTES.DASHBOARD.DEBTS_FOLLOWUP}?party=${row.party_id}`}
        className={iconButton}
        title="فتح ملف التحصيل الكامل للعميل"
        aria-label="فتح ملف التحصيل"
        onClick={event => {
          event.stopPropagation();
        }}
      >
        <ArrowUpRight size={13} />
      </Link>
    </div>
  );
};
