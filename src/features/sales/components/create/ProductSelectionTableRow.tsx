import React, { useMemo } from 'react';
import { Plus, Eye as EyeIcon, ArrowRightLeft, ExternalLink } from 'lucide-react';
import type { Product } from '../../../inventory/types';
import type { ColumnConfig } from '../../hooks/useProductTableConfig';
import { BranchStockAvailabilityCell } from '../../../inventory/components/products/BranchStockAvailabilityCell';
import { summarizeProductBranchAvailability } from '../../../inventory/utils/branchStockSummary';
import { buildGoogleSearchUrl } from '../../../ai/automotiveCrossSell';
import { EntityInfoDot } from '../../../entity-inspector';

interface ProductSelectionTableRowProps {
  product: Product;
  index: number;
  visibleColumns: ColumnConfig[];
  effectiveBranchId: string | null;
  mode: 'sale' | 'purchase' | 'quotation';
  fontSizeClass: string;
  isFocused: boolean;
  onSelect: (product: Product) => void;
  onViewProduct: (product: Product) => void;
  onRequestFromBranch: (product: Product) => void;
  onRowClick: (product: Product) => void;
  onMouseEnter: () => void;
}

export const ProductSelectionTableRow: React.FC<ProductSelectionTableRowProps> = React.memo(({
  product,
  index,
  visibleColumns,
  effectiveBranchId,
  mode,
  fontSizeClass,
  isFocused,
  onSelect,
  onViewProduct,
  onRequestFromBranch,
  onRowClick,
  onMouseEnter,
}) => {
  const branchAvailability = useMemo(
    () => summarizeProductBranchAvailability(product, effectiveBranchId),
    [product, effectiveBranchId]
  );
  const googleUrl = useMemo(
    () =>
      buildGoogleSearchUrl({
        name: product.name || product.name_ar,
        partNumber: product.part_number,
        brand: product.brand,
      }),
    [product.name, product.name_ar, product.part_number, product.brand]
  );
  const renderCellContent = (col: ColumnConfig) => {
    switch (col.id) {
      case 'index':
        return <span className="font-mono opacity-50">{index + 1}</span>;
      case 'name':
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <EntityInfoDot
              type="product"
              id={product.id}
              label={product.name || product.name_ar}
              size="sm"
            />
            <span className="block truncate text-sm font-bold">{product.name}</span>
          </div>
        );
      case 'part_number':
        return (
          <span
            className="block truncate font-mono text-sm font-bold text-gray-700 dark:text-gray-300"
            dir="ltr"
          >
            {product.part_number || product.alternative_numbers || '---'}
          </span>
        );
      case 'brand':
        return (
          <span className="block truncate font-bold opacity-60">{product.brand || '---'}</span>
        );
      case 'branch': {
        return (
          <BranchStockAvailabilityCell
            product={product}
            activeBranchId={effectiveBranchId}
            compact
            maxVisiblePills={2}
          />
        );
      }
      case 'stock': {
        const qty = product.stock_quantity;
        const isLow = qty <= product.min_stock_level;
        return (
          <span className={`font-mono text-sm font-black ${isLow ? 'text-red-500' : ''}`}>
            {qty}
          </span>
        );
      }
      case 'price':
        return (
          <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-400">
            {mode === 'purchase' ? product.cost_price : product.selling_price || product.sale_price}
          </span>
        );
      case 'size':
        return <span className="block truncate opacity-70">{product.size || '---'}</span>;
      case 'specs':
        return (
          <span className="block truncate opacity-70" title={product.specifications || ''}>
            {product.specifications || '---'}
          </span>
        );
      case 'actions':
        return (
          <div
            className="flex items-center justify-center gap-1 max-md:gap-1"
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onSelect(product);
              }}
              className="rounded bg-emerald-100 p-1 text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 max-md:p-1"
              title="إضافة مباشرة بنقرة واحدة"
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onRequestFromBranch(product);
              }}
              className={`rounded p-1 transition-colors max-md:p-1 ${
                branchAvailability.availableOnlyInOtherBranches
                  ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-400/70 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50'
              }`}
              title={
                branchAvailability.availableOnlyInOtherBranches
                  ? 'غير متوفر بفرعك ومتوفر بفروع أخرى — اضغط لطلب مناقلة'
                  : 'طلب القطعة من فرع آخر'
              }
            >
              <ArrowRightLeft size={12} />
            </button>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                e.stopPropagation();
              }}
              className="rounded bg-sky-50 p-1 text-sky-600 transition-colors hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 max-md:p-1"
              title="البحث عن القطعة في جوجل"
            >
              <ExternalLink size={12} />
            </a>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onViewProduct(product);
              }}
              className="rounded bg-gray-100 p-1 text-gray-600 transition-colors hover:bg-blue-100 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 max-md:p-1"
              title="معاينة التفاصيل"
            >
              <EyeIcon size={12} />
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <tr
      data-inspect-type="product"
      data-inspect-id={product.id}
      onClick={() => {
        onRowClick(product);
      }}
      onMouseEnter={onMouseEnter}
      title="انقر مرتين أو اضغط Enter لإضافة المنتج للفاتورة"
      className={`group cursor-pointer outline-none transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 ${fontSizeClass} ${
        isFocused ? 'bg-blue-100 ring-1 ring-blue-400 dark:bg-blue-900/40 dark:ring-blue-500' : ''
      }`}
    >
      {visibleColumns.map(col => (
        <td
          key={`${product.id}-${col.id}`}
          className={`border-l border-gray-200 px-2 py-1.5 last:border-l-0 dark:border-slate-700 ${
            col.id === 'index' || col.id === 'stock' || col.id === 'actions' ? 'text-center' : ''
          }`}
        >
          {renderCellContent(col)}
        </td>
      ))}
    </tr>
  );
});

ProductSelectionTableRow.displayName = 'ProductSelectionTableRow';
