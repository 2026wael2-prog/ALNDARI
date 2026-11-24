import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  Clock,
  Edit,
  Eye,
  Palette,
  Printer,
  Square,
} from 'lucide-react';
import type { StatementMovement } from '../../../service';
import { cn, formatCurrency } from '@/core/utils';
import { EntityInfoDot } from '../../../../entity-inspector';
import { StatementTransactionDetailRow } from '../StatementTransactionDetailRow';
import { COLOR_MAP, classifyStatementMovement } from './statementExcelHelpers';

interface StatementExcelRowProps {
  row: StatementMovement;
  idx: number;
  partyName: string;
  cellPad: string;
  gridBorder: string;
  isSelected: boolean;
  isExpanded: boolean;
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
  partyName,
  cellPad,
  gridBorder,
  isSelected,
  isExpanded,
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
  const currency = (row.currency || 'SAR').toUpperCase();
  const bal = Number(row.balance) || 0;
  const { refType, isInv, isEditableSalesInvoice, isBond, isPartialStatus } =
    classifyStatementMovement(row);

  const rowBg = colorStyle
    ? cn(colorStyle.bg, colorStyle.border)
    : isSelected
      ? 'bg-blue-50/80 dark:bg-blue-950/35'
      : idx % 2 === 0
        ? 'bg-white dark:bg-slate-950'
        : 'bg-slate-50/70 dark:bg-slate-900/50';

  const cellRing = (colIdx: number) =>
    activeCellCol === colIdx
      ? 'ring-2 ring-inset ring-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20'
      : '';

  return (
    <>
      <tr
        className={cn(
          'transition-colors hover:bg-emerald-50/45 dark:hover:bg-slate-800/70',
          rowBg
        )}
      >
        <td
          className={cn('no-print text-center', cellPad, gridBorder)}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={e => onToggleSelection(row.id, e)}
            className="inline-flex items-center justify-center text-slate-400 hover:text-emerald-700"
          >
            {isSelected ? (
              <CheckSquare size={14} className="text-emerald-600" />
            ) : (
              <Square size={14} />
            )}
          </button>
        </td>

        <td
          className={cn(
            'select-none bg-slate-100/90 text-center font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-400',
            cellPad,
            gridBorder
          )}
        >
          <div className="flex items-center justify-center gap-1">
            {colorStyle && <span className={cn('h-2 w-2 rounded-full', colorStyle.badge)} />}
            <span>{idx + 1}</span>
          </div>
        </td>

        <td
          onClick={() => onSelectCell(0)}
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

        <td
          onClick={() => onSelectCell(1)}
          className={cn('whitespace-nowrap text-center', cellPad, gridBorder, cellRing(1))}
        >
          <div className="inline-flex items-center justify-center gap-1">
            {row.reference_id && (
              <button
                type="button"
                onClick={e => onToggleExpand(row.id, e)}
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

        <td
          onClick={() => onSelectCell(2)}
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

        <td
          onClick={() => onSelectCell(3)}
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

        <td
          onClick={() => onSelectCell(4)}
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

        <td
          onClick={() => onSelectCell(5)}
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

        <td
          onClick={() => onSelectCell(6)}
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

        <td
          onClick={() => onSelectCell(7)}
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

        <td
          onClick={() => onSelectCell(8)}
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

        <td
          className={cn('no-print whitespace-nowrap text-center', cellPad, gridBorder)}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-center gap-0.5">
            <div className="relative">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onOpenColorPicker(isColorPickerOpen ? null : row.id);
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

            {isEditableSalesInvoice && (
              <button
                type="button"
                onClick={() => onEditInvoice(row.reference_id!)}
                title="تعديل الفاتورة أو تحويل عملتها (ريال يمني ↔ سعودي)"
                className="rounded p-1 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
              >
                <Edit size={13} />
              </button>
            )}

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
    </>
  );
};
