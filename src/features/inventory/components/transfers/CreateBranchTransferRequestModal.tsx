/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/explicit-function-return-type, jsx-a11y/label-has-associated-control, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowRightLeft,
  X,
  Package,
  Search,
  Send,
  Loader2,
  Trash2,
  Plus,
  Minus,
  Sparkles,
  Tag,
  Hash,
} from 'lucide-react';
import { useCreateStockTransferBatch } from '../../hooks/useStockTransferRequests';
import { useProducts } from '../../hooks/useProducts';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { useBranches } from '@/features/settings/hooks';
import type { Branch } from '@/features/settings/types';
import type { Product } from '../../types';

interface CreateBranchTransferRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TransferItemDraft {
  product: Product;
  quantity: number;
}

export const CreateBranchTransferRequestModal: React.FC<CreateBranchTransferRequestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { branchId: currentBranchId, branchName: currentBranchName } = useBranchFilter();
  const { data: allBranches } = useBranches();
  const { products } = useProducts('');
  const { mutate: createBatch, isPending } = useCreateStockTransferBatch();

  const otherBranches = useMemo(() => {
    return ((allBranches as Branch[]) ?? []).filter((b: Branch) => b.id !== currentBranchId);
  }, [allBranches, currentBranchId]);

  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<TransferItemDraft[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // ضبط الفرع الافتراضي
  useEffect(() => {
    if (otherBranches.length > 0 && !selectedBranchId) {
      const first = otherBranches[0];
      if (first) {
        setSelectedBranchId(first.id);
      }
    }
  }, [otherBranches, selectedBranchId]);

  // إغلاق قائمة البحث عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!isOpen) return null;

  // نتائج البحث المرتبطة بجدول المنتجات ورقم القطعة والشركة الصانعة
  const searchResults = (products ?? [])
    .filter(p => {
      if (!productSearch.trim()) return false;
      const term = productSearch.toLowerCase();
      return (
        p.name_ar.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.part_number?.toLowerCase().includes(term) ?? false) ||
        (p.brand?.toLowerCase().includes(term) ?? false)
      );
    })
    .slice(0, 8);

  const handleAddProduct = (product: Product) => {
    setSelectedItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setProductSearch('');
    setIsSearchFocused(false);
  };

  const handleUpdateQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setSelectedItems(prev =>
      prev.map(item => (item.product.id === productId ? { ...item, quantity: newQty } : item))
    );
  };

  const handleRemoveItem = (productId: string) => {
    setSelectedItems(prev => prev.filter(item => item.product.id !== productId));
  };

  const totalQuantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const isValid = Boolean(selectedBranchId && selectedItems.length > 0 && currentBranchId);

  const handleSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!isValid || !currentBranchId) return;

    createBatch(
      {
        requesterBranchId: currentBranchId,
        dto: {
          sourceBranchId: selectedBranchId,
          items: selectedItems.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
          notes: notes.trim() ? notes.trim() : undefined,
        },
      },
      {
        onSuccess: () => {
          setSelectedItems([]);
          setNotes('');
          setProductSearch('');
          onClose();
        },
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
        
        {/* الترويسة العصرية */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  طلب مناقلة أصناف من فرع آخر
                </h3>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                  متعدد الأصناف
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                طلب إمداد قطع غيار وأصناف لمستودع: <span className="font-bold text-slate-700 dark:text-slate-200">{currentBranchName ?? 'الفرع الحالي'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* جسم النافذة */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-5 text-right space-y-4">
          
          {/* اختيار الفرع المصدر */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              الفرع المطلوب منه البضاعة (المصدر):
            </label>
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={e => {
                  setSelectedBranchId(e.target.value);
                }}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {otherBranches.map((b: Branch) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.is_main ? '★ (الرئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* البحث عن المنتجات المرتبطة بجدول المنتجات */}
          <div ref={searchContainerRef} className="relative">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              إضافة قطع غيار وأصناف للطلب (ابحث بالاسم، رقم القطعة، أو الشركة الصانعة):
            </label>
            <div className="relative">
              <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={productSearch}
                onChange={e => {
                  setProductSearch(e.target.value);
                  setIsSearchFocused(true);
                }}
                onFocus={() => {
                  setIsSearchFocused(true);
                }}
                placeholder="ابحث بالاسم أو رقم القطعة (Part No) أو الماركة (Brand) أو كود الصنف..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-10 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setProductSearch('');
                  }}
                  className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* القائمة المنسدلة لنتائج البحث */}
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
                        handleAddProduct(p);
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

          {/* قائمة الأصناف المحددة للطلب */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                قائمة الأصناف المطلوبة للمناقلة ({selectedItems.length})
              </span>
              <span className="text-[11px] text-slate-500">
                إجمالي الكميات: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{totalQuantity}</span> قطعة
              </span>
            </div>

            {selectedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                <Package size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">لم يتم اختيار أي أصناف بعد</p>
                <p className="text-[11px] text-slate-400">استخدم شريط البحث أعلاه لإضافة قطع الغيار والمنتجات المطلوبة</p>
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
                    {selectedItems.map((item, idx) => (
                      <tr key={item.product.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
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
                                handleUpdateQuantity(item.product.id, item.quantity - 1);
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
                                handleUpdateQuantity(item.product.id, isNaN(val) ? 1 : val);
                              }}
                              className="h-7 w-14 rounded-lg border border-slate-300 bg-white text-center font-mono text-xs font-black text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdateQuantity(item.product.id, item.quantity + 1);
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
                              handleRemoveItem(item.product.id);
                            }}
                            className="flex h-7 w-7 mx-auto items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
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

          {/* ملاحظات الطلب */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ملاحظات الطلب أو وسيلة الشحن المقترحة (اختياري):
            </label>
            <textarea
              value={notes}
              onChange={e => {
                setNotes(e.target.value);
              }}
              rows={2}
              placeholder="مثلاً: يرجى تجهيز القطع مع شحنة الصباح / إرسالها مع سيارة النقل..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {/* شريط الإجراءات السفلي */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Sparkles size={14} className="text-amber-500" />
              <span>
                سيتم إرسال تنبيه منبثق فوري لفرع المصدر لاعتماد وشحن الأصناف
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={!isValid || isPending}
                className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>إرسال طلب المناقلة ({selectedItems.length} أصناف)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBranchTransferRequestModal;
