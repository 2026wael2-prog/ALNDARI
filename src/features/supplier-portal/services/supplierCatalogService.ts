import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';
import { parseError } from '../../../core/utils/errorUtils';
import type { RFQStatus, VendorProductItem, VendorRFQ } from '../types';

const sanitizeSearchInput = (input: string): string => input.replace(/[.(),\\%]/g, '');

interface RawSupplierProductRel {
  supplier_sku?: string | null;
  lead_time_days?: number | null;
  preferred_supplier?: boolean | null;
  supplier_id?: string | null;
}

interface RawProductRow {
  id: string;
  company_id: string;
  name_ar?: string | null;
  description?: string | null;
  sku: string;
  part_number?: string | null;
  brand?: string | null;
  cost_price: number | string | null;
  sale_price?: number | string | null;
  min_stock_level: number | string | null;
  unit?: string | null;
  image_url?: string | null;
  prc_supplier_products?: RawSupplierProductRel[] | null;
}

interface RawRFQItemRow {
  rfq_item_id: string;
  product_id?: string | null;
  description: string;
  quantity: number | string;
  unit_of_measure?: string | null;
  target_unit_price?: number | string | null;
  oem_number?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: number | null;
  vin_number?: string | null;
  notes?: string | null;
}

interface RawRFQRow {
  rfq_id: string;
  company_id: string;
  rfq_number: string;
  title: string;
  status: string;
  submission_deadline: string;
  delivery_date?: string | null;
  terms_and_conditions?: string | null;
  created_at: string;
  prc_rfq_items?: RawRFQItemRow[] | null;
}

export async function getVendorProducts(
  companyId: string,
  supplierId?: string,
  search?: string
): Promise<VendorProductItem[]> {
  try {
    let query = supabase
      .from('products')
      .select(
        `
        id,
        company_id,
        name_ar,
        description,
        sku,
        part_number,
        brand,
        cost_price,
        sale_price,
        min_stock_level,
        unit,
        image_url,
        prc_supplier_products:prc_supplier_products!prc_supplier_products_company_product_fk (
          supplier_sku,
          lead_time_days,
          preferred_supplier,
          supplier_id
        )
      `
      )
      .eq('company_id', companyId)
      .is('deleted_at', null);

    if (search && search.trim() !== '') {
      const safe = sanitizeSearchInput(search.trim());
      if (safe.length > 0) {
        query = query.or(
          `name_ar.ilike.%${safe}%,sku.ilike.%${safe}%,part_number.ilike.%${safe}%`
        );
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    const rawProducts = (data || []) as unknown as RawProductRow[];
    const filteredProducts = supplierId
      ? rawProducts.filter(
          row =>
            Array.isArray(row.prc_supplier_products) &&
            row.prc_supplier_products.some(sp => sp.supplier_id === supplierId)
        )
      : rawProducts;

    return filteredProducts.map((row): VendorProductItem => {
      const supplierProd = Array.isArray(row.prc_supplier_products)
        ? row.prc_supplier_products.find(sp => !supplierId || sp.supplier_id === supplierId)
        : null;

      return {
        id: row.id,
        company_id: row.company_id,
        product_id: row.id,
        product_name: row.name_ar || row.description || row.part_number || 'قطعة غيار',
        ...(row.name_ar ? { product_name_ar: row.name_ar } : {}),
        sku: row.sku,
        oem_number: row.part_number || null,
        brand: row.brand || null,
        category: null,
        vendor_sku: supplierProd?.supplier_sku || null,
        cost_price: Number(row.cost_price) || 0,
        last_quoted_price: null,
        stock_quantity: 0,
        min_stock_level: Number(row.min_stock_level) || 0,
        unit: row.unit || 'حبة',
        image_url: row.image_url || null,
        lead_time_days: supplierProd?.lead_time_days || 3,
        is_preferred: !!supplierProd?.preferred_supplier,
      };
    });
  } catch (err) {
    logger.error('supplierPortalService.getVendorProducts', 'Failed to load products', err);
    throw parseError(err);
  }
}

export async function getVendorRFQs(
  companyId: string,
  supplierId?: string
): Promise<VendorRFQ[]> {
  try {
    let rfqIds: string[] | null = null;
    if (supplierId) {
      const { data: invitedRows, error: invitedErr } = await supabase
        .from('prc_rfq_suppliers')
        .select('rfq_id')
        .eq('company_id', companyId)
        .eq('supplier_id', supplierId);
      if (invitedErr) throw invitedErr;
      rfqIds = (invitedRows || []).map((r: { rfq_id: string }) => r.rfq_id);
      if (rfqIds.length === 0) return [];
    }

    let query = supabase
      .from('prc_rfqs')
      .select(
        `
        rfq_id,
        company_id,
        rfq_number,
        title,
        status,
        submission_deadline,
        delivery_date,
        terms_and_conditions,
        created_at,
        prc_rfq_items (
          rfq_item_id,
          product_id,
          description,
          quantity,
          unit_of_measure,
          target_unit_price,
          oem_number,
          vehicle_make,
          vehicle_model,
          vehicle_year,
          vin_number,
          notes
        )
      `
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (rfqIds) {
      query = query.in('rfq_id', rfqIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rawRFQs = (data || []) as unknown as RawRFQRow[];
    return rawRFQs.map((row): VendorRFQ => ({
      rfq_id: row.rfq_id,
      company_id: row.company_id,
      rfq_number: row.rfq_number,
      title: row.title,
      status: row.status as RFQStatus,
      submission_deadline: row.submission_deadline,
      delivery_date: row.delivery_date || null,
      terms_and_conditions: row.terms_and_conditions || null,
      items_count: Array.isArray(row.prc_rfq_items) ? row.prc_rfq_items.length : 0,
      created_at: row.created_at,
      items: (row.prc_rfq_items || []).map(item => ({
        rfq_item_id: item.rfq_item_id,
        rfq_id: row.rfq_id,
        product_id: item.product_id || null,
        product_name: item.description,
        oem_number: item.oem_number || null,
        quantity: Number(item.quantity) || 1,
        unit_of_measure: item.unit_of_measure || 'حبة',
        target_unit_price: item.target_unit_price ? Number(item.target_unit_price) : null,
        vehicle_make: item.vehicle_make || null,
        vehicle_model: item.vehicle_model || null,
        vehicle_year: item.vehicle_year || null,
        vin_number: item.vin_number || null,
        notes: item.notes || null,
      })),
    }));
  } catch (err) {
    logger.error('supplierPortalService.getVendorRFQs', 'Failed to load RFQs', err);
    throw parseError(err);
  }
}
