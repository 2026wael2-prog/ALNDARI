/**
 * إنشاء منتج جديد أثناء جلسة الجرد ثم إضافته إليها مباشرة.
 *
 * سبب وجود الملف: كان منطق التحويل من صف قاعدة البيانات إلى `Product` مكتوباً
 * بنمط `String(raw.x || '')` داخل `AuditSessionPage`، فينتج عنه 15 تحذير
 * `no-base-to-string` و31 تحذير `prefer-nullish-coalescing`. هنا التحويل صريح
 * ومُختبر المعنى: نص لِما هو نص، ورقم لِما هو رقم.
 */
import { useCallback } from 'react';
import { useFeedbackStore } from '../../feedback/store';
import type { Product, ProductFormData } from '../types';
import { firstFilled, toNumber, toText } from '../utils/valueCoercion';

/** يبني منتج جرد من نتيجة إنشاء المنتج (بلا `any` وبلا `||` على النصوص). */
const toAuditProduct = (raw: Record<string, unknown>, companyId: string): Product => {
  const nameAr = firstFilled(toText(raw.name_ar), toText(raw.name));
  const now = new Date().toISOString();
  return {
    id: toText(raw.id),
    name: nameAr,
    name_ar: nameAr,
    sku: toText(raw.sku),
    part_number: toText(raw.part_number),
    brand: toText(raw.brand),
    category: toText(raw.category),
    unit: toText(raw.unit, 'piece'),
    cost_price: toNumber(raw.cost_price),
    selling_price: toNumber(raw.sale_price ?? raw.selling_price),
    purchase_price: toNumber(raw.cost_price),
    stock_quantity: 0,
    min_stock_level: toNumber(raw.min_stock_level),
    is_core: raw.is_core === true,
    created_at: toText(raw.created_at, now),
    updated_at: toText(raw.updated_at, now),
    company_id: toText(raw.company_id, companyId),
  } as unknown as Product;
};

export interface UseAuditProductCreationOptions {
  companyId: string;
  saveProduct: (input: { data: ProductFormData }) => Promise<unknown>;
  onCreated: (product: Product) => void;
  onClose: () => void;
}

/** إنشاء منتج جديد أثناء الجرد ثم إضافته مباشرة إلى الجلسة. */
export const useAuditProductCreation = ({
  companyId,
  saveProduct,
  onCreated,
  onClose,
}: UseAuditProductCreationOptions): ((formData: ProductFormData) => Promise<void>) => {
  const { showToast } = useFeedbackStore();

  return useCallback(
    async (formData: ProductFormData): Promise<void> => {
      try {
        const created = await saveProduct({ data: formData });
        onClose();
        showToast('تمت إضافة المنتج الجديد بنجاح', 'success');
        if (created === null || created === undefined || typeof created !== 'object') return;
        onCreated(toAuditProduct(created as Record<string, unknown>, companyId));
      } catch (error: unknown) {
        showToast(error instanceof Error ? error.message : 'فشل في إضافة المنتج', 'error');
      }
    },
    [saveProduct, onClose, showToast, onCreated, companyId]
  );
};
