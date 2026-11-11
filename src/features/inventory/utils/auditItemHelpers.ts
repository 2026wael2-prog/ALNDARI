/**
 * دوال مساعدة نقية لإجراءات أصناف الجرد (إضافة/زيادة/حذف).
 *
 * سبب وجود الملف: كانت هذه الدوال داخل `useAuditItemActions` فجعلت الهوك
 * الواحد يتجاوز حدّ طول الدالة، وكانت تخلط منطقاً نقياً (يُختبر وحده) بمنطق
 * حالة React. هنا كل ما هو نقي خارج الهوك.
 */
import type { Product } from '../types';
import { firstFilled, toNumber, toText } from './valueCoercion';

export type AuditItems = Array<Record<string, unknown>>;

/** حمولة إضافة صنف إلى جلسة الجرد. */
export type AddItemToAudit = (
  payload: { sessionId: string; productId: string; expectedQuantity: number },
  options?: { onSuccess?: (result: unknown) => void; onError?: () => void }
) => void;

/** حمولة حذف صنف من جلسة الجرد. */
export type RemoveItemFromAudit = (
  payload: { itemId?: string; productId: string; sessionId: string },
  options?: { onError?: () => void }
) => void;

/** هدف الحذف القادم من جدول الأصناف. */
export interface AuditItemIdentifier {
  id?: string;
  productId: string;
}

/** معرّف الصنف النصّي (product_id ثم id) — بلا تحويل ضمني لكائنات. */
export const itemProductId = (item: Record<string, unknown>): string =>
  firstFilled(toText(item.product_id), toText(item.id));

/** معرّف المنتج المتداخل في علاقة `products`. */
export const nestedProductId = (item: Record<string, unknown>): string => {
  const nested = item.products;
  if (nested === null || typeof nested !== 'object') return '';
  return toText((nested as Record<string, unknown>).id);
};

const countedQuantityOf = (item: Record<string, unknown>): number | null => {
  const raw = item.counted_quantity;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

/** الكمية المتوقّعة من توزيع المخازن أو من رصيد المنتج. */
export const resolveExpectedQuantity = (product: Product, warehouseId: string | undefined): number => {
  const distribution = product.warehouse_distribution;
  if (distribution !== undefined && warehouseId !== undefined) {
    const stock = distribution.find(w => w.warehouse_id === warehouseId);
    if (stock !== undefined) return toNumber(stock.quantity);
  }
  return toNumber(product.stock_quantity);
};

/** يبني صنفاً متفائلاً (يظهر فوراً قبل تأكيد الخادم). */
export const buildOptimisticItem = (product: Product, expectedQuantity: number): Record<string, unknown> => {
  const displayName = firstFilled(product.name_ar, product.name, 'بدون اسم');
  return {
    product_id: product.id,
    expected_quantity: expectedQuantity,
    counted_quantity: null,
    products: {
      id: product.id,
      name: displayName,
      name_ar: displayName,
      sku: firstFilled(product.sku, '---'),
      part_number: product.part_number ?? null,
      brand: product.brand ?? null,
      size: product.size ?? null,
      category: firstFilled(toText((product as unknown as { category?: unknown }).category), 'عام'),
      // التكلفة تصل من نتيجة البحث إن وُجدت، وتُستكمل من الخادم بعد إعادة الجلب.
      cost_price: toNumber(product.cost_price),
      purchase_price: product.purchase_price === undefined ? null : toNumber(product.purchase_price),
    },
  };
};

/** زيادة كمية صنف موجود +1 وإعادة ترتيبه أول القائمة (مجمّع الباركود). */
export const boostExistingItem = (
  items: AuditItems,
  index: number
): { items: AuditItems; quantity: number; displayName: string } => {
  const nextItems = [...items];
  const [existing] = nextItems.splice(index, 1);
  const quantity = (countedQuantityOf(existing) ?? 0) + 1;
  const target: Record<string, unknown> = { ...existing, counted_quantity: quantity };
  nextItems.unshift(target);

  const nested = target.products;
  const displayName =
    nested !== null && typeof nested === 'object'
      ? toText((nested as Record<string, unknown>).name)
      : '';
  return { items: nextItems, quantity, displayName };
};

/** يحذف الصنف المستهدف (بالمعرّف أو بمعرّف المنتج) من قائمة الجرد. */
export const removeTargetItem = (items: AuditItems, target: AuditItemIdentifier): AuditItems =>
  items.filter(item => {
    const sameRow =
      target.id === undefined || (item.id !== target.id && item.audit_item_id !== target.id);
    const sameProduct = target.productId === '' || itemProductId(item) !== target.productId;
    return sameRow && sameProduct;
  });

/** يثبّت معرّف الصنف الحقيقي القادم من الخادم على الصنف المتفائل. */
const applyServerId = (items: AuditItems, productId: string, realId: string): AuditItems =>
  items.map(item =>
    itemProductId(item) === productId || nestedProductId(item) === productId
      ? { ...item, id: realId, audit_item_id: realId }
      : item
  );

/** معرّف الصنف كما يعيده الخادم بعد الإضافة. */
const createdItemId = (result: unknown): string =>
  result !== null && typeof result === 'object'
    ? toText((result as Record<string, unknown>).id)
    : '';

/** يضيف منتجاً إلى الجلسة: زيادة كمية أو إضافة صنف متفائل ثم تثبيت معرّفه. */
export const addProductToSession = (options: {
  product: Product;
  sessionId: string;
  warehouseId: string | undefined;
  items: AuditItems;
  accumulateQuantity: (items: AuditItems, index: number, product: Product) => void;
  syncItems: (items: AuditItems) => void;
  resetSearch: () => void;
  showToast: (message: string, type: 'success' | 'info', opts: { hideAfter: number }) => void;
  addItemToAudit: AddItemToAudit;
  currentItemsAfterMutation: () => AuditItems;
}): void => {
  const { product, items, sessionId } = options;
  const existingIndex = items.findIndex(
    item => itemProductId(item) === product.id || nestedProductId(item) === product.id
  );
  if (existingIndex >= 0) {
    options.accumulateQuantity(items, existingIndex, product);
    return;
  }

  const expectedQuantity = resolveExpectedQuantity(product, options.warehouseId);
  options.syncItems([buildOptimisticItem(product, expectedQuantity), ...items]);
  options.resetSearch();
  const displayName = firstFilled(product.name_ar, product.name);
  options.showToast(`تمت إضافة "${displayName}" إلى مسودة الجرد`, 'success', { hideAfter: 1500 });

  options.addItemToAudit(
    { sessionId, productId: product.id, expectedQuantity },
    {
      onSuccess: (result: unknown) => {
        const realId = createdItemId(result);
        if (realId === '') return;
        options.syncItems(applyServerId(options.currentItemsAfterMutation(), product.id, realId));
      },
      onError: () => {
        options.syncItems(
          options.currentItemsAfterMutation().filter(item => itemProductId(item) !== product.id)
        );
      },
    }
  );
};

/** زيادة كمية صنف موجود +1 ثم مزامنة القائمة وإظهار رسالة توضيحية. */
export const accumulateExistingItem = (options: {
  items: AuditItems;
  index: number;
  product: Product;
  syncItems: (items: AuditItems) => void;
  resetSearch: () => void;
  showToast: (message: string, type: 'success' | 'info', opts: { hideAfter: number }) => void;
}): void => {
  const boosted = boostExistingItem(options.items, options.index);
  options.syncItems(boosted.items);
  options.resetSearch();
  const displayName = firstFilled(boosted.displayName, options.product.name_ar, 'الصنف');
  options.showToast(
    `تم زيادة كمية "${displayName}" إلى (${String(boosted.quantity)})`,
    'info',
    { hideAfter: 1500 }
  );
};

/** حذف متفائل لصنف مع طلب حذفه من الخادم والتراجع عند الفشل. */
export const removeItemFromSession = (options: {
  target: AuditItemIdentifier;
  sessionId: string;
  currentItems: AuditItems;
  syncItems: (items: AuditItems) => void;
  onRemoved: () => void;
  removeItemFromAudit: RemoveItemFromAudit;
}): void => {
  const { target, sessionId, currentItems, syncItems, onRemoved } = options;
  options.syncItems(removeTargetItem(currentItems, target));
  onRemoved();
  options.removeItemFromAudit(
    {
      ...(target.id === undefined ? {} : { itemId: target.id }),
      productId: target.productId,
      sessionId,
    },
    {
      onError: () => {
        syncItems(currentItems);
      },
    }
  );
};
