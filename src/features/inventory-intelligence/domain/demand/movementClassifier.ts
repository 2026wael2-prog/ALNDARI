import type { BranchDemandMetrics, EngineConfig, MovementClass } from '../../types';

export function classifyMovement(
  companyMetrics: BranchDemandMetrics,
  daysSinceLastSale: number | null,
  config: EngineConfig
): MovementClass {
  const { availableStock, adjustedDailyDemand, txCount, daysOfCoverage } = companyMetrics;

  if (adjustedDailyDemand > 0 && availableStock <= 0) {
    return 'stockout_risk';
  }
  if (adjustedDailyDemand > 0 && daysOfCoverage < config.default_lead_time_days) {
    return 'stockout_risk';
  }
  if (
    availableStock > 0 &&
    companyMetrics.qty365d <= 0 &&
    companyMetrics.stockAgeDays !== null &&
    companyMetrics.stockAgeDays < config.slow_moving_days_threshold
  ) {
    return 'newly_stocked';
  }
  if (
    availableStock > 0 &&
    (daysSinceLastSale === null || daysSinceLastSale >= config.dead_stock_days_threshold) &&
    companyMetrics.qty365d <= 1
  ) {
    return 'dead_stock';
  }
  if (availableStock > 0 && daysOfCoverage > config.target_coverage_days * 3 && adjustedDailyDemand > 0) {
    return 'excess_stock';
  }
  if (txCount >= 8 || companyMetrics.qty90d >= 20) {
    return 'fast_moving';
  }
  if (
    availableStock > 0 &&
    (daysSinceLastSale !== null && daysSinceLastSale >= config.slow_moving_days_threshold)
  ) {
    return 'slow_moving';
  }
  return 'medium_moving';
}
