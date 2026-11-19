import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  type InventoryIntelligenceSnapshot,
} from '../../types';
import { runIntelligenceEngine } from '../intelligenceEngine';
import { runAiOrchestration } from '../orchestration/aiOrchestrationEngine';
import { buildLast12MonthKeys, getCurrentMonthKey } from '../demand/patternClassifier';
import { extractProductSize } from '../product/sizeExtractor';

// ---------------------------------------------------------------------------
// Mock Supabase for API-boundary security & threshold tests
// ---------------------------------------------------------------------------
const mockState = {
  stockRows: [{ quantity: 10, reserved_quantity: 0, damaged_quantity: 0, warehouse_id: 'w1' }],
  roleRow: { role: 'branch_manager' } as { role: string } | null,
  roleError: null as { message: string } | null,
  existingDup: null as { id: string } | null,
  rpcResult: { po_id: 'po_123', idempotent: false } as unknown,
  rpcError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  lastRpcArgs: null as Record<string, unknown> | null,
  lastInsertPayload: null as Record<string, unknown> | null,
};

vi.mock('../../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.in = self;
      chain.gte = self;
      chain.is = self;
      chain.order = self;
      chain.limit = self;
      chain.maybeSingle = async () => {
        if (table === 'user_company_roles') {
          return { data: mockState.roleRow, error: mockState.roleError };
        }
        if (table === 'inv_intelligence_recommendations') {
          return { data: mockState.existingDup, error: null };
        }
        return { data: null, error: null };
      };
      chain.insert = async (payload: Record<string, unknown>) => {
        mockState.lastInsertPayload = payload;
        return { error: mockState.insertError };
      };
      chain.then = (resolve: (val: unknown) => void) => {
        if (table === 'product_stock') {
          return Promise.resolve({ data: mockState.stockRows, error: null }).then(resolve);
        }
        if (table === 'warehouses') {
          return Promise.resolve({
            data: [
              { id: 'wh1', branch_id: 'b1', is_primary: true },
              { id: 'wh2', branch_id: 'b2', is_primary: true },
              { id: 'wh3', branch_id: 'b3', is_primary: true },
            ],
            error: null,
          }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      };
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      mockState.lastRpcArgs = { fn, ...args };
      if (fn === 'create_stock_transfer') {
        return { data: { transfer_id: 'tr_new_1' }, error: mockState.rpcError };
      }
      return { data: mockState.rpcResult, error: mockState.rpcError };
    },
  },
}));

import { recordRecommendationDecision } from '../../api/decisionsApi';

describe('Product Intelligence Remediation Verification Suite', () => {
  beforeEach(() => {
    mockState.stockRows = [{ quantity: 10, reserved_quantity: 0, damaged_quantity: 0, warehouse_id: 'w1' }];
    mockState.roleRow = { role: 'branch_manager' };
    mockState.roleError = null;
    mockState.existingDup = null;
    mockState.rpcResult = { po_id: 'po_123', idempotent: false };
    mockState.rpcError = null;
    mockState.insertError = null;
    mockState.lastRpcArgs = null;
    mockState.lastInsertPayload = null;
  });

  // =========================================================================
  // 1. Inventory Integrity: No double deduction of reservedStock & dead stock
  // =========================================================================
  it('does NOT double-deduct reservedStock in NetInventoryPosition or inflate purchase qty', () => {
    const monthKeys = buildLast12MonthKeys(new Date('2026-11-18T00:00:00Z'));
    const snap: InventoryIntelligenceSnapshot = {
      generated_at: '2026-11-18T00:00:00Z',
      branches: [{ id: 'b1', name: 'الفرع الرئيسي', code: 'B1', is_main: true, warehouses: [] }],
      products: [
        {
          id: 'prod_res',
          name_ar: 'فلتر هواء',
          sku: 'SKU-RES',
          part_number: '17801-001',
          alternative_numbers: null,
          brand: 'Toyota',
          item_type: 'spare_part',
          min_stock_level: 2,
          cost_price: 40,
          purchase_price: 40,
          sale_price: 70,
          category_id: null,
          category_name: 'فلاتر',
          stock_by_warehouse: [
            {
              warehouse_id: 'w1',
              branch_id: 'b1',
              quantity: 20,
              reserved_quantity: 5,
              damaged_quantity: 2,
              weighted_avg_cost: 40,
            },
          ],
        },
      ],
      sales_history: [
        {
          product_id: 'prod_res',
          branch_id: 'b1',
          net_qty_365: 360,
          net_qty_180: 180,
          net_qty_90: 90,
          net_qty_30: 30,
          net_qty_7: 7,
          net_revenue_365: 25200,
          net_cogs_365: 14400,
          sale_tx_count: 40,
          demand_days_count: 35,
          returned_qty: 0,
          last_sale_date: '2026-11-17',
          first_sale_date: '2025-11-18',
        },
      ],
      monthly_sales: monthKeys.map(mk => ({
        product_id: 'prod_res',
        branch_id: 'b1',
        month_key: mk,
        net_qty: 30,
      })),
      supplier_history: [
        {
          product_id: 'prod_res',
          supplier_id: 'sup_prc_1',
          prc_supplier_id: 'sup_prc_1',
          party_id: 'party_1',
          is_procurement_registered: true,
          currency: 'SAR',
          supplier_name: 'مورد معتمد',
          purchase_tx_count: 5,
          total_qty_supplied: 200,
          avg_unit_price: 38,
          last_unit_price: 40,
          last_qty: 50,
          last_purchase_date: '2026-11-01',
        },
      ],
      open_pos: [{ product_id: 'prod_res', incoming_qty: 10, earliest_eta: '2026-11-25' }],
      pending_transfers: [],
      cross_references: [],
    };

    const output = runIntelligenceEngine(snap, DEFAULT_ENGINE_CONFIG, new Date('2026-11-18T00:00:00Z'));
    const prod = output.products[0];
    // Physical=20, Reserved=5, Damaged=2 => Available = 13
    expect(prod.companyMetrics.physicalStock).toBe(20);
    expect(prod.companyMetrics.reservedStock).toBe(5);
    expect(prod.companyMetrics.damagedStock).toBe(2);
    expect(prod.companyMetrics.availableStock).toBe(13);

    const poRec = output.purchaseRecommendations.find(r => r.productId === 'prod_res');
    expect(poRec).toBeDefined();
    // NetInventoryPosition = Available(13) + Incoming(10) = 23 (NOT 18!)
    expect(poRec!.calculationBreakdown.netInventoryPosition).toBe(23);
    expect(poRec!.calculationBreakdown.unitPrice).toBe(40);
    expect(poRec!.calculationBreakdown.estimatedCost).toBe(poRec!.recommendedQty * 40);
    expect(poRec!.calculationBreakdown.currency).toBe('SAR');
  });

  it('prevents purchasing company-wide dead stock with zero recent 90d demand', () => {
    const snap: InventoryIntelligenceSnapshot = {
      generated_at: '2026-11-18T00:00:00Z',
      branches: [{ id: 'b1', name: 'الفرع الرئيسي', code: 'B1', is_main: true, warehouses: [] }],
      products: [
        {
          id: 'prod_dead',
          name_ar: 'صنف راكد قديم',
          sku: 'SKU-DEAD',
          part_number: '999-DEAD',
          alternative_numbers: null,
          brand: 'Generic',
          item_type: 'spare_part',
          min_stock_level: 5,
          cost_price: 25,
          purchase_price: 25,
          sale_price: 40,
          category_id: null,
          category_name: 'عام',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 1, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 25 },
          ],
        },
      ],
      sales_history: [
        {
          product_id: 'prod_dead',
          branch_id: 'b1',
          net_qty_365: 1,
          net_qty_180: 0,
          net_qty_90: 0,
          net_qty_30: 0,
          net_qty_7: 0,
          net_revenue_365: 40,
          net_cogs_365: 25,
          sale_tx_count: 1,
          demand_days_count: 1,
          returned_qty: 0,
          last_sale_date: '2025-12-10',
          first_sale_date: '2025-12-10',
        },
      ],
      monthly_sales: [],
      supplier_history: [],
      open_pos: [],
      cross_references: [],
    };

    const output = runIntelligenceEngine(snap, DEFAULT_ENGINE_CONFIG, new Date('2026-11-18T00:00:00Z'));
    expect(output.products[0].isDeadStock).toBe(true);
    expect(output.purchaseRecommendations.find(p => p.productId === 'prod_dead')).toBeUndefined();
  });

  // =========================================================================
  // 2. Data & Forecasting: Completed months vs partial MTD & Arabic sizes
  // =========================================================================
  it('excludes incomplete current month deterministically at start, middle, and end of month', () => {
    const startKeys = buildLast12MonthKeys(new Date(2026, 10, 1, 0, 0, 0));
    const midKeys = buildLast12MonthKeys(new Date(2026, 10, 15, 12, 0, 0));
    const endKeys = buildLast12MonthKeys(new Date(2026, 10, 30, 23, 59, 59));

    expect(startKeys).toHaveLength(12);
    expect(startKeys).toEqual(midKeys);
    expect(midKeys).toEqual(endKeys);
    expect(startKeys[0]).toBe('2025-11');
    expect(startKeys[11]).toBe('2026-10');
    expect(startKeys).not.toContain('2026-11');
    expect(getCurrentMonthKey(new Date(2026, 10, 15, 12, 0, 0))).toBe('2026-11');
  });

  it('extracts Arabic and Latin measurement units accurately without false positives', () => {
    expect(extractProductSize('مسمار مقاس 10 ملم').size).toBe('10 ملم');
    expect(extractProductSize('انبوب 25 مم').size).toBe('25 مم');
    expect(extractProductSize('خرطوم 3 سم').size).toBe('3 سم');
    expect(extractProductSize('زيت محرك 1.5 لتر').size).toBe('1.5 لتر');
    expect(extractProductSize('منظف بخاخ 100 ml').size).toBe('100 ml');
    expect(extractProductSize('برغي 12 mm').size).toBe('12 mm');
    expect(extractProductSize('وصلة 2.5 cm').size).toBe('2.5 cm');
    expect(extractProductSize('فلتر زيت تويوتا كامري').size).toBe('—');
  });

  // =========================================================================
  // 3. Agent 8 (Decision Risk & Financial Impact) & Branch-level Audit
  // =========================================================================
  it('runs Agent 8 (decision_risk_financial_impact), blocks zero-price PO, and catches branch-level negative stock', () => {
    const snap: InventoryIntelligenceSnapshot = {
      generated_at: '2026-11-18T00:00:00Z',
      branches: [
        { id: 'b1', name: 'فرع 1', code: 'B1', is_main: true, warehouses: [] },
        { id: 'b2', name: 'فرع 2', code: 'B2', is_main: false, warehouses: [] },
      ],
      products: [
        {
          // Company-wide physical stock = +10 - 3 = +7 (positive!), but branch b2 is -3!
          id: 'prod_branch_neg',
          name_ar: 'شمعات إشعال',
          sku: 'SKU-BN',
          part_number: '90919-01',
          alternative_numbers: null,
          brand: 'Denso',
          item_type: 'spare_part',
          min_stock_level: 2,
          cost_price: 20,
          purchase_price: 20,
          sale_price: 35,
          category_id: null,
          category_name: 'إشعال',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 10, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 20 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: -3, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 20 },
          ],
        },
        {
          id: 'prod_zero_price',
          name_ar: 'حساس بدون تسعير',
          sku: 'SKU-ZP',
          part_number: '89465-00',
          alternative_numbers: null,
          brand: 'OEM',
          item_type: 'spare_part',
          min_stock_level: 2,
          cost_price: 0,
          purchase_price: 0,
          sale_price: 0,
          category_id: null,
          category_name: 'حساسات',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 0, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 0 },
          ],
        },
      ],
      sales_history: [
        {
          product_id: 'prod_zero_price',
          branch_id: 'b1',
          net_qty_365: 60,
          net_qty_180: 30,
          net_qty_90: 20,
          net_qty_30: 10,
          net_qty_7: 2,
          net_revenue_365: 0,
          net_cogs_365: 0,
          sale_tx_count: 10,
          demand_days_count: 10,
          returned_qty: 0,
          last_sale_date: '2026-11-17',
          first_sale_date: '2026-01-01',
        },
      ],
      monthly_sales: [],
      supplier_history: [],
      open_pos: [],
      cross_references: [],
    };

    const output = runIntelligenceEngine(snap, DEFAULT_ENGINE_CONFIG, new Date('2026-11-18T00:00:00Z'));
    const orch = runAiOrchestration(output, [], 'comp_1');

    expect(orch.financialRiskRun?.agentId).toBe('decision_risk_financial_impact');
    const negAudit = orch.decisions.find(d => d.recType === 'data_audit' && d.productId === 'prod_branch_neg');
    expect(negAudit).toBeDefined();

    const zeroPricePo = orch.decisions.find(d => d.recType === 'purchase' && d.productId === 'prod_zero_price');
    expect(zeroPricePo).toBeDefined();
    expect(zeroPricePo?.conflictBlocked).toBe(true);
    expect(zeroPricePo?.lifecycleState).toBe('cancelled');
  });

  // =========================================================================
  // 4. Security, 5,000 Threshold, Fail-Closed Auth & Route-Aware Idempotency
  // =========================================================================
  it('denies missing role, missing membership, and zero-price purchases (fail-closed)', async () => {
    // Missing role -> DENY
    mockState.roleRow = null;
    await expect(
      recordRecommendationDecision({
        companyId: 'c1',
        userId: 'u1',
        recType: 'purchase',
        productId: 'p1',
        supplierId: 'sup1',
        recommendedQty: 10,
        urgency: 'high',
        confidenceScore: 80,
        reason: 'test',
        status: 'approved',
        calculationBreakdown: { unitPrice: 100 },
      })
    ).rejects.toThrow(/access_denied/);

    // Role lookup error -> DENY
    mockState.roleError = { message: 'DB failure' };
    await expect(
      recordRecommendationDecision({
        companyId: 'c1',
        userId: 'u1',
        recType: 'purchase',
        productId: 'p1',
        supplierId: 'sup1',
        recommendedQty: 10,
        urgency: 'high',
        confidenceScore: 80,
        reason: 'test',
        status: 'approved',
        calculationBreakdown: { unitPrice: 100 },
      })
    ).rejects.toThrow(/تعذر التحقق/);

    // Zero price -> DENY
    mockState.roleError = null;
    mockState.roleRow = { role: 'owner' };
    await expect(
      recordRecommendationDecision({
        companyId: 'c1',
        userId: 'u1',
        recType: 'purchase',
        productId: 'p1',
        supplierId: 'sup1',
        recommendedQty: 10,
        urgency: 'high',
        confidenceScore: 80,
        reason: 'test',
        status: 'approved',
        calculationBreakdown: { unitPrice: 0 },
      })
    ).rejects.toThrow(/unitPrice > 0/);
  });

  it('enforces 5,000 threshold below, at, and above 5,000 for branch_manager vs owner', async () => {
    // 4,999 -> allowed for branch_manager
    mockState.roleRow = { role: 'branch_manager' };
    await expect(
      recordRecommendationDecision({
        companyId: 'c1',
        userId: 'u1',
        recType: 'purchase',
        productId: 'p1',
        supplierId: 'sup1',
        recommendedQty: 1,
        approvedQty: 1,
        urgency: 'high',
        confidenceScore: 80,
        reason: 'below 5000',
        status: 'approved',
        calculationBreakdown: { unitPrice: 4999 },
      })
    ).resolves.toEqual({ linkedTransferId: null, linkedPoId: 'po_123' });

    // Exactly 5,000 -> denied for branch_manager
    await expect(
      recordRecommendationDecision({
        companyId: 'c1',
        userId: 'u1',
        recType: 'purchase',
        productId: 'p1',
        supplierId: 'sup1',
        recommendedQty: 50,
        approvedQty: 50,
        urgency: 'high',
        confidenceScore: 80,
        reason: 'at 5000',
        status: 'approved',
        calculationBreakdown: { unitPrice: 100 },
      })
    ).rejects.toThrow(/5,000/);

    // Above 5,000 -> allowed for owner
    mockState.roleRow = { role: 'owner' };
    await expect(
      recordRecommendationDecision({
        companyId: 'c1',
        userId: 'u1',
        recType: 'purchase',
        productId: 'p1',
        supplierId: 'sup1',
        recommendedQty: 60,
        approvedQty: 60,
        urgency: 'high',
        confidenceScore: 80,
        reason: 'above 5000',
        status: 'approved',
        calculationBreakdown: { unitPrice: 100 },
      })
    ).resolves.toEqual({ linkedTransferId: null, linkedPoId: 'po_123' });
  });

  it('keeps distinct transfer routes (B1->B2 vs B1->B3) independent in idempotency & execution reconciliation', async () => {
    mockState.roleRow = { role: 'branch_manager' };
    await recordRecommendationDecision({
      companyId: 'c1',
      userId: 'u1',
      recType: 'transfer',
      productId: 'p_tr',
      fromBranchId: 'b1',
      toBranchId: 'b2',
      recommendedQty: 5,
      urgency: 'high',
      confidenceScore: 90,
      reason: 'route 1',
      status: 'approved',
    });
    const key1 = mockState.lastInsertPayload?.idempotency_key;

    await recordRecommendationDecision({
      companyId: 'c1',
      userId: 'u1',
      recType: 'transfer',
      productId: 'p_tr',
      fromBranchId: 'b1',
      toBranchId: 'b3',
      recommendedQty: 5,
      urgency: 'high',
      confidenceScore: 90,
      reason: 'route 2',
      status: 'approved',
    });
    const key2 = mockState.lastInsertPayload?.idempotency_key;

    expect(key1).toContain(':b1:b2:');
    expect(key2).toContain(':b1:b3:');
    expect(key1).not.toBe(key2);
  });
});
