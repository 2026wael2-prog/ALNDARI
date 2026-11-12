/**
 * productQueryService
 * ===================
 * الطبقة الموحدة والمدروسة لجلب منتجات المخزون من Supabase
 *
 * الميزات والمعايير:
 * 1. استدعاء دوال الـ RPC عالية الأداء (search_inventory_paginated / get_products_paged).
 * 2. دعم عزل الفروع والمستودعات والمنتجات المفضلة (is_core) بدقة.
 * 3. خيارات كاش محسوبة (staleTime / gcTime) لتفادي الطلبات الشبكية المكررة.
 * 4. نمط Fallback موثوق يتعامل مع انقطاع الشبكة بدون إيقاف الشاشات.
 * 5. توحيد بنية كائنات المنتج بين المخزن ونقاط البيع والفواتير والمشتريات.
 *
 * @module features/inventory/services/productQueryService
 */

import { supabase } from '../../../lib/supabaseClient';
import { productService } from './productService';
import type { Product } from '../types';
import { logger } from '../../../core/utils/logger';
import { normalizeArabic } from '../../../core/utils/search';
import { optArg } from '@/core/utils/rpcArgs';

export interface ProductQueryFilters {
  searchTerm?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sortKey?: string | undefined;
  sortDir?: ('asc' | 'desc') | undefined;
  branchId?: string | null | undefined;
  warehouseId?: string | null | undefined;
  isCore?: boolean | null | undefined;
  inStockOnly?: boolean | undefined;
}

export interface PaginatedProductsResponse {
  data: Product[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const productQueryKeys = {
  all: ['products'] as const,
  lists: () => [...productQueryKeys.all, 'list'] as const,
  paginated: (companyId: string, filters: ProductQueryFilters) =>
    [
      ...productQueryKeys.all,
      'paginated',
      companyId,
      filters.page ?? 1,
      filters.pageSize ?? 50,
      filters.searchTerm ?? '',
      filters.sortKey ?? 'updated_at',
      filters.sortDir ?? 'desc',
      filters.branchId ?? null,
      filters.warehouseId ?? null,
      filters.isCore ?? null,
    ] as const,
  search: (companyId: string, term: string, branchId?: string | null) =>
    [...productQueryKeys.all, 'search', companyId, term, branchId] as const,
  minimal: (companyId: string, limit = 1000) =>
    [...productQueryKeys.all, 'minimal', companyId, limit] as const,
  detail: (id: string) => [...productQueryKeys.all, 'detail', id] as const,
  popular: (companyId: string, branchId?: string | null) =>
    [...productQueryKeys.all, 'popular', companyId, branchId] as const,
};

export const productQueryService = {
  /**
   * جلب المنتجات المصفحة عبر الـ RPC المحسّن search_inventory_paginated
   */
  async fetchPaginated(
    companyId: string,
    filters: ProductQueryFilters = {}
  ): Promise<PaginatedProductsResponse> {
    if (!companyId) {
      return { data: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 };
    }

    const {
      searchTerm = '',
      page = 1,
      pageSize = 50,
      sortKey = 'updated_at',
      sortDir = 'desc',
      branchId,
      warehouseId,
      isCore,
      inStockOnly,
    } = filters;

    const offset = Math.max(0, (page - 1) * pageSize);
    const cleanTerm = normalizeArabic(searchTerm).trim();

    try {
      const { data, error } = await supabase.rpc('search_inventory_paginated', {
        p_company_id: companyId,
        p_term: cleanTerm,
        p_limit: pageSize,
        p_offset: offset,
        p_sort_key: sortKey,
        p_sort_dir: sortDir,
        ...(branchId ? { p_branch_id: branchId } : {}),
        ...optArg('p_is_core', isCore),
      });

      if (error) {
        logger.warn('productQueryService', 'search_inventory_paginated error, using service fallback:', error.message);
        return await this.fetchDirectFallback(companyId, filters);
      }

      let products = productService.mapRawProducts(data ?? [], warehouseId, branchId);

      if (inStockOnly) {
        products = products.filter(p => (p.stock_quantity ?? 0) > 0);
      }

      const totalCount = (data as any)?.[0]?.total_count ?? products.length;
      const totalPages = Math.ceil(totalCount / pageSize);

      return {
        data: products,
        totalCount,
        page,
        pageSize,
        totalPages: Math.max(1, totalPages),
      };
    } catch (err) {
      logger.error('productQueryService', 'Exception in fetchPaginated:', err);
      return await this.fetchDirectFallback(companyId, filters);
    }
  },

  /**
   * استعلام مباشر كبديل آمن عند انقطاع الـ RPC
   */
  async fetchDirectFallback(
    companyId: string,
    filters: ProductQueryFilters
  ): Promise<PaginatedProductsResponse> {
    const {
      searchTerm = '',
      page = 1,
      pageSize = 50,
      sortKey = 'created_at',
      sortDir = 'desc',
      branchId,
      warehouseId,
      isCore,
    } = filters;

    const from = Math.max(0, (page - 1) * pageSize);
    const to = from + pageSize - 1;

    let query = supabase
      .from('products')
      .select(
        `
          id, company_id, name_ar, sku, part_number, brand, category_id, size, description,
          purchase_price, sale_price, min_stock_level, unit, image_url, is_core,
          alternative_numbers, barcode, created_at, updated_at, status,
          category:product_categories(id, name),
          stock:product_stock(quantity, warehouse_id, warehouses(name_ar, branch_id, branches(id, name)))
        `,
        { count: 'exact' }
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or('status.eq.active,status.is.null');

    if (isCore !== undefined && isCore !== null) {
      query = query.eq('is_core', isCore);
    }

    const clean = searchTerm.trim();
    if (clean) {
      query = query.or(
        `name_ar.ilike.%${clean}%,sku.ilike.%${clean}%,part_number.ilike.%${clean}%,barcode.ilike.%${clean}%,brand.ilike.%${clean}%`
      );
    }

    const validCols: Record<string, string> = {
      name_ar: 'name_ar',
      sku: 'sku',
      part_number: 'part_number',
      brand: 'brand',
      sale_price: 'sale_price',
      created_at: 'created_at',
      updated_at: 'updated_at',
    };
    const orderCol = validCols[sortKey] || 'created_at';
    query = query.order(orderCol, { ascending: sortDir === 'asc' }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    const products = productService.mapRawProducts(data ?? [], warehouseId, branchId);
    const totalCount = count ?? products.length;

    return {
      data: products,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },

  /**
   * بحث سريع خفيف للقوائم المنسدلة واختيار الأصناف
   */
  async searchQuick(
    companyId: string,
    term: string,
    branchId?: string | null,
    limit = 30
  ): Promise<Product[]> {
    if (!companyId || !term.trim()) return [];
    const cleanTerm = normalizeArabic(term).trim();

    try {
      const { data, error } = await supabase.rpc('search_inventory_paginated', {
        p_company_id: companyId,
        p_term: cleanTerm,
        p_limit: limit,
        p_offset: 0,
        p_sort_key: 'updated_at',
        p_sort_dir: 'desc',
        ...(branchId ? { p_branch_id: branchId } : {}),
      });

      if (!error && Array.isArray(data)) {
        return productService.mapRawProducts(data, undefined, branchId);
      }
    } catch {
      // Fallback
    }

    return productService.getProducts(companyId, 1, limit, undefined, undefined, branchId);
  },

  /**
   * قائمة المنتجات الخفيفة (Minimal) للقوائم السريعة والـ Select
   */
  async getMinimalList(companyId: string, limit = 1000) {
    return productService.getMinimalProducts(companyId, limit);
  },

  /**
   * تفاصيل منتج محدد مع أرصدته في جميع المستودعات
   */
  async getProductDetails(id: string) {
    return productService.getProductById(id);
  },
};

