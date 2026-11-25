// ============================================
// Product Search Component
// Search and select products for invoice
// ============================================

import React, { useState } from 'react';
import { Search, X, ArrowLeftRight } from 'lucide-react';
import { useTranslation } from '../../../../lib/hooks/useTranslation';
import { useProductSearch, type ProductSearchResult } from '../../../sales/hooks/useProductSearch';
import { useAuthStore } from '../../../auth/store';
import type { CartItem } from '../../../sales/types';
import { useSalesStore } from '../../store';
import ProductSelectionModal from './ProductSelectionModal';
import type { Product } from '../../../inventory/types';
import { EntityInfoDot } from '../../../entity-inspector';

interface ProductSearchProps {
  onSelectProduct: (product: CartItem) => void;
  onClose?: () => void;
}

const ProductSearch: React.FC<ProductSearchProps> = ({ onSelectProduct }) => {
  const {} = useTranslation();
  const { user } = useAuthStore();
  const warehouseId = useSalesStore(s => s.warehouseId);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { products, isLoading, hasResults } = useProductSearch(searchTerm, {
    companyId: user?.company_id || '',
    debounceMs: 300,
    enabled: !!user?.company_id && searchTerm.trim().length >= 2,
  });

  const handleSelect = (product: ProductSearchResult) => {
    const cartItem: CartItem = {
      productId: product.id,
      name: product.name_ar,
      sku: product.sku,
      quantity: 1,
      unitPrice: product.sale_price,
      costPrice: product.purchase_price,

      maxStock: product.quantity || 999,
      isCoreReturn: product.is_core === true,
    };
    onSelectProduct(cartItem);
    setSearchTerm('');
  };

  const handleAdvancedSelect = (product: Product) => {
    const cartItem: CartItem = {
      productId: product.id,
      name: product.name || product.name_ar,
      sku: product.sku,
      quantity: 1,
      unitPrice: product.selling_price || product.sale_price || 0,
      costPrice: product.cost_price || 0,
      maxStock: product.stock_quantity || 999,
    };
    onSelectProduct(cartItem);
    setSearchTerm('');
    setShowAdvanced(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
          }}
          placeholder="ابحث عن منتج..."
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-10 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => {
              setSearchTerm('');
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {searchTerm.trim().length >= 2 && (
        <div className="absolute z-50 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-850">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-gray-500">جاري البحث...</div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-xs text-gray-500">لا توجد نتائج مطابقة</div>
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
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {products.map((product: ProductSearchResult, idx: number) => (
                  <tr
                    key={product.id}
                    onClick={() => {
                      handleSelect(product);
                    }}
                    className="group cursor-pointer transition-colors hover:bg-amber-50/70 dark:hover:bg-amber-950/20"
                  >
                    <td className="border-l border-slate-200 px-2 py-2 text-center font-mono text-[11px] font-bold text-slate-400 dark:border-slate-800">
                      {idx + 1}
                    </td>
                    <td className="border-l border-slate-200 px-3 py-2 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                        <EntityInfoDot type="product" id={product.id} label={product.name_ar} size="xs" />
                        <span className="truncate">{product.name_ar}</span>
                        {searchTerm && product.alternative_numbers?.includes(searchTerm) && (
                          <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            بديل
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="border-l border-slate-200 px-2.5 py-2 text-center font-mono text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300"
                      dir="ltr"
                    >
                      {product.part_number || product.sku || '—'}
                    </td>
                    <td className="border-l border-slate-200 px-2.5 py-2 text-center font-bold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                      {product.brand || '—'}
                    </td>
                    <td
                      className="border-l border-slate-200 px-2.5 py-2 text-center font-mono text-xs font-black text-emerald-600 dark:border-slate-800 dark:text-emerald-400"
                      dir="ltr"
                    >
                      {product.sale_price}
                    </td>
                    <td className="border-l border-slate-200 px-2 py-2 text-center font-mono text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300">
                      {product.quantity ?? 0}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleSelect(product);
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

          {/* [FIX #6] رابط فتح مستكشف الأصناف المتقدم */}
          <div className="border-t border-gray-100 p-2 dark:border-slate-700">
            <button
              onClick={() => {
                setShowAdvanced(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
            >
              <ArrowLeftRight size={14} />
              مستكشف الأصناف المتقدم
            </button>
          </div>
        </div>
      )}

      {/* [FIX #6] نافذة مستكشف الأصناف المتقدم منبثقة من البحث السريع */}
      <ProductSelectionModal
        isOpen={showAdvanced}
        onClose={() => {
          setShowAdvanced(false);
        }}
        onSelect={handleAdvancedSelect}
        initialQuery={searchTerm}
        warehouseId={warehouseId}
      />
    </div>
  );
};

export default ProductSearch;
