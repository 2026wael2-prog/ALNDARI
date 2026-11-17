import type { IntelligenceEngineOutput, UnifiedDecision } from '../../types';
import type { AgentRunResult } from '../../types/autonomous';

/**
 * Agent F: Dead Stock Recovery Agent
 * Identifies frozen capital in dead/excess stock and prioritizes internal redistribution over liquidation.
 */
export function runDeadStockRecoveryAgent(
  output: IntelligenceEngineOutput,
  companyId: string
): { decisions: UnifiedDecision[]; run: AgentRunResult } {
  const start = performance.now();
  const decisions: UnifiedDecision[] = [];

  for (const d of output.deadExcessRecommendations.slice(0, 150)) {
    if (d.stockValue <= 0 && d.currentStock <= 0) continue;

    decisions.push({
      decisionId: d.id,
      idempotencyKey: `excess_review:${companyId}:${d.productId}`,
      agentId: 'dead_stock_recovery',
      recType: 'excess_review',
      companyScope: companyId,
      branchScope: 'all_branches',
      productId: d.productId,
      productName: d.productName,
      supplierId: null,
      supplierName: null,
      supportingSourceData: {
        classification: d.classification,
        currentStock: d.currentStock,
        stockValue: d.stockValue,
        daysSinceLastSale: d.daysSinceLastSale,
        stockAgeDays: d.stockAgeDays,
        branchTransferCandidate: d.branchTransferCandidate,
      },
      calculationMethodology: 'تحليل عمر المخزون من آخر استلام ومبيعات 365 يوم واستثناء الأصناف الواردة حديثاً',
      expectedFinancialImpact: d.stockValue,
      confidenceScore: d.stockAgeEstimated ? 72 : 92,
      dataQualityFlags: {
        availabilityDataLimited: false,
        stockAgeEstimated: Boolean(d.stockAgeEstimated),
        reliabilityDataLimited: false,
        historicalStockoutLimited: false,
      },
      riskLevel: d.classification === 'dead_stock' && d.stockValue >= 1000 ? 'high' : 'medium',
      recommendedAction: d.recommendedAction,
      approvalRequired: true,
      lifecycleState: 'recommended',
      executionStatus: d.status,
      outcomeVerification: {
        verified: false,
        verifiedAt: null,
        notes: 'بانتظار مراجعة التصفية أو التحويل',
      },
    });
  }

  return {
    decisions,
    run: {
      agentId: 'dead_stock_recovery',
      agentNameAr: 'وكيل استرداد المخزون الراكد',
      status: 'healthy',
      itemsScanned: output.deadExcessRecommendations.length,
      decisionsGenerated: decisions.length,
      durationMs: Math.round(performance.now() - start),
      summary: `رأس مال مجمد مرصود: ${output.overviewKpis.totalExcessInventoryValue.toFixed(0)} عبر ${output.deadExcessRecommendations.length} صنف`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
