import type {
  EngineConfig,
  ProductIntelligenceSummary,
  PurchaseRecommendation,
  TransferRecommendation,
  UrgencyLevel,
} from '../../types';

const SERVICE_LEVEL_Z: Record<string, number> = {
  '0.9': 1.28,
  '0.95': 1.65,
  '0.98': 2.05,
  '0.99': 2.33,
};

function getZScore(serviceLevel: number): number {
  if (serviceLevel >= 0.99) return SERVICE_LEVEL_Z['0.99'];
  if (serviceLevel >= 0.98) return SERVICE_LEVEL_Z['0.98'];
  if (serviceLevel >= 0.95) return SERVICE_LEVEL_Z['0.95'];
  return SERVICE_LEVEL_Z['0.9'];
}

/**
 * Dynamic replenishment calculation engine.
 * Accounts for forecast demand over lead-time + review period, safety stock,
 * current physical/available stock, incoming POs, and internal transfer coverage.
 * Never recommends buying stock already satisfied by incoming POs or internal transfers.
 */
export function generatePurchaseRecommendations(
  products: ProductIntelligenceSummary[],
  transfers: TransferRecommendation[],
  config: EngineConfig
): PurchaseRecommendation[] {
  const transferCoverageByProduct = new Map<string, number>();
  const inboundByBranchProduct = new Map<string, number>();
  const outboundByBranchProduct = new Map<string, number>();
  for (const tr of transfers) {
    transferCoverageByProduct.set(
      tr.productId,
      (transferCoverageByProduct.get(tr.productId) ?? 0) + tr.recommendedQty
    );
    const inKey = `${tr.productId}::${tr.toBranchId}`;
    const outKey = `${tr.productId}::${tr.fromBranchId}`;
    inboundByBranchProduct.set(inKey, (inboundByBranchProduct.get(inKey) ?? 0) + tr.recommendedQty);
    outboundByBranchProduct.set(outKey, (outboundByBranchProduct.get(outKey) ?? 0) + tr.recommendedQty);
  }

  const recommendations: PurchaseRecommendation[] = [];
  const z = getZScore(config.safety_stock_service_level);

  for (const item of products) {
    const cm = item.companyMetrics;
    const forecastDaily = Math.max(item.forecast30d.dailyRate, cm.adjustedDailyDemand);
    // Never recommend purchasing solely for low stock when there is zero historical demand
    if (forecastDaily <= 0 && cm.qty365d <= 0) continue;

    const topSupplier = item.suppliers[0] ?? null;
    const leadTimeDays = topSupplier?.estimatedLeadTimeDays ?? config.default_lead_time_days;
    const reviewPeriodDays = config.review_period_days;

    // Demand std dev estimated from monthly series
    const monthlyMean = cm.monthlySeries.reduce((a, b) => a + b, 0) / 12;
    const monthlyStd = Math.sqrt(
      cm.monthlySeries.reduce((acc, v) => acc + (v - monthlyMean) ** 2, 0) / 12
    );
    const dailyStd = monthlyStd / Math.sqrt(30);

    const safetyStock = Math.max(
      item.identity.minStockLevel,
      Math.ceil(z * dailyStd * Math.sqrt(Math.max(1, leadTimeDays)))
    );

    const leadTimeDemand = forecastDaily * leadTimeDays;
    const reviewDemand = forecastDaily * reviewPeriodDays;
    const forecastDemandLeadAndReview = Number((leadTimeDemand + reviewDemand).toFixed(2));
    const reorderPoint = Math.ceil(forecastDemandLeadAndReview + safetyStock);

    // Branch-level forecast & shortage reconciliation (prevents double-counting)
    const branchShortageBreakdown = item.branchMetrics.map(bm => {
      const bf = item.branchForecasts?.[bm.branchId];
      const bDaily = Math.max(bf?.dailyRate ?? 0, bm.adjustedDailyDemand);
      const bMult = config.branch_strategies?.[bm.branchId]?.safetyMultiplier ?? 1;
      const bMean = bm.monthlySeries.reduce((a, b) => a + b, 0) / 12;
      const bStd = Math.sqrt(bm.monthlySeries.reduce((acc, v) => acc + (v - bMean) ** 2, 0) / 12) / Math.sqrt(30);
      const bSafety = Math.ceil(Math.max(0, z * bStd * Math.sqrt(Math.max(1, leadTimeDays))) * bMult);
      const bTarget = bDaily * (leadTimeDays + reviewPeriodDays) + bSafety;
      const tIn = inboundByBranchProduct.get(`${item.identity.productId}::${bm.branchId}`) ?? 0;
      const tOut = outboundByBranchProduct.get(`${item.identity.productId}::${bm.branchId}`) ?? 0;
      const bProjected = bm.availableStock + bm.incomingStock + bm.pendingTransferIn - bm.pendingTransferOut + tIn - tOut;
      const shortage = Math.max(0, Math.ceil(bTarget - bProjected));
      return {
        branchId: bm.branchId,
        branchName: bm.branchName,
        dailyRate: Number(bDaily.toFixed(4)),
        shortage,
      };
    });
    const branchForecastUsed = Object.keys(item.branchForecasts ?? {}).length > 0;
    const sumBranchShortages = branchShortageBreakdown.reduce((s, b) => s + b.shortage, 0);

    const pendingTransferQty = transferCoverageByProduct.get(item.identity.productId) ?? 0;
    const netInventoryPosition =
      cm.availableStock + cm.incomingStock + cm.pendingTransferIn - cm.pendingTransferOut - cm.reservedStock;
    const netBranchShortageAfterIncomingPO = Math.max(0, sumBranchShortages - cm.incomingStock);

    // Only recommend purchase if net inventory position is at or below reorder point OR a branch still has net shortage after incoming POs
    if (netInventoryPosition > reorderPoint && netBranchShortageAfterIncomingPO <= 0) continue;

    const companyRawRequired = Math.max(
      0,
      forecastDemandLeadAndReview + safetyStock - netInventoryPosition - pendingTransferQty
    );
    const rawRequired = Math.max(companyRawRequired, netBranchShortageAfterIncomingPO);
    if (rawRequired < 1) continue;

    const moq = Math.max(1, config.min_order_qty_default, topSupplier?.minimumOrderQty ?? 1);
    const packMultiple = Math.max(1, topSupplier?.orderMultiple ?? 1);
    const baseQty = Math.max(moq, Math.ceil(rawRequired));
    const recommendedQty = Math.ceil(baseQty / packMultiple) * packMultiple;
    const unitPrice = topSupplier?.lastUnitPrice || item.identity.unitCost;
    const estimatedCost = Number((recommendedQty * unitPrice).toFixed(2));

    const expectedCoverageDaysAfter =
      forecastDaily > 0
        ? Number(((netInventoryPosition + recommendedQty) / forecastDaily).toFixed(1))
        : 999;

    const expectedStockoutDays =
      forecastDaily > 0
        ? Number((cm.availableStock / forecastDaily).toFixed(1))
        : null;

    const urgency: UrgencyLevel =
      cm.availableStock <= 0
        ? 'critical'
        : expectedStockoutDays !== null && expectedStockoutDays <= leadTimeDays
          ? 'high'
          : netInventoryPosition <= reorderPoint * 0.75
            ? 'medium'
            : 'low';

    const reasonParts: string[] = [];
    if (cm.availableStock <= 0) reasonParts.push('نفاد كامل للمخزون في جميع الفروع');
    else reasonParts.push(`تغطية حالية (${cm.daysOfCoverage} يوم) أقل من نقطة إعادة الطلب (${reorderPoint})`);
    if (cm.stockoutAdjusted) reasonParts.push('تم تعديل الطلب لتعويض أثر النفاد السابق');
    if (item.isFastGrowing) reasonParts.push(`طلب متنامٍ (+${cm.growthRatePct}%)`);
    if (pendingTransferQty > 0) reasonParts.push(`يُراعى وجود ${pendingTransferQty} وحدة قابلة للتحويل داخلياً`);

    recommendations.push({
      id: `po_${item.identity.productId}`,
      productId: item.identity.productId,
      productName: item.identity.name,
      sku: item.identity.sku,
      partNumber: item.identity.partNumber,
      brand: item.identity.brand,
      qualityGrade: item.identity.qualityGrade,
      targetBranchId: null,
      targetBranchName: 'الشركة (توزيع مركزي)',
      historicalSold365d: cm.qty365d,
      avgDailyDemand: cm.adjustedDailyDemand,
      forecastDemand30d: item.forecast30d.predictedQty,
      availableStock: cm.availableStock,
      incomingStock: cm.incomingStock,
      pendingTransferQty,
      safetyStock,
      reorderPoint,
      recommendedQty,
      estimatedCost,
      expectedCoverageDaysAfter,
      expectedStockoutDays,
      urgency,
      confidenceScore: item.forecast30d.confidenceScore,
      reason: reasonParts.join(' • '),
      calculationBreakdown: {
        forecastDemandLeadAndReview,
        safetyStock,
        reorderPoint,
        physicalStock: cm.physicalStock,
        reservedStock: cm.reservedStock,
        availableStock: cm.availableStock,
        incomingStock: cm.incomingStock,
        netPendingTransfers: pendingTransferQty,
        netInventoryPosition,
        rawRequiredQty: Number(rawRequired.toFixed(2)),
        moqApplied: moq,
        packageMultipleApplied: packMultiple,
        packageConstraintVerified: topSupplier?.packageConstraintVerified ?? false,
        branchForecastUsed,
        branchShortageBreakdown,
        finalRecommendedQty: recommendedQty,
        leadTimeDays,
        reviewPeriodDays,
        serviceLevel: config.safety_stock_service_level,
      },
      recommendedSupplier: topSupplier,
      alternativeSuppliers: item.suppliers.slice(1, 5),
      status: 'pending',
    });
  }

  const urgencyWeight: Record<UrgencyLevel, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return recommendations.sort((a, b) => {
    const uDiff = urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
    if (uDiff !== 0) return uDiff;
    return b.forecastDemand30d - a.forecastDemand30d;
  });
}
