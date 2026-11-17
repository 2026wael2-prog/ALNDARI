import type { BiDatePreset } from '@/core/utils/dateUtils';

export type { BiDatePreset };
export type CustomerMetric = 'revenue' | 'invoices' | 'profit' | 'frequency' | 'growth' | 'loyalty';
export type CustomerLoyaltySegment = 'all' | 'champions' | 'loyal' | 'new' | 'at_risk' | 'churned' | 'returning';

export type SupplierMetric = 'spend' | 'invoices' | 'products_count' | 'growth';

export type ProductViewType = 'profitability' | 'movement' | 'velocity' | 'slow_moving' | 'dead_stock' | 'returns';

export interface BiFilterParams {
  branchId?: string | null | undefined;
  datePreset?: BiDatePreset | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  metric?: string | undefined;
  segment?: string | undefined;
  categoryId?: string | null | undefined;
  viewType?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  brand?: string | undefined;
}

export interface CustomerBiRecord {
  party_id: string;
  party_name: string;
  phone: string;
  category_name: string;
  invoices_count: number;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  margin_percent: number;
  avg_invoice_value: number;
  first_purchase_date: string | null;
  last_purchase_date: string | null;
  days_since_last_purchase: number;
  loyalty_segment: CustomerLoyaltySegment;
  current_balance: number;
  overdue_balance: number;
  collection_rate: number;
  growth_rate: number;
  total_records: number;
  summary_total_revenue: number;
  summary_total_profit: number;
  summary_champions_count: number;
}

export interface SupplierBiRecord {
  supplier_id: string;
  supplier_name: string;
  phone: string;
  category_name: string;
  invoices_count: number;
  total_purchases: number;
  total_items_supplied: number;
  distinct_products_count: number;
  avg_bill_value: number;
  first_bill_date: string | null;
  last_bill_date: string | null;
  total_paid: number;
  current_balance: number;
  overdue_dues: number;
  payment_ratio: number;
  growth_rate: number;
  total_records: number;
  summary_total_purchases: number;
  summary_total_dues: number;
  summary_avg_payment_ratio: number;
}

export interface ProductBiRecord {
  product_id: string;
  product_sku: string;
  part_number: string;
  alternative_numbers: string;
  product_name: string;
  category_name: string;
  brand_name: string;
  unit: string;
  times_sold: number;
  quantity_sold: number;
  quantity_returned: number;
  net_quantity_sold: number;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_percent: number;
  total_discount_given: number;
  current_stock: number;
  stock_valuation_cost: number;
  turnover_ratio: number;
  days_sales_inventory: number;
  movement_classification: 'fast' | 'medium' | 'slow' | 'dead' | 'stockout_risk';
  return_rate_percent: number;
  last_sale_date: string | null;
  last_purchase_date: string | null;
  total_records: number;
  summary_total_revenue: number;
  summary_total_cogs: number;
  summary_total_profit: number;
  summary_stock_valuation: number;
}

export interface SalesBiAnalyticsData {
  summary?: {
    gross_sales: number;
    returns_amount: number;
    net_sales: number;
    total_discount: number;
    invoices_count: number;
    avg_invoice: number;
    cash_sales: number;
    credit_sales: number;
    prev_net_sales: number;
    growth_pct: number;
  };
  by_branch: Array<{
    branch_name: string;
    invoices_count: number;
    net_sales: number;
    avg_invoice: number;
  }>;
  by_payment_method: Array<{
    payment_method: string;
    invoices_count: number;
    total_amount: number;
  }>;
  by_employee?: Array<{
    employee_name: string;
    invoices_count: number;
    net_sales: number;
  }>;
  by_hour?: Array<{
    hour_of_day: number;
    invoices_count: number;
    total_sales: number;
  }>;
  daily_trend: Array<{
    date: string;
    invoices_count: number;
    net_sales: number;
  }>;
}

export interface InventoryBiData {
  summary: {
    total_products: number;
    total_quantity: number;
    total_valuation: number;
    out_of_stock_count: number;
    low_stock_count: number;
    transfers_count: number;
    transfers_quantity: number;
    audit_sessions_count: number;
    audit_variance_qty: number;
    audit_variance_value: number;
  };
  by_branch: Array<{
    branch_name: string;
    products_count: number;
    total_quantity: number;
    total_valuation: number;
  }>;
  by_category: Array<{
    category_name: string;
    products_count: number;
    total_quantity: number;
    total_valuation: number;
  }>;
  by_brand: Array<{
    brand_name: string;
    products_count: number;
    total_quantity: number;
    total_valuation: number;
  }>;
  top_products_by_value?: Array<{
    product_id: string;
    product_name: string;
    part_number: string;
    brand_name: string;
    current_stock: number;
    stock_valuation: number;
  }>;
}

export interface SupplierPriceComparisonRecord {
  product_id: string;
  product_name: string;
  product_sku: string;
  part_number: string;
  brand_name: string;
  supplier_id: string;
  supplier_name: string;
  invoices_count: number;
  total_qty_purchased: number;
  last_purchase_price: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  last_purchase_date: string | null;
  total_records: number;
}

export interface Entity360Profile {
  profile: {
    id: string;
    name?: string;
    name_ar?: string;
    phone?: string;
    sku?: string;
    part_number?: string;
    brand?: string;
    type?: string;
    status?: string;
    balance?: number;
    credit_limit?: number;
    sale_price?: number;
    cost_price?: number;
    purchase_price?: number;
    category?: string;
  };
  stock?: {
    total_quantity: number;
    total_valuation: number;
  };
  kpis: Record<string, number>;
  timeline?: Array<{
    month: string;
    revenue?: number;
    purchases?: number;
    quantity?: number;
    invoices_count?: number;
    bills_count?: number;
  }>;
  top_items?: Array<{
    product_id: string;
    product_name: string;
    part_number?: string;
    brand?: string;
    total_quantity: number;
    total_amount: number;
  }>;
  recent_transactions?: Array<{
    id: string;
    invoice_number: string;
    type: string;
    issue_date: string;
    total_amount: number;
    status: string;
  }>;
}

export interface ExecutiveBiSummary {
  current: {
    total_sales: number;
    total_returns: number;
    net_sales: number;
    cogs: number;
    gross_profit: number;
    gross_margin_percent: number;
    purchases: number;
    stock_valuation: number;
    receivables: number;
    payables: number;
    active_customers: number;
    active_suppliers: number;
    cash_liquidity: number;
  };
  previous: {
    net_sales: number;
    gross_profit: number;
    purchases: number;
  };
  growth: {
    sales_growth_pct: number;
    profit_growth_pct: number;
    purchases_growth_pct: number;
  };
}
