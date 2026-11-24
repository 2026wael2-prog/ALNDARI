import type { StatementMovement } from '../../../service';

export interface RowColorStyle {
  bg: string;
  border: string;
  text: string;
  badge: string;
}

export const COLOR_MAP = new Map<string, RowColorStyle>([
  [
    'emerald',
    {
      bg: 'bg-emerald-50/90 dark:bg-emerald-950/35',
      border: 'border-r-4 border-r-emerald-600',
      text: 'text-emerald-950 dark:text-emerald-200',
      badge: 'bg-emerald-500',
    },
  ],
  [
    'rose',
    {
      bg: 'bg-rose-50/90 dark:bg-rose-950/35',
      border: 'border-r-4 border-r-rose-600',
      text: 'text-rose-950 dark:text-rose-200',
      badge: 'bg-rose-500',
    },
  ],
  [
    'amber',
    {
      bg: 'bg-amber-50/90 dark:bg-amber-950/35',
      border: 'border-r-4 border-r-amber-500',
      text: 'text-amber-950 dark:text-amber-200',
      badge: 'bg-amber-500',
    },
  ],
  [
    'blue',
    {
      bg: 'bg-blue-50/90 dark:bg-blue-950/35',
      border: 'border-r-4 border-r-blue-600',
      text: 'text-blue-950 dark:text-blue-200',
      badge: 'bg-blue-500',
    },
  ],
]);

export const EXCEL_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export interface CurrencyFooterTotal {
  currency: string;
  count: number;
  debit: number;
  credit: number;
  closingBalance: number;
}

export function computeFooterTotalsByCurrency(
  movements: StatementMovement[]
): CurrencyFooterTotal[] {
  const map = new Map<string, CurrencyFooterTotal>();
  for (const m of movements) {
    const code = (m.currency || 'SAR').toUpperCase();
    const entry = map.get(code) ?? {
      currency: code,
      count: 0,
      debit: 0,
      credit: 0,
      closingBalance: 0,
    };
    entry.count += 1;
    entry.debit = Math.round((entry.debit + (Number(m.debit) || 0)) * 100) / 100;
    entry.credit = Math.round((entry.credit + (Number(m.credit) || 0)) * 100) / 100;
    entry.closingBalance = Math.round((Number(m.balance) || 0) * 100) / 100;
    map.set(code, entry);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.currency === 'SAR' ? -1 : b.currency === 'SAR' ? 1 : a.currency.localeCompare(b.currency)
  );
}

export function classifyStatementMovement(row: StatementMovement) {
  const op = (row.operation_type || row.type || '').toLowerCase();
  const refType = (row.reference_type || row.type || '').toLowerCase();
  const isInv =
    refType.includes('invoice') ||
    refType.includes('sale') ||
    refType.includes('purchase') ||
    op.includes('فاتورة');
  const isEditableSalesInvoice =
    Boolean(row.reference_id) &&
    (refType.includes('invoice') || op.includes('invoice') || op.includes('مبيعات')) &&
    !refType.includes('purchase') &&
    !op.includes('مشتريات') &&
    !refType.includes('return') &&
    !op.includes('مرتجع') &&
    !refType.includes('void');
  const isBond =
    refType.includes('bond') ||
    refType.includes('payment') ||
    refType.includes('receipt') ||
    refType.includes('voucher');
  const isPartialStatus =
    row.payment_status === 'partial' || row.payment_status === 'partially_paid';

  return { refType, isInv, isEditableSalesInvoice, isBond, isPartialStatus };
}
