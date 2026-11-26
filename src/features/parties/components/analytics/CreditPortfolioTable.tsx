import type React from 'react';
import { useState } from 'react';
import { CalendarClock, FileText, Lock, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { cn, formatCurrency } from '@/core/utils';
import { buildWhatsAppLink, hasValidWhatsAppPhone } from '../../../debts/lib/whatsapp';
import {
  buildSmartCollectionMessage,
  type CreditGrade,
  type EnrichedCustomerCreditRow,
} from '../../utils/creditScoring';

interface CreditPortfolioTableProps {
  rows: EnrichedCustomerCreditRow[];
  currency: string;
  onViewStatement: (row: EnrichedCustomerCreditRow) => void;
  onEditPolicy: (row: EnrichedCustomerCreditRow) => void;
  onLogPromise: (row: EnrichedCustomerCreditRow) => void;
}

const GRADE_BADGE = new Map<CreditGrade, string>([
  ['A+', 'bg-emerald-700 text-white'],
  ['A', 'bg-emerald-600 text-white'],
  ['B', 'bg-blue-600 text-white'],
  ['C', 'bg-amber-600 text-white'],
  ['D', 'bg-orange-600 text-white'],
  ['F', 'bg-rose-700 text-white'],
]);

const CELL_BDR = 'border border-slate-300/90 dark:border-slate-700';
const PAGE_STEP = 50;

function getRowTone(row: EnrichedCustomerCreditRow): string {
  if (row.creditGrade === 'D' || row.creditGrade === 'F' || row.isOverLimit) {
    return 'bg-rose-50/75 border-r-4 border-r-rose-600 dark:bg-rose-950/25';
  }
  if (row.balance <= 0.01 || row.creditGrade === 'A+' || row.creditGrade === 'A') {
    return 'bg-emerald-50/55 border-r-4 border-r-emerald-600 dark:bg-emerald-950/20';
  }
  return 'bg-amber-50/45 border-r-4 border-r-amber-500 dark:bg-amber-950/15';
}

const CreditLimitCell: React.FC<{
  row: EnrichedCustomerCreditRow;
  currency: string;
  onEditPolicy: (row: EnrichedCustomerCreditRow) => void;
}> = ({ row, currency, onEditPolicy }) => {
  if (row.credit_limit <= 0) {
    return (
      <button
        type="button"
        onClick={() => {
          onEditPolicy(row);
        }}
        className="rounded border border-dashed border-slate-400 px-2 py-0.5 text-[10px] font-bold text-black hover:border-blue-600 hover:text-blue-700 dark:text-slate-300"
      >
        + تحديد سقف
      </button>
    );
  }
  const utilCls = row.isOverLimit
    ? 'bg-rose-600 text-white'
    : (row.utilizationPercent ?? 0) >= 80
      ? 'bg-amber-200 text-amber-950'
      : 'bg-emerald-100 text-emerald-900';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span dir="ltr" className="font-mono text-xs font-extrabold text-black dark:text-slate-100">
        {formatCurrency(row.credit_limit, currency)}
      </span>
      <span className={cn('rounded px-1.5 py-0.2 font-mono text-[10px] font-black', utilCls)}>
        {String(row.utilizationPercent ?? 0)}%
      </span>
    </div>
  );
};

const AgingBreakdownCell: React.FC<{ row: EnrichedCustomerCreditRow; currency: string }> = ({
  row,
  currency,
}) => {
  if (row.balance <= 0.01) {
    return <span className="text-emerald-800 dark:text-emerald-300">خالص</span>;
  }
  const mid = row.aging_1_30 + row.aging_31_60;
  const severe = row.aging_61_90 + row.aging_90_plus;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {row.aging_current > 0.01 && (
        <span className="rounded bg-emerald-100 px-1 text-emerald-950">
          جاري: {formatCurrency(row.aging_current, currency)}
        </span>
      )}
      {mid > 0.01 && (
        <span className="rounded bg-amber-100 px-1 text-amber-950">
          1-60ي: {formatCurrency(mid, currency)}
        </span>
      )}
      {severe > 0.01 && (
        <span className="rounded bg-rose-200 px-1 font-black text-rose-950">
          +60ي: {formatCurrency(severe, currency)}
        </span>
      )}
    </div>
  );
};

const RowActionsCell: React.FC<{
  row: EnrichedCustomerCreditRow;
  currency: string;
  onViewStatement: (row: EnrichedCustomerCreditRow) => void;
  onEditPolicy: (row: EnrichedCustomerCreditRow) => void;
  onLogPromise: (row: EnrichedCustomerCreditRow) => void;
}> = ({ row, currency, onViewStatement, onEditPolicy, onLogPromise }) => (
  <div className="flex items-center justify-center gap-1">
    <button
      type="button"
      onClick={() => {
        onViewStatement(row);
      }}
      title="فتح كشف الحساب بهذه العملة"
      className="rounded-md bg-blue-100 p-1.5 text-blue-900 hover:bg-blue-600 hover:text-white dark:bg-blue-950/60 dark:text-blue-200"
    >
      <FileText size={13} />
    </button>
    {hasValidWhatsAppPhone(row.phone) && row.balance > 0.01 && (
      <button
        type="button"
        onClick={() => {
          const msg = buildSmartCollectionMessage(row, currency);
          window.open(buildWhatsAppLink(row.phone ?? '', msg), '_blank', 'noopener,noreferrer');
        }}
        title="مطالبة واتساب ذكية حسب عمر الدين"
        className="rounded-md bg-emerald-100 p-1.5 text-emerald-900 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:text-emerald-200"
      >
        <MessageCircle size={13} />
      </button>
    )}
    <button
      type="button"
      onClick={() => {
        onEditPolicy(row);
      }}
      title="تعديل السقف الائتماني والتجميد"
      className="rounded-md bg-amber-100 p-1.5 text-amber-950 hover:bg-amber-600 hover:text-white dark:bg-amber-950/60 dark:text-amber-200"
    >
      <SlidersHorizontal size={13} />
    </button>
    <button
      type="button"
      onClick={() => {
        onLogPromise(row);
      }}
      title="تسجيل وعد سداد ومتابعة تحصيل"
      className="rounded-md bg-indigo-100 p-1.5 text-indigo-900 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:text-indigo-200"
    >
      <CalendarClock size={13} />
    </button>
  </div>
);

const CustomerNameCell: React.FC<{ row: EnrichedCustomerCreditRow }> = ({ row }) => (
  <td className={cn('px-2.5 py-1.5 text-right', CELL_BDR)}>
    <div className="flex items-center gap-1.5">
      {row.status === 'blocked' && <Lock size={12} className="shrink-0 text-rose-700" />}
      <span className="font-extrabold text-black dark:text-white">{row.name}</span>
      {row.category_name !== null && row.category_name.length > 0 && (
        <span className="rounded bg-white/80 px-1.5 text-[10px] font-bold text-black dark:bg-slate-800 dark:text-slate-300">
          {row.category_name}
        </span>
      )}
    </div>
    {row.phone !== null && row.phone.length > 0 && (
      <div dir="ltr" className="text-right font-mono text-[11px] font-bold text-black/80 dark:text-slate-400">
        {row.phone}
      </div>
    )}
  </td>
);

const OverdueMetaCell: React.FC<{ row: EnrichedCustomerCreditRow }> = ({ row }) => (
  <td className={cn('whitespace-nowrap px-2 py-1.5 text-center font-mono text-[11px] font-bold text-black dark:text-slate-200', CELL_BDR)}>
    {row.max_days_overdue > 0 ? (
      <span className="rounded bg-rose-100 px-1.5 py-0.5 font-black text-rose-900">
        متأخر {String(row.max_days_overdue)} يوم
      </span>
    ) : '—'}
    {row.last_payment_date !== null && <div className="mt-0.5 text-[10px]">سداد: {row.last_payment_date}</div>}
    {row.next_promise_date !== null && <div className="mt-0.5 rounded bg-indigo-100 px-1 text-[10px] font-black text-indigo-900">وعد: {row.next_promise_date}</div>}
  </td>
);

const CreditPortfolioRow: React.FC<{
  row: EnrichedCustomerCreditRow;
  idx: number;
  currency: string;
  onViewStatement: (row: EnrichedCustomerCreditRow) => void;
  onEditPolicy: (row: EnrichedCustomerCreditRow) => void;
  onLogPromise: (row: EnrichedCustomerCreditRow) => void;
}> = ({ row, idx, currency, onViewStatement, onEditPolicy, onLogPromise }) => {
  const scoreTitle = `انضباط: ${String(row.scoreBreakdown.punctuality)} • أعمار: ${String(row.scoreBreakdown.aging)} • سقف: ${String(row.scoreBreakdown.utilization)} • انتظام: ${String(row.scoreBreakdown.velocity)} • مرتجعات: ${String(row.scoreBreakdown.returns)}`;
  return (
    <tr className={cn('text-xs transition-colors hover:bg-blue-50/60 dark:hover:bg-slate-800/70', getRowTone(row))}>
      <td className={cn('px-2 py-1.5 text-center font-mono text-xs font-extrabold text-black dark:text-slate-200', CELL_BDR)}>{idx + 1}</td>
      <CustomerNameCell row={row} />
      <td className={cn('whitespace-nowrap px-2 py-1.5 text-center', CELL_BDR)} title={scoreTitle}>
        <div className="inline-flex items-center gap-1">
          <span className={cn('rounded px-1.5 py-0.5 font-mono text-xs font-black', GRADE_BADGE.get(row.creditGrade))}>{row.creditGrade}</span>
          <span className="font-mono text-xs font-extrabold text-black dark:text-slate-200">{row.creditScore}</span>
        </div>
        <div className="mt-0.5 text-[10px] font-bold text-black/80 dark:text-slate-300">{row.policyLabel}</div>
      </td>
      <td dir="ltr" className={cn('whitespace-nowrap px-2.5 py-1.5 text-left font-mono font-black tabular-nums', CELL_BDR)}>
        <div className={row.balance > 0.01 ? 'text-rose-900 dark:text-rose-300' : 'text-emerald-900 dark:text-emerald-300'}>{formatCurrency(row.balance, currency)}</div>
        {Math.abs(row.other_currency_balance) > 0.01 && (
          <div className="text-[10px] font-bold text-black/75 dark:text-slate-400">
            {row.other_currency_code}: {formatCurrency(row.other_currency_balance, row.other_currency_code)}
          </div>
        )}
      </td>
      <td className={cn('whitespace-nowrap px-2 py-1.5 text-center', CELL_BDR)}><CreditLimitCell row={row} currency={currency} onEditPolicy={onEditPolicy} /></td>
      <td dir="ltr" className={cn('whitespace-nowrap px-2 py-1.5 text-center font-mono text-[11px] font-bold', CELL_BDR)}><AgingBreakdownCell row={row} currency={currency} /></td>
      <OverdueMetaCell row={row} />
      <td className={cn('whitespace-nowrap px-2 py-1.5 text-center', CELL_BDR)}>
        <RowActionsCell row={row} currency={currency} onViewStatement={onViewStatement} onEditPolicy={onEditPolicy} onLogPromise={onLogPromise} />
      </td>
    </tr>
  );
};

const PortfolioTableHead: React.FC<{ currency: string }> = ({ currency }) => (
  <thead className="sticky top-0 z-10 bg-[#e4f1e9] text-xs font-black text-black dark:bg-slate-800 dark:text-emerald-100">
    <tr>
      <th className={cn('w-10 p-2 text-center', CELL_BDR)}>م</th>
      <th className={cn('min-w-[200px] p-2 text-right', CELL_BDR)}>العميل والهاتف</th>
      <th className={cn('w-40 p-2 text-center', CELL_BDR)}>التصنيف والسياسة</th>
      <th className={cn('w-36 p-2 text-center', CELL_BDR)}>الرصيد ({currency})</th>
      <th className={cn('w-32 p-2 text-center', CELL_BDR)}>السقف والاستغلال</th>
      <th className={cn('min-w-[210px] p-2 text-center', CELL_BDR)}>تفصيل أعمار الدين</th>
      <th className={cn('w-40 p-2 text-center', CELL_BDR)}>التأخير / آخر سداد</th>
      <th className={cn('w-36 p-2 text-center', CELL_BDR)}>إجراءات التحصيل</th>
    </tr>
  </thead>
);

export const CreditPortfolioTable: React.FC<CreditPortfolioTableProps> = ({
  rows,
  currency,
  onViewStatement,
  onEditPolicy,
  onLogPromise,
}) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const displayed = rows.slice(0, visibleCount);

  return (
    <div data-clear-black-text="true" className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-emerald-800/30 bg-[#1d6f42] px-3 py-1.5 text-white dark:bg-emerald-950">
        <span className="text-xs font-black">محفظة الائتمان وأولويات التحصيل ({currency}) — {rows.length} عميل مطابق</span>
        <span className="text-[11px] font-bold text-emerald-100">مرتب تلقائياً حسب شدة المخاطر وأعمار الديون</span>
      </div>
      <div className="custom-scrollbar max-h-[58vh] overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-right">
          <PortfolioTableHead currency={currency} />
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={8} className={cn('py-10 text-center text-xs font-bold text-black/60', CELL_BDR)}>
                  لا يوجد عملاء مطابقون لمعايير التصفية الحالية.
                </td>
              </tr>
            ) : (
              displayed.map((row, idx) => (
                <CreditPortfolioRow key={row.party_id} row={row} idx={idx} currency={currency} onViewStatement={onViewStatement} onEditPolicy={onEditPolicy} onLogPromise={onLogPromise} />
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows.length > visibleCount && (
        <div className="flex items-center justify-center border-t border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
          <button type="button" onClick={() => { setVisibleCount(prev => prev + PAGE_STEP); }} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-black text-white shadow-xs hover:bg-blue-700">
            عرض المزيد ({String(rows.length - visibleCount)} عميل متبقٍ)
          </button>
        </div>
      )}
    </div>
  );
};
