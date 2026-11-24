/* eslint-disable max-lines-per-function, complexity */
import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  Clock,
  Eye,
  Edit,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Palette,
  Printer,
  Square,
} from 'lucide-react';
import type { StatementMovement } from '../../service';
import { cn, formatCurrency } from '@/core/utils';
import EditInvoiceModal from '@/features/sales/components/edit/EditInvoiceModal';
import { EntityInfoDot } from '../../../entity-inspector';
import { StatementTransactionDetailRow } from './StatementTransactionDetailRow';

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

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  emerald: {
    bg: 'bg-emerald-50/90 dark:bg-emerald-950/35',
    border: 'border-r-4 border-r-emerald-600',
    text: 'text-emerald-950 dark:text-emerald-200',
    badge: 'bg-emerald-500',
  },
  rose: {
    bg: 'bg-rose-50/90 dark:bg-rose-950/35',
    border: 'border-r-4 border-r-rose-600',
    text: 'text-rose-950 dark:text-rose-200',
    badge: 'bg-rose-500',
  },
  amber: {
    bg: 'bg-amber-50/90 dark:bg-amber-950/35',
    border: 'border-r-4 border-r-amber-500',
    text: 'text-amber-950 dark:text-amber-200',
    badge: 'bg-amber-500',
  },
  blue: {
    bg: 'bg-blue-50/90 dark:bg-blue-950/35',
    border: 'border-r-4 border-r-blue-600',
    text: 'text-blue-950 dark:text-blue-200',
    badge: 'bg-blue-500',
  },
};

const EXCEL_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

interface CurrencyFooterTotal {
  currency: string;
  count: number;
  debit: number;
  credit: number;
  closingBalance: number;
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

  // Strict per-currency footer totals (NEVER mixes SAR and YER!)
  const footerTotalsByCurrency = useMemo<CurrencyFooterTotal[]>(() => {
    const map = new Map<string, CurrencyFooterTotal>();
    for (const m of filteredMovements) {
      const code = (m.currency || 'SAR').toUpperCase();
      const entry = map.get(code) ?? {
        currency: code,
        count: 0,
        debit: 0,
        credit: 0,
        closingBalance: 0,
      };
      entry.count += 1;
      entry.debit = Math.round((entry.debit + (Number(m.debit) || 0)) * 100) / 100;
      entry.credit = Math.round((entry.credit + (Number(m.credit) || 0)) * 100) / 100;
      entry.closingBalance = Math.round((Number(m.balance) || 0) * 100) / 100;
      map.set(code, entry);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.currency === 'SAR' ? -1 : b.currency === 'SAR' ? 1 : a.currency.localeCompare(b.currency)
    );
  }, [filteredMovements]);

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
              {activeCell ? ` • الخلية: ${EXCEL_COL_LETTERS[activeCell.col] ?? ''}${activeCell.row + 1}` : ''}
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
            {/* Row 0: Authentic Excel Column Letters (A..J) */}
            <tr className="bg-slate-200/90 text-[10px] font-mono font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <th className={cn('w-9 py-0.5 text-center', gridBorder)}></th>
              <th className={cn('w-10 py-0.5 text-center', gridBorder)}>#</th>
              {EXCEL_COL_LETTERS.map(letter => (
                <th key={letter} className={cn('py-0.5 text-center', gridBorder)}>
                  {letter}
                </th>
              ))}
            </tr>

            {/* Row 1: Column Titles */}
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
              <th className={cn('w-32 p-2 text-center text-emerald-950 dark:text-emerald-300', gridBorder)}>
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
                const isSelected = selectedRowIds.has(row.id);
                const isExpanded = effectiveExpandedIds.has(row.id);
                const colorKey =
                  rowColors.get(row.id) ||
                  (row.reference_id ? rowColors.get(row.reference_id) : undefined) ||
                  (row.ref ? rowColors.get(row.ref) : undefined);
                const colorStyle = colorKey ? COLOR_MAP[colorKey] : undefined;
                const currency = (row.currency || 'SAR').toUpperCase();
                const bal = Number(row.balance) || 0;

                const op = (row.operation_type || row.type || '').toLowerCase();
                const refType = (row.reference_type || row.type || '').toLowerCase();
                const isInv =
                  refType.includes('invoice') ||
                  refType.includes('sale') ||
                  refType.includes('purchase') ||
                  op.includes('فاتورة');
                const isEditableSalesInvoice =
                  Boolean(row.reference_id) &&
                  (refType.includes('invoice') || op.includes('invoice') || op.includes('مبيعات')) &&
                  !refType.includes('purchase') &&
                  !op.includes('مشتريات') &&
                  !refType.includes('return') &&
                  !op.includes('مرتجع') &&
                  !refType.includes('void');
                const isBond =
                  refType.includes('bond') ||
                  refType.includes('payment') ||
                  refType.includes('receipt') ||
                  refType.includes('voucher');

                const isPartialStatus =
                  row.payment_status === 'partial' || row.payment_status === 'partially_paid';

                const rowBg = colorStyle
                  ? cn(colorStyle.bg, colorStyle.border)
                  : isSelected
                    ? 'bg-blue-50/80 dark:bg-blue-950/35'
                    : idx % 2 === 0
                      ? 'bg-white dark:bg-slate-950'
                      : 'bg-slate-50/70 dark:bg-slate-900/50';

                const cellRing = (colIdx: number) =>
                  activeCell?.row === idx && activeCell?.col === colIdx
                    ? 'ring-2 ring-inset ring-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : '';

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={cn(
                        'transition-colors hover:bg-emerald-50/45 dark:hover:bg-slate-800/70',
                        rowBg
                      )}
                    >
                      {/* Checkbox */}
                      <td
                        className={cn('no-print text-center', cellPad, gridBorder)}
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={e => onToggleRowSelection(row.id, e)}
                          className="inline-flex items-center justify-center text-slate-400 hover:text-emerald-700"
                        >
                          {isSelected ? (
                            <CheckSquare size={14} className="text-emerald-600" />
                          ) : (
                            <Square size={14} />
                          )}
                        </button>
                      </td>

                      {/* Excel Row Header Number */}
                      <td
                        className={cn(
                          'select-none bg-slate-100/90 text-center font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-400',
                          cellPad,
                          gridBorder
                        )}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {colorStyle && (
                            <span className={cn('h-2 w-2 rounded-full', colorStyle.badge)} />
                          )}
                          <span>{idx + 1}</span>
                        </div>
                      </td>

                      {/* Col A: Date */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 0 })}
                        className={cn(
                          'whitespace-nowrap text-center font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300',
                          cellPad,
                          gridBorder,
                          cellRing(0)
                        )}
                        dir="ltr"
                      >
                        {row.date ? row.date.replace(/-/g, '/') : '—'}
                      </td>

                      {/* Col B: Ref + Quick Open */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 1 })}
                        className={cn('whitespace-nowrap text-center', cellPad, gridBorder, cellRing(1))}
                      >
                        <div className="inline-flex items-center justify-center gap-1">
                          {row.reference_id && (
                            <button
                              type="button"
                              onClick={e => handleToggleExpand(row.id, e)}
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-emerald-700 dark:hover:bg-slate-700"
                              title="توسيع تفاصيل البنود داخل الجدول"
                            >
                              {isExpanded ? (
                                <ChevronDown size={13} className="text-emerald-600" />
                              ) : (
                                <ChevronLeft size={13} />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              if (!row.reference_id) return;
                              if (isInv) onOpenInvoiceModal(row.reference_id);
                              else onOpenBondModal(row.reference_id, row);
                            }}
                            className="font-mono text-[11px] font-bold text-blue-700 hover:underline dark:text-blue-400"
                            title="فتح المستند الأصلي"
                          >
                            {row.ref || '—'}
                          </button>
                          {row.reference_id && (isInv || isBond) && (
                            <EntityInfoDot
                              type={isInv ? 'invoice' : 'bond'}
                              id={row.reference_id}
                              label={row.ref}
                              subType={refType}
                              size="xs"
                            />
                          )}
                        </div>
                      </td>

                      {/* Col C: Operation Type */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 2 })}
                        className={cn('whitespace-nowrap text-center', cellPad, gridBorder, cellRing(2))}
                      >
                        <span
                          className={cn(
                            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold',
                            isInv
                              ? 'bg-blue-100/80 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : row.credit > 0 && isBond
                                ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : isBond
                                  ? 'bg-rose-100/80 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          )}
                        >
                          {row.operation_type || row.type || 'قيد محاسبي'}
                        </span>
                      </td>

                      {/* Col D: Currency */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 3 })}
                        className={cn('whitespace-nowrap text-center', cellPad, gridBorder, cellRing(3))}
                      >
                        <span
                          className={cn(
                            'inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-black',
                            currency === 'YER'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          )}
                        >
                          {currency}
                        </span>
                      </td>

                      {/* Col E: Description */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 4 })}
                        className={cn('text-right', cellPad, gridBorder, cellRing(4))}
                      >
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              'font-medium leading-snug text-slate-800 dark:text-slate-200',
                              colorStyle?.text
                            )}
                            title={row.desc}
                          >
                            {row.desc || '—'}
                          </span>
                          {row.items_count !== undefined && row.items_count > 0 && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              {row.items_count} أصناف
                              {isPartialStatus && row.remaining_amount && row.remaining_amount > 0
                                ? ` • المتبقي: ${formatCurrency(row.remaining_amount, currency)}`
                                : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Col F: Payment Status */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 5 })}
                        className={cn('whitespace-nowrap text-center', cellPad, gridBorder, cellRing(5))}
                      >
                        {row.payment_status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <CheckCircle2 size={10} />
                            خالص
                          </span>
                        ) : isPartialStatus ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                            <Clock size={10} />
                            جزئي
                          </span>
                        ) : row.payment_status === 'unpaid' ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                            <AlertCircle size={10} />
                            غير مسدد
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            مرحل
                          </span>
                        )}
                      </td>

                      {/* Col G: Debit */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 6 })}
                        className={cn(
                          'whitespace-nowrap text-center font-mono text-[11px] font-bold tabular-nums text-blue-700 dark:text-blue-400',
                          cellPad,
                          gridBorder,
                          cellRing(6)
                        )}
                        dir="ltr"
                      >
                        {row.debit > 0 ? formatCurrency(row.debit, currency) : '—'}
                      </td>

                      {/* Col H: Credit */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 7 })}
                        className={cn(
                          'whitespace-nowrap text-center font-mono text-[11px] font-bold tabular-nums text-rose-700 dark:text-rose-400',
                          cellPad,
                          gridBorder,
                          cellRing(7)
                        )}
                        dir="ltr"
                      >
                        {row.credit > 0 ? formatCurrency(row.credit, currency) : '—'}
                      </td>

                      {/* Col I: Running Balance */}
                      <td
                        onClick={() => setActiveCell({ row: idx, col: 8 })}
                        className={cn(
                          'whitespace-nowrap bg-slate-50/60 text-center font-mono text-[11px] font-black tabular-nums dark:bg-slate-900/40',
                          bal >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400',
                          cellPad,
                          gridBorder,
                          cellRing(8)
                        )}
                        dir="ltr"
                      >
                        {formatCurrency(bal, currency)}
                      </td>

                      {/* Col J: Row Actions */}
                      <td
                        className={cn('no-print whitespace-nowrap text-center', cellPad, gridBorder)}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          {/* Color Picker */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                onOpenColorPicker(activeColorPickerRowId === row.id ? null : row.id);
                              }}
                              title={colorKey ? 'تعديل أو مسح اللون' : 'تلوين الصف'}
                              className={cn(
                                'rounded p-1 transition-colors',
                                colorKey === 'emerald'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : colorKey === 'rose'
                                    ? 'bg-rose-100 text-rose-700'
                                    : colorKey === 'amber'
                                      ? 'bg-amber-100 text-amber-700'
                                      : colorKey === 'blue'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800'
                              )}
                            >
                              <Palette size={13} />
                            </button>

                            {activeColorPickerRowId === row.id && (
                              <div
                                className="absolute bottom-full left-0 z-50 mb-1 flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl"
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => onApplyColorToSingleRow(row, 'emerald')}
                                  className="h-4 w-4 rounded-full border border-white/40 bg-emerald-500 hover:scale-125"
                                  title="أخضر"
                                />
                                <button
                                  type="button"
                                  onClick={() => onApplyColorToSingleRow(row, 'rose')}
                                  className="h-4 w-4 rounded-full border border-white/40 bg-rose-500 hover:scale-125"
                                  title="أحمر"
                                />
                                <button
                                  type="button"
                                  onClick={() => onApplyColorToSingleRow(row, 'amber')}
                                  className="h-4 w-4 rounded-full border border-white/40 bg-amber-500 hover:scale-125"
                                  title="كهرماني"
                                />
                                <button
                                  type="button"
                                  onClick={() => onApplyColorToSingleRow(row, 'blue')}
                                  className="h-4 w-4 rounded-full border border-white/40 bg-blue-500 hover:scale-125"
                                  title="أزرق"
                                />
                                {colorKey && (
                                  <button
                                    type="button"
                                    onClick={() => onApplyColorToSingleRow(row, null)}
                                    className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-900/60"
                                  >
                                    مسح
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Open / Preview */}
                          {row.reference_id && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isInv) onOpenInvoiceModal(row.reference_id!);
                                else onOpenBondModal(row.reference_id!, row);
                              }}
                              title="عرض المستند الأصلي"
                              className="rounded p-1 text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40"
                            >
                              <Eye size={13} />
                            </button>
                          )}

                          {/* Edit Invoice (including YER <-> SAR currency conversion) */}
                          {isEditableSalesInvoice && (
                            <button
                              type="button"
                              onClick={() => setEditingInvoiceId(row.reference_id!)}
                              title="تعديل الفاتورة أو تحويل عملتها (ريال يمني ↔ سعودي)"
                              className="rounded p-1 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                            >
                              <Edit size={13} />
                            </button>
                          )}

                          {/* Print Single Transaction */}
                          <button
                            type="button"
                            onClick={() => onPrintSingleTransaction(row)}
                            title="طباعة هذه المعاملة بمفردها"
                            className="rounded p-1 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
                          >
                            <Printer size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable inline line-items inside Excel Grid */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 dark:bg-slate-900/70 print:hidden">
                        <td colSpan={12} className={cn('p-3 pr-10', gridBorder)}>
                          <StatementTransactionDetailRow
                            movement={row}
                            partyName={partyName}
                            onOpenInvoiceModal={onOpenInvoiceModal}
                            onOpenBondModal={onOpenBondModal}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {/* Strict Per-Currency Totals Footer Rows */}
          {footerTotalsByCurrency.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-emerald-700/40 bg-[#e8f3ec] font-bold dark:border-emerald-700/60 dark:bg-slate-800">
              {footerTotalsByCurrency.map(ct => (
                <tr key={ct.currency} className="text-xs">
                  <td colSpan={5} className={cn('px-3 py-2 text-right font-black text-emerald-950 dark:text-emerald-200', gridBorder)}>
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
                  <td colSpan={2} className={cn('px-2 py-2 text-center text-[10px] text-slate-500 dark:text-slate-400', gridBorder)}>
                    مجاميع {ct.currency} المستقلة
                  </td>
                  <td
                    dir="ltr"
                    className={cn('px-2 py-2 text-center font-mono font-black text-blue-800 dark:text-blue-300', gridBorder)}
                  >
                    {formatCurrency(ct.debit, ct.currency)}
                  </td>
                  <td
                    dir="ltr"
                    className={cn('px-2 py-2 text-center font-mono font-black text-rose-800 dark:text-rose-300', gridBorder)}
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
                  <td className={cn('no-print px-2 py-2 text-center text-[10px] font-black text-emerald-800 dark:text-emerald-300', gridBorder)}>
                    {ct.closingBalance > 0.01 ? 'عليه' : ct.closingBalance < -0.01 ? 'له' : 'متوازن'}
                  </td>
                </tr>
              ))}
            </tfoot>
          )}
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
/* eslint-enable max-lines-per-function, complexity */

export default StatementExcelView;
