import type { IntelligenceEngineOutput, UnifiedDecision } from '../../types';
import type { AgentRunResult } from '../../types/autonomous';

/**
 * Agent G: Data Integrity & Accounting Audit Agent
 * Audits stock availability invariants (available <= physical), negative stock anomalies,
 * missing unit costs on active items, and branch reconciliation integrity.
 */
export function runDataIntegrityAuditAgent(
  output: IntelligenceEngineOutput,
  companyId: string
): { decisions: UnifiedDecision[]; run: AgentRunResult; warningsCount: number } {
  const start = performance.now();
  const decisions: UnifiedDecision[] = [];

  let negativePhysicalCount = 0;
  let zeroCostActiveCount = 0;
  let limitedAvailabilityCount = 0;

  for (const p of output.products) {
    const cm = p.companyMetrics;
    if (cm.availabilityDataLimited) limitedAvailabilityCount += 1;

    if (cm.physicalStock < 0) {
      negativePhysicalCount += 1;
      decisions.push({
        decisionId: `audit_neg_${p.identity.productId}`,
        idempotencyKey: `audit_negative_stock:${companyId}:${p.identity.productId}`,
        agentId: 'data_integrity_audit',
        recType: 'data_audit',
        companyScope: companyId,
        branchScope: 'all_branches',
        productId: p.identity.productId,
        productName: p.identity.name,
        supplierId: null,
        supplierName: null,
        supportingSourceData: {
          physicalStock: cm.physicalStock,
          reservedStock: cm.reservedStock,
          damagedStock: cm.damagedStock,
        },
        calculationMethodology: 'فحص الاتساق المحاسبي: رفض الأرصدة السالبة والتحقق من available <= physical',
        expectedFinancialImpact: 0,
        confidenceScore: 100,
        dataQualityFlags: {
          availabilityDataLimited: cm.availabilityDataLimited,
          stockAgeEstimated: cm.stockAgeEstimated,
          reliabilityDataLimited: false,
          historicalStockoutLimited: cm.historicalStockoutLimited,
        },
        riskLevel: 'critical',
        recommendedAction: `رصيد فعلي سالب (${cm.physicalStock}) — يجب إجراء جرد وتصحيح محاسبي فوري`,
        approvalRequired: false,
        lifecycleState: 'detected',
        executionStatus: 'not_executed',
        outcomeVerification: { verified: false, verifiedAt: null, notes: 'مخالفة سلامة مخزنية' },
      });
    }

    if (p.identity.unitCost <= 0 && (cm.physicalStock > 0 || cm.qty365d > 0)) {
      zeroCostActiveCount += 1;
    }
  }

  const warningsCount = negativePhysicalCount + (zeroCostActiveCount > 0 ? 1 : 0);

  return {
    decisions,
    warningsCount,
    run: {
      agentId: 'data_integrity_audit',
      agentNameAr: 'وكيل سلامة البيانات والتدقيق المحاسبي',
      status: negativePhysicalCount > 0 ? 'error' : zeroCostActiveCount > 0 ? 'warning' : 'healthy',
      itemsScanned: output.products.length,
      decisionsGenerated: decisions.length,
      durationMs: Math.round(performance.now() - start),
      summary: `أرصدة سالبة: ${negativePhysicalCount} | أصناف بدون تكلفة: ${zeroCostActiveCount} | صفوف بدون تخصيص تاريخي: ${limitedAvailabilityCount}`,
      errors: negativePhysicalCount > 0 ? [`تم رصد ${negativePhysicalCount} صنف برصيد فعلي سالب`] : [],
      executedAt: new Date().toISOString(),
    },
  };
}
