import { useMemo } from 'react';
import { formatNumberDisplay } from '../../../../core/utils';
import type { Column } from '../../../../ui/common/ExcelTable';
import type { Product } from '../../types';

/** Builds strategic supplier, safety-stock, and inventory status columns for CoreProductsView. */
export function useCoreStrategicColumns(
  productSupplierMap: Record<string, string | undefined>
): Array<Column<Product>> {
  return useMemo(
    () => [
      {
        header: 'المورد',
        accessor: p => {
          const supName = productSupplierMap[p.id] ?? p.supplier_name ?? '—';
          return (
            <span
              className="inline-block max-w-[120px] truncate text-[11px] font-bold text-slate-700 dark:text-slate-300"
              title={supName}
            >
              {supName}
            </span>
          );
        },
        width: 'w-28',
        className: 'text-center',
      },
      {
        header: 'حد الأمان',
        accessor: p => (
          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
            {formatNumberDisplay(p.min_stock_level || 0)} {p.unit || 'قطعة'}
          </span>
        ),
        width: 'w-24',
        className: 'text-center',
        sortKey: 'min_stock_level',
      },
      {
        header: 'موقف المخزون',
        accessor: p => {
          const qty = p.stock_quantity;
          const min = p.min_stock_level || 0;
          const isCritical = Boolean(p.isLowStock) && qty > 0;
          const isOut = qty <= 0;

          if (isOut) {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-extrabold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                نافد كلياً
              </span>
            );
          }
          if (isCritical) {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                حرج ({formatNumberDisplay(qty)} / {formatNumberDisplay(min || 3)})
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              متوفر بأمان
            </span>
          );
        },
        width: 'w-32',
        className: 'text-center',
      },
    ],
    [productSupplierMap]
  );
}
