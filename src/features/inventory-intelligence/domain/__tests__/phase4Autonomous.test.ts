import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  type InventoryIntelligenceSnapshot,
  type PersistedRecommendationRecord,
} from '../../types';
import { runIntelligenceEngine } from '../intelligenceEngine';
import { runAiOrchestration } from '../orchestration/aiOrchestrationEngine';
import { parseManagerCommand } from '../orchestration/conversationalCommandParser';

function makeAutonomousSnapshot(): InventoryIntelligenceSnapshot {
  return {
    generated_at: '2026-11-17T00:00:00Z',
    branches: [
      { id: 'b1', name: 'فرع وائل', code: 'B1', is_main: true, warehouses: [] },
      { id: 'b2', name: 'فرع غمدان', code: 'B2', is_main: false, warehouses: [] },
      { id: 'b3', name: 'فرع محمد', code: 'B3', is_main: false, warehouses: [] },
    ],
    products: [
      {
        id: 'p_transfer',
        name_ar: 'فحمات فرامل أمامي تويوتا',
        sku: 'SKU-T1',
        part_number: '04465-33471',
        alternative_numbers: null,
        brand: 'Toyota Genuine',
        item_type: 'spare_part',
        min_stock_level: 2,
        cost_price: 50,
        purchase_price: 50,
        sale_price: 80,
        category_id: null,
        category_name: 'فرامل',
        stock_by_warehouse: [
          { warehouse_id: 'w1', branch_id: 'b1', quantity: 60, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 50 },
          { warehouse_id: 'w2', branch_id: 'b2', quantity: 0, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 50 },
          { warehouse_id: 'w3', branch_id: 'b3', quantity: 10, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 50 },
        ],
      },
      {
        id: 'p_neg',
        name_ar: 'فلتر زيت نيسان',
        sku: 'SKU-NEG',
        part_number: '15208-65F0A',
        alternative_numbers: null,
        brand: 'Nissan',
        item_type: 'spare_part',
        min_stock_level: 2,
        cost_price: 15,
        purchase_price: 15,
        sale_price: 25,
        category_id: null,
        category_name: 'فلاتر',
        stock_by_warehouse: [
          { warehouse_id: 'w1', branch_id: 'b1', quantity: -3, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 15 },
        ],
      },
    ],
    sales_history: [
      {
        product_id: 'p_transfer',
        branch_id: 'b2',
        net_qty_365: 120,
        net_qty_180: 60,
        net_qty_90: 30,
        net_qty_30: 15,
        net_qty_7: 4,
        net_revenue_365: 9600,
        net_cogs_365: 6000,
        sale_tx_count: 20,
        demand_days_count: 18,
        returned_qty: 0,
        last_sale_date: '2026-11-16',
        first_sale_date: '2025-12-01',
      },
    ],
    monthly_sales: [],
    supplier_history: [],
    open_pos: [],
    cross_references: [],
  };
}

describe('Phase 4 Autonomous Orchestration, 8 Agents & Lifecycle Verification', () => {
  it('runs all 8 agents, deduplicates by idempotencyKey, and flags negative stock integrity errors', () => {
    const output = runIntelligenceEngine(makeAutonomousSnapshot(), DEFAULT_ENGINE_CONFIG);
    const history: PersistedRecommendationRecord[] = [
      {
        id: 'rec_1',
        company_id: 'comp_1',
        rec_type: 'transfer',
        product_id: 'p_transfer',
        from_branch_id: 'b1',
        to_branch_id: 'b2',
        supplier_id: null,
        recommended_qty: 15,
        approved_qty: 15,
        urgency: 'critical',
        confidence_score: 85,
        reason: 'تحويل لتغطية فرع غمدان',
        status: 'executed',
        decision_reason: null,
        linked_transfer_id: 'tr_999',
        linked_po_id: null,
        created_at: '2026-11-17T10:00:00Z',
        decided_at: '2026-11-17T10:05:00Z',
      },
    ];

    const orchestration = runAiOrchestration(output, history, 'comp_1');

    // All 8 agents ran
    expect(orchestration.agentRuns).toHaveLength(8);
    expect(orchestration.agentRuns.map(a => a.agentId)).toEqual([
      'inventory_monitoring',
      'demand_forecasting',
      'procurement_optimization',
      'branch_transfer',
      'supplier_intelligence',
      'dead_stock_recovery',
      'data_integrity_audit',
      'operational_execution',
    ]);

    // Data Integrity Audit Agent caught negative physical stock
    const auditAgent = orchestration.agentRuns.find(a => a.agentId === 'data_integrity_audit');
    expect(auditAgent?.status).toBe('error');
    expect(orchestration.summary.dataIntegrityWarnings).toBeGreaterThanOrEqual(1);

    // Operational Execution Agent reconciled executed transfer -> verified lifecycle state
    const verifiedTransfer = orchestration.decisions.find(
      d => d.recType === 'transfer' && d.productId === 'p_transfer'
    );
    expect(verifiedTransfer?.lifecycleState).toBe('verified');
    expect(verifiedTransfer?.outcomeVerification.verified).toBe(true);
    expect(verifiedTransfer?.linkedTransferId).toBe('tr_999');

    // Unique idempotency keys across all orchestrated decisions
    const keys = orchestration.decisions.map(d => d.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('answers manager conversational queries deterministically without mutating state', () => {
    const output = runIntelligenceEngine(makeAutonomousSnapshot(), DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(output, [], 'comp_1');

    const transferReply = parseManagerCommand('ما هي فرص التحويل المتاحة؟', output, orchestration);
    expect(transferReply.answer).toContain('تحويل');
    expect(transferReply.suggestedTab).toBe('transfers');

    const healthReply = parseManagerCommand('حالة الوكلاء', output, orchestration);
    expect(healthReply.answer).toContain('وكيل مراقبة المخزون');
    expect(healthReply.answer).toContain('وكيل سلامة البيانات والتدقيق المحاسبي');
  });

  it('detects cross-agent conflicts and blocks procurement on negative physical stock', () => {
    const snap = makeAutonomousSnapshot();
    // Give p_neg sales history so procurement agent wants to buy it, while dataAudit flags negative stock (-3)
    snap.sales_history.push({
      product_id: 'p_neg',
      branch_id: 'b1',
      net_qty_365: 60,
      net_qty_180: 30,
      net_qty_90: 20,
      net_qty_30: 10,
      net_qty_7: 3,
      net_revenue_365: 1500,
      net_cogs_365: 900,
      sale_tx_count: 12,
      demand_days_count: 10,
      returned_qty: 0,
      last_sale_date: '2026-11-15',
      first_sale_date: '2025-12-01',
    });

    const output = runIntelligenceEngine(snap, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(output, [], 'comp_1');

    const blockedPurchase = orchestration.decisions.find(
      d => d.recType === 'purchase' && d.productId === 'p_neg'
    );
    expect(blockedPurchase).toBeDefined();
    expect(blockedPurchase?.conflictBlocked).toBe(true);
    expect(blockedPurchase?.lifecycleState).toBe('cancelled');
    expect(blockedPurchase?.conflictsDetected?.some(c => c.includes('رصيد فعلي سالب'))).toBe(true);
    expect(orchestration.summary.blockedByAuditCount).toBeGreaterThanOrEqual(1);
  });
});
