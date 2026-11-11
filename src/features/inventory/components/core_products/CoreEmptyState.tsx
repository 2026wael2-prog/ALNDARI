/* eslint-disable max-lines-per-function -- حالات الفراغ المخصصة للمنتجات الاستراتيجية */
import React from 'react';
import { Search, CheckCircle2, Star, Layers, RotateCcw } from 'lucide-react';
import type { CoreFilterMode } from './CoreProductsFilterBar';

export interface CoreEmptyStateProps {
  activeSearch: string;
  filterMode: CoreFilterMode;
  hasCustomFilters: boolean;
  onClearSearch: () => void;
  onClearCustomFilters: () => void;
  onShowAllCore: () => void;
  onBrowseAllInventory: () => void;
}

export const CoreEmptyState: React.FC<CoreEmptyStateProps> = ({
  activeSearch,
  filterMode,
  hasCustomFilters,
  onClearSearch,
  onClearCustomFilters,
  onShowAllCore,
  onBrowseAllInventory,
}) => {
  if (activeSearch.trim()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-950/30">
          <Search size={24} />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          لا توجد نتائج مطابقة لبحثك
        </h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          لم نعثر على أي صنف استراتيجي يطابق عبارة &quot;{activeSearch}&quot;.
        </p>
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-amber-600"
        >
          مسح البحث
        </button>
      </div>
    );
  }

  if (hasCustomFilters) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <RotateCcw size={24} />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          لا توجد أصناف مطابقة لفلاتر الشركة الصانعة أو المورد
        </h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          لم يتم العثور على أي منتج يطابق معايير الفلترة المحددة حالياً.
        </p>
        <button
          type="button"
          onClick={onClearCustomFilters}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700"
        >
          إعادة ضبط الفلاتر
        </button>
      </div>
    );
  }

  if (filterMode === 'critical_stock') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-white/60 p-8 text-center dark:border-emerald-900/40 dark:bg-slate-900/60">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
          وضع المخزون الاستراتيجي ممتاز!
        </h3>
        <p className="mt-1 max-w-sm text-xs text-slate-600 dark:text-slate-400">
          لا توجد أي أصناف استراتيجية مهددة بالنفاذ حالياً. جميع الأصناف الحيوية أعلى من حدود الأمان.
        </p>
        <button
          type="button"
          onClick={onShowAllCore}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700"
        >
          عرض كافة الأصناف الاستراتيجية
        </button>
      </div>
    );
  }

  if (filterMode === 'out_of_stock') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          رائع! لا توجد أصناف استراتيجية نافدة
        </h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          كافة الأصناف الاستراتيجية متوفرة بأرصدة موجبة في المستودعات.
        </p>
        <button
          type="button"
          onClick={onShowAllCore}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700"
        >
          عرض كافة الأصناف الاستراتيجية
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-amber-200 bg-white/60 p-8 text-center dark:border-amber-900/40 dark:bg-slate-900/60">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-950/30">
        <Star size={24} className="fill-amber-400" />
      </div>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
        لم يتم تحديد أي أصناف استراتيجية بعد
      </h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        الأصناف الاستراتيجية (العمود الفقري) هي المنتجات الحيوية الأكثر طلباً لمنشأتك والتي تحظى
        بمراقبة دقيقة وتنبيهات فورية عند اقتراب نفاذ رصيدها.
      </p>
      <button
        type="button"
        onClick={onBrowseAllInventory}
        className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-500/20 transition-all hover:bg-amber-600 active:scale-95"
      >
        <Layers size={14} />
        استعراض كافة المخزون لتحديد الأصناف الاستراتيجية ⭐
      </button>
    </div>
  );
};

