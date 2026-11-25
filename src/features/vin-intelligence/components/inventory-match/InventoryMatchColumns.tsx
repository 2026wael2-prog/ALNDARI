import React from 'react';
import { Link2, Unlink2 } from 'lucide-react';
import type { Column } from '../../../../ui/common/ExcelTable';
import { cn } from '../../../../core/utils';
import type { MatchingInventoryProduct } from '../../types';
import { isPresent } from './inventoryMatchUtils';

const BADGE_CLASSES: Record<string, string> = {
  CONFIRMED:
    'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60',
  POSSIBLE:
    'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60',
  NOT_COMPATIBLE:
    'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60',
};
const DEFAULT_BADGE_CLASS =
  'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';

const BADGE_LABELS: Record<string, string> = {
  CONFIRMED: 'مؤكد ✓',
  POSSIBLE: 'محتمل ⚡',
  NOT_COMPATIBLE: 'غير متوافق ✕',
  UNKNOWN: 'غير محدد',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${BADGE_CLASSES[status] ?? DEFAULT_BADGE_CLASS}`}
  >
    {BADGE_LABELS[status] ?? status}
  </span>
);

export interface ProductColumnContext {
  linkedMap: Map<string, string>;
  isLinking: boolean;
  isLinkedLoading: boolean;
  onLink: (productId: string) => void;
  onUnlink: (linkId: string) => void;
}

const ProductActionsCell: React.FC<{
  row: MatchingInventoryProduct;
  context: ProductColumnContext;
}> = ({ row, context }) => {
  const linkId = isPresent(row.link_id) ? row.link_id : context.linkedMap.get(row.product_id);

  if (linkId !== undefined) {
    return (
      <button
        type="button"
        onClick={() => {
          context.onUnlink(linkId);
        }}
        disabled={context.isLinkedLoading}
        title="إلغاء ربط القطعة من هذه المركبة"
        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 shadow-xs transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      >
        <Unlink2 size={11} /> إلغاء الربط
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        context.onLink(row.product_id);
      }}
      disabled={context.isLinking}
      title="تأكيد وربط القطعة بهذه المركبة"
      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50"
    >
      <Link2 size={11} /> ربط
    </button>
  );
};

export function createProductColumns(
  context: ProductColumnContext
): Array<Column<MatchingInventoryProduct>> {
  return [
    {
      header: 'SKU',
      accessor: row => (
        <span className="rounded-md border border-slate-200/60 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300">
          {row.sku}
        </span>
      ),
      width: '110px',
    },
    {
      header: 'رقم القطعة (OEM)',
      accessor: row => (
        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
          {row.part_number ?? '—'}
        </span>
      ),
      width: '130px',
    },
    {
      header: 'اسم المنتج في المخزون',
      accessor: row => (
        <div className="flex flex-col py-0.5">
          <span className="text-xs font-bold leading-snug text-slate-900 dark:text-slate-100">
            {row.name_ar}
          </span>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
            المصدر: {row.match_source}
          </span>
        </div>
      ),
    },
    {
      header: 'الماركة',
      accessor: row => (
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {row.brand ?? '—'}
        </span>
      ),
      width: '100px',
    },
    {
      header: 'الكمية المتوفرة',
      accessor: row => {
        const qty = row.quantity ?? 0;
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold',
              qty > 0
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            )}
          >
            {qty}
          </span>
        );
      },
      width: '100px',
    },
    {
      header: 'سعر البيع',
      accessor: row => (
        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
          {row.sale_price ? row.sale_price.toLocaleString() : '—'}
        </span>
      ),
      width: '90px',
    },
    {
      header: 'التوافق',
      accessor: row => <StatusBadge status={row.compatibility_status} />,
      width: '110px',
    },
    {
      header: 'الإجراءات',
      accessor: row => <ProductActionsCell row={row} context={context} />,
      width: '100px',
    },
  ];
}
