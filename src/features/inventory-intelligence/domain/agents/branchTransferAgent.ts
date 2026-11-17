import type { IntelligenceEngineOutput, UnifiedDecision } from '../../types';
import type { AgentRunResult } from '../../types/autonomous';

/**
 * Agent D: Branch Transfer Agent
 * Prioritizes internal surplus-to-shortage transfers before external procurement.
 */
export function runBranchTransferAgent(
  output: IntelligenceEngineOutput,
  companyId: string
): { decisions: UnifiedDecision[]; run: AgentRunResult } {
  const start = performance.now();
  const productMap = new Map(output.products.map(p => [p.identity.productId, p]));
  const decisions: UnifiedDecision[] = [];

  for (const tr of output.transferRecommendations) {
    const prod = productMap.get(tr.productId);
    const cm = prod?.companyMetrics;

    decisions.push({
      decisionId: tr.id,
      idempotencyKey: `transfer:${companyId}:${tr.productId}:${tr.fromBranchId}:${tr.toBranchId}`,
      agentId: 'branch_transfer',
      recType: 'transfer',
      companyScope: companyId,
      branchScope: `${tr.fromBranchName} -> ${tr.toBranchName}`,
      productId: tr.productId,
      productName: tr.productName,
      supplierId: null,
      supplierName: null,
      supportingSourceData: {
        fromBranchId: tr.fromBranchId,
        toBranchId: tr.toBranchId,
        recommendedQty: tr.recommendedQty,
        capitalSaved: tr.capitalSaved,
        reason: tr.reason,
      },
      calculationMethodology: 'تحويل الفائض فوق احتياج فرع المصدر لتغطية عجز فرع الوجهة قبل الشراء الخارجي',
      expectedFinancialImpact: tr.capitalSaved,
      confidenceScore: tr.confidenceScore,
      dataQualityFlags: {
        availabilityDataLimited: cm?.availabilityDataLimited ?? false,
        stockAgeEstimated: cm?.stockAgeEstimated ?? false,
        reliabilityDataLimited: false,
        historicalStockoutLimited: cm?.historicalStockoutLimited ?? true,
      },
      riskLevel: tr.urgency,
      recommendedAction: `تحويل ${tr.recommendedQty} وحدة من ${tr.fromBranchName} إلى ${tr.toBranchName} (وفر ${tr.capitalSaved})`,
      approvalRequired: true,
      lifecycleState: 'awaiting_approval',
      executionStatus: tr.status,
      outcomeVerification: {
        verified: false,
        verifiedAt: null,
        notes: 'بانتظار اعتماد وتنفيذ سند التحويل المخزني',
      },
    });
  }

  return {
    decisions,
    run: {
      agentId: 'branch_transfer',
      agentNameAr: 'وكيل التحويلات بين الفروع',
      status: 'healthy',
      itemsScanned: output.transferRecommendations.length,
      decisionsGenerated: decisions.length,
      durationMs: Math.round(performance.now() - start),
      summary: `رصد ${decisions.length} فرصة تحويل داخلي بوفر رأسمالي ${output.overviewKpis.estimatedTransferCapitalSaved.toFixed(0)}`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
