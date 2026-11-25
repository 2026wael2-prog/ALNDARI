import React from 'react';
import { Trash2 } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import type { ItemAvailability, QuotationItemDraft } from '../../types';

interface QuotationBuilderItemsTableProps {
  items: QuotationItemDraft[];
  currency: string;
  onUpdateItem: <K extends keyof QuotationItemDraft>(
    index: number,
    field: K,
    value: QuotationItemDraft[K]
  ) => void;
  onRemoveItem: (index: number) => void;
}

export const QuotationBuilderItemsTable: React.FC<QuotationBuilderItemsTableProps> = ({
  items,
  currency,
  onUpdateItem,
  onRemoveItem,
}) => (
  <div className="overflow-hidden rounded-xl border border-slate-200 shadow-xs dark:border-slate-800">
    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
        بنود عرض السعر ({items.length})
      </h3>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead className="border-b border-slate-200 bg-slate-50/50 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/30">
          <tr>
            <th className="w-8 p-2 text-center">#</th>
            <th className="min-w-[180px] p-2">الصنف / OEM</th>
            <th className="w-16 p-2 text-center">الكمية</th>
            <th className="w-24 p-2 text-center">سعر الوحدة</th>
            <th className="w-16 p-2 text-center">الخصم %</th>
            <th className="w-24 p-2 text-center">الإجمالي</th>
            <th className="w-24 p-2 text-center">التوفر</th>
            <th className="w-8 p-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item, idx) => (
            <tr
              key={idx}
              className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
            >
              <td className="p-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
              <td className="p-2">
                <div className="font-bold leading-tight text-slate-900 dark:text-white">
                  {item.product_name}
                </div>
                {item.oem_number && (
                  <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                    OEM: {item.oem_number}
                  </span>
                )}
              </td>
              <td className="p-2">
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  value={item.quantity}
                  onChange={e => {
                    onUpdateItem(idx, 'quantity', Number(e.target.value) || 1);
                  }}
                  className="w-full rounded border border-slate-200 bg-[var(--app-surface)] py-1 text-center text-xs font-bold dark:border-slate-700"
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.unit_price}
                  onChange={e => {
                    onUpdateItem(idx, 'unit_price', Number(e.target.value) || 0);
                  }}
                  className="w-full rounded border border-slate-200 bg-[var(--app-surface)] py-1 text-center font-mono text-xs font-bold dark:border-slate-700"
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={item.discount_percentage}
                  onChange={e => {
                    onUpdateItem(idx, 'discount_percentage', Number(e.target.value) || 0);
                  }}
                  className="w-full rounded border border-slate-200 bg-[var(--app-surface)] py-1 text-center text-xs font-bold text-rose-500 dark:border-slate-700"
                />
              </td>
              <td
                className="p-2 text-center font-mono text-xs font-bold text-slate-900 dark:text-white"
                dir="ltr"
              >
                {formatCurrency(item.total_price, currency)}
              </td>
              <td className="p-2">
                <select
                  value={item.availability}
                  onChange={e => {
                    onUpdateItem(idx, 'availability', e.target.value as ItemAvailability);
                  }}
                  className="w-full rounded border border-slate-200 bg-[var(--app-surface)] px-1 py-1 text-[11px] dark:border-slate-700"
                >
                  <option value="in_stock">متوفر</option>
                  <option value="on_order">تحت الطلب</option>
                  <option value="unavailable">غير متوفر</option>
                </select>
              </td>
              <td className="p-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    onRemoveItem(idx);
                  }}
                  className="p-1 text-slate-400 transition-colors hover:text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <div className="py-8 text-center text-slate-400">
          <p className="text-xs">
            لا توجد بنود مضافة لعرض السعر. استخدم شريط البحث أعلاه لإضافة أصناف.
          </p>
        </div>
      )}
    </div>
  </div>
);
