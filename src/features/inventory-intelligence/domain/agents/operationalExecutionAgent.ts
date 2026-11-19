import type { PersistedRecommendationRecord, UnifiedDecision } from '../../types';
import type { AgentRunResult, DecisionLifecycleState } from '../../types/autonomous';

function mapRecordStatusToLifecycle(rec: PersistedRecommendationRecord): DecisionLifecycleState {
  switch (rec.status) {
    case 'approved':
    case 'modified':
      return 'approved';
    case 'executed':
      return rec.linked_transfer_id || rec.linked_po_id ? 'verified' : 'executed';
    case 'rejected':
      return 'rejected';
    case 'postponed':
      return 'postponed';
    default:
      return 'awaiting_approval';
  }
}

/**
 * Agent H: Operational Decision Execution & Verification Agent
 * Reconciles generated decisions against persisted decision history,
 * tracks execution outcomes (linked transfer / PO draft), and verifies closed-loop state.
 */
export function runOperationalExecutionAgent(
  decisions: UnifiedDecision[],
  history: PersistedRecommendationRecord[]
): { reconciled: UnifiedDecision[]; run: AgentRunResult } {
  const start = performance.now();
  const latestByProductType = new Map<string, PersistedRecommendationRecord>();
  for (const h of history) {
    const key =
      h.rec_type === 'transfer' && h.from_branch_id && h.to_branch_id
        ? `${h.rec_type}::${h.product_id}::${h.from_branch_id}::${h.to_branch_id}`
        : `${h.rec_type}::${h.product_id}`;
    if (!latestByProductType.has(key)) {
      latestByProductType.set(key, h);
    }
  }

  let executedCount = 0;
  let verifiedCount = 0;

  const reconciled = decisions.map(d => {
    if (d.recType !== 'transfer' && d.recType !== 'purchase' && d.recType !== 'excess_review') {
      return d;
    }
    if (!d.productId) return d;

    const fromBranchId = String(d.supportingSourceData?.fromBranchId ?? '');
    const toBranchId = String(d.supportingSourceData?.toBranchId ?? '');
    const routeKey =
      d.recType === 'transfer' && fromBranchId && toBranchId
        ? `${d.recType}::${d.productId}::${fromBranchId}::${toBranchId}`
        : `${d.recType}::${d.productId}`;
    const match = latestByProductType.get(routeKey);
    if (!match) return d;

    const lifecycleState = mapRecordStatusToLifecycle(match);
    const hasLink = Boolean(match.linked_transfer_id || match.linked_po_id);
    if (match.status === 'executed') executedCount += 1;
    if (lifecycleState === 'verified') verifiedCount += 1;

    return {
      ...d,
      lifecycleState,
      executionStatus: match.status,
      linkedTransferId: match.linked_transfer_id ?? null,
      linkedPoId: match.linked_po_id ?? null,
      outcomeVerification: {
        verified: lifecycleState === 'verified',
        verifiedAt: lifecycleState === 'verified' ? match.decided_at ?? match.created_at : null,
        notes: hasLink
          ? `تم التحقق من الربط التنفيذي (${match.linked_transfer_id ? 'سند تحويل' : 'مسودة أمر شراء'})`
          : `الحالة الحالية: ${match.status}`,
      },
    };
  });

  return {
    reconciled,
    run: {
      agentId: 'operational_execution',
      agentNameAr: 'وكيل التنفيذ والتحقق التشغيلي',
      status: 'healthy',
      itemsScanned: decisions.length,
      decisionsGenerated: executedCount,
      durationMs: Math.round(performance.now() - start),
      summary: `تتبع دورة حياة ${decisions.length} قرار | منفذ: ${executedCount} | متحقق منه: ${verifiedCount}`,
      errors: [],
      executedAt: new Date().toISOString(),
    },
  };
}
