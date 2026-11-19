import type { QualityGrade, RecommendationStatus, UrgencyLevel } from './rawSnapshot';

export interface TransferRecommendation {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  partNumber: string;
  brand: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  fromCurrentStock: number;
  toCurrentStock: number;
  fromMonthlyDemand: number;
  toMonthlyDemand: number;
  availableSurplus: number;
  recommendedQty: number;
  projectedFromStock: number;
  projectedToStock: number;
  estimatedCoverageDaysAfter: number;
  urgency: UrgencyLevel;
  confidenceScore: number;
  reason: string;
  capitalSaved: number;
  status: RecommendationStatus;
  approvedQty?: number | null;
  decisionReason?: string | null;
}

export interface RankedSupplier {
  supplierId: string;
  prcSupplierId?: string | null;
  partyId?: string | null;
  isProcurementRegistered?: boolean;
  currency?: string;
  supplierName: string;
  lastPurchaseDate: string | null;
  lastUnitPrice: number;
  avgUnitPrice: number;
  lastQty: number;
  purchaseTxCount: number;
  totalQtySupplied: number;
  estimatedLeadTimeDays: number;
  isLeadTimeEstimated: boolean;
  fulfillmentRatePct: number | null;
  returnCount: number;
  reliabilityDataLimited: boolean;
  minimumOrderQty: number;
  orderMultiple: number;
  uomName: string | null;
  uomConversionFactor: number | null;
  packageConstraintVerified: boolean;
  compositeScore: number;
  rankingReasons: string[];
}

export interface PurchaseCalculationBreakdown {
  forecastDemandLeadAndReview: number;
  safetyStock: number;
  reorderPoint: number;
  physicalStock: number;
  reservedStock: number;
  damagedStock?: number;
  availableStock: number;
  incomingStock: number;
  netPendingTransfers: number;
  netInventoryPosition: number;
  rawRequiredQty: number;
  moqApplied: number;
  packageMultipleApplied: number;
  packageConstraintVerified: boolean;
  branchForecastUsed: boolean;
  branchShortageBreakdown?: Array<{
    branchId: string;
    branchName: string;
    dailyRate: number;
    shortage: number;
  }>;
  finalRecommendedQty: number;
  unitPrice: number;
  estimatedCost: number;
  currency: string;
  leadTimeDays: number;
  reviewPeriodDays: number;
  serviceLevel: number;
}

export interface PurchaseRecommendation {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  partNumber: string;
  brand: string;
  qualityGrade: QualityGrade;
  targetBranchId: string | null;
  targetBranchName: string;
  historicalSold365d: number;
  avgDailyDemand: number;
  forecastDemand30d: number;
  availableStock: number;
  incomingStock: number;
  pendingTransferQty: number;
  safetyStock: number;
  reorderPoint: number;
  recommendedQty: number;
  estimatedCost: number;
  expectedCoverageDaysAfter: number;
  expectedStockoutDays: number | null;
  urgency: UrgencyLevel;
  confidenceScore: number;
  reason: string;
  calculationBreakdown: PurchaseCalculationBreakdown;
  recommendedSupplier: RankedSupplier | null;
  alternativeSuppliers: RankedSupplier[];
  status: RecommendationStatus;
  approvedQty?: number | null;
  decisionReason?: string | null;
}

export interface DeadExcessRecommendation {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  partNumber: string;
  brand: string;
  classification: 'dead_stock' | 'slow_moving' | 'excess_stock';
  currentStock: number;
  stockValue: number;
  daysSinceLastSale: number | null;
  stockAgeDays?: number | null;
  stockAgeEstimated?: boolean;
  sold365d: number;
  forecast30d: number;
  recommendedAction: string;
  branchTransferCandidate: boolean;
  status: RecommendationStatus;
}
