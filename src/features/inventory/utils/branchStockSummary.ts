import type { Product } from '../types';

export interface WarehouseStockDetail {
  warehouseId: string;
  warehouseName: string;
  location?: string | undefined;
  quantity: number;
}

export interface BranchStockSummaryItem {
  branchKey: string;
  branchId?: string | undefined;
  branchName: string;
  shortLabel: string;
  branchCode?: string | undefined;
  quantity: number;
  isCurrentBranch: boolean;
  warehouses: WarehouseStockDetail[];
}

export interface ProductBranchAvailability {
  /** الفروع التي تحتوي على رصيد > 0، مرتبة بحيث يأتي الفرع النشط أولاً ثم الأعلى كمية */
  stockedBranches: BranchStockSummaryItem[];
  /** جميع الفروع المسجلة لهذا المنتج (بما فيها ذات الرصيد 0 أو السالب) للعرض التفصيلي في النافذة المنبثقة */
  allBranches: BranchStockSummaryItem[];
  /** رصيد الفرع النشط (إن وُجد فرع نشط) */
  currentBranchQty: number;
  /** إجمالي الرصيد الموجب المتوفر في الفروع الأخرى */
  otherBranchesQty: number;
  /** الإجمالي الكلي في كافة الفروع */
  totalQty: number;
  /** هل المنتج غير متوفر في الفرع النشط لكنه متوفر في فرع آخر؟ */
  availableOnlyInOtherBranches: boolean;
}

/**
 * يستخلص اسماً مختصراً احترافياً للفرع ليناسب الخلية الضيقة بدون استهلاك مساحة
 * مثال: "فرع وائل النظاري" -> "وائل"، "فرع غمدان النظاري" -> "غمدان"، "المستودع الرئيسي" -> "الرئيسي".
 */
export const formatCompactBranchLabel = (
  branchName?: string | null,
  warehouseName?: string | null,
  branchCode?: string | null
): string => {
  const raw = (branchName || warehouseName || branchCode || 'عام').trim();
  if (!raw) return 'عام';

  // إزالة الكلمات التقديمية المتكررة
  const stripped = raw
    .replace(/^فرع\s+/u, '')
    .replace(/^مستودع\s+/u, '')
    .replace(/^مخزن\s+/u, '')
    .trim();

  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 0) return raw.slice(0, 8);

  const first = words[0];
  // إذا كانت الكلمة الأولى قصيرة ومعبّرة (مثل وائل، غمدان، محمد، الرئيسي) نكتفي بها
  if (first.length <= 10) return first;
  return `${first.slice(0, 9)}…`;
};

/**
 * يجمع توزيع المخزون (`warehouse_distribution`) حسب الفروع مع الحفاظ على تفاصيل المستودعات والمواقع.
 */
export const summarizeProductBranchAvailability = (
  product: Pick<Product, 'stock_quantity' | 'warehouse_distribution' | 'location'>,
  activeBranchId?: string | null
): ProductBranchAvailability => {
  const dist = Array.isArray(product.warehouse_distribution) ? product.warehouse_distribution : [];
  const branchMap = new Map<string, BranchStockSummaryItem>();

  for (const row of dist) {
    const qty = Number(row.quantity) || 0;
    const branchId = row.branch_id || undefined;
    const branchName = (row.branch_name || row.warehouse_name || 'المستودع الرئيسي').trim();
    const branchKey = branchId ?? `wh:${row.warehouse_id || branchName}`;
    const isCurrentBranch = Boolean(activeBranchId && branchId && branchId === activeBranchId);

    let entry = branchMap.get(branchKey);
    if (!entry) {
      entry = {
        branchKey,
        branchId,
        branchName,
        shortLabel: formatCompactBranchLabel(row.branch_name, row.warehouse_name, row.branch_code),
        branchCode: row.branch_code,
        quantity: 0,
        isCurrentBranch,
        warehouses: [],
      };
      branchMap.set(branchKey, entry);
    }

    entry.quantity += qty;
    entry.warehouses.push({
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name || 'مستودع',
      location: row.location,
      quantity: qty,
    });
  }

  // ترتيب المستودعات داخل كل فرع من الأعلى كمية للأدنى
  for (const b of branchMap.values()) {
    b.warehouses.sort((a, z) => z.quantity - a.quantity);
  }

  // ترتيب الفروع: الفرع النشط أولاً، ثم الأعلى كمية، ثم أبجدياً
  const allBranches = Array.from(branchMap.values()).sort((a, z) => {
    if (a.isCurrentBranch !== z.isCurrentBranch) return a.isCurrentBranch ? -1 : 1;
    if (z.quantity !== a.quantity) return z.quantity - a.quantity;
    return a.branchName.localeCompare(z.branchName, 'ar');
  });

  const stockedBranches = allBranches.filter(b => b.quantity > 0);

  const currentBranchItem = activeBranchId
    ? allBranches.find(b => b.isCurrentBranch)
    : undefined;

  const currentBranchQty = activeBranchId
    ? (currentBranchItem?.quantity ?? 0)
    : (Number(product.stock_quantity) || 0);

  const otherBranchesQty = stockedBranches
    .filter(b => !b.isCurrentBranch)
    .reduce((sum, b) => sum + b.quantity, 0);

  const totalQty =
    allBranches.length > 0
      ? allBranches.reduce((sum, b) => sum + b.quantity, 0)
      : Number(product.stock_quantity) || 0;

  const availableOnlyInOtherBranches =
    Boolean(activeBranchId) && currentBranchQty <= 0 && otherBranchesQty > 0;

  return {
    stockedBranches,
    allBranches,
    currentBranchQty,
    otherBranchesQty,
    totalQty,
    availableOnlyInOtherBranches,
  };
};
