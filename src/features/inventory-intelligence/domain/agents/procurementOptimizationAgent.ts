import type { IntelligenceEngineOutput, UnifiedDecision } from '../../types';
import type { AgentRunResult } from '../../types/autonomous';

/**
 * Agent C: Procurement Optimization Agent
 * Translates net post-transfer shortages into supplier-ranked purchase order drafts
 * respecting MOQ, packaging multiples, and lead times.
 */
export function runProcurementOptimizationAgent(
  output: IntelligenceEngineOutput,
  companyId: string
): { decisions: UnifiedDecision[]; run: AgentRunResult } {
  const start = performance.now();
  const productMap = new Map(output.products.map(p => [p.identity.productId, p]));
  const decisions: UnifiedDecision[] = [];

  for (const rec of output.purchaseRecommendations.slice(0, 150)) {
    const prod = productMap.get(rec.productId);
    const cm = prod?.companyMetrics;

    decisions.push({
      decisionId: rec.id,
      idempotencyKey: `purchase:${companyId}:${rec.productId}`,
      agentId: 'procurement_optimization',
      recType: 'purchase',
      companyScope: companyId,
      branchScope: rec.targetBranchId ?? 'company_consolidated',
      productId: rec.productId,
      productName: rec.productName,
      supplierId: rec.recommendedSupplier?.supplierId ?? null,
      supplierName: rec.recommendedSupplier?.supplierName ?? null,
      supportingSourceData: {
        recommendedQty: rec.recommendedQty,
        estimatedCost: rec.estimatedCost,
        calculationBreakdown: rec.calculationBreakdown,
        alternativesCount: rec.alternativeSuppliers.length,
      },
      calculationMethodology: 'صافي الاحتياج بعد التحويلات الداخلية + مخزون الأمان + قيود MOQ ومضاعفات العبوة',
      expectedFinancialImpact: rec.estimatedCost,
      confidenceScore: rec.confidenceScore,
      dataQualityFlags: {
        availabilityDataLimited: cm?.availabilityDataLimited ?? false,
        stockAgeEstimated: cm?.stockAgeEstimated ?? false,
        reliabilityDataLimited: rec.recommendedSupplier?.reliabilityDataLimited ?? true,
        historicalStockoutLimited: cm?.historicalStockoutLimited ?? true,
      },
      riskLevel: rec.urgency,
      recommendedAction: `إصدار مسودة أمر شراء (${rec.recommendedQty} وحدة) من ${rec.recommendedSupplier?.supplierName ?? 'مورد غير محدد'}`,
      approvalRequired: true,
      lifecycleState: 'awaiting_approval',
      executionStatus: rec.status,
      outcomeVerification: {
        verified: false,
        verifiedAt: null,
        notes: 'بانتظار اعتماد المدير وتحويل المسودة إلى أمر شراء مؤكد',
      },
    });
  }

  return {
    decisions,
    run: {
      agentId: 'procurement_optimization',
      agentNameAr: 'وكيل تحسين المشتريات',
      status: 'healthy',
      itemsScanned: output.purchaseRecommendations.length,
      decisionsGenerated: decisions.length,
      durationMs: Math.round(performance.now() - start),
      summary: `تجهيز ${output.purchaseRecommendations.length} مسودة توصية شراء صافية بإجمالي ${output.overviewKpis.estimatedRecommendedPurchaseValue.toFixed(0)}`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
