import type { IntelligenceEngineOutput, UnifiedDecision } from '../../types';
import type { AgentRunResult } from '../../types/autonomous';

/**
 * Agent A: Inventory Monitoring Agent
 * Continuously scans branch & company stock levels to detect critical stockouts,
 * zero-stock active items, and coverage below supplier lead time.
 */
export function runInventoryMonitoringAgent(
  output: IntelligenceEngineOutput,
  companyId: string
): { decisions: UnifiedDecision[]; run: AgentRunResult } {
  const start = performance.now();
  const decisions: UnifiedDecision[] = [];

  let totalDetected = 0;
  for (const p of output.products) {
    const cm = p.companyMetrics;
    const isZeroActive = cm.availableStock <= 0 && cm.qty365d > 0;
    const isRisk = p.movementClass === 'stockout_risk';
    if (!isZeroActive && !isRisk) continue;
    totalDetected += 1;
    if (decisions.length >= 100) continue;

    const riskLevel = isZeroActive ? 'critical' : 'high';
    const expectedImpact = Number((cm.avgMonthlyDemand * Math.max(0, p.identity.salePrice - p.identity.unitCost)).toFixed(2));

    decisions.push({
      decisionId: `mon_${p.identity.productId}`,
      idempotencyKey: `monitor:${companyId}:${p.identity.productId}`,
      agentId: 'inventory_monitoring',
      recType: 'data_audit',
      companyScope: companyId,
      branchScope: 'all_branches',
      productId: p.identity.productId,
      productName: p.identity.name,
      supplierId: p.suppliers[0]?.supplierId ?? null,
      supplierName: p.suppliers[0]?.supplierName ?? null,
      supportingSourceData: {
        availableStock: cm.availableStock,
        daysOfCoverage: cm.daysOfCoverage,
        qty365d: cm.qty365d,
        adjustedDailyDemand: cm.adjustedDailyDemand,
      },
      calculationMethodology: 'مراقبة التغطية اليومية مقابل الرصيد المتاح الفعلي (physical - reserved - damaged)',
      expectedFinancialImpact: expectedImpact,
      confidenceScore: p.forecast30d.confidenceScore,
      dataQualityFlags: {
        availabilityDataLimited: cm.availabilityDataLimited,
        stockAgeEstimated: cm.stockAgeEstimated,
        reliabilityDataLimited: p.suppliers[0]?.reliabilityDataLimited ?? true,
        historicalStockoutLimited: cm.historicalStockoutLimited,
      },
      riskLevel,
      recommendedAction: isZeroActive
        ? 'نفاد كامل للمخزون رغم وجود طلب فعلي — مراجعة التحويل أو الشراء العاجل'
        : `تغطية منخفضة (${cm.daysOfCoverage} يوم) — متابعة إعادة التزويد`,
      approvalRequired: false,
      lifecycleState: 'detected',
      executionStatus: 'not_executed',
      outcomeVerification: {
        verified: false,
        verifiedAt: null,
        notes: 'بانتظار إجراء التغطية',
      },
    });
  }

  return {
    decisions,
    run: {
      agentId: 'inventory_monitoring',
      agentNameAr: 'وكيل مراقبة المخزون',
      status: 'healthy',
      itemsScanned: output.products.length,
      decisionsGenerated: decisions.length,
      durationMs: Math.round(performance.now() - start),
      summary: `رصد ${totalDetected} حالة خطر نفاد أو انخفاض تغطية من أصل ${output.products.length} صنف`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
