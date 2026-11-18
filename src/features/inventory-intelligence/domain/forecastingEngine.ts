import type {
  BranchDemandMetrics,
  DemandPattern,
  EngineConfig,
  ForecastModelName,
  ForecastResult,
} from '../types';

const MODEL_VERSION = 'v2.1-ensemble';

export function predictSMA(series: number[], window = 3): number {
  if (series.length === 0) return 0;
  const slice = series.slice(-Math.min(window, series.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function predictWMA(series: number[]): number {
  const slice = series.slice(-4);
  if (slice.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  slice.forEach((v, idx) => {
    const w = idx + 1;
    weightedSum += v * w;
    weightTotal += w;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

export function predictSES(series: number[], alpha = 0.35): number {
  if (series.length === 0) return 0;
  let level = series[0];
  for (let i = 1; i < series.length; i++) {
    level = alpha * series[i] + (1 - alpha) * level;
  }
  return Math.max(0, level);
}

export function predictCroston(series: number[], alpha = 0.2): number {
  if (series.length === 0) return 0;
  let demandEstimate = series.find(v => v > 0) ?? 0;
  let intervalEstimate = 1;
  let periodsSinceDemand = 1;

  for (const val of series) {
    if (val > 0) {
      demandEstimate = alpha * val + (1 - alpha) * demandEstimate;
      intervalEstimate = alpha * periodsSinceDemand + (1 - alpha) * intervalEstimate;
      periodsSinceDemand = 1;
    } else {
      periodsSinceDemand += 1;
    }
  }

  return intervalEstimate > 0 ? Math.max(0, demandEstimate / intervalEstimate) : 0;
}

/** Syntetos-Boylan Approximation (bias-corrected Croston) */
export function predictSBA(series: number[], alpha = 0.2): number {
  return Math.max(0, predictCroston(series, alpha) * (1 - alpha / 2));
}

/** Teunter-Syntetos-Babai (handles obsolescence / long zero tails) */
export function predictTSB(series: number[], alpha = 0.2, beta = 0.15): number {
  if (series.length === 0) return 0;
  let prob = series[0] > 0 ? 1 : 0.5;
  let size = series.find(v => v > 0) ?? 0;

  for (const val of series) {
    if (val > 0) {
      prob = prob + beta * (1 - prob);
      size = size + alpha * (val - size);
    } else {
      prob = prob + beta * (0 - prob);
    }
  }
  return Math.max(0, prob * size);
}

/** Regularized linear trend regression (Ridge-damped slope) for growing/declining demand */
export function predictLinearTrendRidge(series: number[], lambda = 2.0): number {
  const n = series.length;
  if (n === 0) return 0;
  if (n === 1) return Math.max(0, series[0]);

  const meanX = (n - 1) / 2;
  const meanY = series.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = lambda;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (series[i] - meanY);
    den += dx * dx;
  }

  const slope = den > 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;
  return Math.max(0, intercept + slope * n);
}

const MODEL_PREDICTORS: Record<ForecastModelName, (series: number[]) => number> = {
  SMA: s => predictSMA(s, 3),
  WMA: predictWMA,
  SES: s => predictSES(s, 0.35),
  Croston: s => predictCroston(s, 0.2),
  SBA: s => predictSBA(s, 0.2),
  TSB: s => predictTSB(s, 0.2, 0.15),
  LinearTrendRidge: s => predictLinearTrendRidge(s, 2.0),
};

function candidateModelsForPattern(pattern: DemandPattern): ForecastModelName[] {
  switch (pattern) {
    case 'intermittent':
      return ['Croston', 'SBA', 'TSB', 'SES'];
    case 'growing':
    case 'declining':
      return ['LinearTrendRidge', 'WMA', 'SES', 'SMA'];
    case 'erratic_spike':
      return ['SES', 'SMA', 'SBA'];
    case 'seasonal':
      return ['WMA', 'SES', 'SMA', 'LinearTrendRidge'];
    case 'new_or_sparse':
      return ['SMA', 'SES', 'TSB'];
    default:
      return ['WMA', 'SES', 'SMA', 'LinearTrendRidge'];
  }
}

export function backtestModel(
  series: number[],
  model: ForecastModelName
): { mae: number; wape: number; bias: number; sampleCount: number } {
  const predictor = MODEL_PREDICTORS[model];
  if (series.length < 4) {
    return { mae: 0, wape: 0, bias: 0, sampleCount: 0 };
  }

  let absErrorSum = 0;
  let signedErrorSum = 0;
  let actualSum = 0;
  let count = 0;

  // Rolling one-step-ahead walk-forward evaluation on last 6 months
  const startIdx = Math.max(3, series.length - 6);
  for (let t = startIdx; t < series.length; t++) {
    const history = series.slice(0, t);
    const pred = predictor(history);
    const actual = series[t];
    absErrorSum += Math.abs(actual - pred);
    signedErrorSum += pred - actual;
    actualSum += actual;
    count += 1;
  }

  const mae = count > 0 ? absErrorSum / count : 0;
  const wape = actualSum > 0 ? (absErrorSum / actualSum) * 100 : absErrorSum > 0 ? 100 : 0;
  const bias = actualSum > 0 ? (signedErrorSum / actualSum) * 100 : 0;

  return {
    mae: Number(mae.toFixed(3)),
    wape: Number(Math.min(200, wape).toFixed(2)),
    bias: Number(Math.max(-200, Math.min(200, bias)).toFixed(2)),
    sampleCount: count,
  };
}

export function scaleForecastHorizon(
  base: ForecastResult,
  targetHorizonDays: number
): ForecastResult {
  if (base.horizonDays === targetHorizonDays) return base;
  return {
    ...base,
    horizonDays: targetHorizonDays,
    predictedQty: Math.max(0, Number((base.dailyRate * targetHorizonDays).toFixed(2))),
  };
}

export function forecastForMetrics(
  productId: string,
  metrics: BranchDemandMetrics,
  horizonDays: number,
  config: EngineConfig
): ForecastResult {
  // FAST PATH: If product has zero demand across all series, skip complex backtests and model walk-forwards
  const series = metrics.monthlySeries ?? [];
  const activeMonths = series.filter(v => v > 0).length;
  if (activeMonths === 0 && metrics.adjustedDailyDemand <= 0) {
    return {
      productId,
      branchId: metrics.branchId === 'company' ? null : metrics.branchId,
      horizonDays,
      demandPattern: metrics.demandPattern,
      selectedModel: 'SMA',
      modelVersion: MODEL_VERSION,
      predictedQty: 0,
      dailyRate: 0,
      confidenceScore: 20,
      mae: 0,
      wape: 0,
      forecastBias: 0,
      stockoutAdjusted: false,
      allModelEvaluations: [],
    };
  }

  const candidates =
    config.preferred_model !== 'auto'
      ? [config.preferred_model]
      : candidateModelsForPattern(metrics.demandPattern);

  const evaluations = candidates.map(model => ({
    model,
    ...backtestModel(series, model),
  }));

  // Choose champion with lowest WAPE (tie-break by lowest MAE)
  const sorted = [...evaluations].sort((a, b) => {
    if (a.sampleCount === 0 && b.sampleCount === 0) return 0;
    if (a.wape !== b.wape) return a.wape - b.wape;
    return a.mae - b.mae;
  });

  const best = sorted[0];
  const monthlyPred = MODEL_PREDICTORS[best.model](series);
  const modelDaily = monthlyPred / 30;

  // Respect stockout-adjusted demand if current stockout suppressed recent series
  const effectiveDaily = metrics.stockoutAdjusted
    ? Math.max(modelDaily, metrics.adjustedDailyDemand)
    : metrics.demandPattern === 'new_or_sparse'
      ? Math.max(modelDaily, metrics.adjustedDailyDemand * 0.85)
      : modelDaily;

  const predictedQty = Math.max(0, Number((effectiveDaily * horizonDays).toFixed(2)));

  // Honest confidence scoring based on data sufficiency + backtest WAPE
  let confidence = 45;
  if (activeMonths >= 6 && metrics.txCount >= 10) confidence = 85;
  else if (activeMonths >= 3 && metrics.txCount >= 4) confidence = 70;
  else if (activeMonths >= 1 && metrics.txCount >= 1) confidence = 52;
  else confidence = 25;

  if (best.sampleCount > 0) {
    confidence = Math.max(20, Math.min(95, confidence - best.wape * 0.25));
  }
  if (metrics.stockoutAdjusted) {
    confidence = Math.max(20, confidence - 8);
  }

  return {
    productId,
    branchId: metrics.branchId === 'company' ? null : metrics.branchId,
    horizonDays,
    demandPattern: metrics.demandPattern,
    selectedModel: best.model,
    modelVersion: MODEL_VERSION,
    predictedQty,
    dailyRate: Number(effectiveDaily.toFixed(4)),
    confidenceScore: Number(confidence.toFixed(1)),
    mae: best.mae,
    wape: best.wape,
    forecastBias: best.bias,
    stockoutAdjusted: metrics.stockoutAdjusted,
    allModelEvaluations: evaluations,
  };
}
