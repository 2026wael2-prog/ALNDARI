import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  Clock,
  Edit,
  Palette,
  Printer,
  Square,
} from 'lucide-react';
import type { StatementMovement, StatementTransactionDetails } from '../../../service';
import type { PartyType } from '../../../types';
import { cn, formatCurrency } from '@/core/utils';
import { EntityInfoDot } from '../../../../entity-inspector';
import { StatementExcelSubRows } from './StatementExcelSubRows';
import {
  COLOR_MAP,
  classifyStatementMovement,
  getStatementRowSemanticTone,
  type ExcelDensityStyles,
} from './statementExcelHelpers';

interface StatementExcelRowProps {
  row: StatementMovement;
  idx: number;
  partyName: string;
  partyType?: PartyType;
  density: ExcelDensityStyles;
  gridBorder: string;
  isSelected: boolean;
  isExpanded: boolean;
  preloadedDetails?: StatementTransactionDetails | null;
  isBatchDetailsLoading?: boolean;
  colorKey: string | undefined;
  isColorPickerOpen: boolean;
  activeCellCol: number | null;
  onSelectCell: (col: number) => void;
  onToggleSelection: (id: string, e?: React.MouseEvent) => void;
  onToggleExpand: (id: string, e?: React.MouseEvent) => void;
  onOpenColorPicker: (id: string | null) => void;
  onApplyColor: (row: StatementMovement, color: string | null) => void;
  onPrintSingleTransaction: (row: StatementMovement) => void;
  onOpenInvoiceModal: (id: string) => void;
  onOpenBondModal: (bondId: string, movement: StatementMovement) => void;
  onEditInvoice: (invoiceId: string) => void;
}

const COLOR_OPTIONS: Array<{ key: string; title: string; className: string }> = [
  { key: 'emerald', title: 'أخضر', className: 'bg-emerald-500' },
  { key: 'rose', title: 'أحمر', className: 'bg-rose-500' },
  { key: 'amber', title: 'كهرماني', className: 'bg-amber-500' },
  { key: 'blue', title: 'أزرق', className: 'bg-blue-500' },
];

export const StatementExcelRow: React.FC<StatementExcelRowProps> = ({
  row,
  idx,
  partyName: _partyName,
  partyType = 'customer',
  density,
  gridBorder,
  isSelected,
  isExpanded,
  preloadedDetails,
  isBatchDetailsLoading = false,
  colorKey,
  isColorPickerOpen,
  activeCellCol,
  onSelectCell,
  onToggleSelection,
  onToggleExpand,
  onOpenColorPicker,
  onApplyColor,
  onPrintSingleTransaction,
  onOpenInvoiceModal,
  onOpenBondModal,
  onEditInvoice,
}) => {
  const colorStyle = colorKey ? COLOR_MAP.get(colorKey) : undefined;
  const semanticTone = getStatementRowSemanticTone(row, partyType);
  const currency = (row.currency || 'SAR').toUpperCase();
  const bal = Number(row.balance) || 0;
  const { refType, isInv, isEditableSalesInvoice, isBond, isPartialStatus } =
    classifyStatementMovement(row);

  const semanticRowBg =
    semanticTone === 'emerald'
      ? 'bg-emerald-100/80 border-r-4 border-r-emerald-600 dark:bg-emerald-950/40 dark:border-r-emerald-500'
      : 'bg-rose-100/80 border-r-4 border-r-rose-600 dark:bg-rose-950/40 dark:border-r-rose-500';

  const rowBg = colorStyle
    ? cn(colorStyle.bg, colorStyle.border)
    : isSelected
      ? 'bg-blue-50/90 border-r-4 border-r-blue-600 dark:bg-blue-950/35'
      : semanticRowBg;

  const cellRing = (colIdx: number) =>
    activeCellCol === colIdx
      ? 'ring-2 ring-inset ring-emerald-600 bg-emerald-50/55 dark:bg-emerald-950/30'
      : '';

  const cellPad = density.cellPad;

  return (
    <>
      <tr
        className={cn(
          'transition-colors hover:bg-emerald-50/50 dark:hover:bg-slate-800/75',
          rowBg
        )}
      >
        {/* Checkbox */}
        <td
          className={cn('no-print text-center align-middle', cellPad, gridBorder)}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={e => onToggleSelection(row.id, e)}
            className="inline-flex items-center justify-center text-slate-400 hover:text-emerald-700"
          >
            {isSelected ? (
              <CheckSquare size={16} className="text-emerald-600" />
            ) : (
              <Square size={16} />
            )}
          </button>
        </td>

        {/* Row Number */}
        <td
          className={cn(
            'select-none text-center align-middle font-mono text-xs font-black text-black dark:text-white',
            semanticTone === 'emerald'
              ? 'bg-emerald-100/80 dark:bg-emerald-950/50'
              : 'bg-rose-100/80 dark:bg-rose-950/50',
            cellPad,
            gridBorder
          )}
        >
          <div className="flex items-center justify-center gap-1">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                colorStyle
                  ? colorStyle.badge
                  : semanticTone === 'emerald'
                    ? 'bg-emerald-600'
                    : 'bg-rose-600'
              )}
            />
            <span>{idx + 1}</span>
          </div>
        </td>

        {/* Col A: Date */}
        <td
          onClick={() => onSelectCell(0)}
          className={cn(
            'cursor-cell whitespace-nowrap text-center align-middle font-mono font-bold text-black dark:text-white',
            density.monoText,
            cellPad,
            gridBorder,
            cellRing(0)
          )}
          dir="ltr"
        >
          {row.date ? row.date.replace(/-/g, '/') : '—'}
        </td>

        {/* Col B: Ref + Expand */}
        <td
          onClick={() => onSelectCell(1)}
          className={cn(
            'cursor-cell whitespace-nowrap text-center align-middle',
            cellPad,
            gridBorder,
            cellRing(1)
          )}
        >
          <div className="inline-flex items-center justify-center gap-1.5">
            {row.reference_id && (
              <button
                type="button"
                onClick={e => onToggleExpand(row.id, e)}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-emerald-700 dark:hover:bg-slate-700"
                title="توسيع تفاصيل البنود داخل الجدول"
              >
                {isExpanded ? (
                  <ChevronDown size={15} className="text-emerald-600" />
                ) : (
                  <ChevronLeft size={15} />
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
              className={cn(
                'font-mono font-bold text-blue-700 hover:underline dark:text-blue-400',
                density.monoText
              )}
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
          onClick={() => onSelectCell(2)}
          className={cn(
            'cursor-cell whitespace-nowrap text-center align-middle',
            cellPad,
            gridBorder,
            cellRing(2)
          )}
        >
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-2 py-0.5 font-black',
              density.badgeText,
              semanticTone === 'emerald'
                ? 'border-emerald-400 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                : 'border-rose-400 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-900/50 dark:text-rose-200'
            )}
          >
            {row.operation_type || row.type || 'قيد محاسبي'}
          </span>
        </td>

        {/* Col D: Currency */}
        <td
          onClick={() => onSelectCell(3)}
          className={cn(
            'cursor-cell whitespace-nowrap text-center align-middle',
            cellPad,
            gridBorder,
            cellRing(3)
          )}
        >
          <span
            className={cn(
              'inline-block rounded-md px-2 py-0.5 font-mono font-black',
              density.badgeText,
              currency === 'YER'
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/45 dark:text-amber-200'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/45 dark:text-emerald-200'
            )}
          >
            {currency}
          </span>
        </td>

        {/* Col E: Description */}
        <td
          onClick={() => onSelectCell(4)}
          className={cn('cursor-cell text-right align-middle', cellPad, gridBorder, cellRing(4))}
        >
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                'font-semibold leading-relaxed text-slate-900 dark:text-slate-100',
                density.tableText,
                colorStyle?.text
              )}
              title={row.desc}
            >
              {row.desc || '—'}
            </span>
            {row.items_count !== undefined && row.items_count > 0 && (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
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
          onClick={() => onSelectCell(5)}
          className={cn(
            'cursor-cell whitespace-nowrap text-center align-middle',
            cellPad,
            gridBorder,
            cellRing(5)
          )}
        >
          {row.payment_status === 'paid' ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
                density.badgeText
              )}
            >
              <CheckCircle2 size={12} />
              خالص
            </span>
          ) : isPartialStatus ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
                density.badgeText
              )}
            >
              <Clock size={12} />
              جزئي
            </span>
          ) : row.payment_status === 'unpaid' ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 font-bold text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
                density.badgeText
              )}
            >
              <AlertCircle size={12} />
              غير مسدد
            </span>
          ) : (
            <span
              className={cn(
                'inline-flex items-center rounded-full bg-slate-200/80 px-2.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                density.badgeText
              )}
            >
              مرحل
            </span>
          )}
        </td>

        {/* Col G: Debit */}
        <td
          onClick={() => onSelectCell(6)}
          className={cn(
            'cursor-cell whitespace-nowrap bg-rose-50/55 text-left align-middle font-mono font-black tabular-nums dark:bg-rose-950/20',
            row.debit > 0
              ? 'text-rose-800 dark:text-rose-300'
              : 'text-center text-slate-400 dark:text-slate-600',
            density.monoText,
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
          onClick={() => onSelectCell(7)}
          className={cn(
            'cursor-cell whitespace-nowrap bg-emerald-50/55 text-left align-middle font-mono font-black tabular-nums dark:bg-emerald-950/20',
            row.credit > 0
              ? 'text-emerald-800 dark:text-emerald-300'
              : 'text-center text-slate-400 dark:text-slate-600',
            density.monoText,
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
          onClick={() => onSelectCell(8)}
          className={cn(
            'cursor-cell whitespace-nowrap bg-slate-100/75 text-left align-middle font-mono font-black tabular-nums dark:bg-slate-900/65',
            bal >= 0
              ? 'text-emerald-800 dark:text-emerald-300'
              : 'text-rose-800 dark:text-rose-300',
            density.monoText,
            cellPad,
            gridBorder,
            cellRing(8)
          )}
          dir="ltr"
        >
          {formatCurrency(bal, currency)}
        </td>

        {/* Col J: Actions */}
        <td
          className={cn('no-print whitespace-nowrap text-center align-middle', cellPad, gridBorder)}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onOpenColorPicker(isColorPickerOpen ? null : row.id);
                }}
                title={colorKey ? 'تعديل أو مسح اللون' : 'تلوين الصف'}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  colorKey === 'emerald'
                    ? 'bg-emerald-100 text-emerald-700'
                    : colorKey === 'rose'
                      ? 'bg-rose-100 text-rose-700'
                      : colorKey === 'amber'
                        ? 'bg-amber-100 text-amber-700'
                        : colorKey === 'blue'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-800'
                )}
              >
                <Palette size={15} />
              </button>

              {isColorPickerOpen && (
                <div
                  className="absolute bottom-full left-0 z-50 mb-1 flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  {COLOR_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => onApplyColor(row, opt.key)}
                      className={cn(
                        'h-4 w-4 rounded-full border border-white/40 hover:scale-125',
                        opt.className
                      )}
                      title={opt.title}
                    />
                  ))}
                  {colorKey && (
                    <button
                      type="button"
                      onClick={() => onApplyColor(row, null)}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-900/60"
                    >
                      مسح
                    </button>
                  )}
                </div>
              )}
            </div>

            {isEditableSalesInvoice && (
              <button
                type="button"
                onClick={() => onEditInvoice(row.reference_id!)}
                title="تعديل الفاتورة أو تحويل عملتها (ريال يمني ↔ سعودي)"
                className="rounded-md p-1.5 text-amber-700 hover:bg-amber-100/80 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
              >
                <Edit size={15} />
              </button>
            )}

            <button
              type="button"
              onClick={() => onPrintSingleTransaction(row)}
              title="طباعة هذه المعاملة بمفردها"
              className="rounded-md p-1.5 text-black hover:bg-emerald-100/80 hover:text-emerald-800 dark:text-slate-200 dark:hover:bg-emerald-950/40"
            >
              <Printer size={15} />
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <StatementExcelSubRows
          row={row}
          parentIdx={idx}
          details={preloadedDetails}
          isLoading={isBatchDetailsLoading}
          tone={semanticTone}
          gridBorder={gridBorder}
        />
      )}
    </>
  );
};
