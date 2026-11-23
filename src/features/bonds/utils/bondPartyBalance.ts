import {
  resolveCustomerBalanceForCurrency,
  type CurrencyBalanceEntry,
  type ResolvedCustomerBalance,
} from '../../sales/utils/customerBalanceDisplay';
import type { BondType } from '../types';

const EPSILON = 0.005;

export type BalanceDirectionStatus = 'debit' | 'credit' | 'settled';

export interface BalanceDirectionInfo {
  status: BalanceDirectionStatus;
  /** عليه / له / متوازن */
  label: string;
  /** عليه (مدين) / له (دائن) / متوازن */
  longLabel: string;
  /** Absolute magnitude (always >= 0) */
  absAmount: number;
}

export interface PartyBalanceInput {
  balance?: number | null;
  balances_by_currency?: Array<{ currency: string; balance: number }> | null;
}

export interface BondPartyBalanceSummary {
  /** Resolved previous balance (supports multi-currency) */
  previous: ResolvedCustomerBalance;
  /** Previous balance direction (عليه / له / متوازن) */
  previousDirection: BalanceDirectionInfo;
  /** Effective previous balance in the bond's selected currency (native if exists, else 0) */
  previousNativeInBondCurrency: number;
  /** Projected balance in the bond's selected currency after applying bondAmount */
  afterInBondCurrency: number;
  /** Direction of the projected balance after bond */
  afterDirection: BalanceDirectionInfo;
  /** Optional approximate net balance in bond currency when previous balance was in another currency */
  convertedAfterApprox?:
    | {
        amount: number;
        currency: string;
        direction: BalanceDirectionInfo;
      }
    | undefined;
  /** Currency code of the bond */
  bondCurrency: string;
}

/**
 * Standard accounting sign convention across the entire app:
 * - balance > 0  => عليه (مدين - party owes us)
 * - balance < 0  => له (دائن - we owe the party)
 * - |balance| < 0.005 => متوازن
 */
export const getBalanceDirection = (balance: number): BalanceDirectionInfo => {
  const numeric = Number(balance) || 0;
  if (Math.abs(numeric) < EPSILON) {
    return {
      status: 'settled',
      label: 'متوازن',
      longLabel: 'متوازن',
      absAmount: 0,
    };
  }
  if (numeric > 0) {
    return {
      status: 'debit',
      label: 'عليه',
      longLabel: 'عليه (مدين)',
      absAmount: numeric,
    };
  }
  return {
    status: 'credit',
    label: 'له',
    longLabel: 'له (دائن)',
    absAmount: Math.abs(numeric),
  };
};

/**
 * Computes the signed delta that a bond applies to a party's balance (debit - credit):
 * - receipt (سند قبض): credits the party => reduces balance (-amount)
 * - payment (سند صرف): debits the party => increases balance (+amount)
 * - transfer: 0
 */
export const computeBondBalanceDelta = (bondType: BondType, amount: number): number => {
  const safeAmount = Number(amount) || 0;
  if (safeAmount <= 0) return 0;
  if (bondType === 'receipt') return -safeAmount;
  if (bondType === 'payment') return safeAmount;
  return 0;
};

/**
 * Resolves a party's previous balance and projected post-bond balance for the Create Bond modal.
 */
export const resolveBondPartyBalance = (params: {
  party: PartyBalanceInput | null | undefined;
  bondType: BondType;
  bondCurrency: string;
  bondAmount: number;
  exchangeRate?: number;
  exchangeOperator?: 'multiply' | 'divide';
}): BondPartyBalanceSummary | null => {
  const { party, bondType, bondCurrency, bondAmount, exchangeRate = 1, exchangeOperator } = params;
  if (!party) return null;

  const targetCurrency = (bondCurrency || 'SAR').toUpperCase().trim();
  const baseBalanceSar = Number(party.balance) || 0;
  const balancesByCurrency: CurrencyBalanceEntry[] = (party.balances_by_currency ?? []).map(b => ({
    currency_code: b.currency,
    balance: Number(b.balance) || 0,
  }));

  const previous = resolveCustomerBalanceForCurrency({
    baseBalanceSar,
    balancesByCurrency,
    invoiceCurrency: targetCurrency,
    exchangeRate,
    exchangeOperator,
  });

  const previousDirection = getBalanceDirection(previous.primaryAmount);
  const delta = computeBondBalanceDelta(bondType, bondAmount);

  const previousNativeInBondCurrency = previous.matchesInvoiceCurrency ? previous.primaryAmount : 0;
  const afterInBondCurrency = Math.round((previousNativeInBondCurrency + delta) * 100) / 100;
  const afterDirection = getBalanceDirection(afterInBondCurrency);

  let convertedAfterApprox: BondPartyBalanceSummary['convertedAfterApprox'];
  if (!previous.matchesInvoiceCurrency && previous.convertedEquivalent) {
    const approxAfter = Math.round((previous.convertedEquivalent.amount + delta) * 100) / 100;
    convertedAfterApprox = {
      amount: approxAfter,
      currency: targetCurrency,
      direction: getBalanceDirection(approxAfter),
    };
  }

  return {
    previous,
    previousDirection,
    previousNativeInBondCurrency,
    afterInBondCurrency,
    afterDirection,
    convertedAfterApprox,
    bondCurrency: targetCurrency,
  };
};

export interface StatementRowLike {
  id?: string | undefined;
  ref?: string | null | undefined;
  reference_id?: string | null | undefined;
  debit?: number | null | undefined;
  credit?: number | null | undefined;
  balance?: number | null | undefined;
  currency?: string | null | undefined;
}

export interface VoucherBalanceSnapshot {
  previousBalance: number;
  previousDirection: BalanceDirectionInfo;
  afterBalance: number;
  afterDirection: BalanceDirectionInfo;
  currency: string;
  source: 'statement_exact' | 'live_reconstructed';
}

/**
 * Resolves exact previous & post-bond balance for an existing bond voucher
 * using the party's statement movements (matching by bond.id or payment_number).
 */
export const resolveVoucherBalanceFromStatement = (params: {
  movements: StatementRowLike[];
  bondId: string;
  paymentNumber: string;
  bondCurrency: string;
  bondType: BondType;
  bondAmount: number;
  bondStatus: 'posted' | 'draft' | 'void';
}): VoucherBalanceSnapshot | null => {
  const { movements, bondId, paymentNumber, bondCurrency, bondType, bondAmount, bondStatus } = params;
  const targetCurrency = (bondCurrency || 'SAR').toUpperCase().trim();
  if (!Array.isArray(movements) || movements.length === 0) return null;

  // Match the exact statement row for this bond
  const matched = movements.find(
    m =>
      (m.reference_id && m.reference_id === bondId) ||
      (m.ref && paymentNumber && m.ref.trim() === paymentNumber.trim())
  );

  if (matched) {
    const afterBalance = Math.round((Number(matched.balance) || 0) * 100) / 100;
    const rowDelta = (Number(matched.debit) || 0) - (Number(matched.credit) || 0);
    const previousBalance = Math.round((afterBalance - rowDelta) * 100) / 100;
    return {
      previousBalance,
      previousDirection: getBalanceDirection(previousBalance),
      afterBalance,
      afterDirection: getBalanceDirection(afterBalance),
      currency: (matched.currency || targetCurrency).toUpperCase().trim(),
      source: 'statement_exact',
    };
  }

  // Fallback: reconstruct from the latest movement balance in this currency
  const latest = movements[movements.length - 1];
  const liveBalance = Number(latest?.balance) || 0;
  const delta = computeBondBalanceDelta(bondType, bondAmount);

  if (bondStatus === 'posted') {
    const previousBalance = Math.round((liveBalance - delta) * 100) / 100;
    return {
      previousBalance,
      previousDirection: getBalanceDirection(previousBalance),
      afterBalance: Math.round(liveBalance * 100) / 100,
      afterDirection: getBalanceDirection(liveBalance),
      currency: targetCurrency,
      source: 'live_reconstructed',
    };
  }

  const afterBalance = Math.round((liveBalance + delta) * 100) / 100;
  return {
    previousBalance: Math.round(liveBalance * 100) / 100,
    previousDirection: getBalanceDirection(liveBalance),
    afterBalance,
    afterDirection: getBalanceDirection(afterBalance),
    currency: targetCurrency,
    source: 'live_reconstructed',
  };
};
