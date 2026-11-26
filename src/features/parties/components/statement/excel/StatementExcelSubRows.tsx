import type React from 'react';
import { cn, formatCurrency } from '@/core/utils';
import type { StatementMovement, StatementTransactionDetails } from '../../../service';

type SemanticTone = 'emerald' | 'rose';

interface SubRowSpec {
  key: string;
  tag: string;
  colB: string;
  colBMono?: boolean;
  colC: string;
  colCMono?: boolean;
  currency: string;
  description: string;
  statusText: string;
  debitText: string;
  creditText: string;
}

const PAYMENT_METHOD_LABELS = new Map<string, string>([
  ['cash', 'نقداً'],
  ['bank', 'تحويل بنكي'],
  ['bank_transfer', 'تحويل بنكي'],
  ['transfer', 'حوالة / تحويل'],
  ['check', 'شيك'],
  ['cheque', 'شيك'],
  ['card', 'بطاقة / شبكة'],
  ['pos', 'نقطة بيع'],
]);

function nonEmpty(val: string | null | undefined): string {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : '';
}

function firstNonEmpty(fallback: string, ...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    const clean = nonEmpty(v);
    if (clean.length > 0) return clean;
  }
  return fallback;
}

function formatMethodLabel(method: string | undefined): string {
  const clean = nonEmpty(method);
  if (clean.length === 0) return 'سند مالي';
  return PAYMENT_METHOD_LABELS.get(clean.toLowerCase()) ?? clean;
}

function resolveAmountPair(
  amount: number,
  currency: string,
  isDebitParent: boolean,
  isCreditParent: boolean
): { debitText: string; creditText: string } {
  const formatted = formatCurrency(amount, currency);
  return {
    debitText: isDebitParent ? formatted : '—',
    creditText: isCreditParent ? formatted : '—',
  };
}

function buildInvoiceSpecs(
  row: StatementMovement,
  details: StatementTransactionDetails,
  currency: string
): SubRowSpec[] {
  const isDebitParent = row.debit > 0;
  const isCreditParent = !isDebitParent && row.credit > 0;
  const specs: SubRowSpec[] = (details.items ?? []).map((item, idx) => {
    const code = firstNonEmpty('—', item.part_number, item.sku);
    const discount = item.discount_amount ?? 0;
    const amounts = resolveAmountPair(item.total_amount, currency, isDebitParent, isCreditParent);
    return {
      key: firstNonEmpty(`${row.id}-it-${String(idx)}`, item.id),
      tag: 'صنف',
      colB: code,
      colBMono: true,
      colC: `${String(item.quantity)} × ${formatCurrency(item.unit_price, currency)}`,
      colCMono: true,
      currency,
      description: item.item_name,
      statusText: discount > 0 ? `خصم: ${formatCurrency(discount, currency)}` : '—',
      debitText: amounts.debitText,
      creditText: amounts.creditText,
    };
  });

  const note = nonEmpty(details.notes);
  if (note.length > 0) {
    specs.push({
      key: `${row.id}-inv-note`,
      tag: 'ملاحظة',
      colB: '—',
      colC: 'بيان الفاتورة',
      currency,
      description: note,
      statusText: '—',
      debitText: '—',
      creditText: '—',
    });
  }
  return specs;
}

function buildBondSummarySpec(
  rowId: string,
  details: StatementTransactionDetails,
  currency: string
): SubRowSpec | null {
  const method = nonEmpty(details.payment_method);
  const account = nonEmpty(details.account_name);
  const note = nonEmpty(details.notes);
  const methodLabel = formatMethodLabel(method);
  const parts = [
    method.length > 0 ? `طريقة الدفع: ${methodLabel}` : '',
    account.length > 0 ? `الحساب: ${account}` : '',
    note.length > 0 ? `ملاحظة: ${note}` : '',
  ].filter(p => p.length > 0);
  if (parts.length === 0) return null;
  return {
    key: `${rowId}-bond-info`,
    tag: 'تفصيل سند',
    colB: methodLabel,
    colC: account.length > 0 ? account : '—',
    currency,
    description: parts.join(' • '),
    statusText: '—',
    debitText: '—',
    creditText: '—',
  };
}

function buildBondSpecs(
  row: StatementMovement,
  details: StatementTransactionDetails,
  currency: string
): SubRowSpec[] {
  const isDebitParent = row.debit > 0;
  const isCreditParent = !isDebitParent && row.credit > 0;
  const summary = buildBondSummarySpec(row.id, details, currency);
  const allocSpecs: SubRowSpec[] = (details.allocations ?? []).map((alloc, idx) => {
    const amounts = resolveAmountPair(alloc.allocated_amount, currency, isDebitParent, isCreditParent);
    const invDate = nonEmpty(alloc.invoice_date).replace(/-/g, '/');
    return {
      key: firstNonEmpty(`${row.id}-alloc-${String(idx)}`, alloc.allocation_id),
      tag: 'تسوية',
      colB: alloc.invoice_number,
      colBMono: true,
      colC: invDate.length > 0 ? invDate : '—',
      colCMono: true,
      currency,
      description: `تسوية فاتورة رقم #${alloc.invoice_number}`,
      statusText: 'مخصص',
      debitText: amounts.debitText,
      creditText: amounts.creditText,
    };
  });
  return summary !== null ? [summary, ...allocSpecs] : allocSpecs;
}

function buildSubRowSpecs(
  row: StatementMovement,
  details: StatementTransactionDetails | null | undefined,
  isLoading: boolean
): SubRowSpec[] {
  const currency = firstNonEmpty('SAR', details?.currency_code, row.currency).toUpperCase();
  if (isLoading && (details === null || details === undefined)) {
    return [
      {
        key: `${row.id}-loading`,
        tag: 'تفاصيل',
        colB: '—',
        colC: '—',
        currency,
        description: 'جاري تحميل تفاصيل البنود...',
        statusText: '—',
        debitText: '—',
        creditText: '—',
      },
    ];
  }
  if (details === null || details === undefined) return [];
  if (details.kind === 'invoice') return buildInvoiceSpecs(row, details, currency);
  if (details.kind === 'bond') return buildBondSpecs(row, details, currency);
  return [];
}

function getToneClasses(tone: SemanticTone): { rowBg: string; numBg: string } {
  return tone === 'emerald'
    ? {
        rowBg:
          'bg-emerald-50/55 border-r-4 border-r-emerald-400 hover:bg-emerald-100/55 dark:bg-emerald-950/20 dark:border-r-emerald-700 dark:hover:bg-emerald-950/35',
        numBg: 'bg-emerald-100/50 dark:bg-emerald-950/35',
      }
    : {
        rowBg:
          'bg-rose-50/55 border-r-4 border-r-rose-400 hover:bg-rose-100/55 dark:bg-rose-950/20 dark:border-r-rose-700 dark:hover:bg-rose-950/35',
        numBg: 'bg-rose-100/50 dark:bg-rose-950/35',
      };
}

interface ExcelGridSubRowProps {
  spec: SubRowSpec;
  rowLabel: string;
  toneCls: { rowBg: string; numBg: string };
  gridBorder: string;
}

const ExcelGridSubRow: React.FC<ExcelGridSubRowProps> = ({ spec, rowLabel, toneCls, gridBorder }) => {
  const b = gridBorder;
  const muted = 'whitespace-nowrap px-2 py-1 text-center text-[11px] font-bold text-black/75 dark:text-slate-300';
  const valCls = 'whitespace-nowrap px-2 py-1 text-center text-[11px] font-bold text-black dark:text-slate-200';
  const numCls = 'whitespace-nowrap px-2.5 py-1 font-mono text-xs font-extrabold tabular-nums';
  const dashCls = 'text-center text-black/35 dark:text-slate-600';
  return (
    <tr className={cn('print:hidden text-xs transition-colors', toneCls.rowBg)}>
      <td className={cn('no-print py-1 text-center', b)} />
      <td className={cn('select-none py-1 text-center font-mono text-[11px] font-bold text-black/80 dark:text-slate-300', toneCls.numBg, b)}>
        {rowLabel}
      </td>
      <td className={cn(muted, b)}>{spec.tag}</td>
      <td dir={spec.colBMono === true ? 'ltr' : undefined} className={cn(valCls, spec.colBMono === true && 'font-mono', b)}>
        {spec.colB}
      </td>
      <td dir={spec.colCMono === true ? 'ltr' : undefined} className={cn(valCls, spec.colCMono === true && 'font-mono', b)}>
        {spec.colC}
      </td>
      <td className={cn('whitespace-nowrap px-2 py-1 text-center font-mono text-[11px] font-bold text-black/80 dark:text-slate-300', b)}>
        {spec.currency}
      </td>
      <td className={cn('px-2.5 py-1 text-right text-xs font-bold text-black dark:text-slate-100', b)}>
        <span className="ml-1.5 text-black/50 dark:text-slate-400">↳</span>
        <span>{spec.description}</span>
      </td>
      <td className={cn(muted, b)}>{spec.statusText}</td>
      <td dir="ltr" className={cn(numCls, spec.debitText !== '—' ? 'text-left text-rose-900 dark:text-rose-300' : dashCls, b)}>
        {spec.debitText}
      </td>
      <td dir="ltr" className={cn(numCls, spec.creditText !== '—' ? 'text-left text-emerald-900 dark:text-emerald-300' : dashCls, b)}>
        {spec.creditText}
      </td>
      <td className={cn('whitespace-nowrap px-2.5 py-1 font-mono text-xs', dashCls, b)}>—</td>
      <td className={cn('no-print py-1', b)} />
    </tr>
  );
};

interface StatementExcelSubRowsProps {
  row: StatementMovement;
  parentIdx: number;
  details: StatementTransactionDetails | null | undefined;
  isLoading: boolean;
  tone: SemanticTone;
  gridBorder: string;
}

export const StatementExcelSubRows: React.FC<StatementExcelSubRowsProps> = ({
  row,
  parentIdx,
  details,
  isLoading,
  tone,
  gridBorder,
}) => {
  const specs = buildSubRowSpecs(row, details, isLoading);
  if (specs.length === 0) return null;
  const toneCls = getToneClasses(tone);

  return (
    <>
      {specs.map((spec, subIdx) => (
        <ExcelGridSubRow
          key={spec.key}
          spec={spec}
          rowLabel={`${String(parentIdx + 1)}.${String(subIdx + 1)}`}
          toneCls={toneCls}
          gridBorder={gridBorder}
        />
      ))}
    </>
  );
};

interface StandardGridSubRowProps {
  spec: SubRowSpec;
  subIdx: number;
  rowBg: string;
}

const StandardGridSubRow: React.FC<StandardGridSubRowProps> = ({ spec, subIdx, rowBg }) => {
  const b = 'border-l border-[var(--app-border)]';
  const muted = 'whitespace-nowrap px-2 py-1.5 text-center text-[11px] font-bold text-black/75 dark:text-slate-300';
  const valCls = 'whitespace-nowrap px-2 py-1.5 text-center text-[11px] font-bold text-black dark:text-slate-200';
  const numCls = 'whitespace-nowrap px-2 py-1.5 text-center font-mono text-xs font-black tabular-nums';
  const dashCls = 'text-black/35 dark:text-slate-600';
  return (
    <tr className={cn('print:hidden text-xs transition-colors', rowBg)}>
      <td className={cn('no-print py-1.5', b)} />
      <td className={cn('no-print py-1.5 text-center font-mono text-[10px] font-bold text-black/60', b)}>
        {subIdx + 1}
      </td>
      <td className={cn(muted, b)}>{spec.tag}</td>
      <td dir={spec.colBMono === true ? 'ltr' : undefined} className={cn(valCls, spec.colBMono === true && 'font-mono', b)}>
        {spec.colB}
      </td>
      <td dir={spec.colCMono === true ? 'ltr' : undefined} className={cn(valCls, spec.colCMono === true && 'font-mono', b)}>
        {spec.colC}
      </td>
      <td className={cn('px-3 py-1.5 text-right text-xs font-bold text-black dark:text-slate-100', b)}>
        <span className="ml-1.5 text-black/50 dark:text-slate-400">↳</span>
        <span>{spec.description}</span>
      </td>
      <td className={cn(muted, b)}>{spec.statusText}</td>
      <td dir="ltr" className={cn(numCls, spec.debitText !== '—' ? 'text-rose-900 dark:text-rose-300' : dashCls, b)}>
        {spec.debitText}
      </td>
      <td dir="ltr" className={cn(numCls, spec.creditText !== '—' ? 'text-emerald-900 dark:text-emerald-300' : dashCls, b)}>
        {spec.creditText}
      </td>
      <td className={cn('px-2 py-1.5 text-center font-mono text-xs', dashCls, b)}>—</td>
      <td className="no-print py-1.5" />
    </tr>
  );
};

interface StatementStandardSubRowsProps {
  row: StatementMovement;
  details: StatementTransactionDetails | null | undefined;
  isLoading: boolean;
  tone: SemanticTone;
}

export const StatementStandardSubRows: React.FC<StatementStandardSubRowsProps> = ({
  row,
  details,
  isLoading,
  tone,
}) => {
  const specs = buildSubRowSpecs(row, details, isLoading);
  if (specs.length === 0) return null;
  const { rowBg } = getToneClasses(tone);

  return (
    <>
      {specs.map((spec, subIdx) => (
        <StandardGridSubRow key={spec.key} spec={spec} subIdx={subIdx} rowBg={rowBg} />
      ))}
    </>
  );
};
