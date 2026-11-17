import type { DemandPattern } from '../../types';

export function buildLast12MonthKeys(referenceDate = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    keys.push(`${y}-${m}`);
  }
  return keys;
}

/**
 * Detects whether a demand series contains an exceptional one-time spike
 * using modified Z-score / standard deviation, preventing overreaction.
 */
export function detectDemandSpike(series: number[], zThreshold = 2.5): boolean {
  const nonZero = series.filter(v => v > 0);
  if (nonZero.length < 3) return false;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((acc, v) => acc + (v - mean) ** 2, 0) / series.length;
  const std = Math.sqrt(variance);
  if (std <= 0.001) return false;
  const maxVal = Math.max(...series);
  return (maxVal - mean) / std >= zThreshold;
}

/**
 * Classifies demand pattern into smooth, growing, declining, seasonal,
 * intermittent, erratic_spike, or new_or_sparse.
 */
export function classifyDemandPattern(
  monthlySeries: number[],
  txCount: number,
  demandDaysCount: number,
  growthRatePct: number,
  growthThreshold: number,
  spikeZThreshold: number
): DemandPattern {
  const totalQty = monthlySeries.reduce((a, b) => a + b, 0);
  const activeMonths = monthlySeries.filter(v => v > 0).length;

  if (totalQty <= 0 || txCount < 2 || activeMonths < 2) {
    return 'new_or_sparse';
  }

  // Intermittent: many zero-demand months or low demand-day density
  const adi = activeMonths > 0 ? monthlySeries.length / activeMonths : 12;
  if (adi >= 1.75 || (demandDaysCount > 0 && demandDaysCount <= 6 && activeMonths <= 4)) {
    return 'intermittent';
  }

  if (detectDemandSpike(monthlySeries, spikeZThreshold)) {
    return 'erratic_spike';
  }

  if (growthRatePct >= growthThreshold) {
    return 'growing';
  }

  if (growthRatePct <= -growthThreshold) {
    return 'declining';
  }

  // Check recurring seasonality: require >= 10 active months AND repeating seasonal swing
  // (at least 2 distinct months >= 1.2x mean separated by >= 3 months), not just high CV
  const mean = totalQty / monthlySeries.length;
  const std = Math.sqrt(
    monthlySeries.reduce((acc, v) => acc + (v - mean) ** 2, 0) / monthlySeries.length
  );
  const cv = mean > 0 ? std / mean : 0;
  if (cv >= 0.45 && activeMonths >= 10) {
    const peakIndices = monthlySeries
      .map((v, idx) => (v >= mean * 1.2 ? idx : -1))
      .filter(idx => idx >= 0);
    const hasRecurringPeaks =
      peakIndices.length >= 2 &&
      peakIndices[peakIndices.length - 1] - peakIndices[0] >= 3;
    if (hasRecurringPeaks) {
      return 'seasonal';
    }
  }

  return 'smooth';
}

export function computeGrowthRatePct(qty30d: number, qty90d: number, monthlySeries: number[]): number {
  const len = monthlySeries.length;
  if (len >= 6) {
    const recent3 = monthlySeries.slice(-3).reduce((a, b) => a + b, 0);
    const prev3 = monthlySeries.slice(-6, -3).reduce((a, b) => a + b, 0);
    if (prev3 > 0) {
      return Number((((recent3 - prev3) / prev3) * 100).toFixed(1));
    }
    if (recent3 > 0) return 100;
  }

  const prev60Avg30 = (qty90d - qty30d) / 2;
  if (prev60Avg30 > 0) {
    return Number((((qty30d - prev60Avg30) / prev60Avg30) * 100).toFixed(1));
  }
  return qty30d > 0 ? 100 : 0;
}

/**
 * Adjusts daily demand when a product is currently out of stock (available <= 0)
 * despite having historical sales, so stockouts are never misread as zero demand.
 */
export function computeStockoutAdjustedDailyDemand(
  qty30d: number,
  qty90d: number,
  qty365d: number,
  availableStock: number,
  txCount: number,
  spikeDetected: boolean
): { avgDaily: number; adjustedDaily: number; stockoutAdjusted: boolean } {
  const raw30 = Math.max(0, qty30d) / 30;
  const raw90 = Math.max(0, qty90d) / 90;
  const raw365 = Math.max(0, qty365d) / 365;

  // Dampen one-time spike by blending with longer window
  const avgDaily = spikeDetected
    ? raw90 * 0.5 + raw365 * 0.5
    : raw30 * 0.5 + raw90 * 0.35 + raw365 * 0.15;

  // If currently stocked out (available <= 0) and 30d dropped while 90d/365d had real demand,
  // use the stronger historical active velocity instead of letting 0-stock suppress demand.
  if (availableStock <= 0 && txCount >= 2 && (raw90 > raw30 * 1.25 || raw365 > raw30 * 1.25)) {
    const recoveredDaily = Math.max(raw90, raw365);
    return {
      avgDaily,
      adjustedDaily: Number(recoveredDaily.toFixed(4)),
      stockoutAdjusted: true,
    };
  }

  return {
    avgDaily: Number(avgDaily.toFixed(4)),
    adjustedDaily: Number(avgDaily.toFixed(4)),
    stockoutAdjusted: false,
  };
}
