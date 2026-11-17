import type {
  BranchDemandMetrics,
  BranchInfo,
  EngineConfig,
  RawBranchSalesRow,
  RawMonthlySalesRow,
  RawProductSnapshot,
  RawStockMovementRow,
} from '../../types';
import {
  classifyDemandPattern,
  computeGrowthRatePct,
  computeStockoutAdjustedDailyDemand,
  detectDemandSpike,
} from './patternClassifier';

export function buildBranchMetrics(
  product: RawProductSnapshot,
  branch: BranchInfo,
  salesRow: RawBranchSalesRow | undefined,
  monthlyMap: Map<string, number>,
  monthKeys: string[],
  _incomingForCompany: number,
  isMainBranch: boolean,
  config: EngineConfig,
  pendingIn = 0,
  pendingOut = 0,
  movementRow?: RawStockMovementRow
): BranchDemandMetrics {
  const branchStockRows = (product.stock_by_warehouse ?? []).filter(
    s => s.branch_id === branch.id || (isMainBranch && !s.branch_id)
  );
  const physicalStock = branchStockRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const reservedStock = branchStockRows.reduce((s, r) => s + (Number(r.reserved_quantity) || 0), 0);
  const damagedStock = branchStockRows.reduce((s, r) => s + (Number(r.damaged_quantity) || 0), 0);
  const hasExplicitAllocation = branchStockRows.some(
    r => r.reserved_quantity !== undefined || r.damaged_quantity !== undefined
  );
  const availabilityDataLimited = branchStockRows.length > 0 && !hasExplicitAllocation;
  const availableStock = Math.max(0, physicalStock - reservedStock - damagedStock);
  // Keep company-wide open POs at consolidated company level so Main Branch transfer surplus is not artificially inflated
  const incomingStock = 0;
  const projectedPosition = availableStock + incomingStock + pendingIn - pendingOut;

  const nowMs = Date.now();
  let stockAgeDays: number | null = null;
  let stockAgeEstimated = false;
  if (movementRow?.last_receipt_at) {
    stockAgeDays = Math.max(0, Math.floor((nowMs - new Date(movementRow.last_receipt_at).getTime()) / 86400000));
  } else if (product.created_at) {
    stockAgeDays = Math.max(0, Math.floor((nowMs - new Date(product.created_at).getTime()) / 86400000));
    stockAgeEstimated = true;
  }
  const historicalStockoutLimited = !movementRow || movementRow.ledger_tx_count < 1;

  const avgUnitCost =
    branchStockRows.find(r => Number(r.weighted_avg_cost) > 0)?.weighted_avg_cost ??
    (Number(product.cost_price) > 0
      ? Number(product.cost_price)
      : Number(product.purchase_price) || 0);

  const stockValue = Math.max(0, physicalStock) * avgUnitCost;
  const qty7d = Math.max(0, Number(salesRow?.net_qty_7) || 0);
  const qty30d = Math.max(0, Number(salesRow?.net_qty_30) || 0);
  const qty90d = Math.max(0, Number(salesRow?.net_qty_90) || 0);
  const qty180d = Math.max(0, Number(salesRow?.net_qty_180) || 0);
  const qty365d = Math.max(0, Number(salesRow?.net_qty_365) || 0);
  const txCount = Number(salesRow?.sale_tx_count) || 0;
  const demandDaysCount = Number(salesRow?.demand_days_count) || 0;
  const returnedQty = Number(salesRow?.returned_qty) || 0;
  const revenue365d = Number(salesRow?.net_revenue_365) || 0;
  const cogs365d = Number(salesRow?.net_cogs_365) || 0;
  const grossProfit365d = revenue365d - cogs365d;
  const grossMarginPct = revenue365d > 0 ? (grossProfit365d / revenue365d) * 100 : 0;

  const monthlySeries = monthKeys.map(k => Math.max(0, monthlyMap.get(k) || 0));
  const growthRatePct = computeGrowthRatePct(qty30d, qty90d, monthlySeries);
  const spikeDetected = detectDemandSpike(monthlySeries, config.spike_zscore_threshold);

  const { avgDaily, adjustedDaily, stockoutAdjusted } = computeStockoutAdjustedDailyDemand(
    qty30d,
    qty90d,
    qty365d,
    availableStock,
    txCount,
    spikeDetected
  );

  const demandPattern = classifyDemandPattern(
    monthlySeries,
    txCount,
    demandDaysCount,
    growthRatePct,
    config.growth_rate_threshold,
    config.spike_zscore_threshold
  );

  const daysOfCoverage =
    adjustedDaily > 0 ? Number((availableStock / adjustedDaily).toFixed(1)) : availableStock > 0 ? 999 : 0;

  const turnoverRatio = stockValue > 0 ? Number((cogs365d / stockValue).toFixed(2)) : 0;

  return {
    branchId: branch.id,
    branchName: branch.name,
    physicalStock,
    reservedStock,
    damagedStock,
    availableStock,
    incomingStock,
    pendingTransferIn: pendingIn,
    pendingTransferOut: pendingOut,
    projectedPosition,
    availabilityDataLimited,
    stockAgeDays,
    stockAgeEstimated,
    historicalStockoutLimited,
    stockValue,
    qty7d,
    qty30d,
    qty90d,
    qty180d,
    qty365d,
    txCount,
    demandDaysCount,
    returnedQty,
    avgDailyDemand: avgDaily,
    avgWeeklyDemand: Number((adjustedDaily * 7).toFixed(2)),
    avgMonthlyDemand: Number((adjustedDaily * 30).toFixed(2)),
    adjustedDailyDemand: adjustedDaily,
    growthRatePct,
    spikeDetected,
    stockoutAdjusted,
    daysOfCoverage,
    lastSaleDate: salesRow?.last_sale_date ?? null,
    revenue365d,
    grossProfit365d,
    grossMarginPct: Number(grossMarginPct.toFixed(1)),
    turnoverRatio,
    monthlySeries,
    demandPattern,
  };
}

export function aggregateCompanyMetrics(
  branchMetrics: BranchDemandMetrics[],
  incomingForCompany: number,
  config: EngineConfig
): BranchDemandMetrics {
  const physicalStock = branchMetrics.reduce((s, b) => s + b.physicalStock, 0);
  const reservedStock = branchMetrics.reduce((s, b) => s + b.reservedStock, 0);
  const damagedStock = branchMetrics.reduce((s, b) => s + b.damagedStock, 0);
  const availableStock = branchMetrics.reduce((s, b) => s + b.availableStock, 0);
  const pendingTransferIn = branchMetrics.reduce((s, b) => s + b.pendingTransferIn, 0);
  const pendingTransferOut = branchMetrics.reduce((s, b) => s + b.pendingTransferOut, 0);
  const availabilityDataLimited = branchMetrics.some(b => b.availabilityDataLimited);
  const historicalStockoutLimited = branchMetrics.every(b => b.historicalStockoutLimited);
  const ages = branchMetrics.map(b => b.stockAgeDays).filter((a): a is number => a !== null);
  const stockAgeDays = ages.length > 0 ? Math.min(...ages) : null;
  const stockAgeEstimated = branchMetrics.some(b => b.stockAgeEstimated);
  const stockValue = branchMetrics.reduce((s, b) => s + b.stockValue, 0);
  const qty7d = branchMetrics.reduce((s, b) => s + b.qty7d, 0);
  const qty30d = branchMetrics.reduce((s, b) => s + b.qty30d, 0);
  const qty90d = branchMetrics.reduce((s, b) => s + b.qty90d, 0);
  const qty180d = branchMetrics.reduce((s, b) => s + b.qty180d, 0);
  const qty365d = branchMetrics.reduce((s, b) => s + b.qty365d, 0);
  const txCount = branchMetrics.reduce((s, b) => s + b.txCount, 0);
  const demandDaysCount = branchMetrics.reduce((s, b) => s + b.demandDaysCount, 0);
  const returnedQty = branchMetrics.reduce((s, b) => s + b.returnedQty, 0);
  const revenue365d = branchMetrics.reduce((s, b) => s + b.revenue365d, 0);
  const grossProfit365d = branchMetrics.reduce((s, b) => s + b.grossProfit365d, 0);
  const grossMarginPct = revenue365d > 0 ? (grossProfit365d / revenue365d) * 100 : 0;

  const monthlySeries = Array.from({ length: 12 }, (_, idx) =>
    branchMetrics.reduce((s, b) => s + (b.monthlySeries[idx] ?? 0), 0)
  );

  const growthRatePct = computeGrowthRatePct(qty30d, qty90d, monthlySeries);
  const spikeDetected = detectDemandSpike(monthlySeries, config.spike_zscore_threshold);
  const { avgDaily, adjustedDaily, stockoutAdjusted } = computeStockoutAdjustedDailyDemand(
    qty30d,
    qty90d,
    qty365d,
    availableStock,
    txCount,
    spikeDetected
  );

  const demandPattern = classifyDemandPattern(
    monthlySeries,
    txCount,
    demandDaysCount,
    growthRatePct,
    config.growth_rate_threshold,
    config.spike_zscore_threshold
  );

  const lastSaleDates = branchMetrics
    .map(b => b.lastSaleDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  const lastSaleDate = lastSaleDates.length > 0 ? lastSaleDates[lastSaleDates.length - 1] : null;

  const daysOfCoverage =
    adjustedDaily > 0 ? Number((availableStock / adjustedDaily).toFixed(1)) : availableStock > 0 ? 999 : 0;

  const cogs365d = revenue365d - grossProfit365d;
  const turnoverRatio = stockValue > 0 ? Number((cogs365d / stockValue).toFixed(2)) : 0;

  return {
    branchId: 'company',
    branchName: 'الشركة (إجمالي الفروع)',
    physicalStock,
    reservedStock,
    damagedStock,
    availableStock,
    incomingStock: incomingForCompany,
    pendingTransferIn,
    pendingTransferOut,
    projectedPosition: availableStock + incomingForCompany + pendingTransferIn - pendingTransferOut,
    availabilityDataLimited,
    stockAgeDays,
    stockAgeEstimated,
    historicalStockoutLimited,
    stockValue,
    qty7d,
    qty30d,
    qty90d,
    qty180d,
    qty365d,
    txCount,
    demandDaysCount,
    returnedQty,
    avgDailyDemand: avgDaily,
    avgWeeklyDemand: Number((adjustedDaily * 7).toFixed(2)),
    avgMonthlyDemand: Number((adjustedDaily * 30).toFixed(2)),
    adjustedDailyDemand: adjustedDaily,
    growthRatePct,
    spikeDetected,
    stockoutAdjusted,
    daysOfCoverage,
    lastSaleDate,
    revenue365d,
    grossProfit365d,
    grossMarginPct: Number(grossMarginPct.toFixed(1)),
    turnoverRatio,
    monthlySeries,
    demandPattern,
  };
}

export function buildMonthlyIndex(
  monthlyRows: RawMonthlySalesRow[]
): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const row of monthlyRows) {
    const key = `${row.product_id}::${row.branch_id ?? 'none'}`;
    let m = index.get(key);
    if (!m) {
      m = new Map<string, number>();
      index.set(key, m);
    }
    m.set(row.month_key, (m.get(row.month_key) ?? 0) + (Number(row.net_qty) || 0));
  }
  return index;
}
