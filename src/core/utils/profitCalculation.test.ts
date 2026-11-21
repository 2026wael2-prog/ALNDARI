import { describe, expect, it } from 'vitest';
import {
  computeEffectiveLineCost,
  computeEffectiveProductMarginPercent,
  MISSING_COST_IMPLICIT_COST_RATIO,
  MISSING_COST_PROFIT_RATIO,
} from './profitCalculation';

describe('profitCalculation — قاعدة 20% ربح و80% تكلفة للأصناف بدون سعر تكلفة', () => {
  it('يحسب 80% تكلفة و20% ربح عندما تكون تكلفة الصنف صفراً', () => {
    const res = computeEffectiveLineCost({
      lineNetSaleAmount: 1000,
      quantity: 2,
      unitCost: 0,
    });
    expect(res).toEqual({ cost: 800, isEstimated: true });
    expect(1000 - res.cost).toBe(200);
    expect(MISSING_COST_PROFIT_RATIO + MISSING_COST_IMPLICIT_COST_RATIO).toBe(1);
  });

  it('يستخدم التكلفة الفعلية عندما تكون متوفرة وأكبر من صفر', () => {
    const res = computeEffectiveLineCost({
      lineNetSaleAmount: 1000,
      quantity: 2,
      unitCost: 300,
    });
    expect(res).toEqual({ cost: 600, isEstimated: false });
    expect(1000 - res.cost).toBe(400);
  });

  it('يتعامل مع الكمية الصفرية أو السالبة بأمان', () => {
    expect(
      computeEffectiveLineCost({ lineNetSaleAmount: 500, quantity: 0, unitCost: 0 })
    ).toEqual({ cost: 0, isEstimated: false });
  });

  it('يُعيد هامش 20% عند غياب تكلفة المنتج ويحسب الهامش الحقيقي عند توفرها', () => {
    expect(computeEffectiveProductMarginPercent(100, 0)).toBe(20);
    expect(computeEffectiveProductMarginPercent(100, 60)).toBe(40);
    expect(computeEffectiveProductMarginPercent(0, 0)).toBe(0);
  });
});
