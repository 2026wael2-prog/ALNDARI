import React, { useMemo } from 'react';
import { ArrowLeftRight, Eye, FileSpreadsheet, Trash2, Edit } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import type { InvoiceListItem } from '../../types';
import { InvoiceItemsCell } from './InvoiceItemsCell';
import { getStatusLabel } from './InvoiceStatusBadge';
import { EntityInfoDot } from '../../../entity-inspector';

interface UseInvoiceListColumnsParams {
  handleViewDetails: (id: string) => void;
  handleDelete: (e: React.MouseEvent, row: InvoiceListItem) => void;
  handleShareExcel: (e: React.MouseEvent, row: InvoiceListItem) => void;
  handlePrefetchDetails: (id: string) => void;
  handleEditInvoice?: (id: string) => void;
  isDeleting: boolean;
}

/**
 * Column definitions for the Sales / Returns ExcelTable.
 */
export const useInvoiceListColumns = ({
  handleViewDetails,
  handleDelete,
  handleShareExcel,
  handlePrefetchDetails,
  handleEditInvoice,
  isDeleting,
}: UseInvoiceListColumnsParams) =>
  useMemo(
    () => [
      {
        header: 'رقم الفاتورة',
        accessorKey: 'invoiceNumber' as keyof InvoiceListItem,
        accessor: (row: InvoiceListItem) => (
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5">
              {row.type === 'sale_return' && (
                <ArrowLeftRight size={13} className="shrink-0 text-rose-500" />
              )}
              <span
                dir="ltr"
                className={`font-mono font-bold ${row.type === 'sale_return' ? 'text-rose-600' : 'text-blue-600'}`}
              >
                #{row.invoiceNumber}
              </span>
              <EntityInfoDot
                type="invoice"
                id={row.id}
                label={`#${row.invoiceNumber}`}
                subType={row.type}
                size="xs"
              />
            </div>
            {row.invoiceNumber.endsWith('-INT') && (
              <span
                className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                title="فاتورة داخلية نتيجة مبيعات متقاطعة عبر الفروع"
              >
                🔄 نقل داخلي
              </span>
            )}
          </div>
        ),
        width: 'w-40',
      },
      {
        header: 'العميل',
        accessorKey: 'customerName' as keyof InvoiceListItem,
        accessor: (row: InvoiceListItem) => (
          <div className="flex flex-col gap-1">
            <span className="font-bold text-gray-800 dark:text-slate-100" title={row.customerName}>
              {row.customerName}
            </span>
            {row.partyPhone && (
              <span className="font-mono text-[10px] text-gray-500 dark:text-slate-400">
                {row.partyPhone}
              </span>
            )}
          </div>
        ),
        width: 'w-52',
      },
      {
        header: 'الأصناف والقطع',
        accessor: (row: InvoiceListItem) => (
          <InvoiceItemsCell items={row.matchedItems} totalCount={row.itemCount} />
        ),
        width: 'w-72',
      },
      {
        header: 'التاريخ',
        accessorKey: 'date' as keyof InvoiceListItem,
        accessor: (row: InvoiceListItem) => (
          <span className="font-mono text-xs text-gray-500 dark:text-slate-400">{row.date}</span>
        ),
        width: 'w-24',
      },
      {
        header: 'طريقة الدفع',
        accessorKey: 'paymentMethod' as keyof InvoiceListItem,
        accessor: (row: InvoiceListItem) => (
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
              row.paymentMethod === 'cash'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            }`}
          >
            {row.paymentMethod === 'cash' ? 'نقدي' : 'أجل'}
          </span>
        ),
        width: 'w-20',
        className: 'text-center',
      },
      {
        header: 'الإجمالي',
        sortKey: 'total' as keyof InvoiceListItem,
        accessor: (row: InvoiceListItem) => {
          const hasForeignCurrency = row.currencyCode && row.currencyCode !== 'SAR';
          const rateIsNotOne = row.exchangeRate && row.exchangeRate !== 1;
          const showBaseLine =
            hasForeignCurrency &&
            rateIsNotOne &&
            (row.baseTotal - row.total > 0.01 || row.total - row.baseTotal > 0.01);
          return (
            <div className="flex flex-col items-end leading-tight">
              <span
                dir="ltr"
                className={`font-mono text-sm font-bold md:text-base ${row.type === 'sale_return' ? 'text-rose-600' : 'text-emerald-600'}`}
              >
                {formatCurrency(row.total, row.currencyCode)}
              </span>
              {showBaseLine && (
                <span dir="ltr" className="mt-0.5 text-xs font-bold text-blue-500">
                  ≈ {formatCurrency(row.baseTotal, 'SAR')}
                </span>
              )}
            </div>
          );
        },
        width: 'w-32',
        className: 'text-left',
      },
      {
        header: 'الحالة',
        accessorKey: 'status' as keyof InvoiceListItem,
        sortKey: 'status' as keyof InvoiceListItem,
        accessor: (row: InvoiceListItem) => {
          const s = getStatusLabel(row.status || '');
          return (
            <span className={`rounded px-2 py-1 text-[10px] font-bold ${s.cls}`}>{s.label}</span>
          );
        },
        width: 'w-24',
        className: 'text-center',
      },
      {
        header: 'إجراءات',
        accessor: (row: InvoiceListItem) => {
          const isInternal = row.invoiceNumber?.endsWith('-INT');
          return (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={e => handleShareExcel(e, row)}
                className="rounded p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                title="تنزيل / مشاركة Excel"
                aria-label="تنزيل أو مشاركة Excel"
              >
                <FileSpreadsheet size={15} />
              </button>
              {handleEditInvoice && !isInternal && row.type === 'sale' && row.status !== 'void' && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleEditInvoice(row.id);
                  }}
                  className="rounded p-1.5 text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                  title="تعديل الفاتورة"
                  aria-label="تعديل الفاتورة"
                >
                  <Edit size={15} />
                </button>
              )}
              <button
                type="button"
                onMouseEnter={() => {
                  handlePrefetchDetails(row.id);
                }}
                onClick={() => {
                  handleViewDetails(row.id);
                }}
                className="rounded p-1.5 text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-800"
                title="معاينة تفاصيل الفاتورة"
                aria-label="معاينة تفاصيل الفاتورة"
              >
                <Eye size={15} />
              </button>
              {!isInternal && (
                <button
                  type="button"
                  onClick={e => {
                    handleDelete(e, row);
                  }}
                  disabled={isDeleting}
                  title="حذف / إلغاء الفاتورة"
                  aria-label="حذف أو إلغاء الفاتورة"
                  className="rounded p-1.5 text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        },
        width: 'w-28',
        className: 'text-center',
      },
    ],
    [handleViewDetails, handleDelete, handleShareExcel, handlePrefetchDetails, handleEditInvoice, isDeleting]
  );
