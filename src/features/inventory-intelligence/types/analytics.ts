import type {
  ClassificationStatus,
  DemandPattern,
  ForecastModelName,
  MovementClass,
  ProductFitmentRow,
  QualityGrade,
} from './rawSnapshot';
import type { RankedSupplier } from './recommendations';

export interface ProductCustomerDemand {
  customerId: string;
  customerName: string;
  branchId: string | null;
  qty365d: number;
  revenue365d: number;
  txCount: number;
  lastOrderDate: string | null;
}

export interface ProductIdentityProfile {
  productId: string;
  name: string;
  partType: string;
  size: string;
  sizeSortKey: number;
  sku: string;
  partNumber: string;
  alternativeNumbers: string[];
  brand: string;
  originTag: string;
  originCountry: string | null;
  qualityGrade: QualityGrade;
  classificationStatus: ClassificationStatus;
  categoryId: string | null;
  categoryName: string;
  fitments: ProductFitmentRow[];
  unitCost: number;
  salePrice: number;
  minStockLevel: number;
}

export interface BranchDemandMetrics {
  branchId: string;
  branchName: string;
  physicalStock: number;
  reservedStock: number;
  damagedStock: number;
  availableStock: number;
  incomingStock: number;
  pendingTransferIn: number;
  pendingTransferOut: number;
  projectedPosition: number;
  availabilityDataLimited: boolean;
  stockAgeDays: number | null;
  stockAgeEstimated: boolean;
  historicalStockoutLimited: boolean;
  stockValue: number;
  qty7d: number;
  qty30d: number;
  qty90d: number;
  qty180d: number;
  qty365d: number;
  txCount: number;
  demandDaysCount: number;
  returnedQty: number;
  avgDailyDemand: number;
  avgWeeklyDemand: number;
  avgMonthlyDemand: number;
  adjustedDailyDemand: number;
  growthRatePct: number;
  spikeDetected: boolean;
  stockoutAdjusted: boolean;
  daysOfCoverage: number;
  lastSaleDate: string | null;
  revenue365d: number;
  grossProfit365d: number;
  grossMarginPct: number;
  turnoverRatio: number;
  monthlySeries: number[];
  demandPattern: DemandPattern;
}

export interface ForecastResult {
  productId: string;
  branchId: string | null;
  horizonDays: number;
  demandPattern: DemandPattern;
  selectedModel: ForecastModelName;
  modelVersion: string;
  predictedQty: number;
  dailyRate: number;
  confidenceScore: number;
  mae: number;
  wape: number;
  forecastBias: number;
  stockoutAdjusted: boolean;
  allModelEvaluations: Array<{
    model: ForecastModelName;
    mae: number;
    wape: number;
    bias: number;
    sampleCount: number;
  }>;
}

export interface ProductIntelligenceSummary {
  identity: ProductIdentityProfile;
  companyMetrics: BranchDemandMetrics;
  branchMetrics: BranchDemandMetrics[];
  movementClass: MovementClass;
  isFastGrowing: boolean;
  isDeadStock: boolean;
  isExcessStock: boolean;
  isNewlyStocked: boolean;
  daysSinceLastSale: number | null;
  forecast30d: ForecastResult;
  forecastsByHorizon: Record<number, ForecastResult>;
  branchForecasts: Record<string, ForecastResult>;
  verifiedAlternativesCount: number;
  pendingAlternativesCount: number;
  suppliers: RankedSupplier[];
  topCustomers: ProductCustomerDemand[];
  lastSupplier: {
    supplierId: string;
    supplierName: string;
    lastUnitPrice: number;
    lastPurchaseDate: string | null;
  } | null;
}

export interface ModelEvaluationAggregate {
  modelName: ForecastModelName;
  modelVersion: string;
  demandPattern: DemandPattern | 'all';
  mae: number;
  wape: number;
  forecastBias: number;
  sampleCount: number;
  isChampion: boolean;
}

export interface BrandAnalyticsRow {
  brand: string;
  qualityGrade: ProductIdentityProfile['qualityGrade'];
  originTag: string;
  productCount: number;
  qty365d: number;
  revenue365d: number;
  stockValue: number;
}
