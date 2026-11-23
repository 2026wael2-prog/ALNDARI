/**
 * إضافة أصناف إلى جلسة الجرد (بدء البحث/المسح + مجمّع الباركود).
 *
 * سبب وجود الملف: كان هذا الجزء مع حذف الأصناف في هوك واحد (‏~95 سطراً) يتجاوز
 * حدّ طول الدالة، ولهذا فُصل: هذا الهوك يملك حالة البحث، وهوك
 * `useAuditItemRemoval` يملك حالة الحذف.
 */
import { useCallback, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useFeedbackStore } from '../../feedback/store';
import type { Product } from '../types';
import {
  accumulateExistingItem,
  addProductToSession,
  itemProductId,
  type AddItemToAudit,
  type AuditItems,
} from '../utils/auditItemHelpers';
import { toCountedQuantity } from '../utils/auditQuantity';
import type { AuditFormValues } from './useAuditSessionForm';

export interface UseAuditItemAdditionOptions {
  sessionId: string | undefined;
  isCompleted: boolean;
  warehouseId: string | undefined;
  getValues: UseFormReturn<AuditFormValues>['getValues'];
  displayItems?: AuditItems | undefined;
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

const getLiveItemsWithQuantities = (
  getValues: UseFormReturn<AuditFormValues>['getValues'],
  displayItems?: AuditItems
): AuditItems => {
  const formItems = getValues('items');
  if (!displayItems || displayItems.length === 0) return formItems;
  return displayItems.map((item, idx) => {
    const productId = itemProductId(item);
    const matchedById =
      productId !== '' ? formItems.find(f => itemProductId(f) === productId) : undefined;
    const byIdx = formItems.at(idx);
    const matched =
      matchedById ??
      (byIdx !== undefined && (itemProductId(byIdx) === '' || itemProductId(byIdx) === productId)
        ? byIdx
        : undefined);
    if (matched === undefined || matched.counted_quantity === undefined) return item;
    return { ...item, counted_quantity: toCountedQuantity(matched.counted_quantity) };
  });
};

export const useAuditItemAddition = ({
  sessionId,
  isCompleted,
  warehouseId,
  getValues,
  displayItems,
  syncItems,
  addItemToAudit,
}: UseAuditItemAdditionOptions): UseAuditItemAdditionReturn => {
  const { showToast } = useFeedbackStore();
  const [filter, setFilter] = useState('');
  const [showResults, setShowResults] = useState(false);
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;

  const resetSearch = useCallback((): void => {
    setFilter('');
    setShowResults(false);
  }, []);

  const handleAddItem = useCallback(
    (product: Product): void => {
      if (isCompleted || sessionId === undefined) return;
      const currentItems = getLiveItemsWithQuantities(getValues, displayItemsRef.current);
      addProductToSession({
        product,
        sessionId,
        warehouseId,
        items: currentItems,
        accumulateQuantity: (items, index, targetProduct) => {
          accumulateExistingItem({ items, index, product: targetProduct, syncItems, resetSearch, showToast });
        },
        syncItems,
        resetSearch,
        showToast,
        addItemToAudit,
        currentItemsAfterMutation: () =>
          getLiveItemsWithQuantities(getValues, displayItemsRef.current),
      });
    },
    [isCompleted, sessionId, warehouseId, getValues, syncItems, resetSearch, showToast, addItemToAudit]
  );

  return { filter, setFilter, showResults, setShowResults, resetSearch, handleAddItem };
};
