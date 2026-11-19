import type {
  AgentOpinion,
  IntelligenceEngineOutput,
  OrchestrationResult,
  PersistedRecommendationRecord,
  RiskClassification,
  UnifiedDecision,
} from '../../types';
import { runBranchTransferAgent } from '../agents/branchTransferAgent';
import { runDataIntegrityAuditAgent } from '../agents/dataIntegrityAuditAgent';
import { runDeadStockRecoveryAgent } from '../agents/deadStockRecoveryAgent';
import { runDecisionRiskFinancialAgent } from '../agents/decisionRiskFinancialAgent';
import { runDemandForecastingAgent } from '../agents/demandForecastingAgent';
import { runInventoryMonitoringAgent } from '../agents/inventoryMonitoringAgent';
import { runOperationalExecutionAgent } from '../agents/operationalExecutionAgent';
import { runProcurementOptimizationAgent } from '../agents/procurementOptimizationAgent';
import { runSupplierIntelligenceAgent } from '../agents/supplierIntelligenceAgent';

const RISK_WEIGHT: Record<RiskClassification, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function resolveRequiredRole(d: UnifiedDecision): UnifiedDecision['requiredRole'] {
  if (d.recType === 'data_audit') return 'inventory_auditor';
  if (d.recType === 'purchase' && d.expectedFinancialImpact >= 5000) return 'owner_or_admin';
  return 'branch_manager';
}

/**
 * Central AI Orchestration Engine
 * Coordinates all 8 specialized intelligence agents, detects & resolves cross-agent conflicts,
 * enforces audit blocks on corrupted/negative stock, reconciles execution & verification lifecycles,
 * and produces unified, prioritized, explainable decisions.
 */
export function runAiOrchestration(
  output: IntelligenceEngineOutput,
  history: PersistedRecommendationRecord[],
  companyId: string
): OrchestrationResult {
  const monitoring = runInventoryMonitoringAgent(output, companyId);
  const forecasting = runDemandForecastingAgent(output, companyId);
  const transfers = runBranchTransferAgent(output, companyId);
  const procurement = runProcurementOptimizationAgent(output, companyId);
  const suppliers = runSupplierIntelligenceAgent(output, companyId);
  const deadStock = runDeadStockRecoveryAgent(output, companyId);
  const dataAudit = runDataIntegrityAuditAgent(output, companyId);

  // Index cross-agent signals by productId for conflict detection
  const auditBlockedProducts = new Set(
    dataAudit.decisions.map(d => d.productId).filter((id): id is string => Boolean(id))
  );
  const deadExcessByProduct = new Map<string, UnifiedDecision>();
  for (const d of deadStock.decisions) {
    if (d.productId) deadExcessByProduct.set(d.productId, d);
  }
  const supplierAlertsByProduct = new Map<string, UnifiedDecision>();
  for (const s of suppliers.decisions) {
    if (s.productId) supplierAlertsByProduct.set(s.productId, s);
  }

  // Conflict Resolution: Internal transfer takes priority over external procurement.
  // Suppress external procurement when an internal transfer already covers the product shortage.
  const transferCoveredProducts = new Set(
    transfers.decisions.map(t => t.productId).filter((id): id is string => Boolean(id))
  );
  const unsuppressedProcurement = procurement.decisions.filter(
    p => !p.productId || !transferCoveredProducts.has(p.productId)
  );

  // Deduplicate decisions by idempotencyKey
  const dedupedMap = new Map<string, UnifiedDecision>();
  const allRaw: UnifiedDecision[] = [
    ...transfers.decisions,
    ...unsuppressedProcurement,
    ...deadStock.decisions,
    ...suppliers.decisions,
    ...dataAudit.decisions,
    ...monitoring.decisions,
    ...forecasting.decisions,
  ];

  for (const d of allRaw) {
    if (!dedupedMap.has(d.idempotencyKey)) {
      dedupedMap.set(d.idempotencyKey, d);
    }
  }

  // Cross-agent conflict detection & opinion synthesis + Agent 8 (Decision Risk & Financial Impact)
  const preRiskDecisions = Array.from(dedupedMap.values());
  const financialRisk = runDecisionRiskFinancialAgent(preRiskDecisions, output);

  let conflictsCount = 0;
  let blockedByAuditCount = 0;

  const conflictResolved: UnifiedDecision[] = preRiskDecisions.map(d => {
    const opinions: AgentOpinion[] = [
      { agentId: d.agentId, stance: 'approve', note: d.recommendedAction },
    ];
    const conflicts: string[] = [];
    let conflictBlocked = false;

    if (d.productId && (d.recType === 'purchase' || d.recType === 'transfer')) {
      // Conflict 1: Negative/corrupted stock flagged by Data Integrity Audit Agent
      if (auditBlockedProducts.has(d.productId)) {
        conflictBlocked = true;
        conflicts.push('تعارض تدقيق: رصيد فعلي سالب — يُحظر الشراء أو التحويل قبل الجرد والتصحيح');
        opinions.push({
          agentId: 'data_integrity_audit',
          stance: 'block',
          note: 'حجب التنفيذ بسبب رصيد مخزني سالب يتطلب تسوية محاسبية أولاً',
        });
      }

      // Conflict 2: Procurement vs Dead/Excess Stock Recovery
      if (d.recType === 'purchase' && deadExcessByProduct.has(d.productId)) {
        const de = deadExcessByProduct.get(d.productId)!;
        conflicts.push(`تعارض استثماري: الصنف مصنف (${String(de.supportingSourceData.classification ?? 'راكد/فائض')}) — يجب استنفاد المخزون أو التحويل قبل الشراء`);
        opinions.push({
          agentId: 'dead_stock_recovery',
          stance: 'caution',
          note: de.recommendedAction,
        });
      }

      // Conflict 3: Procurement vs Supplier Risk Alert
      if (d.recType === 'purchase' && supplierAlertsByProduct.has(d.productId)) {
        const sa = supplierAlertsByProduct.get(d.productId)!;
        conflicts.push(`تعارض مورد: ${sa.recommendedAction}`);
        opinions.push({
          agentId: 'supplier_intelligence',
          stance: 'caution',
          note: sa.recommendedAction,
        });
      }
    }

    // Conflict 4: Decision Risk & Financial Impact Agent (Agent 8)
    const riskAssessment = financialRisk.assessments.get(d.decisionId);
    if (riskAssessment && riskAssessment.riskFlags.length > 0) {
      if (riskAssessment.recommendedStance === 'block') {
        conflictBlocked = true;
      }
      conflicts.push(...riskAssessment.riskFlags);
      opinions.push({
        agentId: 'decision_risk_financial_impact',
        stance: riskAssessment.recommendedStance,
        note: riskAssessment.riskFlags.join(' • '),
      });
    }

    if (conflicts.length > 0) conflictsCount += 1;
    if (conflictBlocked) blockedByAuditCount += 1;

    return {
      ...d,
      requiredRole: resolveRequiredRole(d),
      agentOpinions: opinions,
      conflictsDetected: conflicts,
      conflictBlocked,
      lifecycleState: conflictBlocked ? 'cancelled' : d.lifecycleState,
      supportingSourceData: riskAssessment
        ? { ...d.supportingSourceData, financialRiskAssessment: riskAssessment }
        : d.supportingSourceData,
    };
  });

  const execution = runOperationalExecutionAgent(conflictResolved, history);
  const prioritized = [...execution.reconciled].sort((a, b) => {
    const rDiff = RISK_WEIGHT[b.riskLevel] - RISK_WEIGHT[a.riskLevel];
    if (rDiff !== 0) return rDiff;
    return b.expectedFinancialImpact - a.expectedFinancialImpact;
  });

  const agentRuns = [
    monitoring.run,
    forecasting.run,
    procurement.run,
    transfers.run,
    suppliers.run,
    deadStock.run,
    dataAudit.run,
    execution.run,
  ];

  const awaitingApproval = prioritized.filter(d => d.lifecycleState === 'awaiting_approval').length;
  const executedCount = prioritized.filter(
    d => d.lifecycleState === 'executed' || d.lifecycleState === 'verified'
  ).length;
  const verifiedCount = prioritized.filter(d => d.lifecycleState === 'verified').length;
  const failedCount = prioritized.filter(d => d.lifecycleState === 'failed').length;
  const criticalRisks = prioritized.filter(d => d.riskLevel === 'critical').length;
  const totalExpectedFinancialImpact = Number(
    prioritized.reduce((s, d) => s + d.expectedFinancialImpact, 0).toFixed(2)
  );

  return {
    orchestratedAt: new Date().toISOString(),
    companyId,
    decisions: prioritized,
    agentRuns,
    financialRiskRun: financialRisk.run,
    summary: {
      totalDecisions: prioritized.length,
      criticalRisks,
      awaitingApproval,
      executedCount,
      verifiedCount,
      failedCount,
      conflictsCount,
      blockedByAuditCount,
      totalExpectedFinancialImpact,
      dataIntegrityWarnings: dataAudit.warningsCount,
    },
  };
}
