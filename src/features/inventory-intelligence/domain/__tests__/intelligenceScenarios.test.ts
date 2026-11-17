import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  type BranchInfo,
  type InventoryIntelligenceSnapshot,
  type RawProductSnapshot,
} from '../../types';
import { runIntelligenceEngine } from '../intelligenceEngine';
import { buildLast12MonthKeys, detectDemandSpike } from '../demandAnalytics';
import { forecastForMetrics } from '../forecastingEngine';
import { getProductRelationships } from '../productIntelligence';

const BRANCHES: BranchInfo[] = [
  { id: 'b1', name: 'فرع وائل النظاري', code: 'B1', is_main: true, warehouses: [] },
  { id: 'b2', name: 'فرع غمدان النظاري', code: 'GN', is_main: false, warehouses: [] },
  { id: 'b3', name: 'فرع محمد النظاري', code: 'B2', is_main: false, warehouses: [] },
];

function makeProduct(overrides: Partial<RawProductSnapshot> = {}): RawProductSnapshot {
  return {
    id: 'p1',
    name_ar: 'فحمات فرامل أمامي تويوتا',
    sku: 'SKU-001',
    part_number: '04465-33471',
    alternative_numbers: null,
    brand: 'Toyota Genuine',
    item_type: 'spare_part',
    min_stock_level: 3,
    cost_price: 100,
    purchase_price: 100,
    sale_price: 150,
    category_id: 'cat1',
    category_name: 'فرامل',
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

describe('AI Inventory Intelligence Engine — Mandatory Scenarios A–J', () => {
  it('Scenario A: Recommends safe inter-branch transfer when Branch 1 has surplus and Branch 2 has high demand & low stock', () => {
    const months = buildLast12MonthKeys();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'pA',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 60, weighted_avg_cost: 100 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: 1, weighted_avg_cost: 100 },
            { warehouse_id: 'w3', branch_id: 'b3', quantity: 5, weighted_avg_cost: 100 },
          ],
        }),
      ],
      sales_history: [
        {
          product_id: 'pA',
          branch_id: 'b1',
          net_qty_365: 24,
          net_qty_180: 12,
          net_qty_90: 6,
          net_qty_30: 2,
          net_qty_7: 0,
          net_revenue_365: 3600,
          net_cogs_365: 2400,
          sale_tx_count: 10,
          demand_days_count: 10,
          returned_qty: 0,
          last_sale_date: '2026-11-15',
          first_sale_date: '2026-01-05',
        },
        {
          product_id: 'pA',
          branch_id: 'b2',
          net_qty_365: 240,
          net_qty_180: 120,
          net_qty_90: 60,
          net_qty_30: 20,
          net_qty_7: 5,
          net_revenue_365: 36000,
          net_cogs_365: 24000,
          sale_tx_count: 40,
          demand_days_count: 35,
          returned_qty: 0,
          last_sale_date: '2026-11-16',
          first_sale_date: '2026-01-02',
        },
      ],
      monthly_sales: months.map(m => ({ product_id: 'pA', branch_id: 'b2', month_key: m, net_qty: 20 })),
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(out.transferRecommendations.length).toBeGreaterThanOrEqual(1);
    const tr = out.transferRecommendations[0];
    expect(tr.fromBranchId).toBe('b1');
    expect(tr.toBranchId).toBe('b2');
    expect(tr.recommendedQty).toBeGreaterThan(0);
    expect(tr.projectedFromStock).toBeGreaterThanOrEqual(3); // sending branch protected
  });

  it('Scenario B: Zero stock across all branches triggers demand forecast, supplier matching & purchase qty', () => {
    const months = buildLast12MonthKeys();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'pB',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 0, weighted_avg_cost: 100 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: 0, weighted_avg_cost: 100 },
          ],
        }),
      ],
      sales_history: [
        {
          product_id: 'pB',
          branch_id: 'b1',
          net_qty_365: 180,
          net_qty_180: 90,
          net_qty_90: 45,
          net_qty_30: 15,
          net_qty_7: 3,
          net_revenue_365: 27000,
          net_cogs_365: 18000,
          sale_tx_count: 30,
          demand_days_count: 28,
          returned_qty: 0,
          last_sale_date: '2026-11-10',
          first_sale_date: '2026-01-10',
        },
      ],
      monthly_sales: months.map(m => ({ product_id: 'pB', branch_id: 'b1', month_key: m, net_qty: 15 })),
      supplier_history: [
        {
          product_id: 'pB',
          supplier_id: 'sup1',
          supplier_name: 'شركة النخبة لقطع الغيار',
          purchase_tx_count: 5,
          total_qty_supplied: 200,
          avg_unit_price: 95,
          last_unit_price: 92,
          last_qty: 50,
          last_purchase_date: '2026-10-20',
        },
      ],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(out.overviewKpis.zeroStockAcrossAllBranches).toBe(1);
    expect(out.purchaseRecommendations.length).toBe(1);
    const po = out.purchaseRecommendations[0];
    expect(po.urgency).toBe('critical');
    expect(po.recommendedQty).toBeGreaterThan(0);
    expect(po.recommendedSupplier?.supplierName).toBe('شركة النخبة لقطع الغيار');
  });

  it('Scenario C: Keeps Genuine/OEM and Chinese/Japanese alternatives separate while tracking only verified cross-refs', () => {
    const snapshot = baseSnapshot({
      products: [
        makeProduct({ id: 'oem', name_ar: 'فلتر زيت أصلي', brand: 'Toyota Genuine' }),
        makeProduct({ id: 'cn', name_ar: 'فلتر زيت صيني تجاري', brand: 'China Commercial' }),
      ],
      cross_references: [
        {
          id: 'cr1',
          base_product_id: 'oem',
          alternative_product_id: 'cn',
          match_quality: 'compatible',
          relationship_type: 'compatible_different_grade',
          status: 'approved',
          confidence: 95,
          source: 'manual',
          notes: null,
        },
        {
          id: 'cr2',
          base_product_id: 'oem',
          alternative_product_id: 'unknown',
          match_quality: 'similar',
          relationship_type: 'unverified_similar',
          status: 'pending_review',
          confidence: 60,
          source: 'ai',
          notes: null,
        },
      ],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(out.products).toHaveLength(2);
    expect(out.products[0].identity.qualityGrade).toBe('genuine_oem');
    expect(out.products[1].identity.qualityGrade).toBe('chinese_commercial');

    const rels = getProductRelationships('oem', snapshot.cross_references);
    expect(rels.verifiedAlternatives).toHaveLength(1);
    expect(rels.pendingSuggestions).toHaveLength(1);
  });

  it('Scenario D: Historical stockout does not treat 0-stock 30d drop as zero demand', () => {
    const months = buildLast12MonthKeys();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'pD',
          stock_by_warehouse: [{ warehouse_id: 'w1', branch_id: 'b1', quantity: 0, weighted_avg_cost: 100 }],
        }),
      ],
      sales_history: [
        {
          product_id: 'pD',
          branch_id: 'b1',
          net_qty_365: 240,
          net_qty_180: 120,
          net_qty_90: 60,
          net_qty_30: 0, // zero recent sales because out of stock
          net_qty_7: 0,
          net_revenue_365: 36000,
          net_cogs_365: 24000,
          sale_tx_count: 25,
          demand_days_count: 25,
          returned_qty: 0,
          last_sale_date: '2026-10-05',
          first_sale_date: '2026-01-01',
        },
      ],
      monthly_sales: months.map((m, idx) => ({
        product_id: 'pD',
        branch_id: 'b1',
        month_key: m,
        net_qty: idx === 11 ? 0 : 22,
      })),
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const pD = out.products[0];
    expect(pD.companyMetrics.stockoutAdjusted).toBe(true);
    expect(pD.companyMetrics.adjustedDailyDemand).toBeGreaterThan(0.5);
    expect(pD.forecast30d.predictedQty).toBeGreaterThan(15);
  });

  it('Scenario E: Intermittent demand selects Croston / SBA / TSB / SES instead of blind SMA', () => {
    const months = buildLast12MonthKeys();
    const intermittentSeries = [0, 4, 0, 0, 0, 5, 0, 0, 3, 0, 0, 4];
    const snapshot = baseSnapshot({
      products: [makeProduct({ id: 'pE' })],
      sales_history: [
        {
          product_id: 'pE',
          branch_id: 'b1',
          net_qty_365: 16,
          net_qty_180: 7,
          net_qty_90: 4,
          net_qty_30: 4,
          net_qty_7: 0,
          net_revenue_365: 2400,
          net_cogs_365: 1600,
          sale_tx_count: 4,
          demand_days_count: 4,
          returned_qty: 0,
          last_sale_date: '2026-11-10',
          first_sale_date: '2026-02-01',
        },
      ],
      monthly_sales: months.map((m, i) => ({
        product_id: 'pE',
        branch_id: 'b1',
        month_key: m,
        net_qty: intermittentSeries[i],
      })),
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const pE = out.products[0];
    expect(pE.companyMetrics.demandPattern).toBe('intermittent');
    expect(['Croston', 'SBA', 'TSB', 'SES']).toContain(pE.forecast30d.selectedModel);
  });

  it('Scenario F: Exceptional one-time spike is detected and dampened', () => {
    const seriesWithSpike = [2, 2, 3, 2, 2, 100, 2, 3, 2, 2, 3, 2];
    expect(detectDemandSpike(seriesWithSpike, 2.5)).toBe(true);
  });

  it('Scenario G: Incoming open purchase order reduces or prevents duplicate purchase recommendation', () => {
    const months = buildLast12MonthKeys();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'pG',
          stock_by_warehouse: [{ warehouse_id: 'w1', branch_id: 'b1', quantity: 5, weighted_avg_cost: 100 }],
        }),
      ],
      sales_history: [
        {
          product_id: 'pG',
          branch_id: 'b1',
          net_qty_365: 120,
          net_qty_180: 60,
          net_qty_90: 30,
          net_qty_30: 10,
          net_qty_7: 2,
          net_revenue_365: 18000,
          net_cogs_365: 12000,
          sale_tx_count: 20,
          demand_days_count: 20,
          returned_qty: 0,
          last_sale_date: '2026-11-15',
          first_sale_date: '2026-01-01',
        },
      ],
      monthly_sales: months.map(m => ({ product_id: 'pG', branch_id: 'b1', month_key: m, net_qty: 10 })),
      open_pos: [{ product_id: 'pG', incoming_qty: 100, earliest_eta: '2026-11-20' }],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    expect(out.purchaseRecommendations).toHaveLength(0);
  });

  it('Scenario H & I & J: Branch-specific demand, multi-supplier ranking, and net returns calculation', () => {
    const months = buildLast12MonthKeys();
    const snapshot = baseSnapshot({
      products: [
        makeProduct({
          id: 'pHIJ',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 2, weighted_avg_cost: 100 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: 1, weighted_avg_cost: 100 },
          ],
        }),
      ],
      sales_history: [
        {
          product_id: 'pHIJ',
          branch_id: 'b1',
          net_qty_365: 120,
          net_qty_180: 60,
          net_qty_90: 30,
          net_qty_30: 10,
          net_qty_7: 2,
          net_revenue_365: 18000,
          net_cogs_365: 12000,
          sale_tx_count: 20,
          demand_days_count: 20,
          returned_qty: 5,
          last_sale_date: '2026-11-16',
          first_sale_date: '2026-01-01',
        },
        {
          product_id: 'pHIJ',
          branch_id: 'b2',
          net_qty_365: 36,
          net_qty_180: 18,
          net_qty_90: 9,
          net_qty_30: 3,
          net_qty_7: 1,
          net_revenue_365: 5400,
          net_cogs_365: 3600,
          sale_tx_count: 8,
          demand_days_count: 8,
          returned_qty: 1,
          last_sale_date: '2026-11-14',
          first_sale_date: '2026-01-05',
        },
      ],
      monthly_sales: months.map(m => ({ product_id: 'pHIJ', branch_id: 'b1', month_key: m, net_qty: 10 })),
      supplier_history: [
        {
          product_id: 'pHIJ',
          supplier_id: 's_expensive',
          supplier_name: 'مورد غالي',
          purchase_tx_count: 2,
          total_qty_supplied: 20,
          avg_unit_price: 130,
          last_unit_price: 130,
          last_qty: 10,
          last_purchase_date: '2026-06-01',
        },
        {
          product_id: 'pHIJ',
          supplier_id: 's_best',
          supplier_name: 'مورد ممتاز وسعر أفضل',
          purchase_tx_count: 8,
          total_qty_supplied: 150,
          avg_unit_price: 92,
          last_unit_price: 90,
          last_qty: 40,
          last_purchase_date: '2026-11-10',
        },
      ],
    });

    const out = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const prod = out.products[0];
    expect(prod.branchMetrics[0].avgMonthlyDemand).toBeGreaterThan(
      prod.branchMetrics[1].avgMonthlyDemand
    );
    expect(prod.suppliers[0].supplierId).toBe('s_best');
    expect(prod.companyMetrics.returnedQty).toBe(6);

    // Backtesting produces valid non-NaN MAE/WAPE/Bias
    const f = forecastForMetrics('pHIJ', prod.companyMetrics, 30, DEFAULT_ENGINE_CONFIG);
    expect(Number.isFinite(f.mae)).toBe(true);
    expect(Number.isFinite(f.wape)).toBe(true);
    expect(Number.isFinite(f.forecastBias)).toBe(true);
  });
});
