import { mapRawProducts } from './productMappers';
import type {
  InventoryMovementFeedItem,
  InventoryMovementsFilterParams,
  Product,
  ProductFormData,
} from '../types';
import { inventoryApi, productsApi } from '../api';
import { supabase } from '../../../lib/supabaseClient';
import type { InsertDto } from '../../../core/database.helpers';
import type { TableUpdate } from '@/core/types/supabase-helpers';
import { logger } from '../../../core/utils/logger';
import { parseError } from '../../../core/utils/errorUtils';
import { normalizeArabic } from '../../../core/utils/search';
import { useBranchFilterStore } from '../../branches/store';

/** Shape returned by the product search RPC — minimal fields for dropdowns/rows. */
export interface SearchResultProduct {
  id: string;
  name?: string;
  name_ar?: string;
  part_number?: string | null;
  sku?: string | null;
  brand?: string | null;
  size?: string | null;
  warehouse_distribution?: Array<{ warehouse_id: string; quantity: number }>;
  stock_quantity?: number;
}

/** Raw row fields consumed by `mapSearchRow` (subset shared by RPC + table fallback). */
interface SearchRow {
  id: string;
  name_ar?: string | null;
  sku?: string | null;
  part_number?: string | null;
  brand?: string | null;
  size?: string | null;
  stock?: unknown;
}

/** Maps a raw product row to the search-result shape used by dropdowns/pickers. */
function mapSearchRow(row: SearchRow): SearchResultProduct {
  const stockList = Array.isArray(row.stock) ? row.stock : [];
  const distribution = stockList.map(s => ({
    warehouse_id: s.warehouse_id,
    quantity: Number(s.quantity) || 0,
  }));
  const totalStock = distribution.reduce((sum, s) => sum + s.quantity, 0);

  return {
    id: row.id,
    name: row.name_ar ?? '',
    name_ar: row.name_ar ?? '',
    sku: row.sku ?? null,
    part_number: row.part_number ?? null,
    brand: row.brand ?? null,
    size: row.size ?? null,
    warehouse_distribution: distribution,
    stock_quantity: totalStock,
  };
}

/**
 * Fallback product search using ILIKE when the smart search RPC is unavailable
 * (mirrors the POS fallback so pickers keep working even if the RPC is missing).
 */
async function searchProductsFallback(
  companyId: string,
  term: string,
  limit = 50,
  branchId?: string | null
): Promise<SearchResultProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name_ar, sku, part_number, brand, size, stock:product_stock(warehouse_id, quantity, warehouses(branch_id))'
    )
    .eq('company_id', companyId)
    .eq('status', 'active')
    .or(
      `normalized_search_text.ilike.%${term}%,` +
      `name_ar.ilike.%${term}%,sku.ilike.%${term}%,` +
      `part_number.ilike.%${term}%,alternative_numbers.ilike.%${term}%,` +
      `barcode.ilike.%${term}%`
    )
    .limit(limit);

  if (error) return [];
  return (data as unknown as SearchRow[]).map(row => {
    if (branchId && Array.isArray(row.stock)) {
      const filteredStock = (row.stock as Array<{ warehouse_id: string; quantity: number; warehouses?: { branch_id?: string | null } | null }>).filter(
        s => !s.warehouses || s.warehouses.branch_id === branchId
      );
      return mapSearchRow({ ...row, stock: filteredStock });
    }
    return mapSearchRow(row);
  });
}

let isSimilarProductsRpcAvailable = true;

interface ValidateProductUniquenessParams {
  companyId: string;
  name?: string;
  sku?: string;
  barcode?: string;
  partNumber?: string;
  brand?: string;
  excludeProductId?: string;
}

/**
 * Validates product uniqueness (name, SKU, barcode, and part number + brand) concurrently.
 * Throws a user-friendly error if any unique constraint is violated.
 */
async function validateProductUniqueness({
  companyId,
  name,
  sku,
  barcode,
  partNumber,
  brand,
  excludeProductId,
}: ValidateProductUniquenessParams): Promise<void> {
  const trimmedName = name?.trim();
  const trimmedSku = sku?.trim();
  const trimmedBarcode = barcode?.trim();
  const trimmedPartNo = partNumber?.trim();
  const trimmedBrand = brand?.trim();

  const checks: Array<Promise<void>> = [];

  // 1. Prevent duplicate product name in company
  if (trimmedName) {
    checks.push(
      (async () => {
        let query = supabase
          .from('products')
          .select('id, name_ar')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .ilike('name_ar', trimmedName);

        if (excludeProductId) {
          query = query.neq('id', excludeProductId);
        }

        const { data: existingName } = await query.limit(1);
        if (existingName && existingName.length > 0) {
          const msg = excludeProductId
            ? `يوجد منتج آخر مسجل بنفس الاسم: "${trimmedName}"`
            : `يوجد منتج مسجل مسبقاً بنفس الاسم: "${trimmedName}"`;
          throw new Error(msg);
        }
      })()
    );
  }

  // 2. Prevent duplicate SKU in company
  if (trimmedSku) {
    checks.push(
      (async () => {
        let query = supabase
          .from('products')
          .select('id, name_ar, sku')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .eq('sku', trimmedSku);

        if (excludeProductId) {
          query = query.neq('id', excludeProductId);
        }

        const { data: existingSku } = await query.limit(1);
        if (existingSku && existingSku.length > 0) {
          const msg = excludeProductId
            ? `رمز الصنف (SKU: ${trimmedSku}) مسجل مسبقاً لمنتج آخر: "${existingSku[0].name_ar}"`
            : `رمز الصنف (SKU: ${trimmedSku}) مسجل مسبقاً للمنتج: "${existingSku[0].name_ar}"`;
          throw new Error(msg);
        }
      })()
    );
  }

  // 3. Prevent duplicate Barcode in company
  if (trimmedBarcode) {
    checks.push(
      (async () => {
        let query = supabase
          .from('products')
          .select('id, name_ar, barcode')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .eq('barcode', trimmedBarcode);

        if (excludeProductId) {
          query = query.neq('id', excludeProductId);
        }

        const { data: existingBarcode } = await query.limit(1);
        if (existingBarcode && existingBarcode.length > 0) {
          const msg = excludeProductId
            ? `الباركود (${trimmedBarcode}) مسجل مسبقاً لمنتج آخر: "${existingBarcode[0].name_ar}"`
            : `الباركود (${trimmedBarcode}) مسجل مسبقاً للمنتج: "${existingBarcode[0].name_ar}"`;
          throw new Error(msg);
        }
      })()
    );
  }

  // 4. Prevent duplicate Part Number + Brand in company
  if (trimmedPartNo) {
    checks.push(
      (async () => {
        let query = supabase
          .from('products')
          .select('id, name_ar, part_number, brand')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .ilike('part_number', trimmedPartNo);

        if (trimmedBrand) {
          query = query.ilike('brand', trimmedBrand);
        }
        if (excludeProductId) {
          query = query.neq('id', excludeProductId);
        }

        const { data: existingPart } = await query.limit(1);
        if (existingPart && existingPart.length > 0) {
          const brandPart = trimmedBrand ? ` - ${trimmedBrand}` : '';
          const msg = excludeProductId
            ? `رقم القطعة (${trimmedPartNo}${brandPart}) مسجل مسبقاً لمنتج آخر: "${existingPart[0].name_ar}"`
            : `رقم القطعة (${trimmedPartNo}${brandPart}) مسجل مسبقاً للمنتج: "${existingPart[0].name_ar}"`;
          throw new Error(msg);
        }
      })()
    );
  }

  if (checks.length > 0) {
    await Promise.all(checks);
  }
}

export const productService = {
  /**
   * Get all products for a company
   */
  /* eslint-disable-next-line max-params -- legacy adapter signature mirroring the inventoryService facade; changing it would ripple through every caller */
  getProducts: async (
    companyId: string,
    page = 1,
    limitNum = 500,
    warehouseId?: string | null,
    signal?: AbortSignal,
    branchId?: string | null
  ): Promise<Product[]> => {
    const { data, error } = await inventoryApi.getProducts(companyId, page, limitNum, signal);
    if (error) throw parseError(error);
    return productService.mapRawProducts(data || [], warehouseId, branchId);
  },

  /**
   * High-performance fetch for stocked products only (used by dashboard and rebalancing engine).
   * Bypasses full catalog scanning and returns in ~15ms instead of multiple seconds.
   */
  getProductsWithStock: async (companyId: string, signal?: AbortSignal): Promise<Product[]> => {
    try {
      const { data, error } = await inventoryApi.getProductsWithStock(companyId, signal);
      if (error) throw parseError(error);
      return productService.mapRawProducts(data || []);
    } catch {
      // Graceful fallback to paginated getProducts
      return productService.getProducts(companyId, 1, 500, undefined, signal);
    }
  },

  mapRawProducts,

  /**
   * Get a single product by ID
   */
  getProductById: async (id: string) => {
    const { data, error } = await inventoryApi.getProductById(id);
    if (error) throw parseError(error);
    return { data };
  },

  /**
   * Search products using advanced database search.
   * Uses the paginated search RPC (granted to `authenticated`) with an ILIKE
   * fallback so product pickers keep working even if the RPC is unavailable.
   */
  searchProducts: async (
    companyId: string,
    term: string,
    branchId?: string | null
  ): Promise<SearchResultProduct[]> => {
    const cleanTerm = normalizeArabic(term).trim();
    try {
      const { data, error } = await supabase.rpc('search_inventory_paginated', {
        p_company_id: companyId,
        p_term: cleanTerm,
        p_limit: 50,
        p_offset: 0,
        p_sort_key: 'updated_at',
        p_sort_dir: 'desc',
        ...(branchId ? { p_branch_id: branchId } : {}),
      });
      if (error) {
        logger.warn('inventory', 'searchProducts RPC error, falling back to ILIKE:', error.message);
        return await searchProductsFallback(companyId, cleanTerm, 50, branchId);
      }
      return (data as unknown as SearchRow[]).map(mapSearchRow);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('inventory', 'searchProducts failed, using fallback:', message);
      return searchProductsFallback(companyId, cleanTerm, 50, branchId);
    }
  },

  /**
   * Create a new product
   */
  createProduct: async (data: ProductFormData, companyId: string, _userId: string) => {
    const trimmedName = (data.name || data.name_ar || '').trim();
    if (!trimmedName) throw new Error('اسم المنتج مطلوب');

    const trimmedSku = (data.sku || '').trim();
    const trimmedPartNo = (data.part_number || '').trim();
    const trimmedBarcode = (data.barcode || '').trim();
    const trimmedBrand = (data.brand || '').trim();

    await validateProductUniqueness({
      companyId,
      name: trimmedName,
      sku: trimmedSku,
      barcode: trimmedBarcode,
      partNumber: trimmedPartNo,
      brand: trimmedBrand,
    });

    const payload: InsertDto<'products'> = {
      company_id: companyId,
      name_ar: trimmedName,
      sku: trimmedSku || `SKU-${Date.now()}`,
      sale_price: Number(data.selling_price) || 0,
      purchase_price: Number(data.cost_price) || 0,
      min_stock_level: Number(data.min_stock_level) || 0,
      is_core: Boolean(data.is_core),
      unit: data.unit || 'piece',
      part_number: trimmedPartNo || null,
      brand: trimmedBrand || null,
      status: 'active',
      description: data.specifications || null,
      size: data.size || null,
      image_url: data.image_url || null,
      alternative_numbers: data.alternative_numbers || null,
      barcode: trimmedBarcode || null,
      category_id: data.category && data.category.length === 36 ? data.category : null,
    };

    try {
      const { data: product, error } = await inventoryApi.createProduct(payload);
      if (error) throw error;

      // Save UOMs
      if (product && data.uoms && data.uoms.length > 0) {
        await inventoryApi.saveProductUoMs(product.id, data.uoms);
      }

      // Initialize stock in active branch's primary warehouse (or company primary warehouse) only when initial quantity > 0
      const initialQty = Number(data.stock_quantity) || 0;
      if (product && initialQty > 0) {
        const activeBranchId =
          (typeof data.branch_id === 'string' && data.branch_id.trim() !== ''
            ? data.branch_id.trim()
            : null) ?? useBranchFilterStore.getState().activeBranchId;
        let targetWarehouseId: string | undefined =
          typeof data.warehouse_id === 'string' && data.warehouse_id.trim() !== ''
            ? data.warehouse_id.trim()
            : undefined;

        if (!targetWarehouseId && activeBranchId) {
          const { data: branchWh } = await supabase
            .from('warehouses')
            .select('id')
            .eq('company_id', companyId)
            .eq('branch_id', activeBranchId)
            .is('deleted_at', null)
            .order('is_primary', { ascending: false })
            .limit(1);
          if (branchWh && branchWh.length > 0) {
            targetWarehouseId = branchWh[0].id;
          }
        }

        if (!targetWarehouseId) {
          const { data: defaultWh } = await supabase
            .from('warehouses')
            .select('id')
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .order('is_primary', { ascending: false })
            .limit(1);
          if (defaultWh && defaultWh.length > 0) {
            targetWarehouseId = defaultWh[0].id;
          }
        }

        if (targetWarehouseId) {
          const { error: stockError } = await inventoryApi.initializeStock(companyId, _userId, {
            product_id: product.id,
            warehouse_id: targetWarehouseId,
            quantity: initialQty,
            unit_cost: Number(data.cost_price) || 0,
          });
          if (stockError) throw parseError(stockError);
        }
      }

      return product;
    } catch (error: unknown) {
      throw error instanceof Error ? error : parseError(error);
    }
  },

  /**
   * Update an existing product
   */
  updateProduct: async (id: string, data: ProductFormData, companyId: string) => {
    logger.debug('ProductService', `Updating product ${id}`, data);

    const trimmedName = (data.name || data.name_ar || '').trim();
    const trimmedSku = (data.sku || '').trim();
    const trimmedBarcode = (data.barcode || '').trim();
    const trimmedPartNo = (data.part_number || '').trim();
    const trimmedBrand = (data.brand || '').trim();

    if (!companyId) {
      throw new Error('معرف المنشأة (companyId) مطلوب لتحديث المنتج');
    }

    await validateProductUniqueness({
      companyId,
      name: trimmedName,
      sku: trimmedSku,
      barcode: trimmedBarcode,
      partNumber: trimmedPartNo,
      brand: trimmedBrand,
      excludeProductId: id,
    });

    try {
      const payload: TableUpdate<'products'> = {};

      if (trimmedName) payload.name_ar = trimmedName;
      if (data.selling_price !== undefined) payload.sale_price = Number(data.selling_price) || 0;
      if (data.cost_price !== undefined) payload.purchase_price = Number(data.cost_price) || 0;
      if (data.min_stock_level !== undefined)
        payload.min_stock_level = Number(data.min_stock_level) || 0;
      if (data.unit !== undefined) payload.unit = data.unit || 'piece';
      if (trimmedSku) payload.sku = trimmedSku;
      if (data.part_number !== undefined) payload.part_number = trimmedPartNo || null;
      if (data.brand !== undefined) payload.brand = trimmedBrand || null;
      if (data.specifications !== undefined) payload.description = data.specifications || null;
      if (data.size !== undefined) payload.size = data.size || null;
      if (data.image_url !== undefined) payload.image_url = data.image_url || null;
      if (data.alternative_numbers !== undefined)
        payload.alternative_numbers = data.alternative_numbers || null;
      if (data.barcode !== undefined) payload.barcode = trimmedBarcode || null;
      if (data.location !== undefined) payload.location = data.location || null;
      if (data.is_core !== undefined) payload.is_core = data.is_core;
      if (data.category !== undefined) {
        payload.category_id = data.category && data.category.length === 36 ? data.category : null;
      }

      logger.debug('ProductService', `Sending update payload to API`, payload);
      const { data: product, error } = await inventoryApi.updateProduct(id, payload);

      if (error) {
        logger.error('ProductService', `API update failed`, error);
        throw error;
      }

      // Update UOMs
      if (data.uoms) {
        await inventoryApi.saveProductUoMs(id, data.uoms);
      }

      logger.debug('ProductService', `Product metadata updated successfully`, product);

      // [CRITICAL FIX]: Do NOT update stock during product edit.
      // data.stock_quantity contains the TOTAL stock across all warehouses.
      // If we update the default warehouse with the total stock, we corrupt the isolated quantities.
      // Stock should only be updated via dedicated inventory transactions (purchases, transfers, audits, sales).

      return product;
    } catch (err) {
      logger.error('ProductService', `Critical failure in updateProduct`, err);
      throw err instanceof Error ? err : parseError(err);
    }
  },

  /**
   * Delete a product
   */
  deleteProduct: async (id: string) => {
    const { error } = await inventoryApi.deleteProduct(id);
    if (error) throw parseError(error);
  },

  /**
   * Bulk delete products
   */
  bulkDeleteProducts: async (ids: string[]) => {
    const { error } = await inventoryApi.bulkDeleteProducts(ids);
    if (error) throw parseError(error);
  },

  /**
   * Get minimal product list (for dropdowns and quick selections)
   */
  getMinimalProducts: async (companyId: string) => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name_ar, sku, sale_price')
      .eq('company_id', companyId)
      .eq('status', 'active');
    if (error) throw parseError(error);
    return (data || []).map(
      (p: { id: string; name_ar: string; sku: string | null; sale_price: number | null }) => ({
        id: p.id,
        name: p.name_ar,
        sku: p.sku,
        selling_price: p.sale_price || 0,
      })
    );
  },

  /**
   * Get item movement history with date filtering and detail resolution, now processed on the DB side
   */
  getItemMovement: async (
    productId: string,
    companyId: string,
    branchId?: string | null
  ) => {
    const [{ data, error }, { data: whRows }] = await Promise.all([
      supabase.rpc('get_item_movements_with_balance', {
        p_company_id: companyId,
        p_product_id: productId,
      }),
      branchId
        ? supabase
          .from('warehouses')
          .select('id, name_ar')
          .eq('company_id', companyId)
          .eq('branch_id', branchId)
          .is('deleted_at', null)
        : Promise.resolve({ data: null }),
    ]);

    if (error) throw parseError(error);

    const rows = data || [];
    if (branchId && whRows && whRows.length > 0) {
      const branchWhIds = new Set(whRows.map(w => w.id));
      const branchWhNames = new Set(whRows.map(w => w.name_ar).filter(Boolean));
      return rows.filter((r: Record<string, unknown>) => {
        if (typeof r.warehouse_id === 'string') return branchWhIds.has(r.warehouse_id);
        if (typeof r.warehouse_name === 'string') return branchWhNames.has(r.warehouse_name);
        return true;
      });
    }

    return rows;
  },

  /**
   * Get global inventory movements feed combining invoices, adjustments, audits and transfers
   */
  getMovementsFeed: async (
    companyId: string,
    params: InventoryMovementsFilterParams = {},
    branchId?: string | null
  ): Promise<InventoryMovementFeedItem[]> => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_inventory_movements_feed', {
        p_company_id: companyId,
        p_branch_id: branchId ?? null,
        p_limit: params.limit ?? 150,
        p_offset: params.offset ?? 0,
        p_search: params.search ?? null,
        p_movement_type: params.movementType ?? 'all',
        p_doc_type: params.docType ?? 'all',
        p_product_id: params.productId ?? null,
        p_start_date: params.startDate ?? null,
        p_end_date: params.endDate ?? null,
      });

      if (!error && data) {
        return data as InventoryMovementFeedItem[];
      }

      if (error) {
        const errCode = String(error.code || '');
        const errMsg = String(error.message || '');
        if (
          errCode === 'PGRST202' ||
          errCode === '404' ||
          errCode === '42883' ||
          errMsg.includes('not found') ||
          errMsg.includes('does not exist')
        ) {
          logger.warn('productService', 'get_inventory_movements_feed RPC unavailable, using fallback', error);
          return await productService.fallbackMovementsFeed(companyId, params, branchId);
        }
        throw parseError(error);
      }
      return [];
    } catch (err: any) {
      const errCode = String(err?.code || '');
      const errMsg = String(err?.message || '');
      if (
        errCode === 'PGRST202' ||
        errCode === '404' ||
        errCode === '42883' ||
        errMsg.includes('not found') ||
        errMsg.includes('does not exist')
      ) {
        logger.warn('productService', 'get_inventory_movements_feed caught unavailable, using fallback', err);
        return await productService.fallbackMovementsFeed(companyId, params, branchId);
      }
      throw parseError(err);
    }
  },

  /**
   * Fallback for inventory movements feed when get_inventory_movements_feed RPC is not installed
   */
  fallbackMovementsFeed: async (
    companyId: string,
    params: InventoryMovementsFilterParams = {},
    branchId?: string | null
  ): Promise<InventoryMovementFeedItem[]> => {
    let query = supabase
      .from('invoices')
      .select(`
        id,
        type,
        invoice_number,
        created_at,
        issue_date,
        branch_id,
        notes,
        party:parties(name),
        invoice_items(
          id,
          product_id,
          quantity,
          unit_price,
          cost_price,
          product:products(id, name_ar, sku, part_number, brand)
        )
      `)
      .eq('company_id', companyId)
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 100);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    if (params.docType && params.docType !== 'all') {
      query = query.eq('type', params.docType);
    }
    if (params.startDate) {
      query = query.gte('issue_date', params.startDate);
    }
    if (params.endDate) {
      query = query.lte('issue_date', params.endDate);
    }

    const { data, error } = await query;
    if (error) throw parseError(error);

    const rows: InventoryMovementFeedItem[] = [];
    const searchLow = params.search?.toLowerCase().trim();

    for (const inv of (data || []) as any[]) {
      const isIncoming = inv.type === 'purchase' || inv.type === 'sale_return';
      const partyName = inv.party?.name || '---';
      const docNum = inv.invoice_number ? `فاتورة #${inv.invoice_number}` : 'فاتورة';

      for (const item of (inv.invoice_items || []) as any[]) {
        if (params.productId && item.product_id !== params.productId) continue;
        const prod = item.product;

        if (searchLow) {
          const matchSearch =
            docNum.toLowerCase().includes(searchLow) ||
            (prod?.name_ar && prod.name_ar.toLowerCase().includes(searchLow)) ||
            (prod?.sku && prod.sku.toLowerCase().includes(searchLow)) ||
            (prod?.part_number && prod.part_number.toLowerCase().includes(searchLow)) ||
            partyName.toLowerCase().includes(searchLow);
          if (!matchSearch) continue;
        }

        if (params.movementType && params.movementType !== 'all') {
          if (params.movementType === 'in' && !isIncoming) continue;
          if (params.movementType === 'out' && isIncoming) continue;
        }

        rows.push({
          id: item.id,
          date: inv.created_at || inv.issue_date,
          doc_type: inv.type,
          doc_number: docNum,
          reference_id: inv.id,
          product_id: item.product_id,
          product_name: prod?.name_ar || 'صنف',
          product_sku: prod?.sku || '',
          product_part_number: prod?.part_number ?? null,
          product_brand: prod?.brand ?? null,
          party_name: partyName,
          movement_type: isIncoming ? 'in' : 'out',
          quantity: Math.abs(Number(item.quantity || 0)),
          unit_cost: Number(item.cost_price || 0),
          unit_price: Number(item.unit_price || 0),
          user_name: 'النظام',
          notes: inv.notes ?? null,
          current_stock: 0,
        });
      }
    }
    return rows;
  },

  /**
   * Get products with similar names to detect potential duplicates
   */
  getSimilarProducts: async (name: string, companyId: string) => {
    try {
      if (isSimilarProductsRpcAvailable) {
        const { data, error } = await supabase.rpc('get_similar_products', {
          p_name: name,
          p_company_id: companyId,
        });

        if (!error && data) {
          return data;
        }

        if (error) {
          const errCode = error.code ?? '';
          const errMsg = error.message ?? '';
          if (
            errCode === 'PGRST202' ||
            errCode === '404' ||
            errMsg.includes('not found') ||
            errMsg.includes('does not exist')
          ) {
            isSimilarProductsRpcAvailable = false;
          }
        }
      }

      // If RPC fails or is unavailable on backend, fallback to fast ILIKE search
      const { data: fallbackData } = await supabase
        .from('products')
        .select('id, name_ar, sku')
        .eq('company_id', companyId)
        .ilike('name_ar', `%${name}%`)
        .limit(5);

      return (fallbackData || []).map(
        (product: { id: string; name_ar: string; sku: string | null }) => ({
          ...product,
          similarity: 0.5,
        })
      );
    } catch {
      return [];
    }
  },

  /**
   * Get all potential duplicate pairs in the company inventory
   */
  getPotentialDuplicates: async (companyId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_potential_duplicates', {
        p_company_id: companyId,
      });
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  },

  /**
   * Toggle is_core status for a product (backbone/strategic product)
   */
  toggleCoreProduct: async (id: string, isCore: boolean) => {
    const { data, error } = await inventoryApi.toggleCoreProduct(id, isCore);
    if (error) throw parseError(error);
    return data;
  },

  /**
   * Bulk set is_core status for multiple products
   */
  bulkSetCoreProducts: async (ids: string[], isCore: boolean) => {
    const { error } = await inventoryApi.bulkSetCoreProducts(ids, isCore);
    if (error) throw parseError(error);
  },

  /**
   * Get accurate aggregate counts for favorite products (total, critical, out_of_stock, safe)
   */
  getCoreProductsStats: async (
    companyId: string,
    branchId?: string | null
  ): Promise<{
    total: number;
    critical: number;
    outOfStock: number;
    safe: number;
  }> => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, min_stock_level, stock:product_stock(quantity, warehouses(branch_id))')
        .eq('company_id', companyId)
        .eq('is_core', true)
        .is('deleted_at', null)
        .or('status.eq.active,status.is.null');

      if (error) throw parseError(error);

      let critical = 0;
      let outOfStock = 0;
      let safe = 0;
      const total = data?.length ?? 0;

      interface CoreProductRow {
        id: string;
        min_stock_level: number | null;
        stock?: Array<{
          quantity: number | string | null;
          warehouses?: { branch_id?: string | null } | null;
        }> | null;
      }

      ((data || []) as unknown as CoreProductRow[]).forEach(row => {
        const filteredStock = branchId
          ? (row.stock || []).filter(s => !s.warehouses || s.warehouses.branch_id === branchId)
          : row.stock || [];
        const stockQty = filteredStock.reduce(
          (sum: number, s) => sum + (Number(s.quantity) || 0),
          0
        );
        const minLevel = Number(row.min_stock_level) || 0;
        const effectiveMinLevel = minLevel > 0 ? minLevel : 3;
        if (stockQty <= 0) {
          outOfStock++;
        } else if (stockQty <= effectiveMinLevel) {
          critical++;
        } else {
          safe++;
        }
      });

      return { total, critical, outOfStock, safe };
    } catch (err) {
      logger.error('productService.getCoreProductsStats', 'Failed to fetch stats', err);
      return { total: 0, critical: 0, outOfStock: 0, safe: 0 };
    }
  },

  /**
   * Get product IDs associated with a specific supplier
   */
  getSupplierProductIds: async (companyId: string, supplierId: string): Promise<string[]> => {
    return productsApi.getSupplierProductIds(companyId, supplierId);
  },

  /**
   * Get map of product IDs to their known supplier name
   */
  getProductSupplierMap: async (companyId: string): Promise<Record<string, string>> => {
    return productsApi.getProductSupplierMap(companyId);
  },
};

export default productService;
