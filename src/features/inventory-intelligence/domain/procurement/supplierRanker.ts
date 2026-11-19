import type {
  RankedSupplier,
  RawSupplierConstraintRow,
  RawSupplierHistoryRow,
} from '../../types';

/**
 * Ranks suppliers using real historical evidence (price competitiveness,
 * recency, purchase frequency, volume, and lead time where available).
 */
export function rankSuppliersForProduct(
  rows: RawSupplierHistoryRow[],
  defaultLeadTimeDays: number,
  constraints: RawSupplierConstraintRow[] = []
): RankedSupplier[] {
  if (!rows || rows.length === 0) return [];

  const constraintBySupplier = new Map<string, RawSupplierConstraintRow>();
  for (const c of constraints) {
    constraintBySupplier.set(c.supplier_id, c);
    if (c.party_id) {
      constraintBySupplier.set(c.party_id, c);
    }
  }
  const minPrice = Math.min(...rows.map(r => Number(r.last_unit_price) || Number(r.avg_unit_price) || Infinity));
  const maxTx = Math.max(...rows.map(r => Number(r.purchase_tx_count) || 1), 1);

  return rows
    .map((r): RankedSupplier => {
      const constraint =
        constraintBySupplier.get(r.prc_supplier_id ?? '') ??
        constraintBySupplier.get(r.supplier_id) ??
        constraintBySupplier.get(r.party_id ?? '');
      const lastPrice = Number(r.last_unit_price) || 0;
      const avgPrice = Number(r.avg_unit_price) || lastPrice;
      const txCount = Number(r.purchase_tx_count) || 0;
      const totalQty = Number(r.total_qty_supplied) || 0;
      const measuredLead = Number(r.measured_lead_days);
      const configuredLead = Number(constraint?.lead_time_days ?? r.lead_time_days);
      const hasMeasuredLead = Number.isFinite(measuredLead) && measuredLead > 0;
      const hasConfiguredLead = Number.isFinite(configuredLead) && configuredLead > 0;
      const leadTime = hasMeasuredLead
        ? Math.round(measuredLead)
        : hasConfiguredLead
          ? configuredLead
          : defaultLeadTimeDays;
      const isLeadTimeEstimated = !hasMeasuredLead && !hasConfiguredLead;

      const fulfillmentRatePct =
        r.fulfillment_rate_pct !== undefined && r.fulfillment_rate_pct !== null
          ? Number(Number(r.fulfillment_rate_pct).toFixed(1))
          : null;
      const returnCount = Number(r.return_count) || 0;
      const reliabilityDataLimited = fulfillmentRatePct === null && !hasMeasuredLead;

      const minimumOrderQty = Math.max(1, Number(constraint?.minimum_order_quantity) || 1);
      const orderMultiple = Math.max(1, Number(constraint?.order_multiple) || 1);
      const uomName = constraint?.uom_name ?? null;
      const uomConversionFactor = constraint?.conversion_factor ? Number(constraint.conversion_factor) : null;
      const packageConstraintVerified = Boolean(constraint);

      const priceScore =
        minPrice > 0 && lastPrice > 0 && Number.isFinite(minPrice)
          ? Math.min(45, (minPrice / lastPrice) * 45)
          : 20;
      const freqScore = (txCount / maxTx) * 25;

      let recencyScore = 10;
      if (r.last_purchase_date) {
        const daysAgo = Math.max(
          0,
          (Date.now() - new Date(r.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)
        );
        recencyScore = daysAgo <= 30 ? 20 : daysAgo <= 90 ? 15 : daysAgo <= 180 ? 10 : 5;
      }

      const leadScore = !isLeadTimeEstimated ? Math.max(0, 10 - leadTime * 0.25) : 5;
      const returnPenalty = Math.min(10, returnCount * 2.5);
      const compositeScore = Number(Math.max(0, priceScore + freqScore + recencyScore + leadScore - returnPenalty).toFixed(1));

      const reasons: string[] = [];
      if (lastPrice > 0 && lastPrice <= minPrice * 1.03) reasons.push('أفضل سعر شراء حديث');
      if (txCount >= 3) reasons.push(`مورد متكرر (${txCount} فواتير)`);
      if (recencyScore >= 15) reasons.push('توريد حديث');
      if (hasMeasuredLead) reasons.push(`توريد مقاس (${leadTime}ي)`);
      if (reasons.length === 0) reasons.push('مورد تاريخي مسجل للصنف');

      const resolvedSupplierId = r.prc_supplier_id ?? constraint?.supplier_id ?? r.supplier_id;
      const isProcurementRegistered =
        r.is_procurement_registered ?? Boolean(r.prc_supplier_id || constraint?.supplier_id);

      return {
        supplierId: resolvedSupplierId,
        prcSupplierId: r.prc_supplier_id ?? constraint?.supplier_id ?? null,
        partyId: r.party_id ?? constraint?.party_id ?? null,
        isProcurementRegistered,
        currency: r.currency ?? constraint?.default_currency ?? 'SAR',
        supplierName: r.supplier_name,
        lastPurchaseDate: r.last_purchase_date,
        lastUnitPrice: Number(lastPrice.toFixed(2)),
        avgUnitPrice: Number(avgPrice.toFixed(2)),
        lastQty: Number(r.last_qty) || 0,
        purchaseTxCount: txCount,
        totalQtySupplied: totalQty,
        estimatedLeadTimeDays: leadTime,
        isLeadTimeEstimated,
        fulfillmentRatePct,
        returnCount,
        reliabilityDataLimited,
        minimumOrderQty,
        orderMultiple,
        uomName,
        uomConversionFactor,
        packageConstraintVerified,
        compositeScore,
        rankingReasons: reasons,
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);
}
