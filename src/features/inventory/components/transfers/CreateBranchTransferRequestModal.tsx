import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { useBranches } from '@/features/settings/hooks';
import type { Branch } from '@/features/settings/types';
import { useProducts } from '../../hooks/useProducts';
import { useCreateStockTransferBatch } from '../../hooks/useStockTransferRequests';
import type { Product } from '../../types';
import { TransferProductSearchBox } from './TransferProductSearchBox';
import {
  TransferSelectedItemsTable,
  type TransferItemDraft,
} from './TransferSelectedItemsTable';

interface CreateBranchTransferRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateBranchTransferRequestModal: React.FC<CreateBranchTransferRequestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { branchId: currentBranchId, branchName: currentBranchName } = useBranchFilter();
  const { data: allBranches } = useBranches();
  const { products } = useProducts('');
  const { mutate: createBatch, isPending } = useCreateStockTransferBatch();

  const otherBranches = useMemo(
    () => ((allBranches as Branch[]) ?? []).filter((b: Branch) => b.id !== currentBranchId),
    [allBranches, currentBranchId]
  );

  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<TransferItemDraft[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (otherBranches.length > 0 && !selectedBranchId) {
      const first = otherBranches[0];
      if (first) setSelectedBranchId(first.id);
    }
  }, [otherBranches, selectedBranchId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

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

  const handleRemoveItem = (productId: string) => {
    setSelectedItems(prev => prev.filter(item => item.product.id !== productId));
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
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:pb-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent px-3.5 py-2.5 dark:border-slate-800 sm:px-5 sm:py-4">
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
                طلب إمداد قطع غيار وأصناف لمستودع:{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {currentBranchName ?? 'الفرع الحالي'}
                </span>
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

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col space-y-4 overflow-y-auto p-5 text-right"
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
              الفرع المطلوب منه البضاعة (المصدر):
            </label>
            <select
              value={selectedBranchId}
              onChange={e => setSelectedBranchId(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {otherBranches.map((b: Branch) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_main ? '★ (الرئيسي)' : ''}
                </option>
              ))}
            </select>
          </div>

          <TransferProductSearchBox
            searchContainerRef={searchContainerRef}
            productSearch={productSearch}
            onProductSearchChange={setProductSearch}
            isSearchFocused={isSearchFocused}
            onSearchFocusChange={setIsSearchFocused}
            searchResults={searchResults}
            onAddProduct={handleAddProduct}
          />

          <TransferSelectedItemsTable
            items={selectedItems}
            totalQuantity={totalQuantity}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
          />

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              ملاحظات الطلب أو وسيلة الشحن المقترحة (اختياري):
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="مثلاً: يرجى تجهيز القطع مع شحنة الصباح / إرسالها مع سيارة النقل..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Sparkles size={14} className="text-amber-500" />
              <span>سيتم إرسال تنبيه منبثق فوري لفرع المصدر لاعتماد وشحن الأصناف</span>
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
