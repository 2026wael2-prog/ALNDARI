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
  sourceList.map(item => {
    const productId = itemProductId(item);
    const matched = formItems.find(formItem => itemProductId(formItem) === productId);
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
      const { isCompleted, sessionId, getValues, updateItems } = latestRef.current;
      if (isCompleted) return;
      const formItems = getValues('items');
      if (formItems.length === 0) return;
      updateItems(formItems);
      if (!toServer || sessionId === undefined) return;
      // لا نُكرّر حفظ نفس المحتوى (يمنع الكتابة المزدوجة في وضع React StrictMode).
      const signature = computeItemsSignature(formItems);
      if (signature === lastPersistedSignatureRef.current) return;
      const itemsToSave = prepareProgressItems();
      if (itemsToSave.length === 0) return;
      lastPersistedSignatureRef.current = signature;
      void inventoryService.saveAuditProgress({ sessionId, items: itemsToSave });
    };

    const onBeforeUnload = (): void => {
      persist(false);
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
  // [PERF-FIX — حلقة حفظ لا نهائية] كان الـ effect أدناه يعتمد على
  // `prepareProgressItems`، وهو يُعاد إنشاؤه كلّما تغيّر `displayItems` أو
  // `serverItems` — أي عند كل ضغطة مفتاح وعند كل إعادة جلب. وبما أنّ دالة
  // التنظيف (cleanup) تنفّذ حفظاً على الخادم، كان كل رسم يُطلق
  // `save_audit_progress` ← أحداث Realtime على `audit_items` ← إبطال
  // `['audit_session']` ← إعادة جلب ← مصفوفة أصناف جديدة ← حفظ مجدداً…
  // حلقة تُغرق الشبكة وتُعيد `reset` للنموذج أثناء الكتابة (اهتزاز الحقول)،
  // وتُظهر مؤشر «اتصال غير مستقر» باستمرار.
  // الحل: أحدث القيم تُقرأ من مرجع (ref)، والدوال صارت ثابتة الهوية،
  // فتبقى دالة التنظيف تعمل مرة واحدة عند المغادرة الفعلية فقط.
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
    const { isCompleted, getValues, updateItems, lastSyncedRef } = latestRef.current;
    if (isCompleted) return;
    const formItems = getValues('items');
    if (formItems.length === 0) return;
    const serialized = computeItemsSignature(formItems);
    if (serialized === lastSyncedRef.current) return;
    lastSyncedRef.current = serialized;
    updateItems(formItems);
  }, []);

  // حفظ إجباري عند إغلاق المتصفح أو مغادرة الصفحة داخل التطبيق (SPA).
  usePersistOnUnload(latestRef, lastPersistedSignatureRef, prepareProgressItems);

  return { prepareProgressItems, handleSaveProgress };
};
