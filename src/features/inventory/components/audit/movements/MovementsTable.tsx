import React from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Package } from 'lucide-react';
import { cn, formatNumberDisplay } from '../../../../../core/utils';
import type { InventoryMovementFeedItem } from '../../../types';
import { getDocTypeMeta, type MovementSelectedProduct } from './docTypeLabels';

interface MovementsTableProps {
  movements: InventoryMovementFeedItem[];
  isLoading: boolean;
  onResetFilters: () => void;
  onSelectProduct: (product: MovementSelectedProduct) => void;
}

const buildSelectedProduct = (m: InventoryMovementFeedItem): MovementSelectedProduct => ({
  id: m.product_id,
  name_ar: m.product_name,
  sku: m.product_sku,
  part_number: m.product_part_number,
  brand: m.product_brand,
});

/** Interactive tabular grid displaying incoming and outgoing stock movements. */
export const MovementsTable: React.FC<MovementsTableProps> = ({
  movements,
  isLoading,
  onResetFilters,
  onSelectProduct,
}) => {
  return (
    <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-[var(--app-surface)] shadow-sm dark:border-slate-800">
      <div className="custom-scrollbar h-full overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[980px] border-collapse border border-slate-200 text-right text-xs dark:border-slate-800">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 text-[10px] font-black uppercase tracking-wider text-slate-600 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300">
            <tr>
              <th className="w-12 border border-slate-200 px-3 py-3 text-center dark:border-slate-800">
                #
              </th>
              <th className="w-36 border border-slate-200 px-3 py-3 dark:border-slate-800">
                التاريخ والوقت
              </th>
              <th className="w-44 border border-slate-200 px-3 py-3 dark:border-slate-800">
                نوع ورقم المستند
              </th>
              <th className="border border-slate-200 px-4 py-3 dark:border-slate-800">
                بيانات الصنف (الاسم / رقم القطعة / SKU)
              </th>
              <th className="w-44 border border-slate-200 px-3 py-3 dark:border-slate-800">
                الطرف المقابل / الفرع
              </th>
              <th className="w-24 border border-slate-200 px-3 py-3 text-center dark:border-slate-800">
                نوع الحركة
              </th>
              <th className="w-28 border border-slate-200 px-3 py-3 text-left dark:border-slate-800">
                الكمية
              </th>
              <th className="w-28 border border-slate-200 px-3 py-3 text-left dark:border-slate-800">
                الرصيد اللحظي
              </th>
              <th className="w-32 border border-slate-200 px-3 py-3 dark:border-slate-800">
                المستخدم
              </th>
              <th className="w-20 border border-slate-200 px-2 py-3 text-center dark:border-slate-800">
                كشف الصنف
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-20 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-600" />
                    <p className="text-xs font-bold text-slate-400">
                      جاري تحميل سجل الحركات المخزنية المباشر...
                    </p>
                  </div>
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Package size={36} className="opacity-30" />
                    <p className="text-xs font-bold">
                      لا توجد حركات مخزنية تطابق معايير البحث المحددة
                    </p>
                    <button
                      onClick={onResetFilters}
                      className="mt-1 text-xs font-black text-blue-600 hover:underline dark:text-blue-400"
                    >
                      إعادة تعيين الفلاتر
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              movements.map((m, idx) => {
                const isIncoming = m.movement_type === 'in';
                const docMeta = getDocTypeMeta(m.doc_type);
                const selectedProduct = buildSelectedProduct(m);

                return (
                  <tr
                    key={m.id || idx}
                    className="group cursor-pointer transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                    onClick={() => onSelectProduct(selectedProduct)}
                    title="انقر لعرض كشف الحساب والمسار التراكمي الكامل لهذا الصنف"
                  >
                    <td className="border border-slate-200/80 px-3 py-2.5 text-center font-mono text-[11px] font-bold text-slate-400 dark:border-slate-800/80">
                      {idx + 1}
                    </td>

                    <td className="whitespace-nowrap border border-slate-200/80 px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:border-slate-800/80 dark:text-slate-400">
                      {new Date(m.date).toLocaleString('en-GB', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </td>

                    <td className="border border-slate-200/80 px-3 py-2.5 dark:border-slate-800/80">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={cn(
                            'inline-block w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-black',
                            docMeta.badge
                          )}
                        >
                          {docMeta.label}
                        </span>
                        <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-100">
                          {m.doc_number}
                        </span>
                      </div>
                    </td>

                    <td className="border border-slate-200/80 px-4 py-2.5 dark:border-slate-800/80">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                          {m.product_name}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            SKU: {m.product_sku}
                          </span>
                          {m.product_part_number && (
                            <span className="font-mono">P/N: {m.product_part_number}</span>
                          )}
                          {m.product_brand && (
                            <span className="rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {m.product_brand}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="border border-slate-200/80 px-3 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-800/80 dark:text-slate-300">
                      <span className="block max-w-[180px] truncate" title={m.party_name}>
                        {m.party_name || '---'}
                      </span>
                    </td>

                    <td className="border border-slate-200/80 px-3 py-2.5 text-center dark:border-slate-800/80">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black',
                          isIncoming
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                        )}
                      >
                        {isIncoming ? (
                          <ArrowDownLeft size={10} strokeWidth={3} />
                        ) : (
                          <ArrowUpRight size={10} strokeWidth={3} />
                        )}
                        {isIncoming ? 'وارد' : 'صادر'}
                      </span>
                    </td>

                    <td
                      dir="ltr"
                      className={cn(
                        'border border-slate-200/80 px-3 py-2.5 text-left font-mono text-xs font-black dark:border-slate-800/80',
                        isIncoming ? 'text-emerald-600' : 'text-rose-600'
                      )}
                    >
                      {isIncoming ? '+' : '-'}
                      {formatNumberDisplay(m.quantity)}
                    </td>

                    <td
                      dir="ltr"
                      className="border border-slate-200/80 px-3 py-2.5 text-left font-mono text-xs font-bold text-slate-700 dark:border-slate-800/80 dark:text-slate-300"
                    >
                      {formatNumberDisplay(m.current_stock)}
                    </td>

                    <td className="border border-slate-200/80 px-3 py-2.5 dark:border-slate-800/80">
                      <span className="block max-w-[120px] truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {m.user_name?.split('@')[0] || 'النظام'}
                      </span>
                    </td>

                    <td
                      className="border border-slate-200/80 px-2 py-2.5 text-center dark:border-slate-800/80"
                      onClick={e => {
                        e.stopPropagation();
                        onSelectProduct(selectedProduct);
                      }}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-900/30"
                        title="عرض كشف حساب هذا الصنف بالتفصيل"
                      >
                        <ChevronLeft size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
