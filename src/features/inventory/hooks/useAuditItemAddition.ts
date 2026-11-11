/**
 * إضافة أصناف إلى جلسة الجرد (بدء البحث/المسح + مجمّع الباركود).
 *
 * سبب وجود الملف: كان هذا الجزء مع حذف الأصناف في هوك واحد (‏~95 سطراً) يتجاوز
 * حدّ طول الدالة، ولهذا فُصل: هذا الهوك يملك حالة البحث، وهوك
 * `useAuditItemRemoval` يملك حالة الحذف.
 */
import { useCallback, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useFeedbackStore } from '../../feedback/store';
import type { Product } from '../types';
import {
  accumulateExistingItem,
  addProductToSession,
  type AddItemToAudit,
  type AuditItems,
} from '../utils/auditItemHelpers';
import type { AuditFormValues } from './useAuditSessionForm';

export interface UseAuditItemAdditionOptions {
  sessionId: string | undefined;
  isCompleted: boolean;
  warehouseId: string | undefined;
  getValues: UseFormReturn<AuditFormValues>['getValues'];
  syncItems: (items: AuditItems) => void;
  addItemToAudit: AddItemToAudit;
}

export interface UseAuditItemAdditionReturn {
  filter: string;
  setFilter: (value: string) => void;
  showResults: boolean;
  setShowResults: (value: boolean) => void;
  resetSearch: () => void;
  handleAddItem: (product: Product) => void;
}

export const useAuditItemAddition = ({
  sessionId,
  isCompleted,
  warehouseId,
  getValues,
  syncItems,
  addItemToAudit,
}: UseAuditItemAdditionOptions): UseAuditItemAdditionReturn => {
  const { showToast } = useFeedbackStore();
  const [filter, setFilter] = useState('');
  const [showResults, setShowResults] = useState(false);

  const resetSearch = useCallback((): void => {
    setFilter('');
    setShowResults(false);
  }, []);

  const handleAddItem = useCallback(
    (product: Product): void => {
      if (isCompleted || sessionId === undefined) return;
      addProductToSession({
        product,
        sessionId,
        warehouseId,
        items: getValues('items'),
        accumulateQuantity: (items, index, targetProduct) => {
          accumulateExistingItem({ items, index, product: targetProduct, syncItems, resetSearch, showToast });
        },
        syncItems,
        resetSearch,
        showToast,
        addItemToAudit,
        currentItemsAfterMutation: () => getValues('items'),
      });
    },
    [isCompleted, sessionId, warehouseId, getValues, syncItems, resetSearch, showToast, addItemToAudit]
  );

  return { filter, setFilter, showResults, setShowResults, resetSearch, handleAddItem };
};
