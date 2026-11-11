/**
 * حذف صنف من جلسة الجرد (تحديث متفائل + تراجع عند فشل الخادم).
 *
 * سبب وجود الملف: كان منطق الحذف وحالة `itemToDelete` مع منطق الإضافة في هوك
 * واحد يتجاوز حدّ طول الدالة؛ فصله يبقي كل هوك صغيراً وقابلاً للاختبار.
 */
import { useCallback, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
  removeItemFromSession,
  type AuditItems,
  type RemoveItemFromAudit,
} from '../utils/auditItemHelpers';
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
  syncItems,
  removeItemFromAudit,
}: UseAuditItemRemovalOptions): UseAuditItemRemovalReturn => {
  const [itemToDelete, setItemToDelete] = useState<AuditItemTarget | null>(null);

  const confirmRemoveItem = useCallback((): void => {
    if (itemToDelete === null || sessionId === undefined) return;
    removeItemFromSession({
      target: itemToDelete,
      sessionId,
      currentItems: getValues('items'),
      syncItems,
      onRemoved: () => {
        setItemToDelete(null);
      },
      removeItemFromAudit,
    });
  }, [itemToDelete, sessionId, getValues, syncItems, removeItemFromAudit]);

  return { itemToDelete, setItemToDelete, confirmRemoveItem };
};
