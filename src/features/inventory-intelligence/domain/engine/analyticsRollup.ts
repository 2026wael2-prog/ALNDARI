import type {
  BrandAnalyticsRow,
  DeadExcessRecommendation,
  ForecastModelName,
  IntelligenceEngineOutput,
  ModelEvaluationAggregate,
  ProductIntelligenceSummary,
  PurchaseRecommendation,
  TransferRecommendation,
} from '../../types';

export interface ModelEvalAccumEntry {
  maeSum: number;
  wapeSum: number;
  biasSum: number;
  count: number;
  samples: number;
}

export function buildModelEvaluations(
  modelEvalAccum: Map<ForecastModelName, ModelEvalAccumEntry>,
  modelWins: Map<ForecastModelName, number>
): { modelEvaluations: ModelEvaluationAggregate[]; championModel: ForecastModelName } {
  const modelEvaluations: ModelEvaluationAggregate[] = Array.from(modelEvalAccum.entries()).map(
    ([modelName, agg]) => ({
      modelName,
      modelVersion: 'v2.1-ensemble',
      demandPattern: 'all',
      mae: agg.count > 0 ? Number((agg.maeSum / agg.count).toFixed(3)) : 0,
      wape: agg.count > 0 ? Number((agg.wapeSum / agg.count).toFixed(2)) : 0,
      forecastBias: agg.count > 0 ? Number((agg.biasSum / agg.count).toFixed(2)) : 0,
      sampleCount: agg.samples,
      isChampion: false,
    })
  );

  modelEvaluations.sort((a, b) => a.wape - b.wape);
  let championModel: ForecastModelName = 'WMA';
  if (modelEvaluations.length > 0) {
    modelEvaluations[0].isChampion = true;
    championModel = modelEvaluations[0].modelName;
  } else if (modelWins.size > 0) {
    championModel = Array.from(modelWins.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }

  return { modelEvaluations, championModel };
}

export function buildBrandAnalytics(productSummaries: ProductIntelligenceSummary[]): BrandAnalyticsRow[] {
  const brandAggMap = new Map<string, BrandAnalyticsRow>();
  for (const p of productSummaries) {
    const key = `${p.identity.brand}::${p.identity.qualityGrade}`;
    const existing = brandAggMap.get(key) ?? {
      brand: p.identity.brand,
      qualityGrade: p.identity.qualityGrade,
      originTag: p.identity.originTag,
      productCount: 0,
      qty365d: 0,
      revenue365d: 0,
      stockValue: 0,
    };
    existing.productCount += 1;
    existing.qty365d += p.companyMetrics.qty365d;
    existing.revenue365d += p.companyMetrics.revenue365d;
    existing.stockValue += p.companyMetrics.stockValue;
    brandAggMap.set(key, existing);
  }
  return Array.from(brandAggMap.values()).sort((a, b) => b.qty365d - a.qty365d);
}

export function buildOverviewKpis(
  productSummaries: ProductIntelligenceSummary[],
  purchaseRecommendations: PurchaseRecommendation[],
  transferRecommendations: TransferRecommendation[],
  deadExcessRecommendations: DeadExcessRecommendation[]
): IntelligenceEngineOutput['overviewKpis'] {
  const totalExcessInventoryValue = deadExcessRecommendations
    .filter(d => d.classification === 'dead_stock' || d.classification === 'excess_stock')
    .reduce((s, d) => s + d.stockValue, 0);

  const estimatedRecommendedPurchaseValue = purchaseRecommendations.reduce(
    (s, p) => s + p.estimatedCost,
    0
  );

  const estimatedTransferCapitalSaved = transferRecommendations.reduce(
    (s, t) => s + t.capitalSaved,
    0
  );

  return {
    totalAnalyzedProducts: productSummaries.length,
    productsRequiringPurchase: purchaseRecommendations.length,
    productsApproachingStockout: productSummaries.filter(
      p => p.movementClass === 'stockout_risk'
    ).length,
    zeroStockAcrossAllBranches: productSummaries.filter(
      p => p.companyMetrics.availableStock <= 0 && p.companyMetrics.qty365d > 0
    ).length,
    pendingTransferCount: transferRecommendations.length,
    excessStockCount: productSummaries.filter(p => p.isExcessStock).length,
    topMovingCount: productSummaries.filter(p => p.movementClass === 'fast_moving').length,
    fastGrowingCount: productSummaries.filter(p => p.isFastGrowing).length,
    deadStockCount: productSummaries.filter(p => p.isDeadStock).length,
    totalExcessInventoryValue: Number(totalExcessInventoryValue.toFixed(2)),
    estimatedRecommendedPurchaseValue: Number(estimatedRecommendedPurchaseValue.toFixed(2)),
    estimatedTransferCapitalSaved: Number(estimatedTransferCapitalSaved.toFixed(2)),
  };
}
