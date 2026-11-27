import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import { useAuthStore } from '../../auth/store';
import { productService } from '../../inventory/service';
import type { Product } from '../../inventory/types';
import { summarizeProductBranchAvailability } from '../../inventory/utils/branchStockSummary';
import { useFeedbackStore } from '../../feedback/store';
import { logger } from '../../../core/utils/logger';

/**
 * useProductSelectionTable
 * ----------------------------------------
 * Encapsulates the product-table data logic of ProductSelectionModal:
 * server-side normalized search across full catalog, warehouse-aware stock checks,
 * in-stock filter, column sorting, client pagination, and keyboard navigation.
 */
interface UseProductSelectionTableOptions {
  isOpen: boolean;
  initialQuery: string;
  effectiveBranchId: string | null;
  filterBySelectedBranch?: boolean;
  warehouseId?: string | null | undefined;
  mode?: 'sale' | 'purchase' | 'quotation';
  onSelect: (product: Product) => void;
}

export function useProductSelectionTable({
  isOpen,
  initialQuery,
  effectiveBranchId,
  filterBySelectedBranch = false,
  warehouseId,
  mode = 'sale',
  onSelect,
}: UseProductSelectionTableOptions) {
  const { showToast } = useFeedbackStore();
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';

  // Query / filter state
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [showInStockOnly, setShowInStockOnly] = useState(false);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const focusSourceRef = useRef<'keyboard' | 'mouse'>('mouse');
  const [selectedPreviewProduct, setSelectedPreviewProduct] = useState<Product | null>(null);

  // Column sorting state
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    null
  );

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  // Map sort config to SQL sort keys
  const sqlSortKey = useMemo(() => {
    if (!sortConfig) return 'updated_at';
    switch (sortConfig.key) {
      case 'name':
        return 'name_ar';
      case 'part_number':
        return 'part_number';
      case 'sku':
        return 'sku';
      default:
        return 'updated_at';
    }
  }, [sortConfig]);

  const sqlSortDir = sortConfig?.direction || 'desc';

  // Server-side search & fetch via high-performance RPC
  const { data: rawProducts = [], isLoading } = useQuery<Product[]>({
    queryKey: [
      'product_selection_table',
      companyId,
      submittedQuery.trim(),
      effectiveBranchId,
      warehouseId ?? 'none',
      sqlSortKey,
      sqlSortDir,
    ],
    queryFn: async () => {
      if (!companyId) return [];

      try {
        const { data, error } = await supabase.rpc('search_inventory_paginated', {
          p_company_id: companyId,
          p_term: submittedQuery.trim(),
          p_limit: filterBySelectedBranch ? 200 : 100,
          p_offset: 0,
          p_sort_key: sqlSortKey,
          p_sort_dir: sqlSortDir,
          ...(effectiveBranchId ? { p_branch_id: effectiveBranchId } : {}),
        });

        if (error) {
          logger.warn('useProductSelectionTable', 'RPC search error, falling back:', error.message);
          const fallbackProds = await productService.getProducts(
            companyId,
            1,
            80,
            warehouseId,
            undefined,
            effectiveBranchId
          );
          const q = submittedQuery.trim().toLowerCase();
          if (!q) return fallbackProds;
          return fallbackProds.filter(
            p =>
              p.name.toLowerCase().includes(q) ||
              p.name_ar.toLowerCase().includes(q) ||
              p.sku?.toLowerCase().includes(q) ||
              p.part_number?.toLowerCase().includes(q) ||
              p.barcode?.toLowerCase().includes(q)
          );
        }

        return productService.mapRawProducts(data ?? [], warehouseId, effectiveBranchId);
      } catch (err) {
        logger.error('useProductSelectionTable', 'Failed to fetch products:', err);
        return [];
      }
    },
    enabled: isOpen && !!companyId,
    staleTime: 1000 * 60,
    placeholderData: prev => prev,
  });

  // In-stock & explicit branch filter
  const filteredProducts = useMemo(() => {
    let list = rawProducts;
    if (filterBySelectedBranch && effectiveBranchId !== null) {
      list = list.filter(p => {
        const avail = summarizeProductBranchAvailability(p, effectiveBranchId);
        return avail.currentBranchQty > 0;
      });
    }
    if (!showInStockOnly) return list;
    return list.filter(p => (p.stock_quantity ?? 0) > 0);
  }, [rawProducts, showInStockOnly, filterBySelectedBranch, effectiveBranchId]);

  // Client-side Sort products for all sortable columns including branch, stock, price, brand
  const products = useMemo(() => {
    if (!sortConfig) return filteredProducts;
    const { key, direction } = sortConfig;

    return [...filteredProducts].sort((a, b) => {
      if (key === 'branch') {
        const avA = summarizeProductBranchAvailability(a, effectiveBranchId);
        const avB = summarizeProductBranchAvailability(b, effectiveBranchId);
        const primaryA = avA.stockedBranches[0] ?? avA.allBranches[0];
        const primaryB = avB.stockedBranches[0] ?? avB.allBranches[0];
        const hasStockA = avA.stockedBranches.length > 0 ? 0 : 1;
        const hasStockB = avB.stockedBranches.length > 0 ? 0 : 1;
        if (hasStockA !== hasStockB) return hasStockA - hasStockB;

        const labelA = primaryA?.shortLabel ?? '';
        const labelB = primaryB?.shortLabel ?? '';
        const cmp = labelA.localeCompare(labelB, 'ar');
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;

        const qtyA = primaryA?.quantity ?? 0;
        const qtyB = primaryB?.quantity ?? 0;
        return direction === 'asc' ? qtyB - qtyA : qtyA - qtyB;
      }

      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (key) {
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          break;
        case 'part_number':
          aVal = a.part_number || '';
          bVal = b.part_number || '';
          break;
        case 'brand':
          aVal = a.brand || '';
          bVal = b.brand || '';
          break;
        case 'stock':
          aVal = a.stock_quantity ?? 0;
          bVal = b.stock_quantity ?? 0;
          break;
        case 'price':
          aVal = mode === 'purchase' ? a.cost_price || 0 : ((a.selling_price || a.sale_price) ?? 0);
          bVal = mode === 'purchase' ? b.cost_price || 0 : ((b.selling_price || b.sale_price) ?? 0);
          break;
        case 'size':
          aVal = a.size || '';
          bVal = b.size || '';
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();
      if (strA < strB) return direction === 'asc' ? -1 : 1;
      if (strA > strB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredProducts, sortConfig, mode, effectiveBranchId]);

  // Handle column header click for sorting
  const handleSort = (colId: string) => {
    if (colId === 'index' || colId === 'actions' || colId === 'specs') return;
    setSortConfig(prev => {
      if (prev?.key === colId) {
        return prev.direction === 'asc' ? { key: colId, direction: 'desc' } : null;
      }
      return { key: colId, direction: 'asc' };
    });
  };

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const safePage = Math.min(page, totalPages);

  // Reset to page 1 when filters/sort change
  useEffect(() => {
    setPage(1);
  }, [submittedQuery, showInStockOnly, filterBySelectedBranch, sortConfig, effectiveBranchId]);

  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return products.slice(start, start + pageSize);
  }, [products, safePage, pageSize]);

  const handlePageChange = (newPage: number) => {
    setPage(Math.max(1, Math.min(totalPages, newPage)));
    setFocusedIndex(-1);
  };

  // Reset local query when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalQuery(initialQuery);
      setSubmittedQuery(initialQuery);
    }
  }, [isOpen, initialQuery]);

  // Live debounced search: updates submittedQuery automatically when user types
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setSubmittedQuery(localQuery);
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [localQuery, isOpen]);

  const handleQuickSelect = useCallback(
    (product: Product) => {
      if (mode === 'sale') {
        const effectiveQty = product.stock_quantity ?? 0;
        if (effectiveQty <= 0) {
          showToast(`تنبيه: المنتج "${product.name}" رصيده 0 في هذا الفرع`, 'warning');
        }
      }
      onSelect(product);
    },
    [mode, showToast, onSelect]
  );

  // Seamless keyboard navigation directly from the search input (ArrowDown/ArrowUp + Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (paginatedProducts.length === 0) return;
      e.preventDefault();
      focusSourceRef.current = 'keyboard';
      setFocusedIndex(prev => {
        const max = paginatedProducts.length - 1;
        if (prev < 0) {
          const idx = e.key === 'ArrowDown' ? 0 : max;
          setSelectedPreviewProduct(paginatedProducts[idx] ?? null);
          return idx;
        }
        const next = Math.max(0, Math.min(max, e.key === 'ArrowDown' ? prev + 1 : prev - 1));
        setSelectedPreviewProduct(paginatedProducts[next] ?? null);
        return next;
      });
      return;
    }
    if (e.key === 'Enter') {
      if (focusedIndex >= 0 && focusedIndex < paginatedProducts.length) {
        e.preventDefault();
        const selected = paginatedProducts[focusedIndex];
        if (selected) {
          handleQuickSelect(selected);
          return;
        }
      }
      setSubmittedQuery(localQuery);
    }
  };

  // Track double-click state
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = useRef<Record<string, number>>({});

  const handleRowClick = (p: Product) => {
    setSelectedPreviewProduct(p);
    const id = p.id;
    clickCountRef.current[id] = (clickCountRef.current[id] ?? 0) + 1;

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current[id] = 0;
    }, 300);

    if (clickCountRef.current[id] >= 2) {
      clickCountRef.current[id] = 0;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      handleQuickSelect(p);
    }
  };

  const handleHoverRow = useCallback((idx: number) => {
    focusSourceRef.current = 'mouse';
    setFocusedIndex(idx);
  }, []);

  // Keyboard navigation: Arrow Up/Down + Enter for selection
  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusSourceRef.current = 'keyboard';
        setFocusedIndex(prev => {
          const max = paginatedProducts.length - 1;
          if (max < 0) return -1;
          if (prev < 0) return 0;
          const next = e.key === 'ArrowDown' ? prev + 1 : prev - 1;
          const clamped = Math.max(0, Math.min(max, next));
          setSelectedPreviewProduct(paginatedProducts[clamped] ?? null);
          return clamped;
        });
      } else if (
        e.key === 'Enter' &&
        focusedIndex >= 0 &&
        focusedIndex < paginatedProducts.length
      ) {
        e.preventDefault();
        const product = paginatedProducts[focusedIndex];
        if (product) {
          handleQuickSelect(product);
        }
      }
    },
    [paginatedProducts, focusedIndex, handleQuickSelect]
  );

  // Scroll focused row into view ONLY on keyboard navigation — NEVER on mouse hover (prevents scroll jitter!)
  useEffect(() => {
    if (focusSourceRef.current === 'keyboard' && focusedIndex >= 0 && tableBodyRef.current) {
      const row = tableBodyRef.current.children[focusedIndex] as HTMLElement | undefined;
      row?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  // Reset keyboard focus when products change or modal opens/closes
  useEffect(() => {
    setFocusedIndex(-1);
    setSelectedPreviewProduct(null);
  }, [products, isOpen]);

  return {
    localQuery,
    setLocalQuery,
    submittedQuery,
    setSubmittedQuery,
    showInStockOnly,
    setShowInStockOnly,
    products,
    isLoading,
    sortConfig,
    handleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    safePage,
    paginatedProducts,
    handlePageChange,
    focusedIndex,
    setFocusedIndex,
    handleHoverRow,
    selectedPreviewProduct,
    tableBodyRef,
    handleKeyDown,
    handleTableKeyDown,
    handleRowClick,
    handleQuickSelect,
  };
}
