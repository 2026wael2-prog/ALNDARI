import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Square,
} from 'lucide-react';
import type { StatementMovement } from '../../service';
import { cn } from '@/core/utils';
import EditInvoiceModal from '@/features/sales/components/edit/EditInvoiceModal';
import {
  EXCEL_COL_LETTERS,
  computeFooterTotalsByCurrency,
} from './excel/statementExcelHelpers';
import { StatementExcelRow } from './excel/StatementExcelRow';
import { StatementExcelFooter } from './excel/StatementExcelFooter';

interface StatementExcelViewProps {
  filteredMovements: StatementMovement[];
  selectedRowIds: Set<string>;
  expandedRowIds?: Set<string>;
  rowColors: Map<string, string>;
  activeColorPickerRowId: string | null;
  partyName: string;
  isAllSelected?: boolean;
  onToggleSelectAll: () => void;
  onToggleRowSelection: (id: string, e?: React.MouseEvent) => void;
  onToggleRowExpand?: (id: string, e?: React.MouseEvent) => void;
  onOpenColorPicker: (id: string | null) => void;
  onApplyColorToSingleRow: (row: StatementMovement, color: string | null) => void;
  onPrintSingleTransaction: (row: StatementMovement) => void;
  onOpenInvoiceModal: (id: string) => void;
  onOpenBondModal: (bondId: string, movement: StatementMovement) => void;
}

export const StatementExcelView: React.FC<StatementExcelViewProps> = ({
  filteredMovements,
  selectedRowIds,
  expandedRowIds,
  rowColors,
  activeColorPickerRowId,
  partyName,
  isAllSelected,
  onToggleSelectAll,
  onToggleRowSelection,
  onToggleRowExpand,
  onOpenColorPicker,
  onApplyColorToSingleRow,
  onPrintSingleTransaction,
  onOpenInvoiceModal,
  onOpenBondModal,
}) => {
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [localExpandedIds, setLocalExpandedIds] = useState<Set<string>>(new Set());
  const [isCompact, setIsCompact] = useState<boolean>(true);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);

  const effectiveExpandedIds = expandedRowIds ?? localExpandedIds;
  const handleToggleExpand = (id: string, e?: React.MouseEvent) => {
    if (onToggleRowExpand) {
      onToggleRowExpand(id, e);
      return;
    }
    e?.stopPropagation();
    setLocalExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected =
    isAllSelected ??
    (filteredMovements.length > 0 && selectedRowIds.size === filteredMovements.length);

  const footerTotalsByCurrency = useMemo(
    () => computeFooterTotalsByCurrency(filteredMovements),
    [filteredMovements]
  );

  const cellPad = isCompact ? 'px-2 py-1.5' : 'px-3 py-2.5';
  const gridBorder = 'border border-slate-200 dark:border-slate-700/80';

  return (
    <div className="w-full overflow-hidden rounded-xl border border-emerald-700/25 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
      {/* Authentic Excel Green Ribbon Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-800/30 bg-[#1d6f42] px-3.5 py-2 text-white dark:bg-emerald-950">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
            <FileSpreadsheet size={16} />
          </div>
          <div>
            <h3 className="text-xs font-black tracking-tight">كشف حساب إكسل: {partyName}</h3>
            <p className="text-[10px] font-medium text-emerald-100/90">
              جدول Excel Grid احترافي — {filteredMovements.length} حركة
              {selectedRowIds.size > 0 ? ` • محدد: ${selectedRowIds.size}` : ''}
              {activeCell
                ? ` • الخلية: ${EXCEL_COL_LETTERS[activeCell.col] ?? ''}${activeCell.row + 1}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCompact(prev => !prev)}
            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-white/25"
            title={isCompact ? 'توسيع ارتفاع الصفوف' : 'ضغط الجدول (كثافة إكسل)'}
          >
            {isCompact ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
            <span>{isCompact ? 'مريح' : 'مضغوط (Excel)'}</span>
          </button>
        </div>
      </div>

      {/* Spreadsheet Grid Viewport */}
      <div className="custom-scrollbar max-h-[68vh] overflow-auto bg-white dark:bg-slate-950">
        <table
          role="grid"
          aria-label={`كشف حساب إكسل: ${partyName}`}
          className="w-full min-w-[980px] border-collapse text-right text-xs"
        >
          <thead className="sticky top-0 z-20 select-none">
            <tr className="bg-slate-200/90 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <th className={cn('w-9 py-0.5 text-center', gridBorder)}></th>
              <th className={cn('w-10 py-0.5 text-center', gridBorder)}>#</th>
              {EXCEL_COL_LETTERS.map(letter => (
                <th key={letter} className={cn('py-0.5 text-center', gridBorder)}>
                  {letter}
                </th>
              ))}
            </tr>

            <tr className="bg-[#e8f3ec] text-[11px] font-black text-emerald-950 dark:bg-slate-800/95 dark:text-emerald-200">
              <th className={cn('no-print w-9 p-2 text-center', gridBorder)}>
                <button
                  type="button"
                  onClick={onToggleSelectAll}
                  className="inline-flex items-center justify-center text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
                  title="تحديد / إلغاء تحديد الكل"
                >
                  {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                </button>
              </th>
              <th className={cn('w-10 p-2 text-center font-mono', gridBorder)}>م</th>
              <th className={cn('w-24 p-2 text-center', gridBorder)}>التاريخ</th>
              <th className={cn('w-32 p-2 text-center', gridBorder)}>المرجع</th>
              <th className={cn('w-28 p-2 text-center', gridBorder)}>نوع العملية</th>
              <th className={cn('w-16 p-2 text-center', gridBorder)}>العملة</th>
              <th className={cn('min-w-[230px] p-2 text-right', gridBorder)}>البيان والتفاصيل</th>
              <th className={cn('w-24 p-2 text-center', gridBorder)}>حالة السداد</th>
              <th className={cn('w-28 p-2 text-center text-blue-900 dark:text-blue-300', gridBorder)}>
                مدين (عليه +)
              </th>
              <th className={cn('w-28 p-2 text-center text-rose-900 dark:text-rose-300', gridBorder)}>
                دائن (له -)
              </th>
              <th
                className={cn(
                  'w-32 p-2 text-center text-emerald-950 dark:text-emerald-300',
                  gridBorder
                )}
              >
                الرصيد المتراكم
              </th>
              <th className={cn('no-print w-28 p-2 text-center', gridBorder)}>إجراءات</th>
            </tr>
          </thead>

          <tbody className="font-sans">
            {filteredMovements.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className={cn('py-14 text-center text-xs font-bold text-slate-400', gridBorder)}
                >
                  لا توجد حركات مسجلة في كشف الحساب وفق المعايير المحددة.
                </td>
              </tr>
            ) : (
              filteredMovements.map((row, idx) => {
                const colorKey =
                  rowColors.get(row.id) ||
                  (row.reference_id ? rowColors.get(row.reference_id) : undefined) ||
                  (row.ref ? rowColors.get(row.ref) : undefined);

                return (
                  <StatementExcelRow
                    key={row.id}
                    row={row}
                    idx={idx}
                    partyName={partyName}
                    cellPad={cellPad}
                    gridBorder={gridBorder}
                    isSelected={selectedRowIds.has(row.id)}
                    isExpanded={effectiveExpandedIds.has(row.id)}
                    colorKey={colorKey}
                    isColorPickerOpen={activeColorPickerRowId === row.id}
                    activeCellCol={activeCell?.row === idx ? activeCell.col : null}
                    onSelectCell={col => setActiveCell({ row: idx, col })}
                    onToggleSelection={onToggleRowSelection}
                    onToggleExpand={handleToggleExpand}
                    onOpenColorPicker={onOpenColorPicker}
                    onApplyColor={onApplyColorToSingleRow}
                    onPrintSingleTransaction={onPrintSingleTransaction}
                    onOpenInvoiceModal={onOpenInvoiceModal}
                    onOpenBondModal={onOpenBondModal}
                    onEditInvoice={setEditingInvoiceId}
                  />
                );
              })
            )}
          </tbody>

          <StatementExcelFooter totals={footerTotalsByCurrency} gridBorder={gridBorder} />
        </table>
      </div>

      {editingInvoiceId && (
        <EditInvoiceModal
          invoiceId={editingInvoiceId}
          isOpen={true}
          onClose={() => setEditingInvoiceId(null)}
          onSuccess={() => setEditingInvoiceId(null)}
        />
      )}
    </div>
  );
};

export default StatementExcelView;
