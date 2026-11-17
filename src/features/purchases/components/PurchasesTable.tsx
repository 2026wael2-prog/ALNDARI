import React from 'react';
import ExcelTable from '../../../ui/common/ExcelTable';
import MicroListItem from '../../../ui/common/MicroListItem';
import { formatCurrency, toBaseCurrency } from '../../../core/utils';
import { Eye, Trash2, ArrowLeftRight, ShoppingCart, Printer, Package } from 'lucide-react';
import { useDeletePurchase } from '../hooks';
import type { MatchedInvoiceItem } from '@/core/types/invoiceSearch';

export interface PurchaseTableRow {
  id: string;
  type: string;
  party: { name: string | null } | null;
  invoice_number: string | null;
  issue_date: string;
  status: string;
  payment_method: string | null;
  total_amount: number;
  currency_code: string | null;
  exchange_rate: number | null;
  matched_items?: MatchedInvoiceItem[];
  party_phone?: string | null;
}
interface PurchasesTableProps {
  data: PurchaseTableRow[];
  isLoading: boolean;
  onView: (id: string) => void;
}
type DeletePurchase = (id: string) => void;

const getSupplierName = (row: PurchaseTableRow): string => row.party?.name ?? 'مورد عام';
const getBaseAmount = (row: PurchaseTableRow): number =>
  toBaseCurrency({
    amount: row.total_amount,
    currency_code: row.currency_code ?? 'SAR',
    exchange_rate: row.exchange_rate ?? 1,
  });
const hasForeignCurrency = (row: PurchaseTableRow): boolean =>
  row.currency_code !== null && row.currency_code !== '' && row.currency_code !== 'SAR';

const getPurchaseStatusMeta = (
  status: string
): { label: string; color: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate'; badgeCls: string } => {
  if (status === 'paid') {
    return {
      label: 'مدفوع',
      color: 'emerald',
      badgeCls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    };
  }
  if (status === 'posted') {
    return {
      label: 'مرحّل',
      color: 'blue',
      badgeCls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    };
  }
  if (status === 'partially_paid') {
    return {
      label: 'مدفوع جزئياً',
      color: 'amber',
      badgeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    };
  }
  if (status === 'void' || status === 'cancelled') {
    return {
      label: 'ملغي (عكسي)',
      color: 'rose',
      badgeCls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    };
  }
  return {
    label: 'مسودة',
    color: 'slate',
    badgeCls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
  };
};

const MobilePurchaseList = ({
  data,
  onView,
  onDelete,
  isDeleting,
}: {
  data: PurchaseTableRow[];
  onView: (id: string) => void;
  onDelete: DeletePurchase;
  isDeleting: boolean;
}): React.ReactElement => (
  <div className="grid grid-cols-1 gap-2 md:hidden">
    {data.map(item => {
      const statusMeta = getPurchaseStatusMeta(item.status);
      return (
      <div
        key={item.id}
        className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]"
      >
        <MicroListItem
          icon={item.type === 'purchase_return' ? ArrowLeftRight : ShoppingCart}
          iconColorClass={item.type === 'purchase_return' ? 'text-rose-500' : 'text-blue-500'}
          title={getSupplierName(item)}
          subtitle={`#${item.invoice_number ?? ''} | ${item.issue_date}`}
          onClick={() => {
            onView(item.id);
          }}
          tags={[
            {
              label: statusMeta.label,
              color: statusMeta.color,
            },
          ]}
          actions={
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onView(item.id);
                  }}
                  title="عرض التفاصيل / طباعة"
                  className="p-1 text-gray-500 hover:text-blue-600"
                >
                  <Printer size={16} />
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={e => {
                    e.stopPropagation();
                    if (
                      window.confirm(
                        'هل أنت متأكد من حذف/إلغاء فاتورة الشراء؟ سيتم عكس الأثر المالي والمخزني على الأرصدة والقيود تلقائياً.'
                      )
                    ) {
                      onDelete(item.id);
                    }
                  }}
                  title="حذف / إلغاء فاتورة الشراء"
                  className="p-1 text-rose-500 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
                <p dir="ltr" className="font-mono text-sm font-bold">
                  {formatCurrency(item.total_amount, item.currency_code ?? undefined)}
                </p>
              </div>
              {hasForeignCurrency(item) && (
                <p dir="ltr" className="text-xs font-bold text-blue-500">
                  {formatCurrency(getBaseAmount(item))}
                </p>
              )}
            </div>
          }
        />
        {item.matched_items && item.matched_items.length > 0 && (
          <div className="border-[var(--app-border)]/50 bg-[var(--app-bg)]/50 flex flex-wrap gap-1 border-t px-3 py-1.5">
            {item.matched_items.map(m => (
              <span
                key={m.id}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  m.is_direct_match
                    ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Package size={10} className="shrink-0 text-blue-600 dark:text-blue-400" />
                <span>{m.product_name}</span>
                {m.part_number && <span className="font-mono opacity-80">({m.part_number})</span>}
                <span className="font-mono font-bold">×{m.quantity}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      );
    })}
  </div>
);

const invoiceColumn = {
  header: 'رقم الفاتورة',
  accessor: (row: PurchaseTableRow): React.ReactElement => (
    <div className="flex items-center gap-2">
      {row.type === 'purchase_return' && <ArrowLeftRight size={14} className="text-red-500" />}
      <span
        dir="ltr"
        className={`font-mono font-bold ${row.type === 'purchase_return' ? 'text-red-700' : 'text-blue-700'}`}
      >
        {row.invoice_number ?? ''}
      </span>
    </div>
  ),
  width: '160px',
};
const dateColumn = {
  header: 'التاريخ',
  accessor: (row: PurchaseTableRow): React.ReactElement => (
    <span dir="ltr" className="font-mono font-bold text-gray-500">
      {row.issue_date}
    </span>
  ),
  width: '130px',
};
const PurchaseItemsCell = ({
  items,
}: {
  items?: MatchedInvoiceItem[] | undefined;
}): React.ReactElement => {
  const [expanded, setExpanded] = React.useState(false);
  const list = items || [];
  if (list.length === 0) {
    return <span className="text-[11px] text-gray-400 dark:text-slate-500">لا توجد أصناف مسجلة</span>;
  }

  const visibleItems = expanded ? list : list.slice(0, 2);
  const remainingCount = list.length - visibleItems.length;

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex flex-wrap gap-1">
        {visibleItems.map(item => (
          <span
            key={item.id}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              item.is_direct_match
                ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300'
                : 'bg-slate-100 text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
            }`}
            title={`التكلفة: ${item.unit_price} | الكمية: ${item.quantity}${item.part_number ? ` | رقم القطعة: ${item.part_number}` : ''}${item.brand ? ` | الماركة: ${item.brand}` : ''}`}
          >
            <Package size={11} className="shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold">{item.product_name}</span>
            {item.part_number && (
              <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                [{item.part_number}]
              </span>
            )}
            <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              ×{item.quantity}
            </span>
          </span>
        ))}
      </div>
      {list.length > 2 && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="cursor-pointer self-start text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          {expanded ? 'عرض أقل ▴' : `+${remainingCount} أصناف أخرى ▾`}
        </button>
      )}
    </div>
  );
};

const supplierColumn = {
  header: 'المورد',
  accessor: (row: PurchaseTableRow): React.ReactElement => (
    <div className="flex flex-col gap-1">
      <span className="font-bold text-gray-800 dark:text-slate-200">{getSupplierName(row)}</span>
      {row.party_phone && (
        <span className="font-mono text-[10px] text-gray-500 dark:text-slate-400">
          {row.party_phone}
        </span>
      )}
    </div>
  ),
  width: '150px',
};

const itemsColumn = {
  header: 'الأصناف والقطع',
  accessor: (row: PurchaseTableRow): React.ReactElement => (
    <PurchaseItemsCell items={row.matched_items} />
  ),
  width: '320px',
};

const paymentColumn = {
  header: 'طريقة الدفع',
  accessor: (row: PurchaseTableRow): React.ReactElement => (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-bold ${row.payment_method === 'cash' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}
    >
      {row.payment_method === 'cash' ? 'نقدي' : 'أجل'}
    </span>
  ),
  width: '100px',
  className: 'text-center',
};
const totalColumn = {
  header: 'إجمالي (الأساسي)',
  accessor: (row: PurchaseTableRow): React.ReactElement => (
    <div className="flex flex-col items-end">
      <span
        dir="ltr"
        className={`font-mono text-sm font-bold leading-none md:text-base ${row.type === 'purchase_return' ? 'text-rose-600' : 'text-emerald-600'}`}
      >
        {formatCurrency(row.total_amount, row.currency_code ?? undefined)}
      </span>
      {hasForeignCurrency(row) && (
        <span dir="ltr" className="mt-1 text-xs font-bold text-blue-500">
          {formatCurrency(getBaseAmount(row))}
        </span>
      )}
    </div>
  ),
  className: 'text-left',
};
const statusColumn = {
  header: 'الحالة',
  accessor: (row: PurchaseTableRow): React.ReactElement => {
    const statusMeta = getPurchaseStatusMeta(row.status);
    return (
      <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusMeta.badgeCls}`}>
        {statusMeta.label}
      </span>
    );
  },
  width: '100px',
  className: 'text-center',
};

const actionColumn = (
  onView: (id: string) => void,
  deletePurchase: DeletePurchase,
  isDeleting: boolean
): {
  header: string;
  accessor: (row: PurchaseTableRow) => React.ReactElement;
  width: string;
  className: string;
} => ({
  header: 'إجراءات',
  accessor: (row: PurchaseTableRow): React.ReactElement => {
    const handleDelete = (event: React.MouseEvent<HTMLButtonElement>): void => {
      event.stopPropagation();
      if (
        window.confirm(
          'هل أنت متأكد من حذف هذه الفاتورة؟ سيتم عكس أثرها المالي والمحاسبي والمخزني تلقائياً.'
        )
      )
        deletePurchase(row.id);
    };
    return (
      <div className="flex items-center justify-center gap-2">
        <button
          title="عرض التفاصيل / طباعة"
          onClick={() => {
            onView(row.id);
          }}
          className="rounded-lg p-1.5 text-blue-600 transition-colors"
        >
          <Eye size={18} />
        </button>
        <button
          title="حذف الفاتورة"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-900/20"
        >
          <Trash2 size={18} />
        </button>
      </div>
    );
  },
  width: '100px',
  className: 'text-center',
});

const DesktopPurchaseTable = ({
  data,
  onView,
}: {
  data: PurchaseTableRow[];
  onView: (id: string) => void;
}): React.ReactElement => {
  const { mutate: deletePurchase, isPending: isDeleting } = useDeletePurchase();
  const columns = [
    invoiceColumn,
    dateColumn,
    supplierColumn,
    itemsColumn,
    paymentColumn,
    totalColumn,
    statusColumn,
    actionColumn(onView, deletePurchase, isDeleting),
  ];
  return (
    <div className="flex hidden min-h-[480px] flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-[var(--app-surface)] shadow-sm dark:border-slate-800 md:block">
      <ExcelTable columns={columns} data={data} colorTheme="blue" />
    </div>
  );
};

const PurchasesTable: React.FC<PurchasesTableProps> = ({ data, isLoading, onView }) => {
  const { mutate: deletePurchase, isPending: isDeleting } = useDeletePurchase();
  if (isLoading)
    return (
      <div className="animate-pulse p-12 text-center text-gray-500">
        جاري مزامنة سجلات التوريد...
      </div>
    );
  return (
    <div className="space-y-4">
      <MobilePurchaseList
        data={data}
        onView={onView}
        onDelete={deletePurchase}
        isDeleting={isDeleting}
      />
      <DesktopPurchaseTable data={data} onView={onView} />
    </div>
  );
};

export default PurchasesTable;
