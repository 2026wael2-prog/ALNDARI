import { supabase } from '../../../lib/supabaseClient';

export interface ValidateProductUniquenessParams {
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
export async function validateProductUniqueness({
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
