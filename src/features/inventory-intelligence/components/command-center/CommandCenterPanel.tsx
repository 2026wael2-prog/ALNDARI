import React, { useMemo } from 'react';
import { Activity, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type {
  IntelligenceEngineOutput,
  OrchestrationResult,
  PersistedRecommendationRecord,
} from '../../types';
import { formatCurrency } from '../../../../core/utils';
import { runAiOrchestration } from '../../domain/orchestration/aiOrchestrationEngine';
import { GRID_TABLE_CLASS } from '../shared/IntelligenceBadges';
import { ManagerCommandChat } from './ManagerCommandChat';

interface CommandCenterPanelProps {
  data: IntelligenceEngineOutput;
  history: PersistedRecommendationRecord[];
  companyId: string;
  orchestration?: OrchestrationResult | null | undefined;
  onNavigateTab: (tabId: string) => void;
}

const ROLE_LABELS = {
  owner_or_admin: 'المالك / المدير العام',
  branch_manager: 'مدير الفرع / المشتريات',
  inventory_auditor: 'مدقق المخزون والمحاسبة',
} as const;

export const CommandCenterPanel: React.FC<CommandCenterPanelProps> = React.memo(({
  data,
  history,
  companyId,
  orchestration: externalOrchestration,
  onNavigateTab,
}) => {
  const orchestration = useMemo(
    () => externalOrchestration ?? runAiOrchestration(data, history, companyId),
    [externalOrchestration, data, history, companyId]
  );

  const s = orchestration.summary;
  const topDecisions = orchestration.decisions.slice(0, 12);

  return (
    <div className="space-y-4 rounded-xl border border-blue-500/20 bg-[var(--app-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] pb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-blue-600" />
          <h3 className="text-sm font-bold text-[var(--app-text)]">
            مركز القيادة الذاتية — تنسيق الوكلاء الثمانية، كشف التعارضات ودورة حياة القرارات
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-rose-600">
            مخاطر حرجة: {s.criticalRisks}
          </span>
          <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-amber-600">
            تعارضات / محجوب تدقيقياً: {s.conflictsCount} / {s.blockedByAuditCount}
          </span>
          <span className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-indigo-600">
            بانتظار الاعتماد: {s.awaitingApproval}
          </span>
          <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-emerald-600">
            منفذ / متحقق: {s.executedCount} / {s.verifiedCount}
          </span>
          <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-blue-600">
            الأثر المالي: {formatCurrency(s.totalExpectedFinancialImpact)}
          </span>
        </div>
      </div>

      {/* 8-Agent Health Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {orchestration.agentRuns.map(agent => (
          <div
            key={agent.agentId}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-2.5 text-xs"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold text-[var(--app-text)]">{agent.agentNameAr}</span>
              {agent.status === 'healthy' ? (
                <CheckCircle2 size={14} className="text-emerald-600" />
              ) : agent.status === 'warning' ? (
                <ShieldAlert size={14} className="text-amber-600" />
              ) : (
                <ShieldCheck size={14} className="text-rose-600" />
              )}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--app-text-secondary)]">
              {agent.summary}
            </p>
          </div>
        ))}
      </div>

      {/* Unified Decisions & Cross-Agent Conflict Ledger */}
      {topDecisions.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)]">
          <table className={GRID_TABLE_CLASS}>
            <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
              <tr>
                <th className="p-2">القرار الموحد</th>
                <th className="p-2">التعارضات وآراء الوكلاء</th>
                <th className="p-2 text-center">الصلاحية المطلوبة</th>
                <th className="p-2 text-end">الأثر المالي</th>
                <th className="p-2 text-center">دورة الحياة والتحقق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {topDecisions.map(dec => (
                <tr key={dec.decisionId} className="hover:bg-[var(--app-surface-hover)]">
                  <td className="p-2">
                    <div className="font-bold text-[var(--app-text)]">{dec.productName}</div>
                    <div className="text-[11px] text-[var(--app-text-secondary)]">
                      {dec.recommendedAction}
                    </div>
                  </td>
                  <td className="p-2">
                    {dec.conflictsDetected && dec.conflictsDetected.length > 0 ? (
                      <div className="space-y-1">
                        {dec.conflictsDetected.map((c, idx) => (
                          <div
                            key={idx}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              dec.conflictBlocked
                                ? 'bg-rose-500/10 text-rose-600'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {c}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-emerald-600">توافق تام بين الوكلاء ✓</span>
                    )}
                  </td>
                  <td className="p-2 text-center text-[11px] font-bold">
                    {ROLE_LABELS[dec.requiredRole ?? 'branch_manager']}
                  </td>
                  <td dir="ltr" className="p-2 text-end font-mono font-bold">
                    {formatCurrency(dec.expectedFinancialImpact)}
                  </td>
                  <td className="p-2 text-center">
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-600">
                      {dec.lifecycleState}
                    </span>
                    <div className="mt-0.5 text-[10px] text-[var(--app-text-secondary)]">
                      {dec.outcomeVerification.notes}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ManagerCommandChat
        output={data}
        orchestration={orchestration}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
});
