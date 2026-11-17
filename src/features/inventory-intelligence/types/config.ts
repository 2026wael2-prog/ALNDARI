import type {
  BranchInfo,
  ForecastModelName,
  RawCrossRefRow,
  RecommendationStatus,
  UrgencyLevel,
} from './rawSnapshot';
import type {
  BrandAnalyticsRow,
  ModelEvaluationAggregate,
  ProductIntelligenceSummary,
} from './analytics';
import type {
  DeadExcessRecommendation,
  PurchaseRecommendation,
  TransferRecommendation,
} from './recommendations';

export interface BranchStrategyConfig {
  safetyMultiplier?: number;
  priority?: number;
  allowOutTransfer?: boolean;
}

export interface EngineConfig {
  forecast_horizons: number[];
  default_horizon_days: number;
  default_lead_time_days: number;
  review_period_days: number;
  safety_stock_service_level: number;
  target_coverage_days: number;
  dead_stock_days_threshold: number;
  slow_moving_days_threshold: number;
  growth_rate_threshold: number;
  spike_zscore_threshold: number;
  min_order_qty_default: number;
  preferred_model: ForecastModelName | 'auto';
  analysis_schedule: 'hourly' | 'daily' | 'weekly' | 'manual';
  branch_strategies?: Record<string, BranchStrategyConfig>;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  forecast_horizons: [7, 14, 30, 60, 90],
  default_horizon_days: 30,
  default_lead_time_days: 14,
  review_period_days: 14,
  safety_stock_service_level: 0.95,
  target_coverage_days: 45,
  dead_stock_days_threshold: 120,
  slow_moving_days_threshold: 60,
  growth_rate_threshold: 25,
  spike_zscore_threshold: 2.5,
  min_order_qty_default: 1,
  preferred_model: 'auto',
  analysis_schedule: 'daily',
};

export interface PersistedRecommendationRecord {
  id: string;
  rec_type: 'transfer' | 'purchase' | 'excess_review';
  product_id: string;
  from_branch_id: string | null;
  to_branch_id: string | null;
  supplier_id: string | null;
  recommended_qty: number;
  approved_qty: number | null;
  urgency: UrgencyLevel;
  confidence_score: number;
  model_version: string;
  reason: string;
  status: RecommendationStatus;
  decision_reason: string | null;
  decided_at: string | null;
  linked_transfer_id?: string | null;
  linked_po_id?: string | null;
  created_at: string;
}

export interface IntelligenceRunSummary {
  id: string;
  status: 'running' | 'completed' | 'failed';
  products_analyzed: number;
  forecasts_generated: number;
  transfer_recommendations_count: number;
  purchase_recommendations_count: number;
  champion_model: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface IntelligenceEngineOutput {
  generatedAt: string;
  branches: BranchInfo[];
  products: ProductIntelligenceSummary[];
  transferRecommendations: TransferRecommendation[];
  purchaseRecommendations: PurchaseRecommendation[];
  deadExcessRecommendations: DeadExcessRecommendation[];
  modelEvaluations: ModelEvaluationAggregate[];
  championModel: ForecastModelName;
  crossReferences: RawCrossRefRow[];
  brandAnalytics: BrandAnalyticsRow[];
  overviewKpis: {
    totalAnalyzedProducts: number;
    productsRequiringPurchase: number;
    productsApproachingStockout: number;
    zeroStockAcrossAllBranches: number;
    pendingTransferCount: number;
    excessStockCount: number;
    topMovingCount: number;
    fastGrowingCount: number;
    deadStockCount: number;
    totalExcessInventoryValue: number;
    estimatedRecommendedPurchaseValue: number;
    estimatedTransferCapitalSaved: number;
  };
}
