import { useEffect, useMemo, useState } from 'react';
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

interface ScoreContext {
  normVehicles: readonly string[];
  normSearchTokens: readonly string[];
  partPrefix: string | null;
  focusedBrandNorm: string;
}

function extractPartNumberPrefix(partNumber?: string | null): string | null {
  if (partNumber === null || partNumber === undefined || partNumber.trim() === '') return null;
  const cleaned = partNumber.trim();
  const dashIdx = cleaned.indexOf('-');
  if (dashIdx >= 4 && dashIdx <= 7) {
    return cleaned.slice(0, dashIdx);
  }
  return null;
}

function sanitizeFilterToken(token: string): string {
  return token.replace(/[%_,()]/g, '').trim();
}

function buildContextText(searchQuery: string, focusedProduct: Product | null): string {
  const q = searchQuery.trim();
  const pBaseName = focusedProduct
    ? focusedProduct.name_ar !== ''
      ? focusedProduct.name_ar
      : focusedProduct.name
    : '';
  const pName = focusedProduct ? `${pBaseName} ${focusedProduct.brand ?? ''}`.trim() : '';

  if (q.length >= 2) {
    const qAnalysis = analyzeAutomotiveQuery(q);
    if (qAnalysis.matchedSystems.length > 0) {
      return pName !== '' && qAnalysis.vehicleTokens.length === 0 ? `${q} ${pName}` : q;
    }
  }
  return pName !== '' ? pName : q;
}

/* eslint-disable complexity -- multi-factor relevance scoring across vehicle, OEM prefix, companion terms, brand & stock */
function scoreCompanionProduct(product: Product, ctx: ScoreContext): number {
  const baseName = product.name_ar !== '' ? product.name_ar : product.name;
  const normName = normalizeAutomotiveText(
    `${baseName} ${product.specifications ?? ''} ${product.brand ?? ''}`
  );
  let score = 0;

  for (const v of ctx.normVehicles) {
    if (v !== '' && normName.includes(v)) score += 50;
  }

  if (ctx.partPrefix !== null && (product.part_number?.startsWith(ctx.partPrefix) ?? false)) {
    score += 40;
  }

  for (const t of ctx.normSearchTokens) {
    if (t !== '' && normName.includes(t)) score += 25;
  }

  if (
    ctx.focusedBrandNorm !== '' &&
    product.brand !== null &&
    normalizeAutomotiveText(product.brand) === ctx.focusedBrandNorm
  ) {
    score += 10;
  }

  if (product.stock_quantity > 0) {
    score += 15;
  } else if (
    Array.isArray(product.warehouse_distribution) &&
    product.warehouse_distribution.some(w => w.quantity > 0)
  ) {
    score += 6;
  }

  return score;
}

async function fetchCompanionCandidates(params: {
  companyId: string;
  queryTokens: readonly string[];
  partPrefix: string | null;
  warehouseId?: string | null | undefined;
  effectiveBranchId: string | null;
}): Promise<Product[]> {
  const orClauses: string[] = params.queryTokens.map(tok => `name_ar.ilike.%${tok}%`);
  if (params.partPrefix !== null) {
    orClauses.push(`part_number.ilike.${sanitizeFilterToken(params.partPrefix)}%`);
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
    .eq('company_id', params.companyId)
    .is('deleted_at', null)
    .or(orClauses.join(','))
    .limit(36);

  if (error !== null) return [];
  return productService.mapRawProducts(data, params.warehouseId, params.effectiveBranchId);
}

/**
 * useRelatedProducts
 * ----------------------------------------------------------------------------
 * Smart companion-parts hook for ProductSelectionModal:
 * - Debounces rapid row hover (`focusedProduct`) by 280ms to prevent query storms
 *   and UI flicker while gliding the cursor across rows.
 * - Analyzes query/product via the automotive mechanical-systems graph.
 * - Fetches real companion products in a single cached Supabase query and ranks
 *   them by vehicle match, OEM part-number family, companion terms, and stock.
 */
/* eslint-disable max-lines-per-function, complexity -- cohesive React Query hook combining hover debounce, query & ranking */
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

  // Debounce focusedProduct so moving the mouse across rows never triggers rapid queries
  const [debouncedFocused, setDebouncedFocused] = useState<Product | null>(focusedProduct);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFocused(focusedProduct);
    }, 280);
    return () => {
      clearTimeout(timer);
    };
  }, [focusedProduct]);

  const contextText = useMemo(
    () => buildContextText(searchQuery, debouncedFocused),
    [searchQuery, debouncedFocused]
  );

  const relation = useMemo(() => analyzeAutomotiveQuery(contextText), [contextText]);
  const partPrefix = useMemo(
    () => extractPartNumberPrefix(debouncedFocused?.part_number),
    [debouncedFocused?.part_number]
  );
  const queryTokens = useMemo(
    () => relation.searchTokens.map(sanitizeFilterToken).filter(t => t.length >= 2).slice(0, 6),
    [relation.searchTokens]
  );

  const shouldFetch =
    enabled && companyId !== '' && (queryTokens.length > 0 || partPrefix !== null);

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
    queryFn: () =>
      fetchCompanionCandidates({
        companyId,
        queryTokens,
        partPrefix,
        warehouseId,
        effectiveBranchId,
      }),
  });

  const excludeSet = useMemo(() => new Set(excludeProductIds), [excludeProductIds]);
  const scoreCtx = useMemo<ScoreContext>(
    () => ({
      normVehicles: relation.vehicleTokens.map(normalizeAutomotiveText),
      normSearchTokens: queryTokens.map(normalizeAutomotiveText),
      partPrefix,
      focusedBrandNorm:
        debouncedFocused?.brand !== null && debouncedFocused?.brand !== undefined
          ? normalizeAutomotiveText(debouncedFocused.brand)
          : '',
    }),
    [relation.vehicleTokens, queryTokens, partPrefix, debouncedFocused?.brand]
  );

  const relatedProducts = useMemo(() => {
    if (candidates.length === 0) return [];
    const focusedId = debouncedFocused?.id;

    return candidates
      .filter(p => p.id !== focusedId && !excludeSet.has(p.id))
      .map(p => ({ product: p, score: scoreCompanionProduct(p, scoreCtx) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(entry => entry.product);
  }, [candidates, excludeSet, debouncedFocused?.id, scoreCtx]);

  const contextLabel =
    debouncedFocused !== null
      ? debouncedFocused.name !== ''
        ? debouncedFocused.name
        : debouncedFocused.name_ar
      : searchQuery.trim();

  return {
    relation,
    relatedProducts,
    isLoading: shouldFetch && isLoading,
    contextLabel,
  };
}
