export interface StatementMovement {
  id: string;
  date: string;
  ref: string;
  desc: string;
  type: string;
  debit: number;
  credit: number;
  currency: string;
  operation_type?: string | undefined;
  balance?: number | undefined;
  debit_base?: number | undefined;
  credit_base?: number | undefined;
  reference_id?: string | null | undefined;
  reference_type?: string | null | undefined;
  payment_status?:
    | 'paid'
    | 'partial'
    | 'partially_paid'
    | 'unpaid'
    | 'void'
    | 'settled'
    | 'draft'
    | 'posted'
    | undefined;
  paid_amount?: number | undefined;
  remaining_amount?: number | undefined;
  items_count?: number | undefined;
  is_bf?: number | undefined;
  custom_color?: string | undefined;
  payment_method?: string | undefined;
}

export interface StatementTransactionItem {
  id: string;
  item_name: string;
  sku?: string;
  part_number?: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount: number;
}

export interface StatementTransactionDetails {
  kind: 'invoice' | 'bond' | 'opening_balance' | 'journal';
  invoice_id?: string;
  invoice_number?: string;
  issue_date?: string;
  type?: string;
  status?: string;
  currency_code?: string;
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  paid_amount?: number;
  remaining_amount?: number;
  notes?: string;
  items?: StatementTransactionItem[];
  payment_id?: string;
  payment_number?: string;
  payment_date?: string;
  payment_method?: string;
  account_name?: string;
  account_code?: string;
  allocations?: Array<{
    allocation_id: string;
    allocated_amount: number;
    invoice_number: string;
    invoice_date: string;
    invoice_total: number;
  }>;
  journal_id?: string;
  entry_number?: string | number;
  entry_date?: string;
  lines?: Array<{
    account_code: string;
    account_name: string;
    debit: number;
    credit: number;
    currency_code: string;
    description: string;
  }>;
}
