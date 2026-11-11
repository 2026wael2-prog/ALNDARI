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
    <div className="flex shrink-0 flex-col gap-2.5">
      {/* Banner & Quick Status Mode Pills */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-transparent p-3 shadow-sm dark:border-amber-800/40 dark:from-amber-500/20 dark:via-amber-500/5 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 shadow-sm ring-1 ring-amber-500/30 dark:text-amber-400">
            <Star size={24} className="fill-amber-400 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                المنتجات الاستراتيجية
              </h2>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                العمود الفقري ⭐
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              أصناف حيوية يراقبها النظام على مدار الساعة ويرسل تنبيهات عاجلة عند اقتراب نفاذها
              لحماية مبيعاتك.
            </p>
          </div>
        </div>

        {/* Mode Pills */}
        <div className="flex w-full flex-wrap items-center gap-1.5 md:w-auto">
          <button
            type="button"
            onClick={() => {
              onFilterModeChange('core_only');
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              filterMode === 'core_only'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
          >
            <Star
              size={14}
              className={
                filterMode === 'core_only'
                  ? 'fill-white text-white'
                  : 'fill-amber-400 text-amber-500'
              }
            />
            الأصناف الاستراتيجية
            <span className="py-0.2 rounded-full bg-white/20 px-1.5 font-mono text-[10px]">
              {String(stats.totalCore)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onFilterModeChange('critical_stock');
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              filterMode === 'critical_stock'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
          >
            <AlertTriangle
              size={14}
              className={filterMode === 'critical_stock' ? 'text-white' : 'text-rose-500'}
            />
            حرجة (مهددة بالنفاذ)
            {stats.criticalCount > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
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
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              filterMode === 'out_of_stock'
                ? 'bg-slate-700 text-white shadow-md shadow-slate-700/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
          >
            <PackageX
              size={14}
              className={filterMode === 'out_of_stock' ? 'text-white' : 'text-slate-500'}
            />
            نافدة كلياً
            {stats.outOfStockCount > 0 && (
              <span className="rounded-full bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
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
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              filterMode === 'all_inventory'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60'
            )}
            title="استعراض كافة المخزون لتحديد الأصناف الاستراتيجية"
          >
            <Layers
              size={14}
              className={filterMode === 'all_inventory' ? 'text-white' : 'text-indigo-500'}
            />
            كافة المخزون ⭐
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="تحديث البيانات"
            className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RefreshCw
              size={14}
              className={cn(isRefreshing ? 'animate-spin text-amber-500' : '')}
            />
          </button>
        </div>
      </div>

      {/* Advanced Filters: Supplier & Manufacturer */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 shadow-xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-1 text-xs font-extrabold text-slate-700 dark:text-slate-300">
            <SlidersHorizontal size={14} className="text-amber-500" />
            <span>فلترة المنتجات:</span>
          </div>

          {/* فلتر الشركة الصانعة (Manufacturer / Brand) */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80">
            <Factory size={13} className="text-blue-500" />
            <span className="font-bold text-slate-500 dark:text-slate-400">الشركة الصانعة:</span>
            <select
              value={selectedBrand}
              onChange={e => {
                onBrandChange(e.target.value);
              }}
              className="bg-transparent font-bold text-slate-800 outline-none dark:text-slate-200"
              title="تصفية حسب الشركة الصانعة / الماركة"
            >
              <option value="">جميع الشركات الصانعة</option>
              {brands.map(b => (
                <option key={b} value={b} className="dark:bg-slate-900">
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر المورد (Supplier) */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80">
            <Building2 size={13} className="text-emerald-500" />
            <span className="font-bold text-slate-500 dark:text-slate-400">المورد:</span>
            <select
              value={selectedSupplierId}
              onChange={e => {
                onSupplierChange(e.target.value);
              }}
              className="max-w-[180px] truncate bg-transparent font-bold text-slate-800 outline-none dark:text-slate-200"
              title="تصفية حسب المورد"
            >
              <option value="">جميع الموردين</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id} className="dark:bg-slate-900">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر المستودع (Warehouse) */}
          {warehouses && warehouses.length > 0 && onWarehouseChange && (
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80">
              <Warehouse size={13} className="text-purple-500" />
              <span className="font-bold text-slate-500 dark:text-slate-400">المستودع:</span>
              <select
                value={selectedWarehouseId ?? ''}
                onChange={e => {
                  onWarehouseChange(e.target.value);
                }}
                className="max-w-[180px] truncate bg-transparent font-bold text-slate-800 outline-none dark:text-slate-200"
                title="تصفية حسب المستودع"
              >
                <option value="">جميع المستودعات</option>
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

