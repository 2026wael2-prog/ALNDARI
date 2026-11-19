import type {
  EngineConfig,
  ProductIntelligenceSummary,
  TransferRecommendation,
  UrgencyLevel,
} from '../types';

/**
 * Optimizes stock distribution across all 3 branches BEFORE recommending purchases.
 * Never equalizes blindly: protects sending branch safety stock + lead-time buffer,
 * and transfers only genuine surplus to branches with real forecast demand.
 */
export function generateTransferRecommendations(
  products: ProductIntelligenceSummary[],
  config: EngineConfig
): TransferRecommendation[] {
  const recommendations: TransferRecommendation[] = [];

  for (const item of products) {
    if (item.branchMetrics.length < 2) continue;

    // Identify branches with genuine transferable surplus
    const senders = item.branchMetrics
      .map(bm => {
        const strategy = config.branch_strategies?.[bm.branchId];
        if (strategy?.allowOutTransfer === false) {
          return { bm, forecast30: bm.adjustedDailyDemand * 30, protectedReserve: bm.availableStock, surplus: 0 };
        }
        const mult = strategy?.safetyMultiplier ?? 1;
        const forecast30 = bm.adjustedDailyDemand * 30;
        const protectedReserve = item.isDeadStock
          ? 0
          : Math.max(
              item.identity.minStockLevel,
              Math.ceil(bm.adjustedDailyDemand * config.target_coverage_days * mult)
            );
        const surplus = Math.floor(bm.availableStock - bm.pendingTransferOut - protectedReserve);
        return { bm, forecast30, protectedReserve, surplus };
      })
      .filter(s => s.surplus >= 1)
      .sort((a, b) => b.surplus - a.surplus);

    if (senders.length === 0) continue;

    // Identify branches with genuine demand deficit
    const receivers = item.branchMetrics
      .map(bm => {
        const forecastLeadAndReview =
          bm.adjustedDailyDemand * (config.default_lead_time_days + config.review_period_days);
        const targetNeeded = Math.max(
          item.identity.minStockLevel,
          Math.ceil(forecastLeadAndReview * 1.15)
        );
        const netAvailable = bm.availableStock + bm.incomingStock + bm.pendingTransferIn - bm.pendingTransferOut;
        const deficit = Math.ceil(targetNeeded - netAvailable);
        const hasRealDemand = bm.adjustedDailyDemand > 0 || bm.qty90d > 0;
        return { bm, deficit, hasRealDemand };
      })
      .filter(r => r.hasRealDemand && r.deficit >= 1)
      .sort((a, b) => {
        // Prioritize zero-stock high-velocity receivers first
        if (a.bm.availableStock <= 0 && b.bm.availableStock > 0) return -1;
        if (b.bm.availableStock <= 0 && a.bm.availableStock > 0) return 1;
        return b.deficit - a.deficit;
      });

    if (receivers.length === 0) continue;

    // Pair senders & receivers without double-allocating surplus
    const remainingSurplus = new Map<string, number>();
    senders.forEach(s => remainingSurplus.set(s.bm.branchId, s.surplus));

    for (const rec of receivers) {
      let stillNeeded = rec.deficit;

      for (const snd of senders) {
        if (snd.bm.branchId === rec.bm.branchId) continue;
        const availSurplus = remainingSurplus.get(snd.bm.branchId) ?? 0;
        if (availSurplus <= 0 || stillNeeded <= 0) continue;

        const transferQty = Math.min(availSurplus, stillNeeded);
        if (transferQty <= 0) continue;

        remainingSurplus.set(snd.bm.branchId, availSurplus - transferQty);
        stillNeeded -= transferQty;

        const urgency: UrgencyLevel =
          rec.bm.availableStock <= 0 && rec.bm.adjustedDailyDemand >= 0.2
            ? 'critical'
            : rec.bm.daysOfCoverage < 7
              ? 'high'
              : rec.bm.daysOfCoverage < 14
                ? 'medium'
                : 'low';

        const projectedTo = rec.bm.availableStock + transferQty;
        const coverageAfter =
          rec.bm.adjustedDailyDemand > 0
            ? Number((projectedTo / rec.bm.adjustedDailyDemand).toFixed(1))
            : 999;

        recommendations.push({
          id: `tr_${item.identity.productId}_${snd.bm.branchId}_${rec.bm.branchId}`,
          productId: item.identity.productId,
          productName: item.identity.name,
          sku: item.identity.sku,
          partNumber: item.identity.partNumber,
          brand: item.identity.brand,
          fromBranchId: snd.bm.branchId,
          fromBranchName: snd.bm.branchName,
          toBranchId: rec.bm.branchId,
          toBranchName: rec.bm.branchName,
          fromCurrentStock: snd.bm.availableStock,
          toCurrentStock: rec.bm.availableStock,
          fromMonthlyDemand: Number(snd.bm.avgMonthlyDemand.toFixed(1)),
          toMonthlyDemand: Number(rec.bm.avgMonthlyDemand.toFixed(1)),
          availableSurplus: availSurplus,
          recommendedQty: transferQty,
          projectedFromStock: snd.bm.availableStock - transferQty,
          projectedToStock: projectedTo,
          estimatedCoverageDaysAfter: coverageAfter,
          urgency,
          confidenceScore: item.forecast30d.confidenceScore,
          reason:
            rec.bm.availableStock <= 0
              ? `نفاد المخزون في ${rec.bm.branchName} مع طلب شهري (${rec.bm.avgMonthlyDemand.toFixed(1)} وحدة) وتوفر فائض آمن في ${snd.bm.branchName}`
              : `تغطية منخفضة (${rec.bm.daysOfCoverage} يوم) في ${rec.bm.branchName} مقابل فائض في ${snd.bm.branchName}`,
          capitalSaved: Number((transferQty * item.identity.unitCost).toFixed(2)),
          status: 'pending',
        });
      }
    }
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
    return b.capitalSaved - a.capitalSaved;
  });
}
