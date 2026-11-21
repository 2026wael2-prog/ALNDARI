import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Edit,
  Palette,
  Printer,
} from 'lucide-react';
import ExcelTable, { type Column } from '@/ui/common/ExcelTable';
import type { StatementMovement } from '../../service';
import { cn, formatCurrency } from '@/core/utils';
import EditInvoiceModal from '@/features/sales/components/edit/EditInvoiceModal';

interface StatementExcelViewProps {
  filteredMovements: StatementMovement[];
  selectedRowIds: Set<string>;
  rowColors: Map<string, string>;
  activeColorPickerRowId: string | null;
  partyName: string;
  onToggleSelectAll: () => void;
  onToggleRowSelection: (id: string, e?: React.MouseEvent) => void;
  onOpenColorPicker: (id: string | null) => void;
  onApplyColorToSingleRow: (row: StatementMovement, color: string | null) => void;
  onPrintSingleTransaction: (row: StatementMovement) => void;
  onOpenInvoiceModal: (id: string) => void;
  onOpenBondModal: (bondId: string, movement: StatementMovement) => void;
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  emerald: {
    bg: 'bg-emerald-50/80 dark:bg-emerald-950/40',
    border: 'border-r-4 border-r-emerald-500',
    text: 'text-emerald-900 dark:text-emerald-200',
    badge: 'bg-emerald-500',
  },
  rose: {
    bg: 'bg-rose-50/80 dark:bg-rose-950/40',
    border: 'border-r-4 border-r-rose-500',
    text: 'text-rose-900 dark:text-rose-200',
    badge: 'bg-rose-500',
  },
  amber: {
    bg: 'bg-amber-50/80 dark:bg-amber-950/40',
    border: 'border-r-4 border-r-amber-500',
    text: 'text-amber-900 dark:text-amber-200',
    badge: 'bg-amber-500',
  },
  blue: {
    bg: 'bg-blue-50/80 dark:bg-blue-950/40',
    border: 'border-r-4 border-r-blue-500',
    text: 'text-blue-900 dark:text-blue-200',
    badge: 'bg-blue-500',
  },
};

export const StatementExcelView: React.FC<StatementExcelViewProps> = ({
  filteredMovements,
  selectedRowIds,
  rowColors,
  activeColorPickerRowId,
  partyName,
  onToggleRowSelection,
  onOpenColorPicker,
  onApplyColorToSingleRow,
  onPrintSingleTransaction,
  onOpenInvoiceModal,
  onOpenBondModal,
}) => {
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const columns = useMemo<Column<StatementMovement>[]>(() => {
    return [
      {
        header: '#',
        accessor: (row: StatementMovement) => {
          const idx = filteredMovements.findIndex(m => m.id === row.id);
          const colorKey =
            rowColors.get(row.id) ||
            (row.reference_id ? rowColors.get(row.reference_id) : undefined) ||
            (row.ref ? rowColors.get(row.ref) : undefined);
          return (
            <div className="flex items-center justify-center gap-1">
              {colorKey && COLOR_MAP[colorKey] && (
                <span
                  className={cn('h-2 w-2 rounded-full', COLOR_MAP[colorKey].badge)}
                  title={`معاملة مميزة بلون`}
                />
              )}
              <span className="font-mono text-[10px] text-slate-400">{idx + 1}</span>
            </div>
          );
        },
        width: '45px',
        align: 'center',
      },
      {
        header: 'التاريخ',
        accessor: (row: StatementMovement) => (
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
            {row.date ? row.date.replace(/-/g, '/') : '—'}
          </span>
        ),
        accessorKey: 'date',
        sortKey: 'date',
        width: '105px',
        align: 'center',
      },
      {
        header: 'المرجع',
        accessor: (row: StatementMovement) => (
          <div className="flex items-center justify-center gap-1">
            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
              {row.ref || '—'}
            </span>
            {row.reference_id && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const type = row.reference_type || row.type;
                  if (type?.includes('invoice')) {
                    onOpenInvoiceModal(row.reference_id!);
                  } else {
                    onOpenBondModal(row.reference_id!, row);
                  }
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-blue-600 dark:hover:bg-slate-700"
                title="عرض المستند الأصلي"
              >
                <Eye size={12} />
              </button>
            )}
          </div>
        ),
        accessorKey: 'ref',
        sortKey: 'ref',
        width: '120px',
        align: 'center',
      },
      {
        header: 'نوع العملية',
        accessor: (row: StatementMovement) => {
          const op = row.operation_type || row.type;
          const isInvoice = op.includes('invoice');
          const isReceipt = op.includes('receipt') || (row.debit > 0 && op.includes('bond'));
          const isPayment = op.includes('payment') || op.includes('disbursement');
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold',
                isInvoice
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                  : isReceipt
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : isPayment
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              {op.includes('invoice')
                ? 'فاتورة مبيعات'
                : isReceipt
                  ? 'سند قبض'
                  : isPayment
                    ? 'سند صرف'
                    : op || 'قيد محاسبي'}
            </span>
          );
        },
        width: '115px',
        align: 'center',
      },
      {
        header: 'البيان والتفاصيل',
        accessor: (row: StatementMovement) => {
          const colorKey =
            rowColors.get(row.id) ||
            (row.reference_id ? rowColors.get(row.reference_id) : undefined) ||
            (row.ref ? rowColors.get(row.ref) : undefined);
          return (
            <div className="flex flex-col text-right">
              <span
                className={cn(
                  'font-medium text-slate-800 dark:text-slate-200',
                  colorKey && COLOR_MAP[colorKey]?.text
                )}
              >
                {row.desc || '—'}
              </span>
              {row.items_count !== undefined && row.items_count > 0 && (
                <span className="text-[10px] text-slate-400">
                  {row.items_count} أصناف بالفاتورة
                </span>
              )}
            </div>
          );
        },
        accessorKey: 'desc',
        width: '260px',
        align: 'right',
      },
      {
        header: 'حالة السداد',
        accessor: (row: StatementMovement) => {
          if (row.payment_status === 'paid') {
            return (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 size={10} />
                خالص
              </span>
            );
          }
          if (row.payment_status === 'partially_paid') {
            return (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                <Clock size={10} />
                جزئي
              </span>
            );
          }
          if (row.payment_status === 'unpaid') {
            return (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertCircle size={10} />
                غير مسدد
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              تسوية
            </span>
          );
        },
        width: '100px',
        align: 'center',
      },
      {
        header: 'مدين (عليه +)',
        accessor: (row: StatementMovement) => (
          <span
            className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400"
            dir="ltr"
          >
            {row.debit > 0 ? formatCurrency(row.debit, row.currency) : '—'}
          </span>
        ),
        accessorKey: 'debit',
        sortKey: 'debit',
        width: '120px',
        align: 'center',
        footer: data => {
          const sum = data.reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0);
          return (
            <span className="font-mono text-xs font-black text-blue-700 dark:text-blue-300" dir="ltr">
              {formatCurrency(sum, data[0]?.currency || 'SAR')}
            </span>
          );
        },
      },
      {
        header: 'دائن (له -)',
        accessor: (row: StatementMovement) => (
          <span
            className="font-mono text-xs font-bold text-rose-700 dark:text-rose-400"
            dir="ltr"
          >
            {row.credit > 0 ? formatCurrency(row.credit, row.currency) : '—'}
          </span>
        ),
        accessorKey: 'credit',
        sortKey: 'credit',
        width: '120px',
        align: 'center',
        footer: data => {
          const sum = data.reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0);
          return (
            <span className="font-mono text-xs font-black text-rose-700 dark:text-rose-300" dir="ltr">
              {formatCurrency(sum, data[0]?.currency || 'SAR')}
            </span>
          );
        },
      },
      {
        header: 'الرصيد المتراكم',
        accessor: (row: StatementMovement) => {
          const bal = row.balance || 0;
          return (
            <span
              className={cn(
                'font-mono text-xs font-black',
                bal >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              )}
              dir="ltr"
            >
              {formatCurrency(bal, row.currency)}
            </span>
          );
        },
        accessorKey: 'balance',
        sortKey: 'balance',
        width: '135px',
        align: 'center',
        footer: data => {
          const last = data[data.length - 1];
          const finalBal = last?.balance || 0;
          return (
            <span
              className={cn(
                'font-mono text-xs font-black',
                finalBal >= 0 ? 'text-emerald-600' : 'text-rose-600'
              )}
              dir="ltr"
            >
              الرصيد: {formatCurrency(finalBal, last?.currency || 'SAR')}
            </span>
          );
        },
      },
      {
        header: 'إجراءات وطباعة',
        accessor: (row: StatementMovement) => {
          const colorKey =
            rowColors.get(row.id) ||
            (row.reference_id ? rowColors.get(row.reference_id) : undefined) ||
            (row.ref ? rowColors.get(row.ref) : undefined);

          return (
            <div
              className="no-print flex items-center justify-center gap-1"
              onClick={e => e.stopPropagation()}
            >
              {/* Color picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onOpenColorPicker(activeColorPickerRowId === row.id ? null : row.id);
                  }}
                  title={colorKey ? 'تعديل أو مسح اللون' : 'تلوين المعاملة بلون ثابت'}
                  className={cn(
                    'rounded p-1 transition-colors',
                    colorKey === 'emerald'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                      : colorKey === 'rose'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'
                        : colorKey === 'amber'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                          : colorKey === 'blue'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800'
                  )}
                >
                  <Palette size={13} />
                </button>

                {activeColorPickerRowId === row.id && (
                  <div
                    className="absolute bottom-full left-0 z-50 mb-1 flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl backdrop-blur"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onApplyColorToSingleRow(row, 'emerald')}
                      className="h-4 w-4 rounded-full border border-white/40 bg-emerald-500 transition-transform hover:scale-125"
                      title="أخضر (خالص)"
                    />
                    <button
                      type="button"
                      onClick={() => onApplyColorToSingleRow(row, 'rose')}
                      className="h-4 w-4 rounded-full border border-white/40 bg-rose-500 transition-transform hover:scale-125"
                      title="أحمر (مستحق)"
                    />
                    <button
                      type="button"
                      onClick={() => onApplyColorToSingleRow(row, 'amber')}
                      className="h-4 w-4 rounded-full border border-white/40 bg-amber-500 transition-transform hover:scale-125"
                      title="كهرماني (جزئي)"
                    />
                    <button
                      type="button"
                      onClick={() => onApplyColorToSingleRow(row, 'blue')}
                      className="h-4 w-4 rounded-full border border-white/40 bg-blue-500 transition-transform hover:scale-125"
                      title="أزرق (مهم)"
                    />
                    {colorKey && (
                      <button
                        type="button"
                        onClick={() => onApplyColorToSingleRow(row, null)}
                        className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-900/60 hover:text-white"
                        title="إزالة اللون"
                      >
                        مسح
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Direct edit button for sales invoice transaction */}
              {(() => {
                const opType = (
                  row.reference_type ||
                  row.operation_type ||
                  row.type ||
                  ''
                ).toLowerCase();
                const isEditableSalesInvoice =
                  Boolean(row.reference_id) &&
                  opType.includes('invoice') &&
                  !opType.includes('purchase') &&
                  !opType.includes('return') &&
                  !opType.includes('void');
                if (!isEditableSalesInvoice) return null;
                return (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setEditingInvoiceId(row.reference_id!);
                    }}
                    title="تعديل الفاتورة وتسوية القيود والمخزون"
                    className="rounded p-1 text-amber-600 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                  >
                    <Edit size={13} />
                  </button>
                );
              })()}

              {/* Direct print button for single transaction */}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onPrintSingleTransaction(row);
                }}
                title="طباعة هذه المعاملة بمفردها"
                className="rounded p-1 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40"
              >
                <Printer size={13} />
              </button>
            </div>
          );
        },
        width: '105px',
        align: 'center',
      },
    ];
  }, [
    filteredMovements,
    rowColors,
    activeColorPickerRowId,
    onOpenColorPicker,
    onApplyColorToSingleRow,
    onPrintSingleTransaction,
    onOpenInvoiceModal,
    onOpenBondModal,
    setEditingInvoiceId,
  ]);

  return (
    <div className="w-full">
      <ExcelTable<StatementMovement>
        columns={columns}
        data={filteredMovements}
        title={`كشف حساب إكسل: ${partyName}`}
        subtitle={`جدول إكسل كامل ملون مع تحديد المعاملات والطباعة المباشرة (${filteredMovements.length} معاملة)`}
        colorTheme="green"
        enableSelection={true}
        selectedRowIds={selectedRowIds}
        onSelectionChange={ids => {
          // Sync selections back to parent
          const current = selectedRowIds;
          for (const id of ids) {
            if (!current.has(id)) onToggleRowSelection(id);
          }
          for (const id of current) {
            if (!ids.has(id)) onToggleRowSelection(id);
          }
        }}
        getRowId={row => row.id}
        enablePagination={false}
        enableResize={true}
        isRTL={true}
        resizeStorageKey="statement_excel_view_widths"
      />

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
