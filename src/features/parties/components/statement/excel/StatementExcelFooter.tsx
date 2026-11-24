import React from 'react';
import { cn, formatCurrency } from '@/core/utils';
import type { CurrencyFooterTotal, ExcelDensityStyles } from './statementExcelHelpers';

interface StatementExcelFooterProps {
  totals: CurrencyFooterTotal[];
  density: ExcelDensityStyles;
  gridBorder: string;
}

export const StatementExcelFooter: React.FC<StatementExcelFooterProps> = ({
  totals,
  density,
  gridBorder,
}) => {
  if (totals.length === 0) return null;

  return (
    <tfoot className="sticky bottom-0 z-10 border-t-2 border-emerald-700/60 bg-[#e4f1e9] font-bold shadow-[0_-2px_6px_rgba(15,23,42,0.06)] dark:border-emerald-700/70 dark:bg-slate-800">
      {totals.map(ct => (
        <tr key={ct.currency} className={density.footerText}>
          <td
            colSpan={5}
            className={cn(
              'px-3.5 py-2.5 text-right font-black text-emerald-950 dark:text-emerald-100',
              gridBorder
            )}
          >
            إجمالي حركات عملة ({ct.currency}) — {ct.count} حركة
          </td>
          <td className={cn('px-2.5 py-2.5 text-center font-mono text-xs font-black', gridBorder)}>
            <span
              className={cn(
                'rounded-md px-2 py-0.5',
                ct.currency === 'YER'
                  ? 'bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-200'
                  : 'bg-emerald-200 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-200'
              )}
            >
              {ct.currency}
            </span>
          </td>
          <td
            colSpan={2}
            className={cn(
              'px-2.5 py-2.5 text-center text-xs font-bold text-slate-600 dark:text-slate-300',
              gridBorder
            )}
          >
            مجاميع {ct.currency} المستقلة
          </td>
          <td
            dir="ltr"
            className={cn(
              'whitespace-nowrap px-3 py-2.5 text-left font-mono font-black tabular-nums text-blue-900 dark:text-blue-200',
              gridBorder
            )}
          >
            {formatCurrency(ct.debit, ct.currency)}
          </td>
          <td
            dir="ltr"
            className={cn(
              'whitespace-nowrap px-3 py-2.5 text-left font-mono font-black tabular-nums text-rose-900 dark:text-rose-200',
              gridBorder
            )}
          >
            {formatCurrency(ct.credit, ct.currency)}
          </td>
          <td
            dir="ltr"
            className={cn(
              'whitespace-nowrap bg-emerald-100/70 px-3 py-2.5 text-left font-mono font-black tabular-nums dark:bg-slate-900/70',
              ct.closingBalance >= 0
                ? 'text-emerald-900 dark:text-emerald-300'
                : 'text-rose-900 dark:text-rose-300',
              gridBorder
            )}
          >
            {formatCurrency(ct.closingBalance, ct.currency)}
          </td>
          <td
            className={cn(
              'no-print px-2.5 py-2.5 text-center text-xs font-black text-emerald-900 dark:text-emerald-200',
              gridBorder
            )}
          >
            {ct.closingBalance > 0.01 ? 'عليه' : ct.closingBalance < -0.01 ? 'له' : 'متوازن'}
          </td>
        </tr>
      ))}
    </tfoot>
  );
};
