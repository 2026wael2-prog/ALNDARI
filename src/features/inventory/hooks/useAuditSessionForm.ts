/**
 * إدارة نموذج جرد المخزون: مزامنة النموذج ↔ جلسة العمل ↔ الخادم.
 *
 * سبب وجود الملف: كانت هذه الكتلة (~130 سطراً: `useForm`، ثلاث `useEffect`
 * للمزامنة، حساب `displayItems`، بناء `prepareProgressItems`، والحفظ عند مغادرة
 * الصفحة) مكتوبة داخل `AuditSessionPage` فرفعت حجمها وتعقيدها فوق حدود المشروع.
 *
 * إصلاح مهم (العيب B4 في تقرير التدقيق): كان `watchedItems` يُقرأ بـ
 * `getValues('items')` **أثناء الرسم**، و`getValues` لا يشترك في تغييرات النموذج،
 * فكان الجدول يعرض لقطة قديمة بعد أول تعديل. الآن `useWatch` يعيد الرسم عند كل
 * تغيير فعلي في مصفوفة الأصناف.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useForm, useWatch, type UseFormRegister, type UseFormReturn } from 'react-hook-form';
import { computeItemsSignature } from '../utils/auditProgressSignature';
import { toCountedQuantity } from '../utils/auditQuantity';
import { itemProductId } from '../utils/auditItemHelpers';

export interface AuditFormValues {
  items: Array<Record<string, unknown>>;
}

export interface UseAuditSessionFormOptions {
  /** أصناف الجلسة كما وصلت من الخادم. */
  serverItems: Array<Record<string, unknown>>;
  /** أصناف المسودة المحلية (sessionStorage/الخادم). */
  sessionItems: Array<Record<string, unknown>>;
  isCompleted: boolean;
  isRestoring: boolean;
  updateItems: (items: Array<Record<string, unknown>>) => void;
  mergeWithServer: (items: Array<Record<string, unknown>>) => void;
}

export interface UseAuditSessionFormReturn {
  register: UseFormRegister<AuditFormValues>;
  getValues: UseFormReturn<AuditFormValues>['getValues'];
  reset: UseFormReturn<AuditFormValues>['reset'];
  /** الأصناف المعروضة في الجدول (تتفاعل مع إضافة/حذف الأصناف). */
  displayItems: Array<Record<string, unknown>>;
  /**
   * أصناف محسوبة للإحصاءات فقط: نفس `displayItems` مع دمج الكميات الحيّة من
   * النموذج، كي تتحدّث البلاطات (المجرود/المتبقي/الفروقات/الأثر المالي) لحظياً
   * أثناء الكتابة. تُفصل عن `displayItems` عمداً حتى لا يُعاد رسم جدول كبير
   * (1161 صفاً في أسوأ الحالات) مع كل ضغطة مفتاح.
   */
  statsItems: Array<Record<string, unknown>>;
  /** يُستدعى بعد أي تعديل مباشر على النموذج لتحديث البصمة والمسودة. */
  syncItemsMutation: (items: Array<Record<string, unknown>>) => void;
  /** بصمة آخر مزامنة (لتفادي الحفظ المتكرر). */
  lastSyncedRef: React.RefObject<string>;
}

const FORM_DEFAULTS: AuditFormValues = { items: [] };

/** يدمج كميات المسودة المحلية على أصناف الخادم (المحلي أولاً لأنه أحدث). */
const mergeDraftQuantities = (
  serverItems: Array<Record<string, unknown>>,
  sessionItems: Array<Record<string, unknown>>
): Array<Record<string, unknown>> => {
  if (sessionItems.length === 0) return serverItems;

  return serverItems.map(serverItem => {
    const serverProductId = serverItem.product_id ?? serverItem.id;
    const local = sessionItems.find(item => (item.product_id ?? item.id) === serverProductId);
    const localCounted = local?.counted_quantity;
    return localCounted !== null && localCounted !== undefined
      ? { ...serverItem, counted_quantity: localCounted }
      : serverItem;
  });
};

/** يزامن النموذج مع ثلاث مصادر: البذرة الأولى، المسودة المحلية، وتحديثات الخادم. */
const useItemsSynchronization = ({
  serverItems,
  sessionItems,
  isCompleted,
  isRestoring,
  mergeWithServer,
  reset,
  lastSyncedRef,
}: {
  serverItems: Array<Record<string, unknown>>;
  sessionItems: Array<Record<string, unknown>>;
  isCompleted: boolean;
  isRestoring: boolean;
  mergeWithServer: (items: Array<Record<string, unknown>>) => void;
  reset: UseFormReturn<AuditFormValues>['reset'];
  lastSyncedRef: React.RefObject<string>;
}): void => {
  const hasLoadedServerItemsRef = useRef(false);

  useEffect(() => {
    if (serverItems.length === 0 || hasLoadedServerItemsRef.current) return;
    hasLoadedServerItemsRef.current = true;
    const itemsToReset = mergeDraftQuantities(serverItems, sessionItems);
    lastSyncedRef.current = computeItemsSignature(itemsToReset);
    reset({ items: itemsToReset });
  }, [serverItems, sessionItems, reset, lastSyncedRef]);

  useEffect(() => {
    if (isCompleted || sessionItems.length === 0) return;
    const serialized = computeItemsSignature(sessionItems);
    if (serialized === lastSyncedRef.current) return;
    lastSyncedRef.current = serialized;
    reset({ items: sessionItems });
  }, [sessionItems, isCompleted, reset, lastSyncedRef]);

  useEffect(() => {
    if (isCompleted || isRestoring || serverItems.length === 0) return;
    if (!hasLoadedServerItemsRef.current) return;
    mergeWithServer(serverItems);
  }, [serverItems, isCompleted, isRestoring, mergeWithServer]);
};

/** هل الكميتان متساويتان بعد التطبيع (فراغ/NaN = غير مجرود)؟ */
const isSameQuantity = (left: unknown, right: unknown): boolean => {
  const a = toCountedQuantity(left);
  const b = toCountedQuantity(right);
  return a === b;
};

/**
 * يدمج «الكميات الحيّة» من النموذج (`useWatch`) على الأصناف المعروضة.
 *
 * سبب وجوده: كان `displayItems` يفضّل `sessionItems` بعد أول مزامنة، فلا يصل
 * تعديل المستخدم إلى الجدول أبداً ⇒ عمود «الفرق» والتذييل وبلاطات الإحصاء
 * تتجمّد حتى يغادر الحقل (blur). الدمج هنا **للعرض فقط** (بمفتاح `product_id`،
 * لا بالترتيب) فلا يغيّر ترتيب الصفوف ولا فهارس `register` ولا أي كمية محفوظة.
 */
const mergeLiveQuantities = (
  base: Array<Record<string, unknown>>,
  live: Array<Record<string, unknown>>
): Array<Record<string, unknown>> => {
  if (base.length === 0 || live.length === 0) return base;

  const liveQuantityById = new Map<string, unknown>();
  for (const item of live) {
    const id = itemProductId(item);
    if (id !== '') liveQuantityById.set(id, item.counted_quantity);
  }
  if (liveQuantityById.size === 0) return base;

  // حاوية حالة: المُصرِّف لا يتتبّع الإسناد داخل `map`، فالمتغيّر العادي كان
  // يُرى دائماً `false`. الحاوية تُبقي الشرط مقروءاً بلا وصول بالفهرس.
  const state = { changed: false };
  const merged = base.map(item => {
    const id = itemProductId(item);
    if (id === '' || !liveQuantityById.has(id)) return item;
    const liveQuantity = liveQuantityById.get(id);
    if (isSameQuantity(item.counted_quantity, liveQuantity)) return item;
    state.changed = true;
    return { ...item, counted_quantity: liveQuantity };
  });

  return state.changed ? merged : base;
};

export const useAuditSessionForm = ({
  serverItems,
  sessionItems,
  isCompleted,
  isRestoring,
  updateItems,
  mergeWithServer,
}: UseAuditSessionFormOptions): UseAuditSessionFormReturn => {
  const { register, reset, getValues, control } = useForm<AuditFormValues>({
    defaultValues: FORM_DEFAULTS,
    shouldUnregister: false,
  });
  const lastSyncedRef = useRef<string>('');

  useItemsSynchronization({
    serverItems,
    sessionItems,
    isCompleted,
    isRestoring,
    mergeWithServer,
    reset,
    lastSyncedRef,
  });

  const watchedItems = useWatch({ control, name: 'items' });

  const displayItems = useMemo(() => {
    if (isCompleted) return serverItems;
    return sessionItems.length > 0 ? sessionItems : watchedItems;
  }, [isCompleted, serverItems, sessionItems, watchedItems]);

  // الإحصاءات وحدها ترى الكميات الحيّة أثناء الكتابة (بلا إعادة رسم الجدول).
  const statsItems = useMemo(() => {
    if (isCompleted || isRestoring) return displayItems;
    return mergeLiveQuantities(displayItems, watchedItems);
  }, [isCompleted, isRestoring, displayItems, watchedItems]);

  const syncItemsMutation = useCallback(
    (items: Array<Record<string, unknown>>): void => {
      lastSyncedRef.current = computeItemsSignature(items);
      reset({ items });
      updateItems(items);
    },
    [reset, updateItems]
  );

  return { register, getValues, reset, displayItems, statsItems, syncItemsMutation, lastSyncedRef };
};
