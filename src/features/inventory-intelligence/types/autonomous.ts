import type { RecommendationStatus } from './rawSnapshot';

export type DecisionLifecycleState =
  | 'detected'
  | 'analyzed'
  | 'recommended'
  | 'awaiting_approval'
  | 'approved'
  | 'executed'
  | 'verified'
  | 'closed'
  | 'rejected'
  | 'postponed'
  | 'cancelled'
  | 'failed'
  | 'retrying';

export type RiskClassification = 'critical' | 'high' | 'medium' | 'low';

export type AgentId =
  | 'inventory_monitoring'
  | 'demand_forecasting'
  | 'procurement_optimization'
  | 'branch_transfer'
  | 'supplier_intelligence'
  | 'dead_stock_recovery'
  | 'data_integrity_audit'
  | 'operational_execution'
  | 'decision_risk_financial_impact'
  | 'product_intelligence';

export interface AgentMetadata {
  agentId: AgentId;
  nameAr: string;
  roleAr: string;
  schedule: string;
  permissions: string[];
}

export interface DataQualityFlags {
  availabilityDataLimited: boolean;
  stockAgeEstimated: boolean;
  reliabilityDataLimited: boolean;
  historicalStockoutLimited: boolean;
}

export interface AgentOpinion {
  agentId: AgentId;
  stance: 'approve' | 'caution' | 'block';
  note: string;
}

export interface UnifiedDecision {
  decisionId: string;
  idempotencyKey: string;
  agentId: AgentId;
  recType: 'transfer' | 'purchase' | 'excess_review' | 'supplier_alert' | 'data_audit';
  companyScope: string;
  branchScope: string;
  productId: string | null;
  productName: string;
  supplierId: string | null;
  supplierName: string | null;
  supportingSourceData: Record<string, unknown>;
  calculationMethodology: string;
  expectedFinancialImpact: number;
  confidenceScore: number;
  dataQualityFlags: DataQualityFlags;
  riskLevel: RiskClassification;
  recommendedAction: string;
  approvalRequired: boolean;
  requiredRole?: 'owner_or_admin' | 'branch_manager' | 'inventory_auditor' | undefined;
  agentOpinions?: AgentOpinion[] | undefined;
  conflictsDetected?: string[] | undefined;
  conflictBlocked?: boolean | undefined;
  lifecycleState: DecisionLifecycleState;
  executionStatus: RecommendationStatus | 'not_executed' | 'failed' | 'verified';
  outcomeVerification: {
    verified: boolean;
    verifiedAt: string | null;
    notes: string;
  };
  linkedTransferId?: string | null | undefined;
  linkedPoId?: string | null | undefined;
}

export interface AgentRunResult {
  agentId: AgentId;
  agentNameAr: string;
  status: 'healthy' | 'warning' | 'error';
  itemsScanned: number;
  decisionsGenerated: number;
  durationMs: number;
  summary: string;
  errors: string[];
  executedAt: string;
}

export interface BackgroundJobRecord {
  id: string;
  company_id: string;
  job_type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled';
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface OrchestrationResult {
  orchestratedAt: string;
  companyId: string;
  decisions: UnifiedDecision[];
  agentRuns: AgentRunResult[];
  financialRiskRun?: AgentRunResult;
  summary: {
    totalDecisions: number;
    criticalRisks: number;
    awaitingApproval: number;
    executedCount: number;
    verifiedCount: number;
    failedCount: number;
    conflictsCount: number;
    blockedByAuditCount: number;
    totalExpectedFinancialImpact: number;
    dataIntegrityWarnings: number;
  };
}
