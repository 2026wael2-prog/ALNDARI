import { mapRawProducts } from './productMappers';
import type { Product, ProductFormData } from '../types';
import { inventoryApi, productsApi } from '../api';
import { supabase } from '../../../lib/supabaseClient';
import type { InsertDto } from '../../../core/database.helpers';
import type { TableUpdate } from '@/core/types/supabase-helpers';
import { logger } from '../../../core/utils/logger';
import { parseError } from '../../../core/utils/errorUtils';
import { useBranchFilterStore } from '../../branches/store';
import { validateProductUniqueness } from './productValidation';
import { productSearchService, type SearchResultProduct } from './productSearchService';
import { productMovementsService } from './productMovementsService';
import { productCoreService } from './productCoreService';

export type { SearchResultProduct };

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
    return mapRawProducts(data || [], warehouseId, branchId);
  },

  /**
   * High-performance fetch for stocked products only (used by dashboard and rebalancing engine).
   * Bypasses full catalog scanning and returns in ~15ms instead of multiple seconds.
   */
  getProductsWithStock: async (companyId: string, signal?: AbortSignal): Promise<Product[]> => {
    try {
      const { data, error } = await inventoryApi.getProductsWithStock(companyId, signal);
      if (error) throw parseError(error);
      return mapRawProducts(data || []);
    } catch {
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
      item_type: data.item_type ?? 'stock',
      barcode: trimmedBarcode || null,
      category_id: data.category && data.category.length === 36 ? data.category : null,
    };

    try {
      const { data: product, error } = await inventoryApi.createProduct(payload);
      if (error) throw error;

      if (product && data.uoms && data.uoms.length > 0) {
        await inventoryApi.saveProductUoMs(product.id, data.uoms);
      }

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
      if (data.min_stock_level !== undefined) {
        payload.min_stock_level = Number(data.min_stock_level) || 0;
      }
      if (data.unit !== undefined) payload.unit = data.unit || 'piece';
      if (trimmedSku) payload.sku = trimmedSku;
      if (data.part_number !== undefined) payload.part_number = trimmedPartNo || null;
      if (data.brand !== undefined) payload.brand = trimmedBrand || null;
      if (data.specifications !== undefined) payload.description = data.specifications || null;
      if (data.size !== undefined) payload.size = data.size || null;
      if (data.image_url !== undefined) payload.image_url = data.image_url || null;
      if (data.alternative_numbers !== undefined) {
        payload.alternative_numbers = data.alternative_numbers || null;
      }
      if (data.barcode !== undefined) payload.barcode = trimmedBarcode || null;
      if (data.location !== undefined) payload.location = data.location || null;
      if (data.is_core !== undefined) payload.is_core = data.is_core;
      if (data.item_type !== undefined) payload.item_type = data.item_type;
      if (data.category !== undefined) {
        payload.category_id = data.category && data.category.length === 36 ? data.category : null;
      }

      logger.debug('ProductService', `Sending update payload to API`, payload);
      const { data: product, error } = await inventoryApi.updateProduct(id, payload);

      if (error) {
        logger.error('ProductService', `API update failed`, error);
        throw error;
      }

      if (data.uoms) {
        await inventoryApi.saveProductUoMs(id, data.uoms);
      }

      logger.debug('ProductService', `Product metadata updated successfully`, product);
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
  getMinimalProducts: async (companyId: string, limitNum = 1000) => {
    let query = supabase
      .from('products')
      .select('id, name_ar, sku, sale_price')
      .eq('company_id', companyId)
      .eq('status', 'active');

    if (limitNum > 0) {
      query = query.limit(limitNum);
    }

    const { data, error } = await query;
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

  ...productSearchService,
  ...productMovementsService,
  ...productCoreService,
};

export default productService;
