export type ReportTab =
  | 'executive_bi'
  | 'customer_bi'
  | 'supplier_bi'
  | 'product_bi'
  | 'sales_bi'
  | 'inventory_bi'
  | 'supplier_prices_bi'
  | 'trial_balance'
  | 'debt_report'
  | 'currency_diff'
  | 'p_and_l'
  | 'balance_sheet'
  | 'cash_flow'
  | 'item_movement'
  | 'returns_report'
  | 'daily_sales'
  | 'operational_expenses'
  | 'debt_aging';

export interface DebtSummary {
  receivables: number;
  payables: number;
  currency: string;
}

export interface PartyDebt {
  id: string;
  name: string;
  phone?: string | null;
  type: 'customer' | 'supplier';
  currency: string;
  total_sales: number;
  paid_amount: number;
  remaining_amount: number;
  balances_by_currency?: Array<{ currency: string; balance: number }>;
}

export interface ReportsStats {
  summary: DebtSummary;
  debts: PartyDebt[];
}