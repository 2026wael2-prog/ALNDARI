import type { usePurchaseStore } from '../../store';

export type PurchaseStoreState = ReturnType<typeof usePurchaseStore.getState>;
export type PurchaseCartItem = PurchaseStoreState['items'][number];

export const hasText = (value: string): boolean => value !== '';

export const filterValidPurchaseItems = (items: PurchaseCartItem[]): PurchaseCartItem[] =>
  items.filter(item => item.productId !== '' && item.quantity > 0 && item.costPrice > 0);

export interface PurchaseValidationContext {
  supplier: { id: string; name: string } | null;
  issueDate: string;
  warehouseId: string;
  availableWarehouseIds?: string[];
  invoiceType: string;
  cashboxId: string;
  validItems: PurchaseCartItem[];
}

export const validatePurchase = ({
  supplier,
  issueDate,
  warehouseId,
  availableWarehouseIds,
  invoiceType,
  cashboxId,
  validItems,
}: PurchaseValidationContext): string | null => {
  if (supplier === null) return 'يرجى اختيار مورد أولاً';
  if (validItems.length === 0) return 'يرجى إضافة صنف واحد على الأقل بكمية وسعر صحيحين';
  if (!hasText(issueDate)) return 'يرجى تحديد تاريخ الفاتورة';
  if (
    !hasText(warehouseId) ||
    (availableWarehouseIds &&
      availableWarehouseIds.length > 0 &&
      !availableWarehouseIds.includes(warehouseId))
  ) {
    return 'يرجى اختيار مستودع فعلي تابع للفرع قبل اعتماد الفاتورة';
  }
  if (validItems.some(item => item.discount < 0 || item.discount > item.quantity * item.costPrice)) {
    return 'يوجد خصم غير صالح؛ يجب ألا يتجاوز الخصم إجمالي الصنف';
  }
  if (invoiceType === 'cash' && !hasText(cashboxId)) {
    return 'يرجى اختيار الصندوق / البنك للفاتورة النقدية';
  }
  return null;
};
