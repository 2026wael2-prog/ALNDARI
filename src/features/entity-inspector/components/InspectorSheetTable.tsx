import React from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '../../../core/utils';
import type {
  InspectorHistoryRow,
  InspectorRowReturnAction,
  InspectorTabSheet,
} from '../types';
import { EntityInfoDot } from './EntityInfoDot';
import { TONE_TEXT } from './inspectorMeta';

interface InspectorSheetTableProps {
  sheet: InspectorTabSheet;
  rows: InspectorHistoryRow[];
  sheetSearch: string;
  onOpenReturn: (action: InspectorRowReturnAction) => void;
}

export const InspectorSheetTable: React.FC<InspectorSheetTableProps> = ({
  sheet,
  rows,
  sheetSearch,
  onOpenReturn,
}) => (
  <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
    {rows.length === 0 ? (
      <div className="p-10 text-center text-xs font-bold text-[var(--app-text-secondary)]">
        {sheetSearch
          ? 'لا توجد نتائج مطابقة للبحث في هذا الجدول.'
          : sheet.emptyMessage || 'لا توجد بيانات مسجلة.'}
      </div>
    ) : (
      <div className="custom-scrollbar max-h-[420px] overflow-auto">
        <table className="w-full border-collapse text-right text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b-2 border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)]">
              <th className="w-10 border border-[var(--app-border)] px-2 py-2 text-center font-mono text-[11px] font-black">
                #
              </th>
              {sheet.columns.map(col => (
                <th
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap border border-[var(--app-border)] px-3 py-2 text-[11px] font-black',
                    col.align === 'center' && 'text-center',
                    col.align === 'left' && 'text-left'
                  )}
                >
                  {col.label}
                </th>
              ))}
              <th className="w-24 border border-[var(--app-border)] px-2 py-2 text-center text-[11px] font-black">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.id}-${idx}`}
                className="transition-colors odd:bg-[var(--app-surface)] even:bg-[var(--app-bg)]/50 hover:bg-blue-500/10"
              >
                <td className="border border-[var(--app-border)] px-2 py-2 text-center font-mono text-[11px] font-bold text-[var(--app-text-secondary)]">
                  {idx + 1}
                </td>
                {sheet.columns.map(col => {
                  const cellVal = row.cells[col.key] ?? '—';
                  return (
                    <td
                      key={col.key}
                      dir={col.mono ? 'ltr' : undefined}
                      className={cn(
                        'border border-[var(--app-border)] px-3 py-2 font-semibold text-[var(--app-text)]',
                        col.align === 'center' && 'text-center',
                        col.align === 'left' && 'text-left',
                        col.mono && 'font-mono tabular-nums',
                        (col.key === 'total' ||
                          col.key === 'amount' ||
                          col.key === 'qty' ||
                          col.key === 'balance') &&
                          row.tone &&
                          TONE_TEXT[row.tone]
                      )}
                    >
                      {cellVal}
                    </td>
                  );
                })}
                <td className="border border-[var(--app-border)] px-2 py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {row.returnAction && (
                      <button
                        type="button"
                        onClick={() => onOpenReturn(row.returnAction!)}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/15 px-2 py-0.5 text-[10px] font-black text-rose-700 transition-colors hover:bg-rose-600 hover:text-white dark:text-rose-300 dark:hover:bg-rose-600 dark:hover:text-white"
                        title="إرجاع هذا الصنف من الفاتورة"
                      >
                        <RotateCcw size={11} />
                        <span>إرجاع</span>
                      </button>
                    )}
                    {row.target ? (
                      <EntityInfoDot
                        type={row.target.type}
                        id={row.target.id}
                        label={row.target.label}
                        subType={row.target.subType}
                        inInspector
                        size="xs"
                      />
                    ) : !row.returnAction ? (
                      <span className="text-[var(--app-text-secondary)]">—</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
