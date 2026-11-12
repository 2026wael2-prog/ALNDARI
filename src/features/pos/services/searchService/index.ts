/**
 * POS Smart Search Service
 * Coordinates server-side RPC, sales history, popular products,
 * and comprehensive search across products, categories, and codes.
 */
import { normalizeSearch } from '../../../../core/utils/search';
import { logger } from '../../../../core/utils/logger';
import type { POSSearchFilters, POSSearchResponse, POSSearchResult } from './types';
import { getCachedSearch, setCachedSearch, invalidateSearchCache } from './cache';
import { searchDatabase, searchByBarcode } from './database';
import { getRecentSales, getSalesCounts } from './history';
import { getPopularProducts } from './popular';

export * from './types';

/** Monotonic timer with a Date.now() fallback for non-browser runtimes. */
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Empty response used to fail gracefully when the search pipeline throws. */
const failedResponse = (): POSSearchResponse => ({
  results: [],
  total: 0,
  popular_suggestions: [],
  search_time_ms: 0,
  error: 'search_failed',
});

export const posSearchService = {
  /**
   * Perform a comprehensive POS search with fuzzy matching,
   * popularity scoring, and quick results.
   */
  async search(
    companyId: string,
    query: string,
    filters?: POSSearchFilters,
    limit = 20,
    branchId?: string | null
  ): Promise<POSSearchResponse> {
    try {
      const startTime = now();
      const cacheKey = `${companyId}:${branchId ?? 'all'}:${query}:${JSON.stringify(filters)}:${limit}`;

      // Cache hit
      const cached = getCachedSearch(cacheKey);
      if (cached) {
        return cached;
      }

      const normalizedQuery = normalizeSearch(query).trim();

      // If empty query, return popular products
      if (!normalizedQuery) {
        const popular = await getPopularProducts(companyId, limit, branchId);
        const response: POSSearchResponse = {
          results: popular,
          total: popular.length,
          popular_suggestions: popular.map(p => p.name_ar),
          search_time_ms: now() - startTime,
        };
        setCachedSearch(cacheKey, response);
        return response;
      }

      // Primary: High-speed DB search leveraging GIN index and search_inventory_paginated
      const dbResults = await searchDatabase(companyId, normalizedQuery, filters, limit, branchId);

      // Merge and deduplicate results
      const seen = new Set<string>();
      const merged: POSSearchResult[] = [];

      // Add DB results first (most relevant, with accurate live stock)
      for (const item of dbResults) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }

      let popularSuggestions: string[] = [];

      // Only query secondary fallbacks (sales history & popular) if primary DB search yielded few results (< 5)
      // This saves 2 heavy DB queries per keystroke on 95% of POS searches!
      if (merged.length < 5) {
        const [popularProducts, salesHistory] = await Promise.all([
          getPopularProducts(companyId, 5, branchId),
          getRecentSales(companyId, normalizedQuery, 5),
        ]);

        for (const item of salesHistory) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }

        if (merged.length < 5) {
          for (const item of popularProducts) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
        }

        popularSuggestions = popularProducts.map(p => p.name_ar).slice(0, 5);
      }

      // Sort by score descending
      merged.sort((a, b) => b.score - a.score);

      const response: POSSearchResponse = {
        results: merged.slice(0, limit),
        total: merged.length,
        popular_suggestions: popularSuggestions,
        search_time_ms: now() - startTime,
      };

      // Update cache
      setCachedSearch(cacheKey, response);

      return response;
    } catch (err) {
      // The sub-services catch most failures themselves, but guard the
      // orchestrator as well so a single bad path never produces an
      // unhandled rejection that leaves the UI with no feedback.
      logger.error('pos-search', 'POS search failed:', (err as Error).message);
      return failedResponse();
    }
  },

  searchDatabase,
  getPopularProducts,
  getRecentSales,
  getSalesCounts,

  /**
   * Invalidate the search cache (useful after product updates).
   */
  invalidateCache(): void {
    invalidateSearchCache();
  },

  searchByBarcode,
};

export default posSearchService;
