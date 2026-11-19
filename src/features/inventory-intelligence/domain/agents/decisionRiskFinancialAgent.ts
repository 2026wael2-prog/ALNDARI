import type {
  AgentRunResult,
  IntelligenceEngineOutput,
  UnifiedDecision,
} from '../../types';

export interface DecisionRiskAssessment {
  decisionId: string;
  productId: string | null;
  recType: UnifiedDecision['recType'];
  estimatedFinancialImpact: number;
  unitPrice: number;
  requiresOwnerOrAdmin: boolean;
  hasMissingOrZeroPrice: boolean;
  hasUnregisteredSupplier: boolean;
  riskFlags: string[];
  recommendedStance: 'approve' | 'caution' | 'block';
}

export interface DecisionRiskAgentOutput {
  assessments: Map<string, DecisionRiskAssessment>;
  blockedCount: number;
  highValueCount: number;
  run: AgentRunResult;
}

/**
 * Agent 8: Decision Risk & Financial Impact Agent
 * Evaluates financial exposure, unit-cost validity, 5,000 SAR owner/admin threshold,
 * and supplier procurement eligibility BEFORE any decision reaches approval.
 * Outcome verification remains an independent post-execution capability.
 */
export function runDecisionRiskFinancialAgent(
  decisions: UnifiedDecision[],
  engineOutput: IntelligenceEngineOutput
): DecisionRiskAgentOutput {
  const start = Date.now();
  const assessments = new Map<string, DecisionRiskAssessment>();
  const productById = new Map(engineOutput.products.map(p => [p.identity.productId, p]));
  let blockedCount = 0;
  let highValueCount = 0;

  for (const d of decisions) {
    if (d.recType !== 'purchase' && d.recType !== 'transfer' && d.recType !== 'excess_review') {
      continue;
    }

    const riskFlags: string[] = [];
    let recommendedStance: 'approve' | 'caution' | 'block' = 'approve';
    const breakdown = (d.supportingSourceData?.calculationBreakdown ?? {}) as Record<string, unknown>;
    const unitPrice = Number(breakdown.unitPrice ?? 0) || 0;
    const prod = d.productId ? productById.get(d.productId) : undefined;
    const topSupplier = prod?.suppliers?.[0];

    const hasMissingOrZeroPrice = d.recType === 'purchase' && unitPrice <= 0;
    const hasUnregisteredSupplier =
      d.recType === 'purchase' &&
      Boolean(d.supplierId) &&
      topSupplier?.isProcurementRegistered === false;

    const requiresOwnerOrAdmin = d.recType === 'purchase' && d.expectedFinancialImpact >= 5000;

    if (hasMissingOrZeroPrice) {
      recommendedStance = 'block';
      blockedCount += 1;
      riskFlags.push('سعر الوحدة مفقود أو صفري — يُحظر إصدار أمر شراء بدون تكلفة موثوقة');
    }

    if (hasUnregisteredSupplier) {
      if (recommendedStance !== 'block') recommendedStance = 'caution';
      riskFlags.push('المورد غير مربوط بسجل المشتريات (prc_suppliers) — يتطلب استكمال بيانات المورد قبل التنفيذ');
    }

    if (requiresOwnerOrAdmin) {
      highValueCount += 1;
      if (recommendedStance === 'approve') recommendedStance = 'caution';
      riskFlags.push(`قيمة الشراء (${d.expectedFinancialImpact.toLocaleString()}) >= 5,000 — يتطلب اعتماد المالك أو المدير العام`);
    }

    assessments.set(d.decisionId, {
      decisionId: d.decisionId,
      productId: d.productId,
      recType: d.recType,
      estimatedFinancialImpact: d.expectedFinancialImpact,
      unitPrice,
      requiresOwnerOrAdmin,
      hasMissingOrZeroPrice,
      hasUnregisteredSupplier,
      riskFlags,
      recommendedStance,
    });
  }

  return {
    assessments,
    blockedCount,
    highValueCount,
    run: {
      agentId: 'decision_risk_financial_impact',
      agentNameAr: 'وكيل مخاطر القرار والأثر المالي',
      status: blockedCount > 0 ? 'warning' : 'healthy',
      itemsScanned: decisions.length,
      decisionsGenerated: assessments.size,
      durationMs: Math.max(1, Date.now() - start),
      summary: `تقييم ${assessments.size} قرار: ${highValueCount} عالي القيمة (≥5,000)، ${blockedCount} محجوب لنقص التسعير`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
