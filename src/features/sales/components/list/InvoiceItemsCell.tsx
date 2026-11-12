import React, { useState } from 'react';
import { Package } from 'lucide-react';
import type { MatchedInvoiceItem } from '../../types';

interface Props {
  items?: MatchedInvoiceItem[] | undefined;
  totalCount?: number | undefined;
}

export const InvoiceItemsCell: React.FC<Props> = ({ items, totalCount }) => {
  const [expanded, setExpanded] = useState(false);
  const list = items || [];
  if (list.length === 0) {
    return (
      <span className="text-[11px] text-gray-400 dark:text-slate-500">
        {totalCount && totalCount > 0 ? `${totalCount} أصناف` : 'لا توجد أصناف'}
      </span>
    );
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
                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
            }`}
            title={`السعر: ${item.unit_price} | الكمية: ${item.quantity}${item.part_number ? ` | رقم القطعة: ${item.part_number}` : ''}${item.brand ? ` | الماركة: ${item.brand}` : ''}`}
          >
            <Package size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
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

