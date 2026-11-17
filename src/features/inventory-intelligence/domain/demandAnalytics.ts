export {
  buildLast12MonthKeys,
  classifyDemandPattern,
  computeGrowthRatePct,
  computeStockoutAdjustedDailyDemand,
  detectDemandSpike,
} from './demand/patternClassifier';

export {
  aggregateCompanyMetrics,
  buildBranchMetrics,
  buildMonthlyIndex,
} from './demand/branchMetricsBuilder';

export { classifyMovement } from './demand/movementClassifier';
