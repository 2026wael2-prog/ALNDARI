import type { IntelligenceEngineOutput, UnifiedDecision } from '../../types';
import type { AgentRunResult } from '../../types/autonomous';

/**
 * Agent B: Demand Forecasting Agent
 * Evaluates branch-level and consolidated forecast reliability, WAPE, and fast-growing spikes.
 */
export function runDemandForecastingAgent(
  output: IntelligenceEngineOutput,
  companyId: string
): { decisions: UnifiedDecision[]; run: AgentRunResult } {
  const start = performance.now();
  const decisions: UnifiedDecision[] = [];

  let totalAlerts = 0;
  for (const p of output.products) {
    if (!p.isFastGrowing && !p.companyMetrics.stockoutAdjusted) continue;
    totalAlerts += 1;
    if (decisions.length >= 100) continue;

    decisions.push({
      decisionId: `fc_${p.identity.productId}`,
      idempotencyKey: `forecast:${companyId}:${p.identity.productId}`,
      agentId: 'demand_forecasting',
      recType: 'data_audit',
      companyScope: companyId,
      branchScope: '3_branches_and_company',
      productId: p.identity.productId,
      productName: p.identity.name,
      supplierId: null,
      supplierName: null,
      supportingSourceData: {
        selectedModel: p.forecast30d.selectedModel,
        predicted30d: p.forecast30d.predictedQty,
        growthRatePct: p.companyMetrics.growthRatePct,
        stockoutAdjusted: p.companyMetrics.stockoutAdjusted,
        branchForecastCount: Object.keys(p.branchForecasts ?? {}).length,
      },
      calculationMethodology: `نموذج ${p.forecast30d.selectedModel} مع تقييم WAPE (${p.forecast30d.wape}%) وتعديل أثر النفاد`,
      expectedFinancialImpact: Number((p.forecast30d.predictedQty * p.identity.salePrice).toFixed(2)),
      confidenceScore: p.forecast30d.confidenceScore,
      dataQualityFlags: {
        availabilityDataLimited: p.companyMetrics.availabilityDataLimited,
        stockAgeEstimated: p.companyMetrics.stockAgeEstimated,
        reliabilityDataLimited: false,
        historicalStockoutLimited: p.companyMetrics.historicalStockoutLimited,
      },
      riskLevel: p.companyMetrics.growthRatePct >= 50 ? 'high' : 'medium',
      recommendedAction: p.isFastGrowing
        ? `نمو متسارع (+${p.companyMetrics.growthRatePct}%) — رفع سقف التغطية في الفروع النشطة`
        : 'تم تعويض أثر النفاد التاريخي في التنبؤ لمنع التقليل من الطلب الحقيقي',
      approvalRequired: false,
      lifecycleState: 'analyzed',
      executionStatus: 'not_executed',
      outcomeVerification: {
        verified: false,
        verifiedAt: null,
        notes: 'تنبؤ تحليلي مدمج في محرك المشتريات',
      },
    });
  }

  return {
    decisions,
    run: {
      agentId: 'demand_forecasting',
      agentNameAr: 'وكيل التنبؤ بالطلب',
      status: 'healthy',
      itemsScanned: output.products.length,
      decisionsGenerated: decisions.length,
      durationMs: Math.round(performance.now() - start),
      summary: `النموذج الفائز: ${output.championModel} | تنبيهات النمو وتعديل النفاد: ${totalAlerts}`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
