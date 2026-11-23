import { useMemo } from 'react';
import { Eye, FileText, Package, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import type { Column } from '../../../../ui/common/ExcelTable';
import type { ReturnsListRow } from '../../../returns/hooks/useReturnsListView';
import type { SalesReturn } from '../../hooks/useSalesReturns';

export const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  posted: 'معتمد',
  paid: 'مدفوع',
};

/**
 * توحيد سجل مرتجع مبيعات مع ReturnsListRow حتى يتوافق مع
 * useReturnsListView (كانت SalesReturn[] لا تطابق ReturnsListRow[]).
 */
export const normalizeSalesReturn = (row: SalesReturn): ReturnsListRow => ({
  id: row.id,
  invoice_number: row.invoice_number,
  issue_date: row.issue_date,
  created_at: row.created_at,
  total_amount: row.total_amount,
  total_document_amount: row.total_document_amount ?? null,
  currency_code: row.currency_code ?? 'SAR',
  exchange_rate: row.exchange_rate ?? null,
  status: row.status,
  notes: row.notes ?? null,
  invoice_items: row.invoice_items ?? [],
  party: row.party === null || row.party === undefined ? null : { name: row.party.name },
  reference_invoice_id: row.reference_invoice_id ?? null,
  reference_invoice: row.reference_invoice
    ? { invoice_number: row.reference_invoice.invoice_number ?? null }
    : null,
  return_reason: row.return_reason ?? null,
});

export interface SalesReturnRow {
  id: string;
  invoice_number?: string | null;
  reference_invoice_id?: string | null;
  reference_invoice?: { id?: string; invoice_number?: string | null } | null;
  issue_date?: string | null;
  created_at?: string | null;
  total_amount?: number | null;
  total_document_amount?: number | null;
  currency_code?: string | null;
  exchange_rate?: number | null;
  status?: string | null;
  invoice_items?: Array<SalesReturnLineItem> | { length: number } | null;
  party?: { name?: string | null } | null;
}

interface SalesReturnLineItem {
  id?: string;
  description?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  product?: {
    name_ar?: string | null;
    part_number?: string | null;
  } | null;
}

interface UseSalesReturnsColumnsProps {
  onPrefetchDetails: (id: string) => void;
  onViewDetails: (id: string) => void;
  onDeleteInvoice: (id: string) => void;
  isDeleting: boolean;
}

/** Column configuration hook for the Sales Returns ExcelTable grid. */
export function useSalesReturnsColumns({
  onPrefetchDetails,
  onViewDetails,
  onDeleteInvoice,
  isDeleting,
}: UseSalesReturnsColumnsProps): Column<SalesReturnRow>[] {
  return useMemo(
    () => [
      {
        header: 'رقم المرتجع',
        accessor: (row: SalesReturnRow) => (
          <span className="font-bold text-red-600">#{row.invoice_number}</span>
        ),
        accessorKey: 'invoice_number',
        sortKey: 'invoice_number',
        width: '120px',
        align: 'center',
      },
      {
        header: 'الفاتورة الأصلية',
        accessor: (row: SalesReturnRow) => (
          <div className="flex items-center gap-2 max-md:gap-2">
            <FileText size={12} className="text-blue-500" />
            <span className="font-mono font-bold text-blue-600">
              {row.reference_invoice?.invoice_number
                ? `#${row.reference_invoice.invoice_number}`
                : row.reference_invoice_id
                  ? `#${row.reference_invoice_id.substring(0, 8)}`
                  : '---'}
            </span>
          </div>
        ),
        accessorKey: 'reference_invoice_id',
        sortKey: 'reference_invoice_id',
        width: '140px',
        align: 'center',
      },
      {
        header: 'العميل',
        accessor: (row: SalesReturnRow) => (
          <span className="font-bold">{row.party?.name || 'عميل نقدي'}</span>
        ),
        accessorKey: 'party.name',
        sortKey: 'party_name',
        align: 'center',
      },
      {
        header: 'الأصناف والقطع المرتجعة',
        accessor: (row: SalesReturnRow) => {
          const items = Array.isArray(row.invoice_items) ? row.invoice_items : [];
          if (items.length === 0) {
            return (
              <span className="text-[11px] text-gray-400 dark:text-slate-500">لا توجد أصناف</span>
            );
          }
          return (
            <div className="flex flex-col gap-1 py-1">
              <div className="flex flex-wrap gap-1">
                {items.slice(0, 2).map((item, idx) => {
                  const name = item.product?.name_ar || item.description || 'صنف غير محدد';
                  const partNo = item.product?.part_number;
                  return (
                    <span
                      key={item.id || idx}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                      title={`السعر: ${item.unit_price ?? 0} | الكمية: ${item.quantity ?? 0}${partNo ? ` | رقم القطعة: ${partNo}` : ''}`}
                    >
                      <Package size={11} className="shrink-0 text-rose-500" />
                      <span className="font-semibold">{name}</span>
                      {partNo && (
                        <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                          [{partNo}]
                        </span>
                      )}
                      <span className="font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400">
                        ×{item.quantity}
                      </span>
                    </span>
                  );
                })}
              </div>
              {items.length > 2 && (
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  +{items.length - 2} أصناف أخرى
                </span>
              )}
            </div>
          );
        },
        accessorKey: 'invoice_items.length',
        sortKey: 'item_count',
        width: '260px',
      },
      {
        header: 'العملة',
        accessor: (row: SalesReturnRow) => (
          <span className="text-xs font-bold text-gray-500">{row.currency_code || '---'}</span>
        ),
        accessorKey: 'currency_code',
        width: '80px',
        align: 'center',
      },
      {
        header: 'المبلغ الإجمالي',
        accessor: (row: SalesReturnRow) => {
          const curr = (row.currency_code || 'SAR').toUpperCase();
          const baseAmt = Number(row.total_amount) || 0;
          const docAmt = Number(row.total_document_amount) || 0;
          const displayAmt = curr !== 'SAR' && docAmt > 0 ? docAmt : baseAmt;
          return (
            <div className="flex flex-col items-center font-bold">
              <span className="text-red-500">-{formatCurrency(displayAmt, curr)}</span>
              {curr !== 'SAR' && baseAmt > 0 && (
                <span className="font-mono text-[10px] text-slate-400">
                  ≈ {formatCurrency(baseAmt, 'SAR')}
                </span>
              )}
            </div>
          );
        },
        accessorKey: 'total_amount',
        sortKey: 'total_amount',
        align: 'center',
      },
      {
        header: 'تاريخ الإرجاع',
        accessor: (row: SalesReturnRow) => (
          <span className="text-xs text-gray-500">
            {new Date(row.issue_date || row.created_at || '').toLocaleDateString('ar-SA-u-nu-latn')}
          </span>
        ),
        accessorKey: 'issue_date',
        sortKey: 'issue_date',
        width: '120px',
        align: 'center',
      },
      {
        header: 'الحالة',
        accessor: (row: SalesReturnRow) => (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              row.status === 'posted' || row.status === 'paid'
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
            }`}
          >
            {STATUS_LABELS[row.status ?? ''] || row.status}
          </span>
        ),
        accessorKey: 'status',
        width: '100px',
        align: 'center',
      },
      {
        header: 'الإجراءات',
        accessor: (row: SalesReturnRow) => (
          <div className="flex items-center justify-center gap-1 max-md:gap-1">
            <button
              onMouseEnter={() => {
                onPrefetchDetails(row.id);
              }}
              onClick={e => {
                e.stopPropagation();
                onViewDetails(row.id);
              }}
              className="rounded-lg p-1 text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 max-md:p-1.5"
              title="معاينة تفاصيل المرتجع"
            >
              <Eye size={14} />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                if (
                  window.confirm(
                    'هل أنت متأكد من حذف هذا المرتجع؟ سيتم إلغاء أثره المالي والمخزني.'
                  )
                ) {
                  onDeleteInvoice(row.id);
                }
              }}
              disabled={isDeleting}
              className="rounded-lg p-1 text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 max-md:p-1.5"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
        width: '100px',
        align: 'center',
      },
    ],
    [onPrefetchDetails, onViewDetails, onDeleteInvoice, isDeleting]
  );
}
