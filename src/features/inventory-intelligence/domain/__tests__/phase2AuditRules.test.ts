import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  type BranchInfo,
  type InventoryIntelligenceSnapshot,
  type RawProductSnapshot,
} from '../../types';
import { buildLast12MonthKeys, classifyDemandPattern, classifyMovement } from '../demandAnalytics';
import { classifyQualityGrade } from '../productIntelligence';
import { runIntelligenceEngine } from '../intelligenceEngine';

const BRANCHES: BranchInfo[] = [
  { id: 'b1', name: 'فرع 1', code: 'B1', is_main: true, warehouses: [] },
  { id: 'b2', name: 'فرع 2', code: 'B2', is_main: false, warehouses: [] },
  { id: 'b3', name: 'فرع 3', code: 'B3', is_main: false, warehouses: [] },
];

function makeProduct(overrides: Partial<RawProductSnapshot> = {}): RawProductSnapshot {
  return {
    id: 'p1',
    name_ar: 'فلتر زيت تويوتا',
    sku: 'SKU-P2-1',
    part_number: '90915-YZZE1',
    alternative_numbers: null,
    brand: 'Toyota Genuine',
    item_type: 'stock',
    min_stock_level: 2,
    cost_price: 25,
    purchase_price: 25,
    sale_price: 45,
    category_id: 'cat1',
    category_name: 'فلاتر',
    stock_by_warehouse: [],
    ...overrides,
  };
}

function baseSnapshot(partial: Partial<InventoryIntelligenceSnapshot> = {}): InventoryIntelligenceSnapshot {
  return {
    branches: BRANCHES,
    products: [],
    sales_history: [],
    monthly_sales: [],
    supplier_history: [],
    open_pos: [],
    cross_references: [],
    generated_at: '2026-11-17T00:00:00Z',
    ...partial,
  };
}

describe('Phase 2 Audit Rules — Isolated Verification Suite', () => {
  it('1. Computes available & projected inventory from physical, reserved, damaged, incoming & pending transfers', () => {
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'p_avail',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 50, reserved_quantity: 10, damaged_quantity: 5, weighted_avg_cost: 25 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: 10, reserved_quantity: 2, damaged_quantity: 0, weighted_avg_cost: 25 },
          ],
        }),
      ],
      open_pos: [{ product_id: 'p_avail', incoming_qty: 20, earliest_eta: '2026-11-25' }],
      pending_transfers: [{ product_id: 'p_avail', from_branch_id: 'b1', to_branch_id: 'b2', quantity: 8 }],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const prod = out.products[0];
    const b1 = prod.branchMetrics.find(b => b.branchId === 'b1')!;
    const b2 = prod.branchMetrics.find(b => b.branchId === 'b2')!;

    expect(b1.physicalStock).toBe(50);
    expect(b1.reservedStock).toBe(10);
    expect(b1.damagedStock).toBe(5);
    expect(b1.availableStock).toBe(35);
    expect(b1.pendingTransferOut).toBe(8);
    expect(b1.projectedPosition).toBe(35 - 8); // 27 (company-wide POs stay at company level)
    expect(b1.availabilityDataLimited).toBe(false);
    expect(prod.companyMetrics.incomingStock).toBe(20);
    expect(prod.companyMetrics.projectedPosition).toBe(43 + 20); // 43 avail + 20 incoming POs

    expect(b2.availableStock).toBe(8);
    expect(b2.pendingTransferIn).toBe(8);
    expect(b2.projectedPosition).toBe(16);
  });

  it('2. Separates Japanese and Korean aftermarket classifications and flags uncertain items for review', () => {
    const jp = classifyQualityGrade('AISIN', 'طقم كلتش ياباني');
    const kr = classifyQualityGrade('CTR', 'ذراع توازن كوري');
    const unk = classifyQualityGrade('GenericX', 'مساعد أمامي');

    expect(jp.grade).toBe('japanese_aftermarket');
    expect(kr.grade).toBe('korean_aftermarket');
    expect(jp.grade).not.toBe(kr.grade);
    expect(unk.grade).toBe('other_aftermarket');
    expect(unk.classificationStatus).toBe('pending_review');
  });

  it('3. Computes independent branch forecasts and reconciles branch shortages without double counting', () => {
    const months = buildLast12MonthKeys();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'p_branch_fc',
          min_stock_level: 1,
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 2, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 25 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: 1, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 25 },
            { warehouse_id: 'w3', branch_id: 'b3', quantity: 0, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 25 },
          ],
        }),
      ],
      sales_history: [
        {
          product_id: 'p_branch_fc',
          branch_id: 'b1',
          net_qty_365: 120, net_qty_180: 60, net_qty_90: 30, net_qty_30: 10, net_qty_7: 3,
          net_revenue_365: 5400, net_cogs_365: 3000, sale_tx_count: 25, demand_days_count: 20,
          returned_qty: 0, last_sale_date: '2026-11-15', first_sale_date: '2025-12-01',
        },
        {
          product_id: 'p_branch_fc',
          branch_id: 'b2',
          net_qty_365: 240, net_qty_180: 120, net_qty_90: 60, net_qty_30: 20, net_qty_7: 5,
          net_revenue_365: 10800, net_cogs_365: 6000, sale_tx_count: 45, demand_days_count: 35,
          returned_qty: 0, last_sale_date: '2026-11-16', first_sale_date: '2025-12-01',
        },
      ],
      monthly_sales: [
        ...months.map(m => ({ product_id: 'p_branch_fc', branch_id: 'b1', month_key: m, net_qty: 10 })),
        ...months.map(m => ({ product_id: 'p_branch_fc', branch_id: 'b2', month_key: m, net_qty: 20 })),
      ],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const prod = out.products[0];
    expect(prod.branchForecasts['b1'].dailyRate).toBeCloseTo(10 / 30, 1);
    expect(prod.branchForecasts['b2'].dailyRate).toBeCloseTo(20 / 30, 1);
    expect(prod.branchForecasts['b3'].dailyRate).toBe(0);

    const po = out.purchaseRecommendations.find(r => r.productId === 'p_branch_fc');
    expect(po).toBeDefined();
    expect(po!.calculationBreakdown.branchForecastUsed).toBe(true);
    expect(po!.calculationBreakdown.branchShortageBreakdown).toHaveLength(3);
  });

  it('4. Protects newly stocked products from being misclassified as dead_stock', () => {
    const recentDate = new Date(Date.now() - 15 * 86400000).toISOString();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'p_new',
          created_at: recentDate,
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 20, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 30 },
          ],
        }),
      ],
      stock_movements: [
        {
          product_id: 'p_new',
          branch_id: 'b1',
          last_receipt_at: recentDate,
          ledger_tx_count: 1,
          issue_days_count: 0,
        },
      ],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const prod = out.products[0];
    expect(prod.isNewlyStocked).toBe(true);
    expect(prod.isDeadStock).toBe(false);
    expect(prod.movementClass).toBe('newly_stocked');
    expect(out.deadExcessRecommendations.find(d => d.productId === 'p_new')).toBeUndefined();
  });

  it('5. Enforces supplier MOQ and purchase package multiples on recommended quantity', () => {
    const months = buildLast12MonthKeys();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'p_pkg',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 1, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 20 },
          ],
        }),
      ],
      sales_history: [
        {
          product_id: 'p_pkg',
          branch_id: 'b1',
          net_qty_365: 120, net_qty_180: 60, net_qty_90: 30, net_qty_30: 10, net_qty_7: 2,
          net_revenue_365: 4800, net_cogs_365: 2400, sale_tx_count: 15, demand_days_count: 12,
          returned_qty: 0, last_sale_date: '2026-11-15', first_sale_date: '2025-12-01',
        },
      ],
      monthly_sales: months.map(m => ({ product_id: 'p_pkg', branch_id: 'b1', month_key: m, net_qty: 10 })),
      supplier_history: [
        {
          product_id: 'p_pkg',
          supplier_id: 'sup_1',
          supplier_name: 'مورد العبوات',
          purchase_tx_count: 4,
          total_qty_supplied: 100,
          avg_unit_price: 20,
          last_unit_price: 20,
          last_qty: 24,
          last_purchase_date: '2026-10-01',
          measured_lead_days: 10,
          fulfillment_rate_pct: 96,
        },
      ],
      supplier_constraints: [
        {
          product_id: 'p_pkg',
          supplier_id: 'sup_1',
          minimum_order_quantity: 12,
          order_multiple: 6,
          lead_time_days: 10,
          uom_name: 'كرتون (6 حبات)',
          conversion_factor: 6,
        },
      ],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const po = out.purchaseRecommendations.find(r => r.productId === 'p_pkg');
    expect(po).toBeDefined();
    expect(po!.recommendedQty % 6).toBe(0);
    expect(po!.recommendedQty).toBeGreaterThanOrEqual(12);
    expect(po!.calculationBreakdown.packageMultipleApplied).toBe(6);
    expect(po!.calculationBreakdown.packageConstraintVerified).toBe(true);
    expect(po!.recommendedSupplier?.isLeadTimeEstimated).toBe(false);
    expect(po!.recommendedSupplier?.fulfillmentRatePct).toBe(96);
  });

  it('6. Rejects seasonal classification when history is insufficient (< 10 active months)', () => {
    const shortSeries = [0, 0, 0, 0, 0, 0, 0, 10, 2, 15, 3, 20]; // only 5 active months
    const pattern = classifyDemandPattern(shortSeries, 10, 8, 10, 25, 2.5);
    expect(pattern).not.toBe('seasonal');

    const fullRecurring = [5, 18, 6, 5, 20, 6, 5, 19, 6, 5, 22, 6]; // 12 active months, recurring peaks
    const seasonalPattern = classifyDemandPattern(fullRecurring, 30, 25, 5, 25, 2.5);
    expect(seasonalPattern).toBe('seasonal');
  });

  it('7. Marks historicalStockoutLimited when inventory_transactions ledger summary is absent', () => {
    const snapshot = baseSnapshot({
      products: [makeProduct({ id: 'p_no_ledger' })],
    });
    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(out.products[0].companyMetrics.historicalStockoutLimited).toBe(true);
    expect(out.products[0].companyMetrics.availabilityDataLimited).toBe(false); // no stock rows
  });

  it('8. Prevents negative available stock when reserved + damaged exceed physical stock', () => {
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'p_over_alloc',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 10, reserved_quantity: 8, damaged_quantity: 5, weighted_avg_cost: 20 },
          ],
        }),
      ],
    });
    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(out.products[0].companyMetrics.availableStock).toBe(0);
  });
});
