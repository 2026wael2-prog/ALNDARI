import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import { useAuthStore } from '../../auth/store';
import { productService } from '../../inventory/service';
import type { Product } from '../../inventory/types';
import {
  analyzeAutomotiveQuery,
  normalizeAutomotiveText,
  type AutomotiveRelationResult,
} from '../../ai/automotiveCrossSell';

interface UseRelatedProductsOptions {
  /** Active search query typed by the cashier */
  searchQuery: string;
  /** Currently focused/hovered product in the search table (fallback context) */
  focusedProduct: Product | null;
  /** IDs of products already visible in the primary results to avoid duplication */
  excludeProductIds: string[];
  effectiveBranchId: string | null;
  warehouseId?: string | null | undefined;
  enabled: boolean;
}

export interface RelatedProductsResult {
  relation: AutomotiveRelationResult;
  relatedProducts: Product[];
  isLoading: boolean;
  /** Source text used for generating recommendations (query or focused product name) */
  contextLabel: string;
}

/**
 * Extracts a clean 4-6 char OEM part-number prefix (e.g. "04438" from "04438-0K020")
 * so parts belonging to the same OEM assembly family get boosted.
 */
function extractPartNumberPrefix(partNumber?: string | null): string | null {
  if (!partNumber) return null;
  const cleaned = partNumber.trim();
  const dashIdx = cleaned.indexOf('-');
  if (dashIdx >= 4 && dashIdx <= 7) {
    return cleaned.slice(0, dashIdx);
  }
  return null;
}

/**
 * Escapes special PostgREST ILIKE pattern characters so user/token strings never break `.or(...)`.
 */
function sanitizeFilterToken(token: string): string {
  return token.replace(/[%_,()]/g, '').trim();
}

/**
 * useRelatedProducts
 * ----------------------------------------------------------------------------
 * Smart companion-parts hook for ProductSelectionModal:
 * - Analyzes the current search query (or focused product) via the automotive
 *   mechanical-systems graph.
 * - Fetches real companion products from the company's inventory in a single
 *   lightweight Supabase query, cached with React Query.
 * - Ranks results by vehicle-model match, OEM part-number family match,
 *   companion keyword match, and stock availability.
 */
export function useRelatedProducts({
  searchQuery,
  focusedProduct,
  excludeProductIds,
  effectiveBranchId,
  warehouseId,
  enabled,
}: UseRelatedProductsOptions): RelatedProductsResult {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';

  // Prefer the focused product name when available and matching a system; otherwise use searchQuery
  const contextText = useMemo(() => {
    const q = searchQuery.trim();
    const pName = focusedProduct ? `${focusedProduct.name_ar || focusedProduct.name} ${focusedProduct.brand ?? ''}`.trim() : '';
    if (q.length >= 2) {
      const qAnalysis = analyzeAutomotiveQuery(q);
      if (qAnalysis.matchedSystems.length > 0) {
        // Combine query + focused product vehicle tokens if focused product adds car model context
        return pName && qAnalysis.vehicleTokens.length === 0 ? `${q} ${pName}` : q;
      }
    }
    return pName || q;
  }, [searchQuery, focusedProduct]);

  const relation = useMemo(() => analyzeAutomotiveQuery(contextText), [contextText]);
  const partPrefix = useMemo(
    () => extractPartNumberPrefix(focusedProduct?.part_number),
    [focusedProduct?.part_number]
  );

  const queryTokens = useMemo(() => {
    const safe = relation.searchTokens.map(sanitizeFilterToken).filter(t => t.length >= 2);
    return safe.slice(0, 6);
  }, [relation.searchTokens]);

  const shouldFetch = enabled && Boolean(companyId) && (queryTokens.length > 0 || Boolean(partPrefix));

  const { data: candidates = [], isLoading } = useQuery<Product[]>({
    queryKey: [
      'related_companion_products',
      companyId,
      effectiveBranchId,
      queryTokens.join('|'),
      relation.vehicleTokens.join('|'),
      partPrefix ?? '',
    ],
    enabled: shouldFetch,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      const orClauses: string[] = [];

      for (const tok of queryTokens) {
        orClauses.push(`name_ar.ilike.%${tok}%`);
      }
      if (partPrefix) {
        orClauses.push(`part_number.ilike.${sanitizeFilterToken(partPrefix)}%`);
      }

      if (orClauses.length === 0) return [];

      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:product_categories(id, name),
          stock:product_stock(
            quantity,
            warehouse_id,
            warehouses(
              id,
              name_ar,
              location,
              branch_id,
              branches:branches(id, name, code)
            )
          )
        `
        )
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .or(orClauses.join(','))
        .limit(36);

      if (error || !data) return [];

      return productService.mapRawProducts(data, warehouseId, effectiveBranchId);
    },
  });

  const excludeSet = useMemo(() => new Set(excludeProductIds), [excludeProductIds]);
  const normVehicles = useMemo(
    () => relation.vehicleTokens.map(normalizeAutomotiveText),
    [relation.vehicleTokens]
  );
  const normSearchTokens = useMemo(
    () => queryTokens.map(normalizeAutomotiveText),
    [queryTokens]
  );

  const relatedProducts = useMemo(() => {
    if (candidates.length === 0) return [];

    const focusedId = focusedProduct?.id;
    const focusedBrandNorm = focusedProduct?.brand
      ? normalizeAutomotiveText(focusedProduct.brand)
      : '';

    const scored = candidates
      .filter(p => p.id !== focusedId && !excludeSet.has(p.id))
      .map(p => {
        const normName = normalizeAutomotiveText(
          `${p.name_ar || p.name} ${p.specifications ?? ''} ${p.brand ?? ''}`
        );
        let score = 0;

        // 1. Vehicle model match (highest relevance!)
        for (const v of normVehicles) {
          if (v && normName.includes(v)) {
            score += 50;
          }
        }

        // 2. OEM part-number family prefix match
        if (partPrefix && p.part_number?.startsWith(partPrefix)) {
          score += 40;
        }

        // 3. Companion mechanical term match
        for (const t of normSearchTokens) {
          if (t && normName.includes(t)) {
            score += 25;
          }
        }

        // 4. Brand match
        if (focusedBrandNorm && p.brand && normalizeAutomotiveText(p.brand) === focusedBrandNorm) {
          score += 10;
        }

        // 5. Stock availability boost
        if ((p.stock_quantity ?? 0) > 0) {
          score += 15;
        } else if (
          Array.isArray(p.warehouse_distribution) &&
          p.warehouse_distribution.some(w => (Number(w.quantity) || 0) > 0)
        ) {
          score += 6;
        }

        return { product: p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(entry => entry.product);

    return scored;
  }, [candidates, excludeSet, focusedProduct, normVehicles, normSearchTokens, partPrefix]);

  const contextLabel = focusedProduct?.name || focusedProduct?.name_ar || searchQuery.trim();

  return {
    relation,
    relatedProducts,
    isLoading: shouldFetch && isLoading,
    contextLabel,
  };
}
