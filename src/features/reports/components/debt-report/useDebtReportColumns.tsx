import { useMemo } from 'react';
import { Phone } from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';
import type { Column } from '../../../../ui/common/ExcelTable';
import {
  getCurrencyColumnLabel,
  getRowCurrencyAmount,
  type EnrichedDebtRow,
} from './debtReportHelpers';

export function useDebtReportColumns(
  activeCurrencies: string[],
  baseCurrency: string,
  hasMultipleCurrencies: boolean
): Array<Column<EnrichedDebtRow>> {
  return useMemo(() => {
    const currencyCols: Array<Column<EnrichedDebtRow>> = activeCurrencies.map(curr => ({
      header: getCurrencyColumnLabel(curr),
      width: '160px',
      align: 'left',
      accessor: row => {
        const amount = getRowCurrencyAmount(row, curr);
        if (Math.abs(amount) < 0.005) {
          return <span className="font-mono text-xs text-slate-300 dark:text-slate-600">—</span>;
        }
        const isDebit = amount > 0;
        return (
          <div className="inline-flex items-center gap-1.5">
            <span
              dir="ltr"
              className={cn(
                'inline-block rounded-lg border px-2.5 py-0.5 font-mono text-xs font-black sm:text-sm',
                isDebit
                  ? 'border-rose-200/80 bg-rose-50/80 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300'
              )}
            >
              {formatCurrency(Math.abs(amount), curr)}
            </span>
            <span
              className={cn(
                'text-[10px] font-black',
                isDebit
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {isDebit ? 'عليه' : 'له'}
            </span>
          </div>
        );
      },
    }));

    const baseCols: Array<Column<EnrichedDebtRow>> = [
      {
        header: '#',
        accessorKey: 'rowIndex',
        width: '54px',
        align: 'center',
        accessor: row => (
          <span className="font-mono text-xs font-bold text-slate-400">{row.rowIndex}</span>
        ),
      },
      {
        header: 'الجهة المالية',
        accessorKey: 'name',
        sortKey: 'name',
        width: '240px',
        accessor: row => (
          <div className="flex flex-col py-0.5 text-right">
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 sm:text-sm">
              {row.name}
            </span>
            {row.phone && (
              <span
                dir="ltr"
                className="mt-0.5 inline-flex items-center gap-1 self-start font-mono text-[10px] font-bold text-slate-400"
              >
                <Phone size={10} />
                {row.phone}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'الفئة',
        accessorKey: 'typeLabel',
        width: '90px',
        align: 'center',
        accessor: row => (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black',
              row.type === 'customer'
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            {row.typeLabel}
          </span>
        ),
      },
      {
        header: 'الموقف',
        accessorKey: 'directionLabel',
        width: '110px',
        align: 'center',
        accessor: row => (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black',
              row.direction === 'debit'
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
            )}
          >
            {row.directionLabel}
          </span>
        ),
      },
      ...currencyCols,
    ];

    if (hasMultipleCurrencies) {
      baseCols.push({
        header: `المعادل (${baseCurrency})`,
        accessorKey: 'absAmount',
        sortKey: 'absAmount',
        width: '150px',
        align: 'left',
        accessor: row => (
          <span
            dir="ltr"
            className="font-mono text-xs font-black text-slate-600 dark:text-slate-300"
          >
            {formatCurrency(row.absAmount, baseCurrency)}
          </span>
        ),
      });
    }

    return baseCols;
  }, [activeCurrencies, baseCurrency, hasMultipleCurrencies]);
}
