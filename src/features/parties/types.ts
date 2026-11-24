import type { Database } from '../../core/database.types';

export type PartyType = 'customer' | 'supplier' | 'both' | 'employee' | 'all';
export type PartyStatus = 'active' | 'blocked';
export type PartyView = 'list' | 'statements' | 'analytics' | 'categories';
export type PartyCurrencyFilter = 'ALL' | 'SAR' | 'YER' | 'MIXED';

export interface PartyCurrencyBalance {
  currency: string;
  balance: number;
  transaction_count?: number;
}

export type Party = Database['public']['Tables']['parties']['Row'] & {
  category?: string;
  status?: PartyStatus;
  email?: string;
  tax_number?: string;
  address?: string;
  balance?: number;
  /** الرصيد الدقيق بالريال السعودي فقط (بدون دمج اليمني) */
  sar_balance?: number;
  /** الرصيد الدقيق بالريال اليمني فقط (بدون تحويل للسعودي) */
  yer_balance?: number;
  balances_by_currency?: PartyCurrencyBalance[];
  portal_token?: string | null;
};

export interface PartyFormData {
  name: string;
  type: 'customer' | 'supplier' | 'both' | 'employee';
  phone?: string;
  email?: string;
  tax_number?: string;
  address?: string;
  status: PartyStatus;
  category?: string;
  category_id?: string | null;
}

export type PartyBalanceClassification = 'debtor' | 'creditor' | 'mixed_currency' | 'settled';

export interface PartyCurrencyStat {
  currency: string;
  balance: number;
  receivable: number;
  payable: number;
  count: number;
  debtorCount: number;
  creditorCount: number;
}

export interface PartyStats {
  /** Total number of parties (active + blocked). */
  totalCount: number;
  /** Sum of `balance` across all parties, in the default currency. */
  totalBalance: number;
  /** Total receivables (positive balance - owed to us). */
  totalReceivable: number;
  /** Total payables / customer credits (negative balance - owed by us). */
  totalPayable: number;
  /** Count of parties whose `status` is `active`. */
  activeCount: number;
  /** Count of parties whose `status` is `blocked`. */
  blockedCount: number;
  /** Canonical per-currency balance counts (never silently netting opposite-sign currencies). */
  debtorCount?: number;
  creditorCount?: number;
  mixedCurrencyCount?: number;
  settledCount?: number;
  /** Breakdown of total balances by currency (e.g. SAR, YER) — strictly separated, never netted across currencies. */
  byCurrency?: PartyCurrencyStat[];
}

export interface PartyCategory {
  id: string;
  name: string;
  type: PartyType;
  count?: number; // Optional for UI display
  totalBalance?: number; // Sum of balances in this category
}
