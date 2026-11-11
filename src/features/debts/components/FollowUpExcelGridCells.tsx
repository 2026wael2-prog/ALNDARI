/**
 * خلايا شبكة الديون والتحصيل — مكوّنات عرض صغيرة بلا منطق أعمال.
 * تُبقي ملف الشبكة الرئيسي مقتصراً على تعريف الأعمدة والتركيب.
 */
import React, { useMemo } from 'react';
import { AlertTriangle, UserCheck } from 'lucide-react';
import {
  formatCurrency,
  toBaseCurrency,
  resolveAutoExchangeRate,
} from '../../../core/utils/currencyUtils';
import StatusBadge from './StatusBadge';
import RowActions from './RowActions';
import { classificationMeta, escalationBadgeMeta, reminderStatusMeta } from '../lib/constants';
import { buildDebtRowActions, type DebtRowActionHandlers } from '../lib/rowActions';
import type { FollowUpDashboardRow } from '../types';

/** خلية الرصيد بالعملة الأساسية (المعادل المالي الموحد). */
export const BaseCurrencyCell: React.FC<{
  row: FollowUpDashboardRow;
  baseCurrency: string;
  rates?: Array<{ currency_code: string; rate_to_base: number }> | undefined;
  currencies?: Array<{ code: string; exchange_operator?: 'multiply' | 'divide' }> | undefined;
}> = ({ row, baseCurrency, rates = [], currencies = [] }) => {
  const converted = useMemo(() => {
    if (!row.currency_code || row.currency_code.toUpperCase() === baseCurrency.toUpperCase()) {
      return row.outstanding_balance;
    }
    const rate = resolveAutoExchangeRate(row.currency_code, rates, currencies);
    try {
      return toBaseCurrency({
        amount: row.outstanding_balance,
        currency_code: row.currency_code,
        exchange_rate: rate,
      });
    } catch {
      return row.outstanding_balance;
    }
  }, [row.outstanding_balance, row.currency_code, baseCurrency, rates, currencies]);

  return (
    <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--app-text)]" dir="ltr">
      {formatCurrency(converted, baseCurrency)}
    </span>
  );
};

/** خلية الديون الحرجة ومستوى الخطر. */
export const CriticalCell: React.FC<{ row: FollowUpDashboardRow }> = ({ row }) => {
  const isCritical =
    row.classification === 'critical' ||
    row.has_broken_promise ||
    row.escalation_stage === 'legal' ||
    row.days_overdue >= 30;

  if (!isCritical) {
    return <span className="inline-flex items-center justify-center text-[11px] text-[var(--app-text-muted)]">—</span>;
  }

  let label = 'حرج';
  if (row.has_broken_promise) {
    label = 'وعد مخلف';
  } else if (row.escalation_stage === 'legal') {
    label = 'قانوني';
  } else if (row.days_overdue >= 30) {
    label = `+${row.days_overdue} يوم`;
  }

  return (
    <span
      className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400"
      title={`حالة حرجة: ${label}`}
    >
      <AlertTriangle size={11} className="shrink-0" />
      <span>{label}</span>
    </span>
  );
};

/** خلية المسؤول عن التحصيل / المحصل المسند له العميل. */
export const CollectorCell: React.FC<{
  partyId: string;
  assignments?: Record<string, { collectorId: string; collectorName: string }> | undefined;
}> = ({ partyId, assignments }) => {
  const assignment = assignments?.[partyId];
  if (!assignment || !assignment.collectorName) {
    return <span className="inline-flex items-center justify-center text-[11px] text-[var(--app-text-muted)]">—</span>;
  }

  return (
    <span
      className="inline-flex items-center justify-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300"
      title={`المسؤول: ${assignment.collectorName}`}
    >
      <UserCheck size={11} className="shrink-0 text-blue-500" />
      <span className="max-w-[110px] truncate">{assignment.collectorName}</span>
    </span>
  );
};

/** خلية العميل: الاسم + الهاتف في سطر واحد (كثافة إكسل). */
export const PartyCell: React.FC<{ row: FollowUpDashboardRow }> = ({ row }) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap">
    <span className="text-[11px] font-bold text-[var(--app-text)]" title={row.party_name}>
      {row.party_name}
    </span>
    {row.party_phone !== null && row.party_phone !== '' && (
      <span className="font-mono text-[10px] text-[var(--app-text-secondary)]" dir="ltr">
        {row.party_phone}
      </span>
    )}
  </span>
);

/** خلية الرصيد: مبلغ بخط ثابت (tabular) لسهولة المقارنة الرأسية كإكسل. */
export const MoneyCell: React.FC<{ row: FollowUpDashboardRow }> = ({ row }) => (
  <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--app-text)]" dir="ltr">
    {formatCurrency(row.outstanding_balance, row.currency_code)}
  </span>
);

/** خلية تاريخ/نص مختصر: القيمة أو «—». */
export const ShortCell: React.FC<{ value: string | null; mono?: boolean }> = ({
  value,
  mono = true,
}) => {
  if (value === null || value === '') {
    return <span className="text-[11px] text-[var(--app-text-secondary)]">—</span>;
  }
  return (
    <span
      className={mono ? 'font-mono text-[11px] tabular-nums' : 'text-[11px]'}
      dir={mono ? 'ltr' : undefined}
    >
      {value.slice(0, 10)}
    </span>
  );
};

/** خلية أيام التأخير — اليوم/الأيام بصيغة موجزة. */
export const DaysCell: React.FC<{ days: number }> = ({ days }) =>
  days > 0 ? (
    <span className="font-mono text-[11px] font-extrabold tabular-nums text-orange-600">
      {days}
    </span>
  ) : (
    <span className="text-[11px] text-[var(--app-text-secondary)]">—</span>
  );

/** خلية التصنيف (حرج / متأخر / اليوم / قريب / حالي). */
export const ClassificationCell: React.FC<{ classification: string }> = ({ classification }) => (
  <StatusBadge {...classificationMeta(classification)} />
);

/** خلية الحالة المدمجة: التصنيف + أيام التأخير في خلية واحدة نظيفة. */
export const StatusWithDaysCell: React.FC<{ row: FollowUpDashboardRow }> = ({ row }) => (
  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
    <StatusBadge {...classificationMeta(row.classification)} />
    {row.days_overdue > 0 && (
      <span className="font-mono text-[10px] font-extrabold tabular-nums text-orange-600 dark:text-orange-400">
        ({row.days_overdue} ي)
      </span>
    )}
  </div>
);

/** خلية التذكير المدمجة: حالة التذكير + تاريخ آخر تذكير أسفلها. */
export const ReminderWithDateCell: React.FC<{ row: FollowUpDashboardRow }> = ({ row }) => {
  const meta = reminderStatusMeta(row.reminder_status);
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 leading-tight">
      <StatusBadge {...meta} />
      {row.last_reminded_at && (
        <span className="font-mono text-[10px] text-[var(--app-text-muted)]" dir="ltr">
          {row.last_reminded_at.slice(0, 10)}
        </span>
      )}
    </div>
  );
};

/** خلية حالة التذكير (بحاجة تذكير / تم تذكيرهم). */
export const ReminderCell: React.FC<{ reminderStatus: string }> = ({ reminderStatus }) => (
  <StatusBadge {...reminderStatusMeta(reminderStatus)} />
);

/** خلية مرحلة التصعيد المقترحة (مراقبة/تذكير/اتصال/زيارة/قانوني). */
export const EscalationCell: React.FC<{ stage: string | null }> = ({ stage }) => {
  const meta = escalationBadgeMeta(stage);
  if (meta.label === '') {
    return <span className="text-[11px] text-[var(--app-text-secondary)]">—</span>;
  }
  return (
    <span
      title="مرحلة التصعيد المقترحة حسب أيام التأخير"
      className={`whitespace-nowrap rounded-lg border px-1.5 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}
    >
      {meta.label}
    </span>
  );
};

/** خلية الوعد المعلّق: تاريخ الوعد + تنبيه الوعد المخلَف. */
export const PromiseCell: React.FC<{ row: FollowUpDashboardRow }> = ({ row }) => (
  <span className="flex items-center gap-1 whitespace-nowrap">
    <ShortCell value={row.pending_promise_date} />
    {row.has_broken_promise && (
      <span className="text-[10px] font-bold text-rose-500" title="وعد سداد مخلَف">
        ⚠️ مخلَف
      </span>
    )}
  </span>
);

/** خلية الإجراءات: صدّ انتشار النقر حتى لا يُحدَّد الصف/الخلية عند ضغط زر. */
export const ActionsCell: React.FC<{
  row: FollowUpDashboardRow;
  handlers: DebtRowActionHandlers;
}> = ({ row, handlers }) => (
  <div
    onClick={e => {
      e.stopPropagation();
    }}
    onMouseDown={e => {
      e.stopPropagation();
    }}
  >
    <RowActions
      actions={buildDebtRowActions(row, handlers)}
      variant="table"
      className="justify-center"
    />
  </div>
);
