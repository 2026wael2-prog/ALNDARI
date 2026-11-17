import type { Invoice, Party } from '@/core/types/supabase-helpers';

export type InvoiceWithParty = Invoice & {
  party: Pick<Party, 'name'>;
  invoice_items: Array<{ id: string }>;
};

export interface InvoiceDetailItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  returned_at: string | null;
  name?: string;
  price?: number;
  product: {
    name_ar: string;
    sku: string;
    cost_price?: number;
    part_number?: string;
    brand?: string;
  };
}

export type InvoiceWithDetails = Invoice & {
  parties: Party;
  payment_allocations: Array<{
    payments: { amount: number; created_at: string; payment_method: string };
  }>;
  invoice_items: InvoiceDetailItem[];
};

export interface InvoiceNavSummary {
  id: string;
  invoice_number: string;
  created_at: string;
  issue_date: string;
  total_amount: number;
  currency_code: string;
  party_name?: string | null;
}
