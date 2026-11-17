import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../auth/store';
import { useBranchFilter } from '../../../branches/hooks/useBranchFilter';
import { useSuppliers } from '../../../parties/hooks';
import { useBrandSuggestions } from '../../hooks/useBrandSuggestions';
import {
  useProductMutations,
  useProductSupplierMap,
  useSupplierProductIds,
} from '../../hooks/useProducts';
import { useProductsPaginated } from '../../hooks/useProductsPaginated';
import { useWarehouses } from '../../hooks/useWarehouses';
import { productService } from '../../services/productService';
import type { Product } from '../../types';
import type { CoreFilterMode } from './CoreProductsFilterBar';

interface UseCoreProductsControllerArgs {
  propSearchTerm?: string | undefined;
  propOnSearchChange?: ((term: string) => void) | undefined;
}

/** Manages filtering, queries, KPI derivation, and actions for CoreProductsView. */
export function useCoreProductsController({
  propSearchTerm,
  propOnSearchChange,
}: UseCoreProductsControllerArgs) {
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

  const { data: rawWarehouses } = useWarehouses(branchId);
  const warehouses = useMemo(
    () =>
      (rawWarehouses ?? []).map((w: { id: string; name_ar: string }) => ({
        id: w.id,
        name_ar: w.name_ar,
      })),
    [rawWarehouses]
  );

  const { data: rawSuppliers } = useSuppliers('');
  const suppliers = useMemo(
    () => rawSuppliers.map(s => ({ id: s.id, name: s.name })),
    [rawSuppliers]
  );

  const { brands: dbBrands } = useBrandSuggestions({ companyId });

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

  const { data: supplierProductIds } = useSupplierProductIds(
    companyId,
    selectedSupplierId.trim() !== '' ? selectedSupplierId : null
  );

  const { data: rawProductSupplierMap } = useProductSupplierMap(companyId);
  const productSupplierMap: Record<string, string | undefined> = useMemo(
    () => rawProductSupplierMap ?? {},
    [rawProductSupplierMap]
  );

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

  const displayedProducts = useMemo(() => {
    let result = products;

    if (filterMode === 'critical_stock') {
      result = result.filter(p => Boolean(p.isLowStock) && p.stock_quantity > 0);
    } else if (filterMode === 'out_of_stock') {
      result = result.filter(p => p.stock_quantity <= 0);
    }

    if (selectedBrand.trim() !== '') {
      const targetBrand = selectedBrand.trim().toLowerCase();
      result = result.filter(p => (p.brand ?? '').trim().toLowerCase() === targetBrand);
    }

    if (selectedSupplierId.trim() !== '') {
      const supplierSet = new Set(supplierProductIds ?? []);
      result = result.filter(
        p => p.supplier_id === selectedSupplierId || supplierSet.has(p.id)
      );
    }

    return result;
  }, [products, filterMode, selectedBrand, selectedSupplierId, supplierProductIds]);

  const stats = useMemo(() => {
    const totalCore = globalStats?.total ?? (filterMode === 'core_only' ? totalCount : 0);
    const criticalCount = globalStats?.critical ?? 0;
    const outOfStockCount = globalStats?.outOfStock ?? 0;
    const safeCount = globalStats?.safe ?? Math.max(0, totalCore - criticalCount - outOfStockCount);
    return { totalCore, criticalCount, outOfStockCount, safeCount };
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

  const hasClientFilter =
    filterMode === 'critical_stock' ||
    filterMode === 'out_of_stock' ||
    selectedBrand.trim() !== '' ||
    selectedSupplierId.trim() !== '';

  const effectiveTotalCount = hasClientFilter ? displayedProducts.length : totalCount;
  const effectiveTotalPages = hasClientFilter
    ? Math.max(1, Math.ceil(effectiveTotalCount / pageSize))
    : totalPages;

  return {
    filterMode,
    setFilterMode,
    selectedBrand,
    setSelectedBrand,
    selectedSupplierId,
    setSelectedSupplierId,
    selectedWarehouseId,
    setSelectedWarehouseId,
    activeSearch,
    pageSize,
    setPageSize,
    page,
    isFetching,
    isLoading,
    goToPage,
    warehouses,
    suppliers,
    availableBrands,
    productSupplierMap,
    isStatsFetching,
    onSearch,
    displayedProducts,
    stats,
    handleToggleCore,
    handleRefresh,
    effectiveTotalCount,
    effectiveTotalPages,
  };
}
