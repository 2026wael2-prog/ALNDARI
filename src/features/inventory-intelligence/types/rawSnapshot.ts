export type DemandPattern =
  | 'smooth'
  | 'growing'
  | 'declining'
  | 'seasonal'
  | 'intermittent'
  | 'erratic_spike'
  | 'new_or_sparse';

export type ForecastModelName =
  | 'SMA'
  | 'WMA'
  | 'SES'
  | 'Croston'
  | 'SBA'
  | 'TSB'
  | 'LinearTrendRidge';

export type MovementClass =
  | 'fast_moving'
  | 'medium_moving'
  | 'slow_moving'
  | 'dead_stock'
  | 'excess_stock'
  | 'stockout_risk'
  | 'newly_stocked';

export type QualityGrade =
  | 'genuine_oem'
  | 'japanese_aftermarket'
  | 'korean_aftermarket'
  | 'thai_aftermarket'
  | 'chinese_commercial'
  | 'other_aftermarket';

export type ClassificationStatus = 'auto' | 'pending_review' | 'verified';

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

export type RecommendationStatus =
  | 'pending'
  | 'approved'
  | 'modified'
  | 'rejected'
  | 'postponed'
  | 'executed';

export type CrossRefStatus = 'pending_review' | 'approved' | 'rejected';

export type CrossRefType =
  | 'oem_equivalent'
  | 'aftermarket_alternative'
  | 'compatible_different_grade'
  | 'unverified_similar';

export interface BranchWarehouseInfo {
  id: string;
  name_ar: string;
  is_primary: boolean;
}

export interface BranchInfo {
  id: string;
  name: string;
  code: string;
  is_main: boolean;
  warehouses: BranchWarehouseInfo[];
}

export interface WarehouseStockRow {
  warehouse_id: string;
  branch_id: string | null;
  quantity: number;
  reserved_quantity?: number;
  damaged_quantity?: number;
  weighted_avg_cost: number;
}

export interface RawProductSnapshot {
  id: string;
  name_ar: string;
  sku: string | null;
  part_number: string | null;
  alternative_numbers: string | null;
  brand: string | null;
  origin_country?: string | null;
  size?: string | null;
  quality_grade?: QualityGrade | null;
  classification_status?: ClassificationStatus | null;
  created_at?: string | null;
  item_type: string | null;
  min_stock_level: number | null;
  cost_price: number | null;
  purchase_price: number | null;
  sale_price: number | null;
  category_id: string | null;
  category_name: string | null;
  stock_by_warehouse: WarehouseStockRow[];
}

export interface RawBranchSalesRow {
  product_id: string;
  branch_id: string | null;
  net_qty_365: number;
  net_qty_180: number;
  net_qty_90: number;
  net_qty_30: number;
  net_qty_7: number;
  net_revenue_365: number;
  net_cogs_365: number;
  sale_tx_count: number;
  demand_days_count: number;
  returned_qty: number;
  last_sale_date: string | null;
  first_sale_date: string | null;
}

export interface RawMonthlySalesRow {
  product_id: string;
  branch_id: string | null;
  month_key: string;
  net_qty: number;
}

export interface RawSupplierHistoryRow {
  product_id: string;
  supplier_id: string;
  prc_supplier_id?: string | null;
  party_id?: string | null;
  is_procurement_registered?: boolean;
  currency?: string | null;
  supplier_name: string;
  purchase_tx_count: number;
  total_qty_supplied: number;
  avg_unit_price: number;
  last_unit_price: number;
  last_qty: number;
  last_purchase_date: string | null;
  lead_time_days?: number | null;
  measured_lead_days?: number | null;
  fulfillment_rate_pct?: number | null;
  return_count?: number;
  returned_qty?: number;
}

export interface RawStockMovementRow {
  product_id: string;
  branch_id: string | null;
  last_receipt_at: string | null;
  ledger_tx_count: number;
  issue_days_count: number;
}

export interface RawSupplierConstraintRow {
  product_id: string;
  supplier_id: string;
  party_id?: string | null;
  minimum_order_quantity: number;
  order_multiple: number;
  lead_time_days: number;
  default_currency?: string | null;
  preferred_supplier?: boolean;
  uom_name: string | null;
  conversion_factor: number | null;
}

export interface RawOpenPORow {
  product_id: string;
  incoming_qty: number;
  earliest_eta: string | null;
}

export interface PendingTransferRow {
  product_id: string;
  from_branch_id: string | null;
  to_branch_id: string | null;
  quantity: number;
}

export interface ProductFitmentRow {
  product_id: string;
  make: string;
  model: string;
  year_start: number;
  year_end: number;
  engine: string | null;
}

export interface RawCrossRefRow {
  id: string;
  base_product_id: string;
  alternative_product_id: string;
  match_quality: string | null;
  relationship_type: CrossRefType;
  status: CrossRefStatus;
  confidence: number;
  source: string;
  notes: string | null;
}

export interface RawProductCustomerRow {
  product_id: string;
  branch_id?: string | null;
  customer_id: string;
  customer_name: string;
  qty_365d: number;
  revenue_365d: number;
  tx_count?: number;
  last_order_date: string | null;
}

export interface InventoryIntelligenceSnapshot {
  branches: BranchInfo[];
  products: RawProductSnapshot[];
  sales_history: RawBranchSalesRow[];
  monthly_sales: RawMonthlySalesRow[];
  supplier_history: RawSupplierHistoryRow[];
  customer_demand?: RawProductCustomerRow[];
  open_pos: RawOpenPORow[];
  pending_transfers?: PendingTransferRow[];
  fitments?: ProductFitmentRow[];
  stock_movements?: RawStockMovementRow[];
  supplier_constraints?: RawSupplierConstraintRow[];
  cross_references: RawCrossRefRow[];
  generated_at: string;
}
