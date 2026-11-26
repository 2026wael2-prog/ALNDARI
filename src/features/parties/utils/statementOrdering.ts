import type { StatementMovement } from '../services/statementTypes';

export interface CurrencyBalanceSummary {
  currency: string;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  count: number;
}

const CURRENCY_RANK: Record<string, number> = {
  SAR: 0,
  YER: 1,
  USD: 2,
  OMR: 3,
};

/** Returns true for brought-forward / opening-balance rows that should anchor at the bottom when newest-first. */
export const isOpeningStatementRow = (
  row: { is_bf?: number | undefined; type?: string | undefined }
): boolean => row.is_bf === 1 || row.type === 'opening_balance';

/**
 * Reorders a chronologically-sorted (oldest -> newest) list of statement rows
 * into newest-first display order while preserving each row's pre-computed running balance.
 * Opening balance rows (`is_bf === 1` / `opening_balance`) stay anchored at the bottom.
 */
export function orderStatementNewestFirst<
  T extends { is_bf?: number | undefined; type?: string | undefined },
>(chronologicalRows: readonly T[]): T[] {
  if (chronologicalRows.length <= 1) return [...chronologicalRows];

  const openingRows: T[] = [];
  const regularRows: T[] = [];

  for (const row of chronologicalRows) {
    if (isOpeningStatementRow(row)) {
      openingRows.push(row);
    } else {
      regularRows.push(row);
    }
  }

  return [...regularRows.reverse(), ...openingRows];
}

/**
 * Computes per-currency totals and closing balance cleanly regardless of display order.
 * - When `order === 'newest_first'`, the chronologically latest balance is on the FIRST row of each currency.
 * - When `order === 'chronological'`, the chronologically latest balance is on the LAST row of each currency.
 */
export function summarizeStatementByCurrency(
  movements: readonly StatementMovement[],
  order: 'chronological' | 'newest_first' = 'chronological'
): CurrencyBalanceSummary[] {
  const map = new Map<string, CurrencyBalanceSummary>();

  for (const m of movements) {
    const code = (m.currency || 'SAR').trim().toUpperCase();
    const debit = m.debit || 0;
    const credit = m.credit || 0;
    const balance = m.balance ?? 0;
    const existing = map.get(code);

    if (!existing) {
      map.set(code, {
        currency: code,
        totalDebit: Math.round(debit * 100) / 100,
        totalCredit: Math.round(credit * 100) / 100,
        finalBalance: Math.round(balance * 100) / 100,
        count: 1,
      });
    } else {
      existing.totalDebit = Math.round((existing.totalDebit + debit) * 100) / 100;
      existing.totalCredit = Math.round((existing.totalCredit + credit) * 100) / 100;
      existing.count += 1;
      if (order === 'chronological') {
        existing.finalBalance = Math.round(balance * 100) / 100;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const rankA = CURRENCY_RANK[a.currency] ?? 99;
    const rankB = CURRENCY_RANK[b.currency] ?? 99;
    return rankA !== rankB ? rankA - rankB : a.currency.localeCompare(b.currency);
  });
}

/** Resolves the effective accounting party type ('customer' | 'supplier') when searching across 'all' parties. */
export function resolveEffectivePartyType(
  scopeType: 'customer' | 'supplier' | 'employee' | 'all',
  selectedPartyRawType?: string | null
): 'customer' | 'supplier' {
  if (scopeType === 'supplier') return 'supplier';
  if (scopeType === 'customer') return 'customer';
  const normalized = (selectedPartyRawType ?? '').toLowerCase().trim();
  if (normalized === 'supplier') return 'supplier';
  return 'customer';
}
