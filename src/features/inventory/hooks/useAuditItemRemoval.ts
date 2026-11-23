/**
 * حذف صنف من جلسة الجرد (تحديث متفائل + تراجع عند فشل الخادم).
 *
 * سبب وجود الملف: كان منطق الحذف وحالة `itemToDelete` مع منطق الإضافة في هوك
 * واحد يتجاوز حدّ طول الدالة؛ فصله يبقي كل هوك صغيراً وقابلاً للاختبار.
 */
import { useCallback, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
  itemProductId,
  removeItemFromSession,
  type AuditItems,
  type RemoveItemFromAudit,
} from '../utils/auditItemHelpers';
import { toCountedQuantity } from '../utils/auditQuantity';
import type { AuditFormValues } from './useAuditSessionForm';

/** هدف الحذف كما يمرّره جدول الأصناف. */
export interface AuditItemTarget {
  id?: string;
  productId: string;
  name?: string;
}

export interface UseAuditItemRemovalOptions {
  sessionId: string | undefined;
  getValues: UseFormReturn<AuditFormValues>['getValues'];
  displayItems?: AuditItems | undefined;
  syncItems: (items: AuditItems) => void;
  removeItemFromAudit: RemoveItemFromAudit;
}

export interface UseAuditItemRemovalReturn {
  itemToDelete: AuditItemTarget | null;
  setItemToDelete: (target: AuditItemTarget | null) => void;
  confirmRemoveItem: () => void;
}

export const useAuditItemRemoval = ({
  sessionId,
  getValues,
  displayItems,
  syncItems,
  removeItemFromAudit,
}: UseAuditItemRemovalOptions): UseAuditItemRemovalReturn => {
  const [itemToDelete, setItemToDelete] = useState<AuditItemTarget | null>(null);
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;

  const confirmRemoveItem = useCallback((): void => {
    if (itemToDelete === null || sessionId === undefined) return;
    const formItems = getValues('items');
    const source = displayItemsRef.current;
    const currentItems =
      source && source.length > 0
        ? source.map((item, idx) => {
            const productId = itemProductId(item);
            const matched =
              (productId !== ''
                ? formItems.find(f => itemProductId(f) === productId)
                : undefined) ?? formItems.at(idx);
            if (matched === undefined || matched.counted_quantity === undefined) return item;
            return { ...item, counted_quantity: toCountedQuantity(matched.counted_quantity) };
          })
        : formItems;
    removeItemFromSession({
      target: itemToDelete,
      sessionId,
      currentItems,
      syncItems,
      onRemoved: () => {
        setItemToDelete(null);
      },
      removeItemFromAudit,
    });
  }, [itemToDelete, sessionId, getValues, syncItems, removeItemFromAudit]);

  return { itemToDelete, setItemToDelete, confirmRemoveItem };
};
