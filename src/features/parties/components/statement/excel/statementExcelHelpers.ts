import type { StatementMovement } from '../../../service';
import type { PartyType } from '../../../types';

export interface RowColorStyle {
  bg: string;
  border: string;
  text: string;
  badge: string;
}

export type StatementRowSemanticTone = 'rose' | 'emerald';

/**
 * Resolves the automatic Red/Green visual tone for a statement transaction:
 * - Green ('emerald'): payments, receipts, returns, or fully paid transactions reducing/settling debt.
 * - Red ('rose'): unpaid/partial invoices or charges increasing the party balance.
 */
export function getStatementRowSemanticTone(
  row: Pick<StatementMovement, 'debit' | 'credit' | 'payment_status' | 'type' | 'reference_type' | 'operation_type'>,
  partyType: PartyType = 'customer'
): StatementRowSemanticTone {
  const debit = Number(row.debit) || 0;
  const credit = Number(row.credit) || 0;
  const isSupplier = partyType === 'supplier';

  if (row.payment_status === 'paid') {
    return 'emerald';
  }

  if (isSupplier) {
    // Supplier: Debit reduces what we owe (payment/return -> green); Credit increases liability (purchase -> red)
    if (debit > 0 && credit === 0) return 'emerald';
    if (credit > 0) return 'rose';
    return 'emerald';
  }

  // Customer: Credit reduces receivable (receipt/return -> green); Debit increases debt (sale -> red)
  if (credit > 0 && debit === 0) return 'emerald';
  if (debit > 0) return 'rose';
  return 'emerald';
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

export const EXCEL_COL_TITLES = [
  'التاريخ',
  'المرجع',
  'نوع العملية',
  'العملة',
  'البيان والتفاصيل',
  'حالة السداد',
  'مدين (عليه +)',
  'دائن (له -)',
  'الرصيد المتراكم',
  'إجراءات',
];

export type ExcelDensityMode = 'compact' | 'comfortable' | 'large';

export interface ExcelDensityStyles {
  label: string;
  tableText: string;
  headerText: string;
  monoText: string;
  badgeText: string;
  cellPad: string;
  footerText: string;
}

export const EXCEL_DENSITY_MAP = new Map<ExcelDensityMode, ExcelDensityStyles>([
  [
    'compact',
    {
      label: 'مضغوط',
      tableText: 'text-[13px]',
      headerText: 'text-xs',
      monoText: 'text-[13px]',
      badgeText: 'text-[11px]',
      cellPad: 'px-2.5 py-2',
      footerText: 'text-[13px]',
    },
  ],
  [
    'comfortable',
    {
      label: 'واضح (افتراضي)',
      tableText: 'text-sm',
      headerText: 'text-[13px]',
      monoText: 'text-sm',
      badgeText: 'text-xs',
      cellPad: 'px-3 py-2.5',
      footerText: 'text-sm',
    },
  ],
  [
    'large',
    {
      label: 'كبير ومريح',
      tableText: 'text-[15px]',
      headerText: 'text-sm',
      monoText: 'text-[15px]',
      badgeText: 'text-xs',
      cellPad: 'px-3.5 py-3',
      footerText: 'text-[15px]',
    },
  ],
]);

export function getExcelCellDisplayValue(
  row: StatementMovement,
  colIdx: number,
  formatAmount: (amount: number, currency: string) => string
): string {
  const currency = (row.currency || 'SAR').toUpperCase();
  switch (colIdx) {
    case 0:
      return row.date ? row.date.replace(/-/g, '/') : '—';
    case 1:
      return row.ref || '—';
    case 2:
      return row.operation_type || row.type || 'قيد محاسبي';
    case 3:
      return currency;
    case 4:
      return row.desc || '—';
    case 5:
      return row.payment_status === 'paid'
        ? 'خالص'
        : row.payment_status === 'partial' || row.payment_status === 'partially_paid'
          ? 'جزئي'
          : row.payment_status === 'unpaid'
            ? 'غير مسدد'
            : 'مرحل';
    case 6:
      return row.debit > 0 ? formatAmount(row.debit, currency) : '0';
    case 7:
      return row.credit > 0 ? formatAmount(row.credit, currency) : '0';
    case 8:
      return formatAmount(Number(row.balance) || 0, currency);
    default:
      return '';
  }
}

export interface CurrencyFooterTotal {
  currency: string;
  count: number;
  debit: number;
  credit: number;
  closingBalance: number;
}

export function computeFooterTotalsByCurrency(
  movements: StatementMovement[],
  isNewestFirst = false
): CurrencyFooterTotal[] {
  const map = new Map<string, CurrencyFooterTotal>();
  for (const m of movements) {
    const code = (m.currency || 'SAR').toUpperCase();
    const existing = map.get(code);
    if (!existing) {
      map.set(code, {
        currency: code,
        count: 1,
        debit: Math.round((Number(m.debit) || 0) * 100) / 100,
        credit: Math.round((Number(m.credit) || 0) * 100) / 100,
        closingBalance: Math.round((Number(m.balance) || 0) * 100) / 100,
      });
    } else {
      existing.count += 1;
      existing.debit = Math.round((existing.debit + (Number(m.debit) || 0)) * 100) / 100;
      existing.credit = Math.round((existing.credit + (Number(m.credit) || 0)) * 100) / 100;
      if (!isNewestFirst) {
        existing.closingBalance = Math.round((Number(m.balance) || 0) * 100) / 100;
      }
    }
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
