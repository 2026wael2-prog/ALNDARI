/* eslint-disable max-lines-per-function, complexity -- شريط تصفية المنتجات الاستراتيجية حسب الشركة الصانعة والمورد والمخزون */
import React from 'react';
import {
  Star,
  AlertTriangle,
  PackageX,
  Layers,
  RefreshCw,
  Building2,
  Factory,
  RotateCcw,
  SlidersHorizontal,
  Warehouse,
} from 'lucide-react';
import { cn } from '../../../../core/utils';

export type CoreFilterMode = 'core_only' | 'critical_stock' | 'out_of_stock' | 'all_inventory';

export interface CoreProductsFilterBarProps {
  filterMode: CoreFilterMode;
  onFilterModeChange: (mode: CoreFilterMode) => void;
  stats: {
    totalCore: number;
    criticalCount: number;
    outOfStockCount: number;
    safeCount: number;
  };
  brands: string[];
  selectedBrand: string;
  onBrandChange: (brand: string) => void;
  suppliers: Array<{ id: string; name: string }>;
  selectedSupplierId: string;
  onSupplierChange: (supplierId: string) => void;
  warehouses?: Array<{ id: string; name_ar: string }>;
  selectedWarehouseId?: string;
  onWarehouseChange?: (warehouseId: string) => void;
  displayedCount: number;
  totalAvailableCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const CoreProductsFilterBar: React.FC<CoreProductsFilterBarProps> = ({
  filterMode,
  onFilterModeChange,
  stats,
  brands,
  selectedBrand,
  onBrandChange,
  suppliers,
  selectedSupplierId,
  onSupplierChange,
  warehouses,
  selectedWarehouseId,
  onWarehouseChange,
  displayedCount,
  totalAvailableCount,
  onRefresh,
  isRefreshing,
}) => {
  const hasActiveFilters =
    Boolean(selectedBrand.trim()) ||
    Boolean(selectedSupplierId.trim()) ||
    Boolean(selectedWarehouseId?.trim());

  const handleClearFilters = (): void => {
    onBrandChange('');
    onSupplierChange('');
    onWarehouseChange?.('');
  };

  return (
    <div className="flex shrink-0 flex-col gap-1.5 sm:gap-2.5">
      {/* Banner & Quick Status Mode Pills */}
      <div className="flex flex-col items-start justify-between gap-1.5 rounded-xl border border-amber-200/70 bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-transparent p-2 shadow-sm dark:border-amber-800/40 dark:from-amber-500/20 dark:via-amber-500/5 sm:gap-3 sm:rounded-2xl sm:p-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 shadow-sm ring-1 ring-amber-500/30 dark:text-amber-400 sm:h-11 sm:w-11 sm:rounded-xl">
            <Star size={16} className="fill-amber-400 text-amber-500 sm:h-6 sm:w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="text-xs font-extrabold text-slate-900 dark:text-white sm:text-base">
                المنتجات الاستراتيجية
              </h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 sm:px-2.5 sm:text-[10px]">
                العمود الفقري ⭐
              </span>
            </div>
            <p className="mt-0.5 hidden text-xs text-slate-600 dark:text-slate-400 sm:block">
              أصناف حيوية يراقبها النظام على مدار الساعة ويرسل تنبيهات عاجلة عند اقتراب نفاذها
              لحماية مبيعاتك.
            </p>
          </div>
        </div>

        {/* Mode Pills — Single horizontal scrollable strip on mobile */}
        <div className="no-scrollbar flex w-full flex-nowrap items-center gap-1 overflow-x-auto sm:flex-wrap sm:gap-1.5 md:w-auto">
          <button
            type="button"
            onClick={() => {
              onFilterModeChange('core_only');
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-bold transition-all sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs',
              filterMode === 'core_only'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
          >
            <Star
              size={12}
              className={
                filterMode === 'core_only'
                  ? 'fill-white text-white'
                  : 'fill-amber-400 text-amber-500'
              }
            />
            الاستراتيجية
            <span className="rounded-full bg-white/20 px-1 font-mono text-[10px] sm:px-1.5 sm:text-[10px]">
              {String(stats.totalCore)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onFilterModeChange('critical_stock');
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-bold transition-all sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs',
              filterMode === 'critical_stock'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
          >
            <AlertTriangle
              size={12}
              className={filterMode === 'critical_stock' ? 'text-white' : 'text-rose-500'}
            />
            حرجة
            {stats.criticalCount > 0 && (
              <span className="rounded-full bg-rose-500 px-1 py-0 text-[10px] font-bold text-white sm:px-1.5 sm:py-0.5 sm:text-[10px]">
                {String(stats.criticalCount)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onFilterModeChange('out_of_stock');
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-bold transition-all sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs',
              filterMode === 'out_of_stock'
                ? 'bg-slate-700 text-white shadow-md shadow-slate-700/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
          >
            <PackageX
              size={12}
              className={filterMode === 'out_of_stock' ? 'text-white' : 'text-slate-500'}
            />
            نافدة
            {stats.outOfStockCount > 0 && (
              <span className="rounded-full bg-slate-600 px-1 py-0 text-[10px] font-bold text-white sm:px-1.5 sm:py-0.5 sm:text-[10px]">
                {String(stats.outOfStockCount)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onFilterModeChange('all_inventory');
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-bold transition-all sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs',
              filterMode === 'all_inventory'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
            title="استعراض كافة المخزون لتحديد الأصناف الاستراتيجية"
          >
            <Layers
              size={12}
              className={filterMode === 'all_inventory' ? 'text-white' : 'text-indigo-500'}
            />
            كافة المخزون
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="تحديث البيانات"
            className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:rounded-xl sm:p-2"
          >
            <RefreshCw
              size={13}
              className={cn(isRefreshing ? 'animate-spin text-amber-500' : '')}
            />
          </button>
        </div>
      </div>

      {/* Advanced Filters: Supplier & Manufacturer */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 sm:gap-2.5 sm:rounded-2xl sm:p-2.5">
        <div className="grid w-full grid-cols-3 items-center gap-1 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
          <div className="hidden items-center gap-1.5 px-1 text-xs font-extrabold text-slate-700 dark:text-slate-300 sm:flex">
            <SlidersHorizontal size={14} className="text-amber-500" />
            <span>فلترة المنتجات:</span>
          </div>

          {/* فلتر الشركة الصانعة (Manufacturer / Brand) */}
          <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 px-1.5 py-1 text-[10px] transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80 sm:rounded-xl sm:px-2.5 sm:text-xs">
            <Factory size={12} className="shrink-0 text-blue-500" />
            <span className="hidden font-bold text-slate-500 dark:text-slate-400 sm:inline">الشركة الصانعة:</span>
            <select
              value={selectedBrand}
              onChange={e => {
                onBrandChange(e.target.value);
              }}
              className="w-full min-w-0 bg-transparent font-bold text-slate-800 outline-none dark:text-slate-200"
              title="تصفية حسب الشركة الصانعة / الماركة"
            >
              <option value="">الماركة</option>
              {brands.map(b => (
                <option key={b} value={b} className="dark:bg-slate-900">
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر المورد (Supplier) */}
          <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 px-1.5 py-1 text-[10px] transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80 sm:rounded-xl sm:px-2.5 sm:text-xs">
            <Building2 size={12} className="shrink-0 text-emerald-500" />
            <span className="hidden font-bold text-slate-500 dark:text-slate-400 sm:inline">المورد:</span>
            <select
              value={selectedSupplierId}
              onChange={e => {
                onSupplierChange(e.target.value);
              }}
              className="w-full min-w-0 truncate bg-transparent font-bold text-slate-800 outline-none dark:text-slate-200 sm:max-w-[180px]"
              title="تصفية حسب المورد"
            >
              <option value="">المورد</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id} className="dark:bg-slate-900">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر المستودع (Warehouse) */}
          {warehouses && warehouses.length > 0 && onWarehouseChange && (
            <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 px-1.5 py-1 text-[10px] transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80 sm:rounded-xl sm:px-2.5 sm:text-xs">
              <Warehouse size={12} className="shrink-0 text-purple-500" />
              <span className="hidden font-bold text-slate-500 dark:text-slate-400 sm:inline">المستودع:</span>
              <select
                value={selectedWarehouseId ?? ''}
                onChange={e => {
                  onWarehouseChange(e.target.value);
                }}
                className="w-full min-w-0 truncate bg-transparent font-bold text-slate-800 outline-none dark:text-slate-200 sm:max-w-[180px]"
                title="تصفية حسب المستودع"
              >
                <option value="">المستودع</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id} className="dark:bg-slate-900">
                    {w.name_ar}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* زر إعادة ضبط التصفية عند وجود فلاتر نشطة */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 transition-all hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
              title="مسح فلاتر الشركة الصانعة والمورد"
            >
              <RotateCcw size={12} />
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>

        {/* عداد الأصناف المعروضة */}
        <div className="flex items-center gap-1.5 px-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          <span>المعروض:</span>
          <span className="font-mono text-slate-900 dark:text-white">{String(displayedCount)}</span>
          <span>من</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">
            {String(totalAvailableCount)}
          </span>
          {hasActiveFilters && (
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              مفلتر
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

