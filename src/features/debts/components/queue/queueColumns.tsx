/**
 * queueColumns — تعريف أعمدة شبكة طابور التحصيل (ExcelTable).
 *
 * ترتيب الأعمدة من اليمين لليسار: أولوية → درجة → عميل → أرقام → سياق → إجراءات.
 * صف الإجمالي يُحسب من الصفوف المعروضة ويستخدم `amount_base` فقط (لا جمع عملات).
 */
import type { Column } from '../../../../ui/common/ExcelTable';
import { baseTotalLabel, summarizeQueue, type QueueSummary } from '../../lib/queueGrid';
import {
  QueueActionsCell,
  QueueAmountCell,
  QueueBaseCell,
  QueueContactCell,
  QueueDaysCell,
  QueueNextActionCell,
  QueuePartyCell,
  QueueScoreCell,
  QueueStageCell,
} from './QueueCells';
import type { DebtPriorityQueueRow } from '../../types';

export interface QueueColumnContext {
  /** الصفوف المعروضة (بعد الفلترة) — أساس صف الإجمالي. */
  rows: DebtPriorityQueueRow[];
  baseCurrency: string;
  /** رتبة الأولوية من الخادم: تبقى ثابتة حتى لو غيّر المستخدم الفرز. */
  rankById: ReadonlyMap<string, number>;
  canRemind: boolean;
  canManage: boolean;
  partiesWithDetail: ReadonlySet<string>;
  onRemind: (row: DebtPriorityQueueRow) => void;
  onPromise: (row: DebtPriorityQueueRow) => void;
}

interface ColumnMetrics {
  summary: QueueSummary;
  maxBase: number;
  maxDays: number;
}

const maxOf = (rows: DebtPriorityQueueRow[], pick: (row: DebtPriorityQueueRow) => number): number =>
  rows.reduce((max, row) => Math.max(max, pick(row)), 0);

const metricsOf = (rows: DebtPriorityQueueRow[]): ColumnMetrics => ({
  summary: summarizeQueue(rows),
  maxBase: maxOf(rows, row => row.amount_base),
  maxDays: maxOf(rows, row => row.days_late),
});

/** الأولوية/الدرجة/العميل — هوية الصف وسبب ترتيبه. */
const priorityColumns = (ctx: QueueColumnContext): Array<Column<DebtPriorityQueueRow>> => [
  {
    header: 'أولوية',
    accessorKey: 'priority_rank',
    accessor: row => (
      <span
        className="font-mono text-[11px] font-bold tabular-nums text-[var(--app-text-secondary)]"
        title="رتبة الأولوية كما رتّبها الخادم — ثابتة حتى مع تغيير فرز الأعمدة"
      >
        {String(ctx.rankById.get(row.task_id) ?? '—')}
      </span>
    ),
    width: 'w-10',
    align: 'center',
  },
  {
    header: 'الدرجة',
    accessorKey: 'priority_score',
    accessor: row => <QueueScoreCell score={row.priority_score} drivers={row.score_drivers} />,
    sortKey: 'priority_score',
    width: 'w-20',
    align: 'center',
  },
  {
    header: 'العميل',
    accessorKey: 'party_name',
    accessor: row => <QueuePartyCell row={row} />,
    sortKey: 'party_name',
    width: 'w-56',
    align: 'right',
  },
];

/** الأرقام: المبلغ بعملته، ثم بالعملة الأساس مع الحصة، ثم أيام التأخير. */
const moneyColumns = (
  ctx: QueueColumnContext,
  metrics: ColumnMetrics
): Array<Column<DebtPriorityQueueRow>> => [
  {
    header: 'المبلغ',
    accessorKey: 'amount',
    accessor: row => <QueueAmountCell row={row} />,
    sortKey: 'amount_base',
    width: 'w-32',
    align: 'left',
  },
  {
    header: 'العملة',
    accessorKey: 'currency_code',
    accessor: row => (
      <span className="font-mono text-[10px] text-[var(--app-text-secondary)]" dir="ltr">
        {row.currency_code ?? '—'}
      </span>
    ),
    sortKey: 'currency_code',
    width: 'w-16',
    align: 'center',
  },
  {
    header: 'بالعملة الأساس',
    accessorKey: 'amount_base',
    accessor: row => (
      <QueueBaseCell row={row} baseTotal={metrics.summary.baseTotal} maxBase={metrics.maxBase} />
    ),
    sortKey: 'amount_base',
    width: 'w-24',
    align: 'left',
    footer: () => baseTotalLabel(metrics.summary, ctx.baseCurrency),
  },
  {
    header: 'التأخير',
    accessorKey: 'days_late',
    accessor: row => <QueueDaysCell days={row.days_late} maxDays={metrics.maxDays} />,
    sortKey: 'days_late',
    width: 'w-20',
    align: 'center',
    footer: () => (metrics.summary.count === 0 ? '' : `${String(metrics.summary.avgDaysLate)} يوم`),
  },
];

/** سياق التحصيل: آخر تواصل / التصعيد / المسؤول. */
const contactColumns = (): Array<Column<DebtPriorityQueueRow>> => [
  {
    header: 'آخر تواصل',
    accessorKey: 'days_since_contact',
    accessor: row => <QueueContactCell days={row.days_since_contact} />,
    sortKey: 'days_since_contact',
    width: 'w-20',
    align: 'center',
  },
  {
    header: 'التصعيد',
    accessorKey: 'escalation_stage',
    accessor: row => <QueueStageCell stage={row.escalation_stage} />,
    sortKey: 'escalation_stage',
    width: 'w-24',
    align: 'center',
  },
  {
    header: 'المسؤول',
    accessorKey: 'assigned_name',
    accessor: row => (
      <span
        className="truncate text-[11px] text-[var(--app-text)]"
        title={row.assigned_name ?? 'غير مُسند'}
      >
        {row.assigned_name ?? '—'}
      </span>
    ),
    sortKey: 'assigned_name',
    width: 'w-28',
    align: 'right',
  },
];

/** العمل المطلوب: الأمر التالي / المرجع / الإجراءات. */
const workColumns = (ctx: QueueColumnContext): Array<Column<DebtPriorityQueueRow>> => [
  {
    header: 'الأمر التالي',
    accessorKey: 'next_action',
    accessor: row => <QueueNextActionCell row={row} />,
    sortKey: 'next_action',
    width: 'w-64',
    align: 'right',
  },
  {
    header: 'المرجع',
    accessorKey: 'reference_info',
    accessor: row => (
      <span className="font-mono text-[10px] text-[var(--app-text-secondary)]" dir="ltr">
        {row.reference_info ?? '—'}
      </span>
    ),
    sortKey: 'reference_info',
    width: 'w-28',
    align: 'center',
  },
  {
    header: 'الإجراءات',
    accessor: row => (
      <QueueActionsCell
        row={row}
        canRemind={ctx.canRemind}
        canManage={ctx.canManage}
        hasDashboardRow={ctx.partiesWithDetail.has(row.party_id)}
        onRemind={ctx.onRemind}
        onPromise={ctx.onPromise}
      />
    ),
    width: 'w-24',
    align: 'center',
  },
];

/** كل أعمدة الشبكة بترتيب العرض. */
export const buildQueueColumns = (
  ctx: QueueColumnContext
): Array<Column<DebtPriorityQueueRow>> => {
  const metrics = metricsOf(ctx.rows);
  return [
    ...priorityColumns(ctx),
    ...moneyColumns(ctx, metrics),
    ...contactColumns(),
    ...workColumns(ctx),
  ];
};
