/* eslint-disable max-lines-per-function, complexity, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition */
import React, { useState } from 'react';
import {
  Plus,
  X,
  Edit2,
  Check,
  Car,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useOpenInvoicesStore, type OpenInvoiceDraft } from '../../store/openInvoicesStore';
import { useSalesStore } from '../../store';
import { formatCurrency } from '@/core/utils';
import { useFeedbackStore } from '@/features/feedback/store';

interface OpenInvoicesTabsProps {
  disabled?: boolean;
}

export const OpenInvoicesTabs: React.FC<OpenInvoicesTabsProps> = ({ disabled = false }) => {
  const {
    drafts,
    activeDraftId,
    createDraft,
    switchDraft,
    closeDraft,
    renameDraft,
    syncCurrentDraft,
  } = useOpenInvoicesStore();

  const salesStore = useSalesStore();
  const { showToast } = useFeedbackStore();

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [draftToClose, setDraftToClose] = useState<OpenInvoiceDraft | null>(null);

  // أخذ snapshot من حالة السلة الحالية
  const captureCurrentCartSnapshot = (): Partial<OpenInvoiceDraft> => ({
    items: salesStore.items,
    selectedCustomer: salesStore.selectedCustomer,
    summary: salesStore.summary,
    invoiceType: salesStore.invoiceType,
    currency: salesStore.currency,
    exchangeRate: salesStore.exchangeRate,
    exchangeOperator: salesStore.exchangeOperator,
    warehouseId: salesStore.warehouseId,
    cashboxId: salesStore.cashboxId,
    paidAmount: salesStore.paidAmount,
    showDiscount: salesStore.showDiscount,
    notes: salesStore.notes,
  });

  const handleSwitchTab = (targetDraftId: string): void => {
    if (disabled || targetDraftId === activeDraftId) return;

    // 1. التقاط الحالة الحالية وحفظها في التبويب الحالي
    const currentSnapshot = captureCurrentCartSnapshot();
    const targetDraft = switchDraft(targetDraftId, currentSnapshot);

    // 2. تحميل حالة التبويب الهدف إلى سلة المبيعات
    if (targetDraft) {
      salesStore.loadCartState({
        items: targetDraft.items,
        selectedCustomer: targetDraft.selectedCustomer,
        invoiceType: targetDraft.invoiceType,
        currency: targetDraft.currency,
        exchangeRate: targetDraft.exchangeRate,
        exchangeOperator: targetDraft.exchangeOperator,
        warehouseId: targetDraft.warehouseId,
        cashboxId: targetDraft.cashboxId,
        paidAmount: targetDraft.paidAmount,
        showDiscount: targetDraft.showDiscount,
        notes: targetDraft.notes,
      });
    }
  };

  const handleCreateNewTab = (): void => {
    if (disabled) return;

    // حفظ السلة الحالية أولاً
    const currentSnapshot = captureCurrentCartSnapshot();
    syncCurrentDraft(currentSnapshot);

    // إنشاء تبويب مسودة جديدة
    createDraft();

    // إعادة ضبط سلة المبيعات للفاتورة الجديدة البيضاء
    salesStore.resetCart();
    showToast('تم فتح فاتورة جديدة مفتوحة بالتوازي', 'success');
  };

  const handleStartRename = (e: React.MouseEvent, draft: OpenInvoiceDraft): void => {
    e.stopPropagation();
    setEditingDraftId(draft.id);
    setEditTitle(draft.tabTitle);
  };

  const handleSaveRename = (e: React.SyntheticEvent, draftId: string): void => {
    e.stopPropagation();
    e.preventDefault();
    if (editTitle.trim()) {
      renameDraft(draftId, editTitle.trim());
    }
    setEditingDraftId(null);
  };

  const handleRequestClose = (e: React.MouseEvent, draft: OpenInvoiceDraft): void => {
    e.stopPropagation();
    const hasItems =
      draft.id === activeDraftId
        ? salesStore.items.some(i => Boolean(i.productId))
        : draft.items.some(i => Boolean(i.productId));

    if (hasItems) {
      setDraftToClose(draft);
    } else {
      executeClose(draft.id);
    }
  };

  const executeClose = (draftId: string): void => {
    const nextDraft = closeDraft(draftId);
    if (nextDraft && draftId === activeDraftId) {
      salesStore.loadCartState({
        items: nextDraft.items,
        selectedCustomer: nextDraft.selectedCustomer,
        invoiceType: nextDraft.invoiceType,
        currency: nextDraft.currency,
        exchangeRate: nextDraft.exchangeRate,
        exchangeOperator: nextDraft.exchangeOperator,
        warehouseId: nextDraft.warehouseId,
        cashboxId: nextDraft.cashboxId,
        paidAmount: nextDraft.paidAmount,
        showDiscount: nextDraft.showDiscount,
        notes: nextDraft.notes,
      });
    }
    setDraftToClose(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-100/70 px-2 py-1.5 dark:border-slate-800/80 dark:bg-slate-900/40">
        {/* قائمة التبويبات للفواتير المفتوحة */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {drafts.map(draft => {
            const isActive = draft.id === activeDraftId;
            const isEditing = editingDraftId === draft.id;
            const itemsCount =
              isActive
                ? salesStore.items.filter(i => Boolean(i.productId) && i.quantity > 0).length
                : draft.items.filter(i => Boolean(i.productId) && i.quantity > 0).length;

            const total =
              isActive
                ? salesStore.summary.totalAmount
                : (draft.summary?.totalAmount ?? 0);

            const customerName =
              isActive
                ? salesStore.selectedCustomer?.name
                : draft.selectedCustomer?.name;

            return (
              <div
                key={draft.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  handleSwitchTab(draft.id);
                }}
                className={`group relative flex cursor-pointer items-center gap-2 rounded-t-xl border px-3 py-1.5 transition-all select-none ${
                  isActive
                    ? 'border-b-transparent border-slate-300 bg-white font-bold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                    : 'border-transparent bg-slate-200/60 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {/* أيقونة الفاتورة أو السيارة */}
                <Car
                  size={14}
                  className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}
                />

                {/* عنوان التبويب أو نموذج التعديل */}
                {isEditing ? (
                  <form
                    onSubmit={e => {
                      handleSaveRename(e, draft.id);
                    }}
                    className="flex items-center gap-1"
                    onClick={e => {
                      e.stopPropagation();
                    }}
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => {
                        setEditTitle(e.target.value);
                      }}
                      className="h-6 w-32 rounded border border-blue-400 bg-white px-1.5 text-xs font-medium text-slate-900 focus:outline-none dark:bg-slate-950 dark:text-white"
                      placeholder="اسم الفاتورة/السيارة..."
                    />
                    <button
                      type="submit"
                      className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Check size={12} />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[130px] truncate text-xs sm:max-w-[180px]">
                      {draft.tabTitle}
                    </span>
                    {customerName && (
                      <span className="hidden text-[10px] text-slate-400 sm:inline">
                        ({customerName})
                      </span>
                    )}
                  </div>
                )}

                {/* شارة عدد الأصناف والإجمالي */}
                {itemsCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                    {itemsCount} {itemsCount === 1 ? 'صنف' : 'أصناف'}
                    {total > 0 && (
                      <span className="border-r border-blue-300 pr-1 mr-1 dark:border-blue-700">
                        {formatCurrency(total, draft.currency || 'SAR')}
                      </span>
                    )}
                  </span>
                )}

                {/* أزرار العمليات على التبويب */}
                {!isEditing && (
                  <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    {/* تعديل الاسم */}
                    <button
                      type="button"
                      onClick={e => {
                        handleStartRename(e, draft);
                      }}
                      title="إعادة تسمية الفاتورة (مثلاً: رقم السيارة أو اسم العميل)"
                      className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <Edit2 size={10} />
                    </button>

                    {/* إغلاق التبويب */}
                    <button
                      type="button"
                      onClick={e => {
                        handleRequestClose(e, draft);
                      }}
                      title="إغلاق هذه الفاتورة المفتوحة"
                      className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* زر فتح فاتورة جديدة بالتوازي (+) */}
          <button
            type="button"
            onClick={handleCreateNewTab}
            disabled={disabled}
            title="فتح فاتورة مفتوحة جديدة لعميل آخر دون التأثير على الفواتير الحالية"
            className="flex h-7 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white/80 px-2 text-xs font-semibold text-slate-700 transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
          >
            <Plus size={14} className="text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">فاتورة مفتوحة جديدة</span>
          </button>
        </div>

        {/* تلميح مساعدة سريع */}
        <div className="hidden items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 md:flex">
          <HelpCircle size={13} className="text-slate-400" />
          <span>يمكنك فتح عدة فواتير بالتوازي لزبائن يتفقدون سياراتهم</span>
        </div>
      </div>

      {/* نافذة تأكيد إغلاق الفاتورة التي تحتوي على أصناف */}
      {draftToClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">إغلاق الفاتورة المفتوحة؟</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  تحتوي &quot;{draftToClose.tabTitle}&quot; على أصناف مدخلة. هل تريد إغلاقها وحذف محتوياتها؟
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftToClose(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  executeClose(draftToClose.id);
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700"
              >
                نعم، إغلاق وحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OpenInvoicesTabs;
