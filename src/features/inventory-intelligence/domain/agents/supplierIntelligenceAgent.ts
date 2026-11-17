import type { IntelligenceEngineOutput, UnifiedDecision } from '../../types';
import type { AgentRunResult } from '../../types/autonomous';

/**
 * Agent E: Supplier Intelligence Agent
 * Flags supplier delivery delays, low fulfillment rates, return spikes, and single-supplier risk.
 */
export function runSupplierIntelligenceAgent(
  output: IntelligenceEngineOutput,
  companyId: string
): { decisions: UnifiedDecision[]; run: AgentRunResult } {
  const start = performance.now();
  const decisions: UnifiedDecision[] = [];

  for (const rec of output.purchaseRecommendations) {
    const sup = rec.recommendedSupplier;
    if (!sup) {
      decisions.push({
        decisionId: `sup_missing_${rec.productId}`,
        idempotencyKey: `supplier_missing:${companyId}:${rec.productId}`,
        agentId: 'supplier_intelligence',
        recType: 'supplier_alert',
        companyScope: companyId,
        branchScope: 'company_consolidated',
        productId: rec.productId,
        productName: rec.productName,
        supplierId: null,
        supplierName: null,
        supportingSourceData: { recommendedQty: rec.recommendedQty },
        calculationMethodology: 'فحص سجل الموردين التاريخي وقيود التوريد لكل صنف مطلوب شراؤه',
        expectedFinancialImpact: rec.estimatedCost,
        confidenceScore: 70,
        dataQualityFlags: {
          availabilityDataLimited: false,
          stockAgeEstimated: false,
          reliabilityDataLimited: true,
          historicalStockoutLimited: false,
        },
        riskLevel: 'high',
        recommendedAction: 'لا يوجد مورد مسجل للصنف — يرجى ربط مورد وطلب عروض أسعار',
        approvalRequired: false,
        lifecycleState: 'detected',
        executionStatus: 'not_executed',
        outcomeVerification: { verified: false, verifiedAt: null, notes: 'يتطلب ربط مورد' },
      });
      continue;
    }

    const lowFulfillment = sup.fulfillmentRatePct !== null && sup.fulfillmentRatePct < 80;
    const highReturns = sup.returnCount >= 2;
    const slowLead = sup.estimatedLeadTimeDays >= 21;
    if (!lowFulfillment && !highReturns && !slowLead) continue;

    decisions.push({
      decisionId: `sup_risk_${rec.productId}_${sup.supplierId}`,
      idempotencyKey: `supplier_risk:${companyId}:${rec.productId}:${sup.supplierId}`,
      agentId: 'supplier_intelligence',
      recType: 'supplier_alert',
      companyScope: companyId,
      branchScope: 'company_consolidated',
      productId: rec.productId,
      productName: rec.productName,
      supplierId: sup.supplierId,
      supplierName: sup.supplierName,
      supportingSourceData: {
        fulfillmentRatePct: sup.fulfillmentRatePct,
        returnCount: sup.returnCount,
        estimatedLeadTimeDays: sup.estimatedLeadTimeDays,
        alternativesCount: rec.alternativeSuppliers.length,
      },
      calculationMethodology: 'تقييم التزام المورد عبر استلامات GRN ومرتجعات المشتريات ومدة التوريد المقاسة',
      expectedFinancialImpact: rec.estimatedCost,
      confidenceScore: sup.reliabilityDataLimited ? 60 : 90,
      dataQualityFlags: {
        availabilityDataLimited: false,
        stockAgeEstimated: false,
        reliabilityDataLimited: sup.reliabilityDataLimited,
        historicalStockoutLimited: false,
      },
      riskLevel: lowFulfillment || highReturns ? 'high' : 'medium',
      recommendedAction:
        rec.alternativeSuppliers.length > 0
          ? `مخاطر توريد لدى ${sup.supplierName} — يُنصح بمقارنة المورد البديل (${rec.alternativeSuppliers[0].supplierName})`
          : `مخاطر توريد لدى ${sup.supplierName} — مراجعة شروط التوريد والتسليم`,
      approvalRequired: false,
      lifecycleState: 'analyzed',
      executionStatus: 'not_executed',
      outcomeVerification: { verified: false, verifiedAt: null, notes: 'تنبيه تقييم موردين' },
    });
  }

  return {
    decisions,
    run: {
      agentId: 'supplier_intelligence',
      agentNameAr: 'وكيل ذكاء الموردين',
      status: decisions.some(d => d.riskLevel === 'high') ? 'warning' : 'healthy',
      itemsScanned: output.purchaseRecommendations.length,
      decisionsGenerated: decisions.length,
      durationMs: Math.round(performance.now() - start),
      summary: `تقييم ${output.purchaseRecommendations.length} توصية شراء — رصد ${decisions.length} تنبيه مورد`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
