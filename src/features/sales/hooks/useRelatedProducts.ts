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
  /** Explicitly selected product (via click or keyboard arrow — NEVER passive mouse hover) */
  selectedProduct: Product | null;
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

function buildContextText(searchQuery: string, selectedProduct: Product | null): string {
  const q = searchQuery.trim();
  const pBaseName = selectedProduct
    ? selectedProduct.name_ar !== ''
      ? selectedProduct.name_ar
      : selectedProduct.name
    : '';
  const pName = selectedProduct ? `${pBaseName} ${selectedProduct.brand ?? ''}`.trim() : '';

  if (q.length >= 2) {
    const qAnalysis = analyzeAutomotiveQuery(q);
    if (qAnalysis.matchedSystems.length > 0) {
      return pName !== '' && qAnalysis.vehicleTokens.length === 0 ? `${q} ${pName}` : q;
    }
  }
  return pName !== '' ? pName : q;
}

/* eslint-disable complexity -- strict multi-factor relevance scoring requiring vehicle match when vehicle context exists */
function scoreCompanionProduct(product: Product, ctx: ScoreContext): number {
  const baseName = product.name_ar !== '' ? product.name_ar : product.name;
  const normName = normalizeAutomotiveText(
    `${baseName} ${product.specifications ?? ''} ${product.brand ?? ''}`
  );

  let vehicleMatchCount = 0;
  for (const v of ctx.normVehicles) {
    if (v !== '' && normName.includes(v)) vehicleMatchCount += 1;
  }

  const partFamilyMatch =
    ctx.partPrefix !== null && (product.part_number?.startsWith(ctx.partPrefix) ?? false);

  // Strict accuracy rule: when a car model is specified (e.g. هايلوكس / كامري),
  // discard unrelated car models unless they share the exact OEM part-number family.
  if (ctx.normVehicles.length > 0 && vehicleMatchCount === 0 && !partFamilyMatch) {
    return -1;
  }

  let companionMatchCount = 0;
  for (const t of ctx.normSearchTokens) {
    if (t !== '' && normName.includes(t)) companionMatchCount += 1;
  }

  if (companionMatchCount === 0 && !partFamilyMatch) {
    return -1;
  }

  let score = vehicleMatchCount * 60 + companionMatchCount * 30;
  if (partFamilyMatch) score += 50;

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
    score += 5;
  }

  return score;
}

async function fetchCompanionCandidates(params: {
  companyId: string;
  queryTokens: readonly string[];
  vehicleTokens: readonly string[];
  partPrefix: string | null;
  warehouseId?: string | null | undefined;
  effectiveBranchId: string | null;
}): Promise<Product[]> {
  const orClauses: string[] = params.queryTokens.map(tok => `name_ar.ilike.%${tok}%`);
  if (params.partPrefix !== null) {
    orClauses.push(`part_number.ilike.${sanitizeFilterToken(params.partPrefix)}%`);
  }
  if (orClauses.length === 0) return [];

  let query = supabase
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
    .or(orClauses.join(','));

  // Push the primary vehicle model token directly into SQL for laser-accurate DB results
  const primaryVehicle = params.vehicleTokens.at(0);
  if (primaryVehicle !== undefined && sanitizeFilterToken(primaryVehicle).length >= 2) {
    query = query.ilike('name_ar', `%${sanitizeFilterToken(primaryVehicle)}%`);
  }

  const { data, error } = await query.limit(24);
  if (error !== null) return [];
  return productService.mapRawProducts(data, params.warehouseId, params.effectiveBranchId);
}

/**
 * useRelatedProducts
 * ----------------------------------------------------------------------------
 * High-precision companion-parts hook for ProductSelectionModal:
 * - Only activates on an explicit search query (>= 2 chars) or explicit product
 *   selection — never flickers on passive mouse hover or empty search.
 * - Filters strictly by vehicle model in SQL & scoring so recommendations are
 *   laser-accurate for the customer's exact car.
 */
/* eslint-disable max-lines-per-function, complexity -- cohesive React Query hook for accurate vehicle-scoped companion parts */
export function useRelatedProducts({
  searchQuery,
  selectedProduct,
  excludeProductIds,
  effectiveBranchId,
  warehouseId,
  enabled,
}: UseRelatedProductsOptions): RelatedProductsResult {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';

  const hasExplicitContext = searchQuery.trim().length >= 2 || selectedProduct !== null;

  const contextText = useMemo(
    () => (hasExplicitContext ? buildContextText(searchQuery, selectedProduct) : ''),
    [hasExplicitContext, searchQuery, selectedProduct]
  );

  const relation = useMemo(() => analyzeAutomotiveQuery(contextText), [contextText]);
  const partPrefix = useMemo(
    () => extractPartNumberPrefix(selectedProduct?.part_number),
    [selectedProduct?.part_number]
  );
  const queryTokens = useMemo(
    () => relation.searchTokens.map(sanitizeFilterToken).filter(t => t.length >= 2).slice(0, 6),
    [relation.searchTokens]
  );

  const shouldFetch =
    enabled &&
    hasExplicitContext &&
    companyId !== '' &&
    (queryTokens.length > 0 || partPrefix !== null);

  const { data: candidates = [], isLoading } = useQuery<Product[]>({
    queryKey: [
      'related_companion_products_v2',
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
        vehicleTokens: relation.vehicleTokens,
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
        selectedProduct?.brand !== null && selectedProduct?.brand !== undefined
          ? normalizeAutomotiveText(selectedProduct.brand)
          : '',
    }),
    [relation.vehicleTokens, queryTokens, partPrefix, selectedProduct?.brand]
  );

  const relatedProducts = useMemo(() => {
    if (candidates.length === 0) return [];
    const selectedId = selectedProduct?.id;

    return candidates
      .filter(p => p.id !== selectedId && !excludeSet.has(p.id))
      .map(p => ({ product: p, score: scoreCompanionProduct(p, scoreCtx) }))
      .filter(entry => entry.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(entry => entry.product);
  }, [candidates, excludeSet, selectedProduct?.id, scoreCtx]);

  const contextLabel =
    selectedProduct !== null
      ? selectedProduct.name !== ''
        ? selectedProduct.name
        : selectedProduct.name_ar
      : searchQuery.trim();

  return {
    relation,
    relatedProducts,
    isLoading: shouldFetch && isLoading,
    contextLabel,
  };
}
