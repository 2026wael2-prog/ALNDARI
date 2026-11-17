import React from 'react';
import { Hash, Package, Plus, Search, Tag, X } from 'lucide-react';
import type { Product } from '../../types';

interface TransferProductSearchBoxProps {
  searchContainerRef: React.RefObject<HTMLDivElement | null>;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  isSearchFocused: boolean;
  onSearchFocusChange: (focused: boolean) => void;
  searchResults: Product[];
  onAddProduct: (product: Product) => void;
}

/** Search input and dropdown autocomplete for picking spare parts in branch transfers. */
export const TransferProductSearchBox: React.FC<TransferProductSearchBoxProps> = ({
  searchContainerRef,
  productSearch,
  onProductSearchChange,
  isSearchFocused,
  onSearchFocusChange,
  searchResults,
  onAddProduct,
}) => (
  <div ref={searchContainerRef} className="relative">
    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
      إضافة قطع غيار وأصناف للطلب (ابحث بالاسم، رقم القطعة، أو الشركة الصانعة):
    </label>
    <div className="relative">
      <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
      <input
        type="text"
        value={productSearch}
        onChange={e => {
          onProductSearchChange(e.target.value);
          onSearchFocusChange(true);
        }}
        onFocus={() => {
          onSearchFocusChange(true);
        }}
        placeholder="ابحث بالاسم أو رقم القطعة (Part No) أو الماركة (Brand) أو كود الصنف..."
        className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-10 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
      {productSearch && (
        <button
          type="button"
          onClick={() => {
            onProductSearchChange('');
          }}
          className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      )}
    </div>

    {isSearchFocused && productSearch.trim().length > 0 && (
      <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {searchResults.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            لم يتم العثور على قطع غيار مطابقة للبحث
          </div>
        ) : (
          searchResults.map(p => (
            <div
              key={p.id}
              onClick={() => {
                onAddProduct(p);
              }}
              className="flex cursor-pointer items-center justify-between rounded-lg p-2.5 transition hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                  <Package size={15} />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {p.name_ar}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {p.part_number && (
                      <span className="flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Hash size={10} />
                        <span>{p.part_number}</span>
                      </span>
                    )}
                    {p.brand && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        <Tag size={10} />
                        <span>{p.brand}</span>
                      </span>
                    )}
                    <span className="font-mono text-slate-400">كود: {p.sku}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  المتوفر: {p.stock_quantity}
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700">
                  <Plus size={14} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    )}
  </div>
);
