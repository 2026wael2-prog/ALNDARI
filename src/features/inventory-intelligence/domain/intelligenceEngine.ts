import type {
  DeadExcessRecommendation,
  EngineConfig,
  ForecastModelName,
  ForecastResult,
  IntelligenceEngineOutput,
  InventoryIntelligenceSnapshot,
  ProductIntelligenceSummary,
} from '../types';
import {
  aggregateCompanyMetrics,
  buildBranchMetrics,
  buildLast12MonthKeys,
  buildMonthlyIndex,
  classifyMovement,
} from './demandAnalytics';
import {
  buildBrandAnalytics,
  buildModelEvaluations,
  buildOverviewKpis,
  type ModelEvalAccumEntry,
} from './engine/analyticsRollup';
import { buildSnapshotIndexes } from './engine/snapshotIndexers';
import { forecastForMetrics } from './forecastingEngine';
import { generatePurchaseRecommendations, rankSuppliersForProduct } from './procurementEngine';
import { buildProductIdentityProfile, getProductRelationships } from './productIntelligence';
import { generateTransferRecommendations } from './transferOptimizer';

export function runIntelligenceEngine(
  snapshot: InventoryIntelligenceSnapshot,
  config: EngineConfig
): IntelligenceEngineOutput {
  const branches = snapshot.branches ?? [];
  const mainBranch = branches.find(b => b.is_main) ?? branches[0];
  const monthKeys = buildLast12MonthKeys();
  const monthlyIndex = buildMonthlyIndex(snapshot.monthly_sales ?? []);

  const {
    salesMap,
    fitmentMap,
    pendingInMap,
    pendingOutMap,
    incomingMap,
    supplierMap,
    customerMap,
    movementMap,
    constraintMap,
  } = buildSnapshotIndexes(snapshot, mainBranch);

  const nowMs = Date.now();
  const modelEvalAccum = new Map<ForecastModelName, ModelEvalAccumEntry>();
  const modelWins = new Map<ForecastModelName, number>();

  const productSummaries: ProductIntelligenceSummary[] = [];
  const deadExcessRecommendations: DeadExcessRecommendation[] = [];

  for (const rawProd of snapshot.products ?? []) {
    const identity = buildProductIdentityProfile(rawProd, fitmentMap.get(rawProd.id) ?? []);
    const incomingQty = incomingMap.get(rawProd.id) ?? 0;

    const branchMetrics = branches.map(branch => {
      const salesRow = salesMap.get(`${rawProd.id}::${branch.id}`);
      const mMap = monthlyIndex.get(`${rawProd.id}::${branch.id}`) ?? new Map<string, number>();
      const pIn = pendingInMap.get(`${rawProd.id}::${branch.id}`) ?? 0;
      const pOut = pendingOutMap.get(`${rawProd.id}::${branch.id}`) ?? 0;
      const mvRow = movementMap.get(`${rawProd.id}::${branch.id}`);
      return buildBranchMetrics(
        rawProd,
        branch,
        salesRow,
        mMap,
        monthKeys,
        incomingQty,
        mainBranch ? branch.id === mainBranch.id : false,
        config,
        pIn,
        pOut,
        mvRow
      );
    });

    const companyMetrics = aggregateCompanyMetrics(branchMetrics, incomingQty, config);

    let daysSinceLastSale: number | null = null;
    if (companyMetrics.lastSaleDate) {
      daysSinceLastSale = Math.max(
        0,
        Math.floor((nowMs - new Date(companyMetrics.lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    const movementClass = classifyMovement(companyMetrics, daysSinceLastSale, config);
    const isFastGrowing =
      companyMetrics.growthRatePct >= config.growth_rate_threshold &&
      companyMetrics.qty30d >= 2 &&
      !companyMetrics.spikeDetected;
    const isDeadStock = movementClass === 'dead_stock';
    const isExcessStock = movementClass === 'excess_stock';
    const isNewlyStocked = movementClass === 'newly_stocked';

    const forecastsByHorizon: Record<number, ForecastResult> = {};
    for (const h of config.forecast_horizons) {
      forecastsByHorizon[h] = forecastForMetrics(rawProd.id, companyMetrics, h, config);
    }
    const forecast30d =
      forecastsByHorizon[30] ?? forecastForMetrics(rawProd.id, companyMetrics, 30, config);

    const branchForecasts: Record<string, ForecastResult> = {};
    for (const bm of branchMetrics) {
      branchForecasts[bm.branchId] = forecastForMetrics(
        rawProd.id,
        bm,
        config.default_horizon_days,
        config
      );
    }

    for (const ev of forecast30d.allModelEvaluations) {
      if (ev.sampleCount <= 0) continue;
      const cur = modelEvalAccum.get(ev.model) ?? {
        maeSum: 0,
        wapeSum: 0,
        biasSum: 0,
        count: 0,
        samples: 0,
      };
      cur.maeSum += ev.mae;
      cur.wapeSum += ev.wape;
      cur.biasSum += ev.bias;
      cur.count += 1;
      cur.samples += ev.sampleCount;
      modelEvalAccum.set(ev.model, cur);
    }
    modelWins.set(forecast30d.selectedModel, (modelWins.get(forecast30d.selectedModel) ?? 0) + 1);

    const { verifiedAlternatives, pendingSuggestions } = getProductRelationships(
      rawProd.id,
      snapshot.cross_references ?? []
    );

    const rawSuppliers = supplierMap.get(rawProd.id) ?? [];
    const suppliers = rankSuppliersForProduct(
      rawSuppliers,
      config.default_lead_time_days,
      constraintMap.get(rawProd.id) ?? []
    );
    const latestSupplierRow = [...rawSuppliers].sort((a, b) =>
      (b.last_purchase_date ?? '').localeCompare(a.last_purchase_date ?? '')
    )[0];
    const lastSupplier = latestSupplierRow
      ? {
          supplierId: latestSupplierRow.supplier_id,
          supplierName: latestSupplierRow.supplier_name,
          lastUnitPrice: Number(latestSupplierRow.last_unit_price) || 0,
          lastPurchaseDate: latestSupplierRow.last_purchase_date,
        }
      : null;

    const topCustomers = [...(customerMap.get(rawProd.id) ?? [])]
      .sort((a, b) => (Number(b.qty_365d) || 0) - (Number(a.qty_365d) || 0))
      .slice(0, 5)
      .map(c => ({
        customerId: c.customer_id,
        customerName: c.customer_name,
        branchId: c.branch_id ?? null,
        qty365d: Number(c.qty_365d) || 0,
        revenue365d: Number(c.revenue_365d) || 0,
        txCount: Number(c.tx_count) || 1,
        lastOrderDate: c.last_order_date,
      }));

    productSummaries.push({
      identity,
      companyMetrics,
      branchMetrics,
      movementClass,
      isFastGrowing,
      isDeadStock,
      isExcessStock,
      isNewlyStocked,
      daysSinceLastSale,
      forecast30d,
      forecastsByHorizon,
      branchForecasts,
      verifiedAlternativesCount: verifiedAlternatives.length,
      pendingAlternativesCount: pendingSuggestions.length,
      suppliers,
      topCustomers,
      lastSupplier,
    });

    if (isDeadStock || isExcessStock || movementClass === 'slow_moving') {
      const hasOtherBranchDemand = branchMetrics.some(
        b => b.adjustedDailyDemand > 0 && b.availableStock <= identity.minStockLevel
      );
      deadExcessRecommendations.push({
        id: `de_${rawProd.id}`,
        productId: rawProd.id,
        productName: identity.name,
        sku: identity.sku,
        partNumber: identity.partNumber,
        brand: identity.brand,
        classification: isDeadStock
          ? 'dead_stock'
          : isExcessStock
            ? 'excess_stock'
            : 'slow_moving',
        currentStock: companyMetrics.availableStock,
        stockValue: Number(companyMetrics.stockValue.toFixed(2)),
        daysSinceLastSale,
        stockAgeDays: companyMetrics.stockAgeDays,
        stockAgeEstimated: companyMetrics.stockAgeEstimated,
        sold365d: companyMetrics.qty365d,
        forecast30d: forecast30d.predictedQty,
        recommendedAction: hasOtherBranchDemand
          ? 'تحويل الفائض إلى فرع آخر لديه طلب فعلي'
          : isDeadStock
            ? 'إيقاف الشراء المؤقت ومراجعة تصفية أو تخفيض السعر'
            : 'تخفيض كميات إعادة الطلب وتقليص المخزون المستهدف',
        branchTransferCandidate: hasOtherBranchDemand,
        status: 'pending',
      });
    }
  }

  const transferRecommendations = generateTransferRecommendations(productSummaries, config);
  const purchaseRecommendations = generatePurchaseRecommendations(
    productSummaries,
    transferRecommendations,
    config
  );
  const { modelEvaluations, championModel } = buildModelEvaluations(modelEvalAccum, modelWins);
  const brandAnalytics = buildBrandAnalytics(productSummaries);
  const overviewKpis = buildOverviewKpis(
    productSummaries,
    purchaseRecommendations,
    transferRecommendations,
    deadExcessRecommendations
  );

  return {
    generatedAt: snapshot.generated_at,
    branches,
    products: productSummaries,
    transferRecommendations,
    purchaseRecommendations,
    deadExcessRecommendations: deadExcessRecommendations.sort((a, b) => b.stockValue - a.stockValue),
    modelEvaluations,
    championModel,
    crossReferences: snapshot.cross_references ?? [],
    brandAnalytics,
    overviewKpis,
  };
}
