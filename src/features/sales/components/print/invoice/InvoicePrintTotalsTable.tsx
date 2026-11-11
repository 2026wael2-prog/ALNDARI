import type { ReactElement } from 'react';
import { formatCurrency } from '@/core/utils';
import type { InvoicePrintTotals } from './invoicePrintModel';

type RowTone = 'default' | 'rose' | 'emerald' | 'amber';

/** ألوان الصفوف كدالة بدل كائن مفهرس (يمنع object-injection ويبقى صريحاً). */
const toneClass = (tone: RowTone): string => {
  switch (tone) {
    case 'rose':
      return 'border-b border-slate-200 text-rose-600';
    case 'emerald':
      return 'border-b border-slate-200 text-emerald-700';
    case 'amber':
      return 'border-b border-slate-200 text-amber-800';
    default:
      return 'border-b border-slate-200 text-slate-700';
  }
};

const TotalsRow = ({
  label,
  value,
  tone = 'default',
  compact = false,
  labelBold = false,
}: {
  label: string;
  value: string;
  tone?: RowTone | undefined;
  compact?: boolean | undefined;
  labelBold?: boolean | undefined;
}): ReactElement => (
  <tr className={toneClass(tone)}>
    <td
      className={
        compact
          ? `px-3 py-1 text-[11px] ${labelBold ? 'font-bold' : 'font-semibold'}`
          : 'px-3 py-1.5 font-semibold'
      }
    >
      {label}
    </td>
    <td
      className={compact ? 'px-3 py-1 text-left font-mono text-[11px] font-bold' : 'px-3 py-1.5 text-left font-mono font-bold'}
      dir="ltr"
    >
      {value}
    </td>
  </tr>
);

/** صف الصافي المستحق — الصف الوحيد الملوّن بلون الترويسة. */
const TotalsGrandRow = ({
  total,
  currencyCode,
  accentColor,
}: {
  total: number;
  currencyCode: string;
  accentColor: string;
}): ReactElement => (
  <tr className="inv-total-highlight border-b-2" style={{ borderColor: accentColor }}>
    <td className="px-3 py-2 text-sm font-black" style={{ color: accentColor }}>
      الصافي المستحق النهائي:
    </td>
    <td
      className="px-3 py-2 text-left font-mono text-base font-black"
      style={{ color: accentColor }}
      dir="ltr"
    >
      {formatCurrency(total, currencyCode)}
    </td>
  </tr>
);

/** المدفوع والمتبقي — لا يُرسمان إلا عند دفع جزئي فعلي. */
const TotalsSettlement = ({
  totals,
  currencyCode,
}: {
  totals: InvoicePrintTotals;
  currencyCode: string;
}): ReactElement | null => {
  if (totals.paid <= 0 || totals.paid === totals.total) return null;
  return (
    <>
      <TotalsRow
        label="المبلغ المدفوع:"
        value={formatCurrency(totals.paid, currencyCode)}
        tone="emerald"
        compact
      />
      <TotalsRow
        label="المتبقي:"
        value={formatCurrency(totals.remaining, currencyCode)}
        tone="amber"
        compact
        labelBold
      />
    </>
  );
};

/** جدول الإجماليات: قبل الضريبة ← الخصم ← الضريبة ← الصافي ← التسوية. */
const InvoicePrintTotalsTable = ({
  totals,
  currencyCode,
  accentColor,
}: {
  totals: InvoicePrintTotals;
  currencyCode: string;
  accentColor: string;
}): ReactElement => (
  <div className="w-full shrink-0 sm:w-72">
    <table className="w-full border-collapse border border-slate-200 text-xs">
      <tbody>
        <TotalsRow
          label="المجموع قبل الضريبة:"
          value={formatCurrency(totals.subtotal, currencyCode)}
        />
        {totals.discount > 0 && (
          <TotalsRow
            label="إجمالي الخصم:"
            value={`-${formatCurrency(totals.discount, currencyCode)}`}
            tone="rose"
          />
        )}
        {Number(totals.tax) > 0 && (
          <TotalsRow
            label="ضريبة القيمة المضافة:"
            value={formatCurrency(totals.tax, currencyCode)}
          />
        )}
        <TotalsGrandRow total={totals.total} currencyCode={currencyCode} accentColor={accentColor} />
        <TotalsSettlement totals={totals} currencyCode={currencyCode} />
      </tbody>
    </table>
  </div>
);

export default InvoicePrintTotalsTable;
