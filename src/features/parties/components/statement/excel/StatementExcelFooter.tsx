import React from 'react';
import { cn, formatCurrency } from '@/core/utils';
import type { CurrencyFooterTotal } from './statementExcelHelpers';

interface StatementExcelFooterProps {
  totals: CurrencyFooterTotal[];
  gridBorder: string;
}

export const StatementExcelFooter: React.FC<StatementExcelFooterProps> = ({
  totals,
  gridBorder,
}) => {
  if (totals.length === 0) return null;

  return (
    <tfoot className="sticky bottom-0 z-10 border-t-2 border-emerald-700/40 bg-[#e8f3ec] font-bold dark:border-emerald-700/60 dark:bg-slate-800">
      {totals.map(ct => (
        <tr key={ct.currency} className="text-xs">
          <td
            colSpan={5}
            className={cn(
              'px-3 py-2 text-right font-black text-emerald-950 dark:text-emerald-200',
              gridBorder
            )}
          >
            إجمالي حركات عملة ({ct.currency}) — {ct.count} حركة
          </td>
          <td className={cn('px-2 py-2 text-center font-mono text-[10px] font-black', gridBorder)}>
            <span
              className={cn(
                'rounded px-1.5 py-0.5',
                ct.currency === 'YER'
                  ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200'
                  : 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200'
              )}
            >
              {ct.currency}
            </span>
          </td>
          <td
            colSpan={2}
            className={cn(
              'px-2 py-2 text-center text-[10px] text-slate-500 dark:text-slate-400',
              gridBorder
            )}
          >
            مجاميع {ct.currency} المستقلة
          </td>
          <td
            dir="ltr"
            className={cn(
              'px-2 py-2 text-center font-mono font-black text-blue-800 dark:text-blue-300',
              gridBorder
            )}
          >
            {formatCurrency(ct.debit, ct.currency)}
          </td>
          <td
            dir="ltr"
            className={cn(
              'px-2 py-2 text-center font-mono font-black text-rose-800 dark:text-rose-300',
              gridBorder
            )}
          >
            {formatCurrency(ct.credit, ct.currency)}
          </td>
          <td
            dir="ltr"
            className={cn(
              'px-2 py-2 text-center font-mono font-black',
              ct.closingBalance >= 0
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-rose-800 dark:text-rose-300',
              gridBorder
            )}
          >
            {formatCurrency(ct.closingBalance, ct.currency)}
          </td>
          <td
            className={cn(
              'no-print px-2 py-2 text-center text-[10px] font-black text-emerald-800 dark:text-emerald-300',
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
