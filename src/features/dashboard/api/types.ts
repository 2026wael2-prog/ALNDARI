export type DashResult = PromiseSettledResult<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;

export interface SummaryRow {
  total_sales?: number | string;
  total_purchases?: number | string;
  total_expenses?: number | string;
  receipt_bonds?: number | string;
  payment_bonds?: number | string;
  total_debts?: number | string;
  total_supplier_debts?: number | string;
  invoice_count?: number | string;
}

export interface RawTopProduct {
  id?: string;
  sku?: string;
  name?: string;
  name_ar?: string;
  part_number?: string | null;
  brand?: string | null;
  category_name?: string | null;
  total_revenue?: number;
  revenue?: number;
  total_quantity?: number;
  quantity?: number;
  gross_profit?: number;
  cost?: number;
  total_cost?: number;
  margin_percentage?: number;
  revenue_yer?: number;
  total_revenue_yer?: number;
  cost_yer?: number;
  total_cost_yer?: number;
  gross_profit_yer?: number;
  price?: number;
  current_stock?: number;
  min_stock_level?: number;
  is_low_stock?: boolean;
  is_out_of_stock?: boolean;
}

export interface RawTopCustomer {
  id?: string;
  customer_id?: string;
  name?: string;
  total_revenue?: number;
  total?: number;
  invoice_count?: number;
  invoices?: number;
}

export interface RawLowStockProduct {
  id: string;
  name_ar?: string;
  quantity: number | string;
  min_quantity: number | string;
}

export interface RawRecentInvoice {
  id: string;
  invoice_number?: string | null;
  type?: string | null;
  issue_date: string;
  created_at?: string | null;
  party_id?: string | null;
  total_amount?: number | null;
  currency_code?: string | null;
  parties?: { name?: string | null } | null;
}

export interface RawRecentExpense {
  id: string;
  voucher_number?: string | null;
  expense_date: string;
  created_at?: string | null;
  description?: string | null;
  amount?: number | null;
  currency_code?: string | null;
  expense_categories?: { name?: string | null } | null;
}

export interface RawDebtFollowupRow {
  party_id: string;
  party_name?: string | null;
  classification?: string;
  days_overdue?: number | null;
  outstanding_balance?: number | null;
  invoice_count?: number | null;
}

export interface RawTopSellingProduct {
  category_id: string;
  gross_profit?: number;
  id: string;
  name_ar?: string;
  sku?: string;
  total_cost?: number;
  total_revenue?: number;
  total_sold?: number;
}

export interface RawProductCategory {
  id: string;
  name: string;
}

export interface RawTopPayload {
  top_products?: RawTopProduct[] | null;
  top_customers?: RawTopCustomer[] | null;
}

export interface FetchRawDashboardOptions {
  signal?: AbortSignal | undefined;
  branchId?: string | null | undefined;
  dateFrom?: string | null | undefined;
  dateTo?: string | null | undefined;
}
