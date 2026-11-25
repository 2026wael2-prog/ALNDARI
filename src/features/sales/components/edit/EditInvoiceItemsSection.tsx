import React, { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useProductSearch, type ProductSearchResult } from '../../hooks/useProductSearch';
import { formatCurrency } from '../../../../core/utils';
import { EntityInfoDot } from '../../../entity-inspector';
import { CalculatorInput } from '@/ui/common/CalculatorInput';
import type { EditItemRow } from './useEditInvoiceForm';

interface EditInvoiceItemsSectionProps {
  companyId: string;
  currencyCode: string;
  items: EditItemRow[];
  onAddProduct: (product: ProductSearchResult) => void;
  onQuantityChange: (index: number, qty: number) => void;
  onUnitPriceChange: (index: number, price: number) => void;
  onDiscountChange: (index: number, discount: number) => void;
  onRemoveItem: (index: number) => void;
}

export const EditInvoiceItemsSection: React.FC<EditInvoiceItemsSectionProps> = ({
  companyId,
  currencyCode,
  items,
  onAddProduct,
  onQuantityChange,
  onUnitPriceChange,
  onDiscountChange,
  onRemoveItem,
}) => {
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);

  const { products: searchResults, isLoading: searchLoading } = useProductSearch(
    productSearchTerm,
    {
      companyId,
      debounceMs: 250,
      enabled: Boolean(companyId) && productSearchTerm.trim().length >= 2,
    }
  );

  const handleSelectProduct = (prod: ProductSearchResult) => {
    onAddProduct(prod);
    setProductSearchTerm('');
    setIsProductSearchOpen(false);
  };

  return (
    <>
      {/* Product Search & Addition */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
            />
            <input
              type="text"
              placeholder="ابحث عن صنف لإضافته إلى الفاتورة (بالاسم أو SKU أو الباركود)..."
              value={productSearchTerm}
              onChange={e => {
                setProductSearchTerm(e.target.value);
                setIsProductSearchOpen(true);
              }}
              onFocus={() => setIsProductSearchOpen(true)}
              className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] py-2.5 pl-4 pr-10 text-xs font-medium text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
            />
            {searchLoading && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                جاري البحث...
              </div>
            )}
          </div>
        </div>

        {isProductSearchOpen && productSearchTerm.trim().length >= 2 && (
          <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-300 bg-[var(--app-surface)] shadow-2xl dark:border-slate-700">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--app-text-secondary)]">
                لم يتم العثور على أصناف مطابقة.
              </div>
            ) : (
              <table className="w-full border-collapse text-right text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 text-[11px] font-black uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="w-8 border-l border-slate-300 px-2 py-2 text-center dark:border-slate-700">#</th>
                    <th className="border-l border-slate-300 px-3 py-2 text-start font-black dark:border-slate-700">
                      اسم المنتج
                    </th>
                    <th className="w-32 border-l border-slate-300 px-2.5 py-2 text-center font-black dark:border-slate-700">
                      رقم المنتج
                    </th>
                    <th className="w-28 border-l border-slate-300 px-2.5 py-2 text-center font-black dark:border-slate-700">
                      الشركة الصانعة
                    </th>
                    <th className="w-24 border-l border-slate-300 px-2.5 py-2 text-center font-black dark:border-slate-700">
                      السعر
                    </th>
                    <th className="w-20 border-l border-slate-300 px-2 py-2 text-center font-black dark:border-slate-700">
                      المخزون
                    </th>
                    <th className="w-16 px-2 py-2 text-center font-black">إضافة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-[var(--app-surface)] dark:divide-slate-800">
                  {searchResults.map((prod, idx) => (
                    <tr
                      key={prod.id}
                      onClick={() => handleSelectProduct(prod)}
                      className="group cursor-pointer transition-colors hover:bg-amber-50/70 dark:hover:bg-amber-950/20"
                    >
                      <td className="border-l border-slate-200 px-2 py-2 text-center font-mono text-[11px] font-bold text-slate-400 dark:border-slate-800">
                        {idx + 1}
                      </td>
                      <td className="border-l border-slate-200 px-3 py-2 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 font-bold text-[var(--app-text)]">
                          <EntityInfoDot
                            type="product"
                            id={prod.id}
                            label={prod.name_ar}
                            size="sm"
                          />
                          <span className="truncate">{prod.name_ar}</span>
                        </div>
                      </td>
                      <td
                        className="border-l border-slate-200 px-2.5 py-2 text-center font-mono text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300"
                        dir="ltr"
                      >
                        {prod.part_number || prod.sku || '—'}
                      </td>
                      <td className="border-l border-slate-200 px-2.5 py-2 text-center font-bold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        {prod.brand || '—'}
                      </td>
                      <td
                        className="border-l border-slate-200 px-2.5 py-2 text-center font-mono text-xs font-black text-emerald-600 dark:border-slate-800 dark:text-emerald-400"
                        dir="ltr"
                      >
                        {formatCurrency(prod.sale_price, currencyCode)}
                      </td>
                      <td className="border-l border-slate-200 px-2 py-2 text-center font-mono text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300">
                        {prod.quantity ?? 0}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleSelectProduct(prod);
                          }}
                          className="rounded bg-blue-600/15 px-2 py-0.5 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-600 hover:text-white dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white"
                        >
                          + إضافة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)]">
              <th className="w-10 px-3 py-2.5 text-center font-bold">#</th>
              <th className="px-3 py-2.5 font-bold">الصنف</th>
              <th className="w-28 px-3 py-2.5 text-center font-bold">الكمية</th>
              <th className="w-28 px-3 py-2.5 text-center font-bold">السعر الإفرادي</th>
              <th className="w-24 px-3 py-2.5 text-center font-bold">الخصم</th>
              <th className="w-28 px-3 py-2.5 text-left font-bold">الإجمالي</th>
              <th className="w-12 px-2 py-2.5 text-center font-bold">حذف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {items.map((item, index) => {
              const lineTotal = Math.max(0, item.quantity * item.unitPrice - item.discount);
              return (
                <tr
                  key={`${item.productId}-${index}`}
                  className="hover:bg-[var(--app-surface-hover)]"
                >
                  <td className="px-3 py-2.5 text-center font-mono text-xs text-[var(--app-text-secondary)]">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                      {item.productId && (
                        <EntityInfoDot
                          type="product"
                          id={item.productId}
                          label={item.name}
                          size="sm"
                        />
                      )}
                      <span>{item.name}</span>
                    </div>
                    {item.sku && (
                      <div className="font-mono text-[10px] text-[var(--app-text-secondary)]">
                        SKU: {item.sku}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onQuantityChange(index, Math.max(1, item.quantity - 1))}
                        className="flex h-6 w-6 items-center justify-center rounded border border-[var(--app-border)] bg-[var(--app-surface-hover)] font-bold text-[var(--app-text)] hover:bg-[var(--app-border)]"
                      >
                        -
                      </button>
                      <CalculatorInput
                        value={item.quantity}
                        onValueChange={val => onQuantityChange(index, val)}
                        allowNegative={false}
                        compact={true}
                        wrapperClassName="w-16"
                        className="h-7 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] text-center font-mono text-xs font-bold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                        placeholder="1"
                      />
                      <button
                        type="button"
                        onClick={() => onQuantityChange(index, item.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-[var(--app-border)] bg-[var(--app-surface-hover)] font-bold text-[var(--app-text)] hover:bg-[var(--app-border)]"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <CalculatorInput
                      value={item.unitPrice}
                      onValueChange={val => onUnitPriceChange(index, val)}
                      allowNegative={false}
                      compact={true}
                      className="h-7 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] text-center font-mono text-xs font-bold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <CalculatorInput
                      value={item.discount}
                      onValueChange={val => onDiscountChange(index, val)}
                      allowNegative={false}
                      compact={true}
                      className="h-7 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] text-center font-mono text-xs font-bold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                      placeholder="0"
                    />
                  </td>
                  <td
                    className="px-3 py-2.5 text-left font-mono font-bold text-emerald-600 dark:text-emerald-400"
                    dir="ltr"
                  >
                    {formatCurrency(lineTotal, currencyCode)}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="rounded p-1.5 text-[var(--app-text-secondary)] transition-colors hover:bg-rose-500/15 hover:text-rose-600"
                      title="حذف الصنف"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
