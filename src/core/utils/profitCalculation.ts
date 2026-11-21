/**
 * قواعد حساب التكلفة والربح الموحدة للمنتجات بدون سعر تكلفة.
 *
 * القاعدة المعتمدة في النظام:
 * - إذا كان للمنتج سعر تكلفة مسجل (> 0): تُحسب التكلفة الفعلية = الكمية × التكلفة، والربح = صافي البيع - التكلفة.
 * - إذا لم يكن للمنتج سعر تكلفة (0 أو غير محدد): يُحتسب 20% فقط من مبلغ البيع الفعلي كربح،
 *   وتُحتسب النسبة المتبقية (80%) كتكلفة تقديرية للبضاعة المباعة.
 */

export const MISSING_COST_PROFIT_RATIO = 0.2;
export const MISSING_COST_IMPLICIT_COST_RATIO = 0.8;

const roundTwo = (value: number): number => Math.round(value * 100) / 100;

/**
 * يحسب التكلفة الفعلية أو التقديرية (80% عند غياب التكلفة) لسطر بيع واحد.
 */
export const computeEffectiveLineCost = (params: {
  lineNetSaleAmount: number;
  quantity: number;
  unitCost: number;
}): { cost: number; isEstimated: boolean } => {
  const qty = Number.isFinite(params.quantity) ? Math.max(0, params.quantity) : 0;
  const lineSale = Number.isFinite(params.lineNetSaleAmount)
    ? Math.max(0, params.lineNetSaleAmount)
    : 0;
  const unitCost = Number.isFinite(params.unitCost) ? params.unitCost : 0;

  if (qty <= 0) return { cost: 0, isEstimated: false };
  if (unitCost > 0) {
    return { cost: roundTwo(qty * unitCost), isEstimated: false };
  }
  return {
    cost: roundTwo(lineSale * MISSING_COST_IMPLICIT_COST_RATIO),
    isEstimated: lineSale > 0,
  };
};

/**
 * يحسب نسبة هامش الربح لمنتج معين (تُرجع 20% عند غياب سعر التكلفة).
 */
export const computeEffectiveProductMarginPercent = (
  salePrice: number,
  costPrice: number
): number => {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return 0;
  if (!Number.isFinite(costPrice) || costPrice <= 0) {
    return MISSING_COST_PROFIT_RATIO * 100;
  }
  return Math.round(((salePrice - costPrice) / salePrice) * 100);
};
