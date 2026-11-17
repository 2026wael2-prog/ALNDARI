import React from 'react';
import { Minus, Package, Plus, Trash2 } from 'lucide-react';
import type { Product } from '../../types';

export interface TransferItemDraft {
  product: Product;
  quantity: number;
}

interface TransferSelectedItemsTableProps {
  items: TransferItemDraft[];
  totalQuantity: number;
  onUpdateQuantity: (productId: string, newQty: number) => void;
  onRemoveItem: (productId: string) => void;
}

/** Selected items list with inline quantity controls for branch transfer requests. */
export const TransferSelectedItemsTable: React.FC<TransferSelectedItemsTableProps> = ({
  items,
  totalQuantity,
  onUpdateQuantity,
  onRemoveItem,
}) => (
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
        قائمة الأصناف المطلوبة للمناقلة ({items.length})
      </span>
      <span className="text-[11px] text-slate-500">
        إجمالي الكميات:{' '}
        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
          {totalQuantity}
        </span>{' '}
        قطعة
      </span>
    </div>

    {items.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
        <Package size={32} className="mb-2 text-slate-300 dark:text-slate-600" />
        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
          لم يتم اختيار أي أصناف بعد
        </p>
        <p className="text-[11px] text-slate-400">
          استخدم شريط البحث أعلاه لإضافة قطع الغيار والمنتجات المطلوبة
        </p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-50/50 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
            <tr>
              <th className="py-2.5 pr-4">#</th>
              <th className="py-2.5">اسم الصنف</th>
              <th className="py-2.5">رقم القطعة (Part No)</th>
              <th className="py-2.5">الشركة الصانعة (Brand)</th>
              <th className="py-2.5 text-center">الكمية المطلوبة</th>
              <th className="py-2.5 pl-4 text-center">إزالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {items.map((item, idx) => (
              <tr
                key={item.product.id}
                className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
              >
                <td className="py-2.5 pr-4 font-mono text-slate-400">{idx + 1}</td>
                <td className="py-2.5">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {item.product.name_ar}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    كود: {item.product.sku}
                  </div>
                </td>
                <td className="py-2.5">
                  {item.product.part_number ? (
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                      {item.product.part_number}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2.5">
                  {item.product.brand ? (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      {item.product.brand}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2.5 text-center">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateQuantity(item.product.id, item.quantity - 1);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        onUpdateQuantity(item.product.id, isNaN(val) ? 1 : val);
                      }}
                      className="h-7 w-14 rounded-lg border border-slate-300 bg-white text-center font-mono text-xs font-black text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateQuantity(item.product.id, item.quantity + 1);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </td>
                <td className="py-2.5 pl-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveItem(item.product.id);
                    }}
                    className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
