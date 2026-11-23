/**
 * حفظ تقدّم الجرد: بناء طلب الحفظ + الحفظ الدوري + الحفظ الإجباري عند المغادرة.
 *
 * سبب وجود الملف: كان هذا الجزء داخل `useAuditSessionForm` فجعل الهوك الواحد
 * يتجاوز حدّ طول الدالة في ESLint. فصل «مزامنة النموذج» عن «حفظ التقدّم» يجعل
 * كل مسؤولية قابلة للاختبار وحدها.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { inventoryService } from '../service';
import { computeItemsSignature } from '../utils/auditProgressSignature';
import { toCountedQuantity } from '../utils/auditQuantity';
import { itemProductId } from '../utils/auditItemHelpers';
import type { AuditFormValues } from './useAuditSessionForm';

/** صنف واحد في طلب حفظ تقدّم الجرد. */
export interface AuditProgressItem {
  id?: string;
  product_id: string;
  counted_quantity: number | null;
}

export interface UseAuditProgressPersistenceOptions {
  sessionId: string | undefined;
  isCompleted: boolean;
  getValues: UseFormReturn<AuditFormValues>['getValues'];
  displayItems: Array<Record<string, unknown>>;
  serverItems: Array<Record<string, unknown>>;
  updateItems: (items: Array<Record<string, unknown>>) => void;
  lastSyncedRef: React.RefObject<string>;
}

export interface UseAuditProgressPersistenceReturn {
  prepareProgressItems: () => AuditProgressItem[];
  handleSaveProgress: () => void;
}

/** يبني طلب الحفظ من النموذج (أحدث قيمة) مع الرجوع لأصناف المصدر عند غيابها. */
const buildProgressItems = (
  formItems: Array<Record<string, unknown>>,
  sourceList: Array<Record<string, unknown>>
): AuditProgressItem[] =>
  sourceList.map((item, idx) => {
    const productId = itemProductId(item);
    const matchedById =
      productId !== ''
        ? formItems.find(formItem => itemProductId(formItem) === productId)
        : undefined;
    const byIndex = formItems.at(idx);
    const matched =
      matchedById ??
      (byIndex !== undefined &&
      (itemProductId(byIndex) === '' || itemProductId(byIndex) === productId)
        ? byIndex
        : undefined);
    const formValue = matched?.counted_quantity;
    const rawCounted =
      formValue !== undefined && formValue !== '' ? formValue : item.counted_quantity;

    const result: AuditProgressItem = {
      product_id: productId,
      counted_quantity: toCountedQuantity(rawCounted),
    };
    if (typeof item.id === 'string' && item.id.length > 0) result.id = item.id;
    return result;
  });

/** يدمج الكميات المجرودة من النموذج الحيّ داخل أصناف المصدر الكاملة (مع الحفاظ على products/expected_quantity). */
const mergeFormQuantitiesIntoSource = (
  formItems: Array<Record<string, unknown>>,
  sourceList: Array<Record<string, unknown>>
): Array<Record<string, unknown>> => {
  if (sourceList.length === 0) return formItems;
  if (formItems.length === 0) return sourceList;

  return sourceList.map((item, idx) => {
    const productId = itemProductId(item);
    const matchedById =
      productId !== ''
        ? formItems.find(formItem => itemProductId(formItem) === productId)
        : undefined;
    const byIndex = formItems.at(idx);
    const matched =
      matchedById ??
      (byIndex !== undefined &&
      (itemProductId(byIndex) === '' || itemProductId(byIndex) === productId)
        ? byIndex
        : undefined);

    if (matched === undefined || matched.counted_quantity === undefined) {
      return item;
    }
    return {
      ...item,
      counted_quantity: toCountedQuantity(matched.counted_quantity),
    };
  });
};

/**
 * يحفظ التقدّم عند إغلاق المتصفح أو مغادرة الصفحة داخل التطبيق (SPA).
 * يُسجّل المستمع مرة واحدة، ويقرأ أحدث القيم من مرجع — فلا حفظ عند كل ضغطة مفتاح.
 */
const usePersistOnUnload = (
  latestRef: { current: UseAuditProgressPersistenceOptions },
  lastPersistedSignatureRef: { current: string },
  prepareProgressItems: () => AuditProgressItem[]
): void => {
  useEffect(() => {
    const persist = (toServer: boolean): void => {
      const { isCompleted, sessionId, getValues, displayItems, serverItems, updateItems } =
        latestRef.current;
      if (isCompleted) return;
      const formItems = getValues('items');
      const sourceList = displayItems.length > 0 ? displayItems : serverItems;
      const mergedItems = mergeFormQuantitiesIntoSource(formItems, sourceList);
      if (mergedItems.length === 0) return;
      updateItems(mergedItems);
      if (!toServer || sessionId === undefined) return;
      // لا نُكرّر حفظ نفس المحتوى (يمنع الكتابة المزدوجة في وضع React StrictMode).
      const signature = computeItemsSignature(mergedItems);
      if (signature === lastPersistedSignatureRef.current) return;
      const itemsToSave = prepareProgressItems();
      if (itemsToSave.length === 0) return;
      lastPersistedSignatureRef.current = signature;
      void inventoryService.saveAuditProgress({ sessionId, items: itemsToSave });
    };

    const onBeforeUnload = (): void => {
      persist(true);
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return (): void => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      persist(true);
    };
  }, [latestRef, lastPersistedSignatureRef, prepareProgressItems]);
};

export const useAuditProgressPersistence = (
  options: UseAuditProgressPersistenceOptions
): UseAuditProgressPersistenceReturn => {
  const latestRef = useRef(options);
  const lastPersistedSignatureRef = useRef<string>('');

  useEffect(() => {
    latestRef.current = options;
  });

  const prepareProgressItems = useCallback((): AuditProgressItem[] => {
    const { displayItems, serverItems, getValues } = latestRef.current;
    const sourceList = displayItems.length > 0 ? displayItems : serverItems;
    return buildProgressItems(getValues('items'), sourceList);
  }, []);

  const handleSaveProgress = useCallback((): void => {
    const {
      isCompleted,
      sessionId,
      getValues,
      displayItems,
      serverItems,
      updateItems,
      lastSyncedRef,
    } = latestRef.current;
    if (isCompleted) return;
    const formItems = getValues('items');
    const sourceList = displayItems.length > 0 ? displayItems : serverItems;
    const mergedItems = mergeFormQuantitiesIntoSource(formItems, sourceList);
    if (mergedItems.length === 0) return;
    const serialized = computeItemsSignature(mergedItems);
    if (serialized === lastSyncedRef.current) return;
    lastSyncedRef.current = serialized;
    updateItems(mergedItems);
    if (sessionId !== undefined && serialized !== lastPersistedSignatureRef.current) {
      const itemsToSave = buildProgressItems(formItems, sourceList);
      if (itemsToSave.length > 0) {
        lastPersistedSignatureRef.current = serialized;
        void inventoryService.saveAuditProgress({ sessionId, items: itemsToSave });
      }
    }
  }, []);

  // حفظ إجباري عند إغلاق المتصفح أو مغادرة الصفحة داخل التطبيق (SPA).
  usePersistOnUnload(latestRef, lastPersistedSignatureRef, prepareProgressItems);

  return { prepareProgressItems, handleSaveProgress };
};
