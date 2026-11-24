import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  FileSpreadsheet,
  Square,
  Type,
} from 'lucide-react';
import type { StatementMovement } from '../../service';
import { cn, formatCurrency } from '@/core/utils';
import EditInvoiceModal from '@/features/sales/components/edit/EditInvoiceModal';
import {
  EXCEL_COL_LETTERS,
  EXCEL_COL_TITLES,
  EXCEL_DENSITY_MAP,
  computeFooterTotalsByCurrency,
  getExcelCellDisplayValue,
  type ExcelDensityMode,
} from './excel/statementExcelHelpers';
import { StatementExcelRow } from './excel/StatementExcelRow';
import { StatementExcelFooter } from './excel/StatementExcelFooter';

const DENSITY_STORAGE_KEY = 'erp_statement_excel_density';

const readSavedDensity = (): ExcelDensityMode => {
  try {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (saved === 'compact' || saved === 'comfortable' || saved === 'large') return saved;
  } catch {
    // ignore storage errors
  }
  return 'comfortable';
};

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
  const [densityMode, setDensityModeState] = useState<ExcelDensityMode>(readSavedDensity);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [copiedFormula, setCopiedFormula] = useState(false);

  const setDensityMode = (mode: ExcelDensityMode) => {
    setDensityModeState(mode);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };

  const density = EXCEL_DENSITY_MAP.get(densityMode) ?? EXCEL_DENSITY_MAP.get('comfortable')!;

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

  const activeCellInfo = useMemo(() => {
    if (!activeCell) return null;
    const row = filteredMovements[activeCell.row];
    if (!row) return null;
    const refLabel = `${EXCEL_COL_LETTERS[activeCell.col] ?? ''}${activeCell.row + 1}`;
    const colTitle = EXCEL_COL_TITLES[activeCell.col] ?? '';
    const value = getExcelCellDisplayValue(row, activeCell.col, formatCurrency);
    return { refLabel, colTitle, value };
  }, [activeCell, filteredMovements]);

  const handleCopyActiveCell = () => {
    if (!activeCellInfo?.value || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(activeCellInfo.value).then(() => {
      setCopiedFormula(true);
      setTimeout(() => setCopiedFormula(false), 1400);
    });
  };

  const gridBorder = 'border border-slate-300/90 dark:border-slate-700';

  return (
    <div className="w-full overflow-hidden rounded-xl border border-emerald-700/35 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
      {/* Authentic Excel Green Ribbon Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-emerald-800/30 bg-[#1d6f42] px-4 py-2.5 text-white dark:bg-emerald-950">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight">كشف حساب إكسل: {partyName}</h3>
            <p className="text-xs font-medium text-emerald-100">
              جدول Excel Grid احترافي — {filteredMovements.length} حركة
              {selectedRowIds.size > 0 ? ` • محدد: ${selectedRowIds.size}` : ''}
            </p>
          </div>
        </div>

        {/* Readable Text Size / Density Selector */}
        <div className="flex items-center gap-1 rounded-lg bg-black/15 p-1">
          <span className="inline-flex items-center gap-1 px-1.5 text-[11px] font-bold text-emerald-100">
            <Type size={13} />
            حجم الخط:
          </span>
          {(
            [
              { id: 'compact', label: 'مضغوط' },
              { id: 'comfortable', label: 'واضح' },
              { id: 'large', label: 'كبير' },
            ] as const
          ).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setDensityMode(opt.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-bold transition-colors',
                densityMode === opt.id
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-emerald-50 hover:bg-white/15'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Excel Formula / Active Cell Preview Bar */}
      <div className="no-print flex items-center gap-2 border-b border-slate-300 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900/90">
        <div
          dir="ltr"
          className="flex min-w-[54px] items-center justify-center rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-black text-emerald-800 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-300"
        >
          {activeCellInfo ? activeCellInfo.refLabel : 'A1'}
        </div>
        <span className="select-none font-serif text-sm font-bold italic text-slate-400">fx</span>
        <div className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2.5 py-1 text-[13px] font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          {activeCellInfo ? (
            <>
              <span className="ml-2 text-xs font-bold text-slate-400">
                [{activeCellInfo.colTitle}]
              </span>
              <span>{activeCellInfo.value}</span>
            </>
          ) : (
            <span className="text-xs font-medium text-slate-400">
              انقر على أي خلية في الجدول لعرض محتواها الكامل أو نسخه بسرعة
            </span>
          )}
        </div>
        {activeCellInfo?.value && (
          <button
            type="button"
            onClick={handleCopyActiveCell}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="نسخ قيمة الخلية النشطة"
          >
            {copiedFormula ? (
              <Check size={13} className="text-emerald-600" />
            ) : (
              <Copy size={13} />
            )}
            <span>{copiedFormula ? 'تم النسخ' : 'نسخ'}</span>
          </button>
        )}
      </div>

      {/* Spreadsheet Grid Viewport */}
      <div className="custom-scrollbar max-h-[70vh] overflow-auto bg-white dark:bg-slate-950">
        <table
          role="grid"
          aria-label={`كشف حساب إكسل: ${partyName}`}
          className={cn('w-full min-w-[1100px] border-collapse text-right', density.tableText)}
        >
          <thead className="sticky top-0 z-20 select-none shadow-xs">
            {/* Row 0: Authentic Excel Column Letters (A..J) */}
            <tr className="bg-slate-200 font-mono text-[11px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <th className={cn('w-10 py-1 text-center', gridBorder)}></th>
              <th className={cn('w-11 py-1 text-center', gridBorder)}>#</th>
              {EXCEL_COL_LETTERS.map((letter, colIdx) => (
                <th
                  key={letter}
                  className={cn(
                    'py-1 text-center',
                    activeCell?.col === colIdx &&
                      'bg-emerald-200/80 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-200',
                    gridBorder
                  )}
                >
                  {letter}
                </th>
              ))}
            </tr>

            {/* Row 1: Column Titles */}
            <tr
              className={cn(
                'border-b-2 border-emerald-700/40 bg-[#e4f1e9] font-black text-emerald-950 dark:bg-slate-800 dark:text-emerald-100',
                density.headerText
              )}
            >
              <th className={cn('no-print w-10 p-2.5 text-center', gridBorder)}>
                <button
                  type="button"
                  onClick={onToggleSelectAll}
                  className="inline-flex items-center justify-center text-emerald-800 hover:text-emerald-950 dark:text-emerald-300"
                  title="تحديد / إلغاء تحديد الكل"
                >
                  {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </th>
              <th className={cn('w-11 p-2.5 text-center font-mono', gridBorder)}>م</th>
              <th className={cn('w-28 p-2.5 text-center', gridBorder)}>التاريخ</th>
              <th className={cn('w-40 p-2.5 text-center', gridBorder)}>المرجع</th>
              <th className={cn('w-32 p-2.5 text-center', gridBorder)}>نوع العملية</th>
              <th className={cn('w-20 p-2.5 text-center', gridBorder)}>العملة</th>
              <th className={cn('min-w-[260px] p-2.5 text-right', gridBorder)}>البيان والتفاصيل</th>
              <th className={cn('w-28 p-2.5 text-center', gridBorder)}>حالة السداد</th>
              <th className={cn('w-32 p-2.5 text-center text-blue-900 dark:text-blue-200', gridBorder)}>
                مدين (عليه +)
              </th>
              <th className={cn('w-32 p-2.5 text-center text-rose-900 dark:text-rose-200', gridBorder)}>
                دائن (له -)
              </th>
              <th
                className={cn(
                  'w-36 p-2.5 text-center text-emerald-950 dark:text-emerald-200',
                  gridBorder
                )}
              >
                الرصيد المتراكم
              </th>
              <th className={cn('no-print w-32 p-2.5 text-center', gridBorder)}>إجراءات</th>
            </tr>
          </thead>

          <tbody className="font-sans">
            {filteredMovements.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className={cn('py-14 text-center text-sm font-bold text-slate-500', gridBorder)}
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
                    density={density}
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

          <StatementExcelFooter
            totals={footerTotalsByCurrency}
            density={density}
            gridBorder={gridBorder}
          />
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
