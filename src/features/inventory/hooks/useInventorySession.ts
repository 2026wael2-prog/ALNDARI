/**
 * useInventorySession - Hook to manage inventory session state with persistence
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  inventoryPersistence,
  type InventorySessionDraft,
} from '../services/inventoryPersistenceService';
import { useFeedbackStore } from '../../feedback/store';

interface UseInventorySessionProps {
  sessionId: string;
  warehouseId?: string;
  initialItems: Array<Record<string, unknown>>;
  autoSave?: boolean;
  isCompleted?: boolean;
}

/** أول معرّف نصّي غير فارغ (بديل آمن لسلسلة `||` على قيم مجهولة النوع). */
const firstIdentifier = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
};

/** معرّف الصنف النصّي بلا تحويل ضمني لكائنات (`[object Object]`). */
const identifierOf = (item: Record<string, unknown>): string =>
  firstIdentifier(item.product_id, item.id);

/** يوازي الكميات للتحقق من التطابق (الفراغ والقيمة الفارغة يعنيان «غير مجرود»). */
const normalizeComparableQuantity = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return '';
};

/**
 * مقارنة محتوى أصناف الجرد (معرّف الصنف + الكمية المجرودة) بنفس الترتيب.
 * تُستخدم لمنع إعادة الرسم وإعادة ضبط النموذج عند وصول بيانات مطابقة.
 */
const areAuditItemsEquivalent = (
  current: ReadonlyArray<Record<string, unknown>>,
  next: ReadonlyArray<Record<string, unknown>>
): boolean => {
  if (current === next) return true;
  if (current.length !== next.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    const left = current.at(index);
    const right = next.at(index);
    if (left === undefined || right === undefined) return false;
    if (left === right) continue;
    if (identifierOf(left) !== identifierOf(right)) {
      return false;
    }
    if (
      normalizeComparableQuantity(left.counted_quantity) !==
      normalizeComparableQuantity(right.counted_quantity)
    ) {
      return false;
    }
  }
  return true;
};

/**
 * يدمج كميات مسودة الحفظ داخل قائمة الأصناف الأساسية.
 * مأخوذ خارج الهوك لإبقائه قصيراً وقابلاً للاختبار منفصلاً.
 */
const mergeDraftIntoBase = (
  baseList: ReadonlyArray<Record<string, unknown>>,
  draftItems: InventorySessionDraft['items']
): Array<Record<string, unknown>> => {
  const mergedItems = [...baseList];
  draftItems.forEach(draftItem => {
    const rawDraft = draftItem as unknown as Record<string, unknown>;
    const draftProductId = firstIdentifier(
      rawDraft.productId,
      rawDraft.product_id,
      rawDraft.id
    );
    const draftCountedQty =
      rawDraft.countedQuantity !== undefined
        ? (rawDraft.countedQuantity as number | null)
        : rawDraft.counted_quantity !== undefined
          ? (rawDraft.counted_quantity as number | null)
          : null;

    const existingIndex = mergedItems.findIndex(item => identifierOf(item) === draftProductId);

    if (existingIndex >= 0) {
      const existing = mergedItems.at(existingIndex);
      if (existing !== undefined && draftCountedQty !== null && draftCountedQty !== undefined) {
        mergedItems[existingIndex] = { ...existing, counted_quantity: draftCountedQty };
      }
    } else if (draftProductId !== '') {
      // حالة حدّية: صنف موجود في المسودة وليس في بيانات الخادم بعد
      mergedItems.push({
        product_id: draftProductId,
        counted_quantity: draftCountedQty,
      });
    }
  });
  return mergedItems;
};

export function useInventorySession({
  sessionId,
  warehouseId,
  initialItems,
  autoSave = true,
  isCompleted = false,
}: UseInventorySessionProps) {
  const { showToast } = useFeedbackStore();
  const [items, setItems] = useState<Array<Record<string, unknown>>>(initialItems);
  const [isRestoring, setIsRestoring] = useState(!isCompleted);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const isDirtyRef = useRef(false);
  const lastItemsRef = useRef<Array<Record<string, unknown>>>(initialItems);
  const hasRestoredRef = useRef(false);
  // [PERF-FIX] أحدث نسخة من الأصناف ومن `buildDraft` تُقرأ من مراجع داخل مستمع
  // `beforeunload` ودالة التنظيف، بدل وضعهما في مصفوفة تبعيات الـ effect
  // (كان ذلك يُنفّذ التنظيف — أي حفظاً على الخادم — عند كل تعديل صنف).
  const itemsRef = useRef(items);
  const buildDraftRef = useRef<
    ((items: Array<Record<string, unknown>>) => InventorySessionDraft) | null
  >(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Sync initialItems when server data finishes loading.
  // IMPORTANT: Only run before restoration is complete to avoid overwriting
  // user-entered quantities that were saved in the sessionStorage / server draft.
  useEffect(() => {
    if (initialItems.length > 0) {
      // For completed sessions always show server data.
      // For active sessions only seed the state if restoration hasn't happened yet,
      // so that a saved draft is never wiped by the server baseline.
      if (isCompleted || (items.length === 0 && !hasRestoredRef.current)) {
        setItems(initialItems);
        lastItemsRef.current = initialItems;
      }
    }
  }, [initialItems, isCompleted, items.length]);

  // Restore session on mount (only for active sessions, never for completed)
  useEffect(() => {
    if (isCompleted) {
      setIsRestoring(false);
      return;
    }
    if (hasRestoredRef.current) return;
    let mounted = true;

    async function restore() {
      if (!mounted || hasRestoredRef.current || isCompleted) return;
      hasRestoredRef.current = true;
      try {
        const draft = await inventoryPersistence.restoreSession(sessionId);
        if (draft && mounted) {
          // دمج كميات المسودة في القائمة الأساسية (بيانات الخادم إن وُجدت، وإلا الحالة الحالية)
          const baseList = initialItems.length > 0 ? initialItems : items;
          const mergedItems = mergeDraftIntoBase(baseList, draft.items);

          setItems(mergedItems);
          lastItemsRef.current = mergedItems;
          setSaveStatus('saved');
          showToast('تم استعادة بيانات الجلسة من الحفظ التلقائي', 'info');
        }
      } finally {
        if (mounted) {
          setIsRestoring(false);
        }
      }
    }

    // We only want to restore once, but we need initialItems to be loaded first
    // If initialItems is empty, it might be loading, or it might actually be empty.
    // We'll run restore once we have items, or after a short delay if it remains empty.
    const timer = setTimeout(
      () => {
        if (mounted && !hasRestoredRef.current) {
          restore();
        }
      },
      initialItems.length > 0 ? 0 : 1000
    );

    if (initialItems.length > 0 && !hasRestoredRef.current) {
      clearTimeout(timer);
      restore();
    }

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [sessionId, showToast, initialItems, items, isCompleted]);

  // Subscribe to save status changes
  useEffect(() => {
    const unsubscribe = inventoryPersistence.subscribe(setSaveStatus);
    return unsubscribe;
  }, []);

  // Helper to build draft
  const buildDraft = useCallback(
    (currentItems: Array<Record<string, unknown>>): InventorySessionDraft => {
      const draft: InventorySessionDraft = {
        sessionId,
        items: currentItems.map(item => ({
          productId: identifierOf(item),
          countedQuantity: (item.counted_quantity as number) ?? null,
          timestamp: Date.now(),
          synced: false,
        })),
        lastSavedAt: Date.now(),
        isDirty: true,
      };
      if (warehouseId) {
        draft.warehouseId = warehouseId;
      }
      return draft;
    },
    [sessionId, warehouseId]
  );

  useEffect(() => {
    buildDraftRef.current = buildDraft;
  }, [buildDraft]);

  // Auto-save on items change
  useEffect(() => {
    if (!autoSave || isRestoring || isCompleted) return;
    if (JSON.stringify(items) === JSON.stringify(lastItemsRef.current)) return;
    isDirtyRef.current = true;
    lastItemsRef.current = items;
    const draft = buildDraft(items);
    inventoryPersistence.scheduleLocalSave(draft);
    inventoryPersistence.saveToServer(draft);
  }, [items, autoSave, isRestoring, isCompleted, buildDraft]);

  // Force save on page unload and on component unmount
  // [PERF-FIX] كان هذا الـ effect في مصفوفة تبعيته `items`، فتُنفَّذ دالة
  // التنظيف (حفظ على الخادم + sessionStorage) عند **كل** تغيّر في الأصناف —
  // أي طلب شبكة إضافي مع كل تعديل، وهو ما كان يُبطئ الجرد ويُظهر «اتصال غير
  // مستقر». الآن يُثبَّت المستمع مرة واحدة، وتُقرأ أحدث القيم من مراجع.
  useEffect(() => {
    const handleBeforeUnload = () => {
      const buildDraft = buildDraftRef.current;
      if (!buildDraft || !isDirtyRef.current || isCompleted) return;
      inventoryPersistence.forceSave(buildDraft(itemsRef.current));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      const buildDraft = buildDraftRef.current;
      // Synchronously preserve local draft on SPA navigation unmount
      if (buildDraft && isDirtyRef.current && !isCompleted) {
        const draft = buildDraft(itemsRef.current);
        inventoryPersistence.saveLocalSync(draft);
        void inventoryPersistence.saveToServer(draft);
      }
    };
  }, [isCompleted]);

  const updateItems = useCallback((newItems: Array<Record<string, unknown>>) => {
    // لا نستبدل الحالة إن كان المحتوى مطابقاً: يمنع إعادة الرسم، ويمنع
    // إعادة ضبط النموذج (reset) والقفز في مؤشر الحقل أثناء الكتابة.
    setItems(prev => (areAuditItemsEquivalent(prev, newItems) ? prev : newItems));
  }, []);
  const updateItemQuantity = useCallback((productId: string, quantity: number | null) => {
    setItems(prev =>
      prev.map(item =>
        (item.product_id || item.id) === productId ? { ...item, counted_quantity: quantity } : item
      )
    );
  }, []);
  const addItem = useCallback((item: Record<string, unknown>) => {
    setItems(prev => {
      const exists = prev.find(i => (i.product_id || i.id) === (item.product_id || item.id));
      if (exists) return prev;
      return [item, ...prev];
    });
  }, []);
  const removeItem = useCallback((productId: string) => {
    setItems(prev => prev.filter(item => (item.product_id || item.id) !== productId));
  }, []);
  const clearSession = useCallback(() => {
    setItems([]);
    lastItemsRef.current = [];
    isDirtyRef.current = false;
    hasRestoredRef.current = false;
    // Pass sessionId so the server draft is also deleted, preventing
    // a stale "restored from autosave" on re-entry of a completed session.
    inventoryPersistence.clearSession(sessionId);
  }, [sessionId]);
  const mergeWithServer = useCallback((serverItems: Array<Record<string, unknown>>) => {
    setItems(prev => {
      const merged = [...prev];
      const known = new Set(merged.map(item => identifierOf(item)));
      let didAdd = false;
      serverItems.forEach(serverItem => {
        const key = identifierOf(serverItem);
        if (known.has(key)) return;
        known.add(key);
        merged.unshift(serverItem);
        didAdd = true;
      });
      // [PERF-FIX] كان يُرجع مصفوفة جديدة دائماً حتى بلا أي إضافة، فيُشعل
      // إعادة رسم + مزامنة نموذج + مقارنة حفظ مع كل إعادة جلب.
      if (!didAdd) return prev;
      lastItemsRef.current = merged;
      return merged;
    });
  }, []);

  return {
    items,
    updateItems,
    updateItemQuantity,
    addItem,
    removeItem,
    clearSession,
    mergeWithServer,
    isRestoring,
    saveStatus,
    isDirty: isDirtyRef.current,
  };
}
