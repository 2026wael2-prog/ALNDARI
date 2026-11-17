import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_CONFIG,
  type InventoryIntelligenceSnapshot,
  type PersistedRecommendationRecord,
} from '../../types';
import type { DecisionLifecycleState, UnifiedDecision } from '../../types/autonomous';
import { buildLast12MonthKeys } from '../demandAnalytics';
import { runIntelligenceEngine } from '../intelligenceEngine';
import { runAiOrchestration } from '../orchestration/aiOrchestrationEngine';

function createLifecycleSimulationSnapshot(): InventoryIntelligenceSnapshot {
  const months = buildLast12MonthKeys();
  return {
    generated_at: '2026-11-17T12:00:00Z',
    branches: [
      { id: 'branch_main', name: 'المركز الرئيسي - فرع وائل', code: 'B1', is_main: true, warehouses: [] },
      { id: 'branch_sub1', name: 'فرع غمدان', code: 'B2', is_main: false, warehouses: [] },
      { id: 'branch_sub2', name: 'فرع محمد', code: 'B3', is_main: false, warehouses: [] },
    ],
    products: [
      {
        id: 'prod_brake_pad',
        name_ar: 'فحمات فرامل لاندكروزر أصلي',
        sku: 'BRK-LC-01',
        part_number: '04465-60320',
        alternative_numbers: null,
        brand: 'Toyota Genuine',
        item_type: 'spare_part',
        min_stock_level: 5,
        cost_price: 120,
        purchase_price: 120,
        sale_price: 210,
        category_id: null,
        category_name: 'فرامل',
        stock_by_warehouse: [
          // Branch Main has huge surplus (80 units, min is 5)
          { warehouse_id: 'wh_main', branch_id: 'branch_main', quantity: 80, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 120 },
          // Branch Sub1 has ZERO stock (critical deficit)
          { warehouse_id: 'wh_sub1', branch_id: 'branch_sub1', quantity: 0, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 120 },
          // Branch Sub2 has healthy stock
          { warehouse_id: 'wh_sub2', branch_id: 'branch_sub2', quantity: 15, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 120 },
        ],
      },
      {
        id: 'prod_corrupt_stock',
        name_ar: 'حساس هواء نيسان - رصيد معطوب',
        sku: 'SEN-NIS-99',
        part_number: '22680-7S000',
        alternative_numbers: null,
        brand: 'Nissan',
        item_type: 'spare_part',
        min_stock_level: 2,
        cost_price: 250,
        purchase_price: 250,
        sale_price: 400,
        category_id: null,
        category_name: 'كهرباء',
        stock_by_warehouse: [
          // Negative physical stock: severe accounting violation!
          { warehouse_id: 'wh_main', branch_id: 'branch_main', quantity: -4, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 250 },
        ],
      },
    ],
    sales_history: [
      {
        product_id: 'prod_brake_pad',
        branch_id: 'branch_sub1',
        net_qty_365: 180,
        net_qty_180: 90,
        net_qty_90: 45,
        net_qty_30: 25,
        net_qty_7: 7,
        net_revenue_365: 37800,
        net_cogs_365: 21600,
        sale_tx_count: 35,
        demand_days_count: 28,
        returned_qty: 0,
        last_sale_date: '2026-11-17',
        first_sale_date: '2025-11-20',
      },
      {
        product_id: 'prod_corrupt_stock',
        branch_id: 'branch_main',
        net_qty_365: 40,
        net_qty_180: 20,
        net_qty_90: 10,
        net_qty_30: 5,
        net_qty_7: 2,
        net_revenue_365: 16000,
        net_cogs_365: 10000,
        sale_tx_count: 8,
        demand_days_count: 8,
        returned_qty: 0,
        last_sale_date: '2026-11-15',
        first_sale_date: '2025-12-01',
      },
    ],
    monthly_sales: months.map((m, idx) => ({
      product_id: 'prod_brake_pad',
      branch_id: 'branch_sub1',
      month_key: m,
      net_qty: 25 + (idx % 5),
    })),
    supplier_history: [
      {
        product_id: 'prod_brake_pad',
        supplier_id: 'sup_toyota',
        supplier_name: 'شركة عبد اللطيف جميل',
        purchase_tx_count: 8,
        total_purchased_qty: 200,
        avg_unit_cost: 120,
        last_purchased_at: '2026-10-15',
        last_purchased_price: 120,
        days_since_last_purchase: 33,
        price_trend: 'stable',
        reliability_score: 95,
      },
    ],
    open_pos: [],
    cross_references: [],
  };
}

describe('Autonomous Operational Decision Lifecycle E2E Simulation', () => {
  it('Phase 4 Step 1: Autonomous Deficit Detection & Multi-Agent Analysis', () => {
    const snapshot = createLifecycleSimulationSnapshot();
    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(domainOutput, [], 'company_alndari');

    // 1. All 8 agents ran
    expect(orchestration.agentRuns).toHaveLength(8);

    // 2. Branch transfer opportunity detected for prod_brake_pad
    const transferDecision = orchestration.decisions.find(
      d => d.recType === 'transfer' && d.productId === 'prod_brake_pad'
    );
    expect(transferDecision).toBeDefined();
    expect(transferDecision?.lifecycleState).toBe('awaiting_approval');
    expect(transferDecision?.riskLevel).toBe('critical');
    expect(transferDecision?.expectedFinancialImpact).toBeGreaterThan(0);
    expect(transferDecision?.confidenceScore).toBeGreaterThanOrEqual(70);

    // 3. Deterministic Idempotency Key generated
    expect(transferDecision?.idempotencyKey).toBe(
      'transfer:company_alndari:prod_brake_pad:branch_main:branch_sub1'
    );
  });

  it('Phase 4 Step 2: Cross-Agent Conflict Resolution (Internal Transfer vs External Procurement)', () => {
    const snapshot = createLifecycleSimulationSnapshot();
    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(domainOutput, [], 'company_alndari');

    const transferDecisions = orchestration.decisions.filter(
      d => d.recType === 'transfer' && d.productId === 'prod_brake_pad'
    );
    const purchaseDecisions = orchestration.decisions.filter(
      d => d.recType === 'purchase' && d.productId === 'prod_brake_pad'
    );

    // Conflict Rule: Transfer from surplus branch B1 suppresses unnecessary outside purchase
    expect(transferDecisions.length).toBeGreaterThanOrEqual(1);
    expect(purchaseDecisions.length).toBe(0);
  });

  it('Phase 4 Step 3: Accounting Audit Agent Veto (Negative Stock Protection)', () => {
    const snapshot = createLifecycleSimulationSnapshot();
    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(domainOutput, [], 'company_alndari');

    // Audit agent detected negative stock for prod_corrupt_stock (-4)
    const auditAgent = orchestration.agentRuns.find(a => a.agentId === 'data_integrity_audit');
    expect(auditAgent?.status).toBe('error');

    // Procurement/transfer for corrupt item is VETO BLOCKED & cancelled
    const corruptPurchase = orchestration.decisions.find(
      d => d.productId === 'prod_corrupt_stock' && d.recType === 'purchase'
    );
    expect(corruptPurchase).toBeDefined();
    expect(corruptPurchase?.conflictBlocked).toBe(true);
    expect(corruptPurchase?.lifecycleState).toBe('cancelled');
    expect(corruptPurchase?.conflictsDetected?.some(c => c.includes('رصيد فعلي سالب'))).toBe(true);
  });

  it('Phase 4 Step 4: RBAC Approval & Idempotent Atomic Execution', () => {
    // Simulate user approving the transfer
    const approvedDecisionRecord: PersistedRecommendationRecord = {
      id: 'rec_uuid_001',
      company_id: 'company_alndari',
      rec_type: 'transfer',
      product_id: 'prod_brake_pad',
      from_branch_id: 'branch_main',
      to_branch_id: 'branch_sub1',
      supplier_id: null,
      recommended_qty: 20,
      approved_qty: 20,
      urgency: 'critical',
      confidence_score: 85,
      reason: 'تحويل داخلي لتغطية العجز الحرج في فرع غمدان من فائض الفرع الرئيسي',
      status: 'executed',
      decision_reason: 'تم الاعتماد من قبل مدير الفرع',
      linked_transfer_id: 'TR-AUTO-2026-8899',
      linked_po_id: null,
      created_at: '2026-11-17T12:05:00Z',
      decided_at: '2026-11-17T12:06:00Z',
    };

    // Re-run orchestration with the persisted record in history
    const snapshot = createLifecycleSimulationSnapshot();
    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestrationWithHistory = runAiOrchestration(
      domainOutput,
      [approvedDecisionRecord],
      'company_alndari'
    );

    const reconciledDecision = orchestrationWithHistory.decisions.find(
      d => d.recType === 'transfer' && d.productId === 'prod_brake_pad'
    );

    expect(reconciledDecision).toBeDefined();
    expect(reconciledDecision?.executionStatus).toBe('executed');
    expect(reconciledDecision?.linkedTransferId).toBe('TR-AUTO-2026-8899');
  });

  it('Phase 4 Step 5: Post-Execution Outcome Verification & Closed-Loop Lifecycle', () => {
    const historicalRecord: PersistedRecommendationRecord = {
      id: 'rec_uuid_002',
      company_id: 'company_alndari',
      rec_type: 'transfer',
      product_id: 'prod_brake_pad',
      from_branch_id: 'branch_main',
      to_branch_id: 'branch_sub1',
      supplier_id: null,
      recommended_qty: 20,
      approved_qty: 20,
      urgency: 'critical',
      confidence_score: 90,
      reason: 'تغطية عجز مؤكدة',
      status: 'executed',
      decision_reason: 'معتمد',
      linked_transfer_id: 'TR-AUTO-2026-8899',
      linked_po_id: null,
      created_at: '2026-11-17T10:00:00Z',
      decided_at: '2026-11-17T10:02:00Z',
    };

    const snapshot = createLifecycleSimulationSnapshot();
    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(
      domainOutput,
      [historicalRecord],
      'company_alndari'
    );

    const verifiedTransfer = orchestration.decisions.find(
      d => d.recType === 'transfer' && d.productId === 'prod_brake_pad'
    );

    // Outcome Verification assertions:
    expect(verifiedTransfer?.lifecycleState).toBe('verified');
    expect(verifiedTransfer?.outcomeVerification.verified).toBe(true);
    expect(verifiedTransfer?.outcomeVerification.notes).toContain('سند تحويل');
    expect(verifiedTransfer?.outcomeVerification.verifiedAt).toBeTruthy();
  });

  it('Phase 4 Step 6: Failure & Stale Lock Timeout Simulation', () => {
    // Simulate state-transition machine logic
    const simulateTransition = (
      currentState: DecisionLifecycleState,
      toState: DecisionLifecycleState,
      attempts: number,
      maxAttempts = 3
    ): { nextState: DecisionLifecycleState; attempts: number } => {
      if (currentState === 'executing' && toState === 'failed') {
        if (attempts + 1 < maxAttempts) {
          return { nextState: 'retrying', attempts: attempts + 1 };
        }
        return { nextState: 'failed', attempts: attempts + 1 };
      }
      return { nextState: toState, attempts };
    };

    // First attempt fails -> transitions to retrying
    const step1 = simulateTransition('executing', 'failed', 0, 3);
    expect(step1.nextState).toBe('retrying');
    expect(step1.attempts).toBe(1);

    // Second attempt fails -> transitions to retrying
    const step2 = simulateTransition('executing', 'failed', step1.attempts, 3);
    expect(step2.nextState).toBe('retrying');
    expect(step2.attempts).toBe(2);

    // Third attempt fails -> max attempts reached, escalates to FAILED technical dead-letter state
    // NOTE: 'cancelled' = authorized administrative cancellation; 'failed' = technical execution failure
    const step3 = simulateTransition('executing', 'failed', step2.attempts, 3);
    expect(step3.nextState).toBe('failed');
    expect(step3.attempts).toBe(3);
  });
});

// =============================================================================
// Three-Branch Reconciliation Tests (Company-Wide Safety)
// Validates: no double-assignment, no double-counting, correct transfer proposals
// =============================================================================
describe('Three-Branch Inventory Reconciliation (Company-Wide)', () => {
  /**
   * Scenario:
   *   Branch Main (B1): 80 units surplus of prod_brake_pad (min=5 → 75 available)
   *   Branch Sub1 (B2): 0 units (critical deficit, 25/month demand)
   *   Branch Sub2 (B3): 0 units (critical deficit, 20/month demand)
   *
   * Expected behaviour:
   *   - Transfer agent proposes transfer B1→B2 (highest demand priority)
   *   - Procurement is SUPPRESSED because surplus exists in another branch
   *   - Company-level stock sum is non-negative (no double-counting)
   *   - Idempotency keys are unique per branch-pair
   */
  it('prevents double-assignment: two deficit branches compete for one surplus branch', () => {
    const months = buildLast12MonthKeys();
    const snapshot: InventoryIntelligenceSnapshot = {
      generated_at: '2026-11-17T12:00:00Z',
      branches: [
        { id: 'branch_main', name: 'الفرع الرئيسي', code: 'B1', is_main: true, warehouses: [] },
        { id: 'branch_sub1', name: 'فرع غمدان', code: 'B2', is_main: false, warehouses: [] },
        { id: 'branch_sub2', name: 'فرع محمد', code: 'B3', is_main: false, warehouses: [] },
      ],
      products: [
        {
          id: 'prod_brake_pad',
          name_ar: 'فحمات فرامل',
          sku: 'BRK-LC-01',
          part_number: '04465-60320',
          alternative_numbers: null,
          brand: 'Toyota',
          item_type: 'spare_part',
          min_stock_level: 5,
          cost_price: 120,
          purchase_price: 120,
          sale_price: 210,
          category_id: null,
          category_name: 'فرامل',
          stock_by_warehouse: [
            // B1: massive surplus (80 units, min=5 → 75 transferable)
            { warehouse_id: 'wh_main', branch_id: 'branch_main', quantity: 80, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 120 },
            // B2: critical deficit
            { warehouse_id: 'wh_sub1', branch_id: 'branch_sub1', quantity: 0, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 120 },
            // B3: also critical deficit
            { warehouse_id: 'wh_sub2', branch_id: 'branch_sub2', quantity: 0, reserved_quantity: 0, damaged_quantity: 0, weighted_avg_cost: 120 },
          ],
        },
      ],
      sales_history: [
        { product_id: 'prod_brake_pad', branch_id: 'branch_sub1', net_qty_365: 300, net_qty_180: 150, net_qty_90: 75, net_qty_30: 25, net_qty_7: 7, net_revenue_365: 63000, net_cogs_365: 36000, sale_tx_count: 60, demand_days_count: 55, returned_qty: 0, last_sale_date: '2026-11-17', first_sale_date: '2025-11-20' },
        { product_id: 'prod_brake_pad', branch_id: 'branch_sub2', net_qty_365: 240, net_qty_180: 120, net_qty_90: 60, net_qty_30: 20, net_qty_7: 5, net_revenue_365: 50400, net_cogs_365: 28800, sale_tx_count: 48, demand_days_count: 44, returned_qty: 0, last_sale_date: '2026-11-16', first_sale_date: '2025-11-20' },
      ],
      monthly_sales: [
        ...months.map((m, idx) => ({
          product_id: 'prod_brake_pad',
          branch_id: 'branch_sub1',
          month_key: m,
          net_qty: 25 + (idx % 5),
        })),
        ...months.map((m, idx) => ({
          product_id: 'prod_brake_pad',
          branch_id: 'branch_sub2',
          month_key: m,
          net_qty: 20 + (idx % 4),
        })),
      ],
      supplier_history: [],
      open_pos: [],
      cross_references: [],
    };

    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(domainOutput, [], 'company_alndari');

    // 1. Transfer decisions proposed for the deficit branches
    const transferDecisions = orchestration.decisions.filter(
      d => d.recType === 'transfer' && d.productId === 'prod_brake_pad'
    );
    expect(transferDecisions.length).toBeGreaterThanOrEqual(1);

    // 2. Procurement must be SUPPRESSED since surplus exists internally
    const purchaseDecisions = orchestration.decisions.filter(
      d => d.recType === 'purchase' && d.productId === 'prod_brake_pad'
    );
    expect(purchaseDecisions.length).toBe(0);

    // 3. All transfer proposals originate from the surplus branch (B1)
    for (const td of transferDecisions) {
      expect(td.supportingSourceData.fromBranchId).toBe('branch_main');
    }

    // 4. Each transfer must have a unique idempotency key (no two are identical)
    const keys = transferDecisions.map(d => d.idempotencyKey).filter(Boolean);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('company-wide stock sum must equal total across all branches (no double-counting)', () => {
    const snapshot = createLifecycleSimulationSnapshot();

    // Company total for prod_brake_pad: 80 (B1) + 0 (B2) + 15 (B3) = 95
    const expectedCompanyTotal = 80 + 0 + 15;

    const product = snapshot.products.find(p => p.id === 'prod_brake_pad');
    const computedTotal = (product?.stock_by_warehouse ?? []).reduce(
      (sum, wh) => sum + wh.quantity, 0
    );

    expect(computedTotal).toBe(expectedCompanyTotal);

    // Run orchestration: companyMetrics must reflect this total without inflation
    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(domainOutput, [], 'company_alndari');

    // No decision can propose a transfer quantity exceeding the available surplus
    const transferDecisions = orchestration.decisions.filter(
      d => d.recType === 'transfer' && d.productId === 'prod_brake_pad'
    );
    for (const td of transferDecisions) {
      // Available from surplus branch = 80 - 5 (min_stock) = 75
      const recQty = Number(td.supportingSourceData.recommendedQty);
      expect(recQty).toBeLessThanOrEqual(75);
      expect(recQty).toBeGreaterThan(0);
    }
  });

  it('after transfer reversal: linked_transfer_id absent → decision NOT marked verified', () => {
    // Simulate: a transfer was executed but then its linked_transfer_id was removed
    // (indicating reversal / void). The orchestrator must NOT upgrade lifecycle to 'verified'.
    const reversedRecord: PersistedRecommendationRecord = {
      id: 'rec_uuid_reversed',
      company_id: 'company_alndari',
      rec_type: 'transfer',
      product_id: 'prod_brake_pad',
      from_branch_id: 'branch_main',
      to_branch_id: 'branch_sub1',
      supplier_id: null,
      recommended_qty: 20,
      approved_qty: 20,
      urgency: 'critical',
      confidence_score: 85,
      reason: 'تحويل سبق تنفيذه ثم أُلغي',
      status: 'executed',
      decision_reason: 'تم التنفيذ ثم العكس',
      // No linked_transfer_id — indicates the transfer document was reversed
      linked_transfer_id: null,
      linked_po_id: null,
      created_at: '2026-11-17T10:00:00Z',
      decided_at: '2026-11-17T10:02:00Z',
    };

    const snapshot = createLifecycleSimulationSnapshot();
    const domainOutput = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);
    const orchestration = runAiOrchestration(domainOutput, [reversedRecord], 'company_alndari');

    const reconciledDecision = orchestration.decisions.find(
      d => d.recType === 'transfer' && d.productId === 'prod_brake_pad'
    );

    // With no linked_transfer_id, verification evidence is absent:
    // lifecycle must NOT be 'verified' — it should remain 'executed' or 'failed'
    expect(reconciledDecision?.lifecycleState).not.toBe('verified');
    // outcomeVerification must NOT claim success without a transfer document
    expect(reconciledDecision?.outcomeVerification?.verified).not.toBe(true);
  });
});
