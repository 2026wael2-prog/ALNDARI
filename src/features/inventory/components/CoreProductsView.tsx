/* eslint-disable max-lines-per-function, complexity -- تبويبة المنتجات الاستراتيجية الشاملة مع فلاتر الشركة الصانعة والمورد */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ProductExcelGrid from './ProductExcelGrid';
import ProductDetailPane from './ProductDetailPane';
import ServerPaginationBar from '../../../ui/common/ServerPaginationBar';
import { useProductsPaginated } from '../hooks/useProductsPaginated';
import {
  useProductMutations,
  useSupplierProductIds,
  useProductSupplierMap,
} from '../hooks/useProducts';
import { productService } from '../services/productService';
import { useAuthStore } from '../../auth/store';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';
import { useSuppliers } from '../../parties/hooks';
import { useBrandSuggestions } from '../hooks/useBrandSuggestions';
import { useWarehouses } from '../hooks/useWarehouses';
import type { Product } from '../types';
import { formatNumberDisplay } from '../../../core/utils';
import type { Column } from '../../../ui/common/ExcelTable';
import {
  CoreProductsFilterBar,
  type CoreFilterMode,
} from './core_products/CoreProductsFilterBar';
import { CoreEmptyState } from './core_products/CoreEmptyState';

interface CoreProductsViewProps {
  isDesktop: boolean;
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product | null) => void;
  handleEdit: (product: Product) => void;
  deleteProduct: (id: string) => void;
  onMaximizeProduct?: (() => void) | undefined;
  searchTerm?: string | undefined;
  onSearchChange?: ((term: string) => void) | undefined;
}

export const CoreProductsView: React.FC<CoreProductsViewProps> = ({
  isDesktop,
  selectedProduct,
  setSelectedProduct,
  handleEdit,
  deleteProduct,
  onMaximizeProduct,
  searchTerm: propSearchTerm,
  onSearchChange: propOnSearchChange,
}) => {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';
  const { branchId, warehouseId: contextWarehouseId } = useBranchFilter();
  const queryClient = useQueryClient();

  const [filterMode, setFilterMode] = useState<CoreFilterMode>('core_only');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    contextWarehouseId ?? ''
  );
  const [localSearchTerm, setLocalSearchTerm] = useState<string>(propSearchTerm ?? '');
  const activeSearch = propSearchTerm ?? localSearchTerm;
  const [pageSize, setPageSize] = useState(100);
  const { toggleCoreProduct } = useProductMutations();

  // Query parameter: only filter is_core = true when not inspecting full inventory
  const queryIsCore = filterMode === 'all_inventory' ? undefined : true;

  const {
    products,
    totalCount,
    totalPages,
    page,
    isFetching,
    isLoading,
    handleSearchChange,
    goToPage,
  } = useProductsPaginated({
    pageSize,
    initialSearch: activeSearch,
    isCore: queryIsCore,
    warehouseId: selectedWarehouseId.trim() !== '' ? selectedWarehouseId : undefined,
  });

  // Fetch all warehouses for the active branch
  const { data: rawWarehouses } = useWarehouses(branchId);
  const warehouses = useMemo(
    () =>
      (rawWarehouses ?? []).map((w: { id: string; name_ar: string }) => ({
        id: w.id,
        name_ar: w.name_ar,
      })),
    [rawWarehouses]
  );

  // Fetch all suppliers for company
  const { data: rawSuppliers } = useSuppliers('');
  const suppliers = useMemo(
    () => rawSuppliers.map(s => ({ id: s.id, name: s.name })),
    [rawSuppliers]
  );

  // Fetch distinct brands for company
  const { brands: dbBrands } = useBrandSuggestions({ companyId });

  // Merge with any brands currently visible in products catalog
  const availableBrands = useMemo(() => {
    const brandSet = new Set<string>();
    dbBrands.forEach(b => {
      if (b.trim() !== '') brandSet.add(b.trim());
    });
    products.forEach(p => {
      if (typeof p.brand === 'string' && p.brand.trim() !== '') {
        brandSet.add(p.brand.trim());
      }
    });
    return Array.from(brandSet).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [dbBrands, products]);

  // Product IDs linked to the selected supplier
  const { data: supplierProductIds } = useSupplierProductIds(
    companyId,
    selectedSupplierId.trim() !== '' ? selectedSupplierId : null
  );

  // Map of productId -> supplierName for display
  const { data: rawProductSupplierMap } = useProductSupplierMap(companyId);
  const productSupplierMap: Record<string, string | undefined> = useMemo(
    () => rawProductSupplierMap ?? {},
    [rawProductSupplierMap]
  );

  // Accurate real-time KPI counts across the company's full catalog
  const {
    data: globalStats,
    isFetching: isStatsFetching,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['core_products_stats', companyId, branchId],
    queryFn: () => productService.getCoreProductsStats(companyId, branchId),
    enabled: Boolean(companyId),
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (propSearchTerm !== undefined) {
      setLocalSearchTerm(propSearchTerm);
      handleSearchChange(propSearchTerm);
    }
  }, [propSearchTerm, handleSearchChange]);

  const onSearch = (value: string): void => {
    setLocalSearchTerm(value);
    propOnSearchChange?.(value);
    handleSearchChange(value);
  };

  // Synchronize search and filter state (Stock status + Manufacturer/Brand + Supplier)
  const displayedProducts = useMemo(() => {
    let result = products;

    if (filterMode === 'critical_stock') {
      result = result.filter(p => Boolean(p.isLowStock) && p.stock_quantity > 0);
    } else if (filterMode === 'out_of_stock') {
      result = result.filter(p => p.stock_quantity <= 0);
    }

    if (selectedBrand.trim() !== '') {
      const targetBrand = selectedBrand.trim().toLowerCase();
      result = result.filter(
        p => (p.brand ?? '').trim().toLowerCase() === targetBrand
      );
    }

    if (selectedSupplierId.trim() !== '') {
      const supplierSet = new Set(supplierProductIds ?? []);
      result = result.filter(
        p => p.supplier_id === selectedSupplierId || supplierSet.has(p.id)
      );
    }

    return result;
  }, [products, filterMode, selectedBrand, selectedSupplierId, supplierProductIds]);

  // Derived KPI numbers
  const stats = useMemo(() => {
    const totalCore = globalStats?.total ?? (filterMode === 'core_only' ? totalCount : 0);
    const criticalCount = globalStats?.critical ?? 0;
    const outOfStockCount = globalStats?.outOfStock ?? 0;
    const safeCount = globalStats?.safe ?? Math.max(0, totalCore - criticalCount - outOfStockCount);

    return {
      totalCore,
      criticalCount,
      outOfStockCount,
      safeCount,
    };
  }, [globalStats, totalCount, filterMode]);

  const handleToggleCore = (product: Product, newIsCore: boolean): void => {
    void toggleCoreProduct({ id: product.id, isCore: newIsCore });
  };

  const handleRefresh = useCallback(async (): Promise<void> => {
    await Promise.all([
      refetchStats(),
      queryClient.invalidateQueries({ queryKey: ['products_paginated'] }),
    ]);
  }, [refetchStats, queryClient]);

  // Handle effective counts for pagination
  const effectiveTotalCount = useMemo(() => {
    if (
      filterMode === 'critical_stock' ||
      filterMode === 'out_of_stock' ||
      selectedBrand.trim() !== '' ||
      selectedSupplierId.trim() !== ''
    ) {
      return displayedProducts.length;
    }
    return totalCount;
  }, [filterMode, selectedBrand, selectedSupplierId, displayedProducts.length, totalCount]);

  const effectiveTotalPages = useMemo(() => {
    if (
      filterMode === 'critical_stock' ||
      filterMode === 'out_of_stock' ||
      selectedBrand.trim() !== '' ||
      selectedSupplierId.trim() !== ''
    ) {
      return Math.max(1, Math.ceil(effectiveTotalCount / pageSize));
    }
    return totalPages;
  }, [
    filterMode,
    selectedBrand,
    selectedSupplierId,
    effectiveTotalCount,
    pageSize,
    totalPages,
  ]);

  // Strategic extra columns for clear intelligence and stock monitoring
  const strategicColumns: Array<Column<Product>> = useMemo(
    () => [
      {
        header: 'المورد',
        accessor: p => {
          const supName = productSupplierMap[p.id] ?? p.supplier_name ?? '—';
          return (
            <span
              className="inline-block max-w-[120px] truncate text-[11px] font-bold text-slate-700 dark:text-slate-300"
              title={supName}
            >
              {supName}
            </span>
          );
        },
        width: 'w-28',
        className: 'text-center',
      },
      {
        header: 'حد الأمان',
        accessor: p => (
          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
            {formatNumberDisplay(p.min_stock_level || 0)} {p.unit || 'قطعة'}
          </span>
        ),
        width: 'w-24',
        className: 'text-center',
        sortKey: 'min_stock_level',
      },
      {
        header: 'موقف المخزون',
        accessor: p => {
          const qty = p.stock_quantity;
          const min = p.min_stock_level || 0;
          const isCritical = Boolean(p.isLowStock) && qty > 0;
          const isOut = qty <= 0;

          if (isOut) {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-extrabold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                نافد كلياً
              </span>
            );
          }
          if (isCritical) {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                حرج ({formatNumberDisplay(qty)} / {formatNumberDisplay(min || 3)})
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              متوفر بأمان
            </span>
          );
        },
        width: 'w-32',
        className: 'text-center',
      },
    ],
    [productSupplierMap]
  );

  const gridSubtitle =
    filterMode === 'all_inventory'
      ? 'انقر على النجمة ⭐ لتعيين الصنف كصنف استراتيجي يتابعه النظام بدقة'
      : `${String(displayedProducts.length)} صنف معروض من إجمالي ${String(effectiveTotalCount)}`;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-2">
      {/* Top Banner, Filter Pills & Advanced Brand/Supplier Filter Bar */}
      <CoreProductsFilterBar
        filterMode={filterMode}
        onFilterModeChange={mode => {
          setFilterMode(mode);
          goToPage(1);
        }}
        stats={stats}
        brands={availableBrands}
        selectedBrand={selectedBrand}
        onBrandChange={b => {
          setSelectedBrand(b);
          goToPage(1);
        }}
        suppliers={suppliers}
        selectedSupplierId={selectedSupplierId}
        onSupplierChange={sId => {
          setSelectedSupplierId(sId);
          goToPage(1);
        }}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        onWarehouseChange={wId => {
          setSelectedWarehouseId(wId);
          goToPage(1);
        }}
        displayedCount={displayedProducts.length}
        totalAvailableCount={effectiveTotalCount}
        onRefresh={() => {
          void handleRefresh();
        }}
        isRefreshing={isFetching || isStatsFetching}
      />

      {/* Main Table Area (Desktop split or full width) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!isLoading && displayedProducts.length === 0 ? (
          <CoreEmptyState
            activeSearch={activeSearch}
            filterMode={filterMode}
            hasCustomFilters={
              selectedBrand.trim() !== '' || selectedSupplierId.trim() !== ''
            }
            onClearSearch={() => {
              onSearch('');
            }}
            onClearCustomFilters={() => {
              setSelectedBrand('');
              setSelectedSupplierId('');
              goToPage(1);
            }}
            onShowAllCore={() => {
              setFilterMode('core_only');
              goToPage(1);
            }}
            onBrowseAllInventory={() => {
              setFilterMode('all_inventory');
              goToPage(1);
            }}
          />
        ) : isDesktop ? (
          <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div
              className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden transition-all duration-300 ${
                selectedProduct !== null ? 'lg:col-span-8' : 'lg:col-span-12'
              }`}
            >
              <ProductExcelGrid
                products={displayedProducts}
                isLoading={isLoading}
                onDelete={deleteProduct}
                onViewDetails={setSelectedProduct}
                onEdit={handleEdit}
                searchValue={activeSearch}
                onSearchChange={onSearch}
                onToggleCore={handleToggleCore}
                extraColumns={strategicColumns}
                title={
                  filterMode === 'all_inventory'
                    ? 'اختر الأصناف لتحديدها كمنتجات استراتيجية'
                    : 'المنتجات الاستراتيجية'
                }
                subtitle={gridSubtitle}
              />
            </div>
            {selectedProduct !== null && (
              <div className="animate-in slide-in-from-right-4 fade-in h-full min-h-0 overflow-hidden duration-300 lg:col-span-4">
                <ProductDetailPane
                  product={selectedProduct}
                  onEdit={handleEdit}
                  onDelete={deleteProduct}
                  onClose={() => {
                    setSelectedProduct(null);
                  }}
                  onMaximize={onMaximizeProduct}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <ProductExcelGrid
              products={displayedProducts}
              isLoading={isLoading}
              onDelete={deleteProduct}
              onViewDetails={setSelectedProduct}
              onEdit={handleEdit}
              searchValue={activeSearch}
              onSearchChange={onSearch}
              onToggleCore={handleToggleCore}
              extraColumns={strategicColumns}
              title={
                filterMode === 'all_inventory'
                  ? 'اختر الأصناف لتحديدها كمنتجات استراتيجية'
                  : 'المنتجات الاستراتيجية'
              }
              subtitle={gridSubtitle}
            />
          </div>
        )}

        {/* Pagination Bar */}
        {displayedProducts.length > 0 && (
          <ServerPaginationBar
            page={page}
            totalPages={effectiveTotalPages}
            totalCount={effectiveTotalCount}
            pageSize={pageSize}
            isFetching={isFetching}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[25, 50, 100, 200]}
          />
        )}
      </div>
    </div>
  );
};

export default CoreProductsView;
