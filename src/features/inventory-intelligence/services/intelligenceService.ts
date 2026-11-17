import { intelligenceApi } from '../api/intelligenceApi';
import { runIntelligenceEngine } from '../domain/intelligenceEngine';
import type {
  EngineConfig,
  IntelligenceEngineOutput,
  IntelligenceRunSummary,
  PersistedRecommendationRecord,
  RecommendationStatus,
} from '../types';

const lastRunRecordedAt = new Map<string, number>();

export const intelligenceService = {
  loadAndRunAnalysis: async (
    companyId: string,
    configOverride?: EngineConfig
  ): Promise<IntelligenceEngineOutput> => {
    const [config, snapshot] = await Promise.all([
      configOverride ? Promise.resolve(configOverride) : intelligenceApi.getConfig(companyId),
      intelligenceApi.getSnapshot(companyId, 365),
    ]);

    const output = runIntelligenceEngine(snapshot, config);

    const now = Date.now();
    const last = lastRunRecordedAt.get(companyId) ?? 0;
    if (now - last > 5 * 60 * 1000) {
      lastRunRecordedAt.set(companyId, now);
      const forecastsCount = output.products.reduce(
        (s, p) => s + Object.keys(p.forecastsByHorizon).length,
        0
      );
      void intelligenceApi.recordRunAndEvaluations(companyId, {
        productsAnalyzed: output.overviewKpis.totalAnalyzedProducts,
        forecastsGenerated: forecastsCount,
        transferCount: output.transferRecommendations.length,
        purchaseCount: output.purchaseRecommendations.length,
        championModel: output.championModel,
        leaderboard: output.modelEvaluations.map(m => ({
          modelName: m.modelName,
          avgMae: m.mae,
          avgWape: m.wape,
          avgBias: m.forecastBias,
          sampleCount: m.sampleCount,
          isChampion: m.isChampion,
        })),
        forecasts: output.products
          .filter(p => p.forecast30d.predictedQty > 0)
          .slice(0, 300)
          .map(p => ({
            productId: p.identity.productId,
            horizonDays: p.forecast30d.horizonDays,
            demandPattern: p.forecast30d.demandPattern,
            selectedModel: p.forecast30d.selectedModel,
            predictedQty: p.forecast30d.predictedQty,
            dailyRate: p.forecast30d.dailyRate,
            confidenceScore: p.forecast30d.confidenceScore,
            mae: p.forecast30d.mae,
            wape: p.forecast30d.wape,
            forecastBias: p.forecast30d.forecastBias,
            stockoutAdjusted: p.forecast30d.stockoutAdjusted,
          })),
      });
    }

    return output;
  },

  getConfig: (companyId: string) => intelligenceApi.getConfig(companyId),

  saveConfig: (companyId: string, userId: string, config: EngineConfig) =>
    intelligenceApi.saveConfig(companyId, userId, config),

  getRecommendationHistory: (companyId: string): Promise<PersistedRecommendationRecord[]> =>
    intelligenceApi.getRecommendationHistory(companyId),

  getRunHistory: (companyId: string): Promise<IntelligenceRunSummary[]> =>
    intelligenceApi.getRunHistory(companyId),

  decideRecommendation: async (params: {
    companyId: string;
    userId: string;
    recType: 'transfer' | 'purchase' | 'excess_review';
    productId: string;
    productName?: string;
    fromBranchId?: string | null;
    toBranchId?: string | null;
    supplierId?: string | null;
    recommendedQty: number;
    approvedQty?: number | null;
    urgency: string;
    confidenceScore: number;
    reason: string;
    status: RecommendationStatus;
    decisionReason?: string;
    calculationBreakdown?: Record<string, unknown>;
  }) => {
    await intelligenceApi.recordRecommendationDecision(params);
  },

  reviewAlternative: (id: string, userId: string, status: 'approved' | 'rejected') =>
    intelligenceApi.reviewCrossReference(id, userId, status),
};
