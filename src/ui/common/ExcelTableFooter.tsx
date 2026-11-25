import type React from 'react';
import { cn } from '../../core/utils';
import type { Column } from './ExcelTable';

interface ExcelTableFooterProps<T> {
  columns: Array<Column<T>>;
  enableSelection: boolean;
  orderedData: T[];
  processedData: T[];
}

export function ExcelTableFooter<T>({
  columns,
  enableSelection,
  orderedData,
  processedData,
}: ExcelTableFooterProps<T>): React.ReactElement | null {
  if (!columns.some(c => c.footer)) return null;

  return (
    <tfoot className="border-t-2 border-[var(--app-border)] bg-[var(--app-bg)]">
      <tr>
        {enableSelection && <td className="border-r border-[var(--app-border)] p-2"></td>}
        <td className="border-r border-[var(--app-border)] p-2 text-center text-[10px] font-bold text-[var(--app-text-secondary)]">
          الإجمالي
        </td>
        {columns.map((col, idx) => (
          <td
            key={idx}
            className={cn(
              'border-r border-[var(--app-border)] p-2 text-[11px] font-bold',
              col.align === 'center' && 'text-center',
              col.align === 'left' && 'text-left',
              col.align === 'right' && 'text-right',
              col.className
            )}
          >
            {col.footer
              ? (col.footer as (pageData: T[], fullData: T[]) => React.ReactNode)(
                  orderedData,
                  processedData
                )
              : ''}
          </td>
        ))}
      </tr>
    </tfoot>
  );
}
