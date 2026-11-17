export interface TopProduct {
  id: string;
  name: string;
  revenue: number;
  quantity: number;
  part_number?: string | null;
  brand?: string | null;
  sku?: string;
  category_name?: string | null;
  current_stock?: number;
  min_stock_level?: number;
  is_low_stock?: boolean;
  is_out_of_stock?: boolean;
  cost?: number;
  gross_profit?: number;
  margin_percentage?: number;
  revenue_yer?: number;
  cost_yer?: number;
  gross_profit_yer?: number;
  price?: number;
}

export interface TopCustomer {
  id: string;
  name: string;
  total: number;
  invoices: number;
}

export type SortMode = 'quantity' | 'revenue' | 'profit';
export type MainTab = 'both' | 'parts' | 'customers';
