import { optArg } from '@/core/utils/rpcArgs';
import { logger } from '../../../core/utils/logger';
import { supabase } from '../../../lib/supabaseClient';
import type { Party, PartyBalanceClassification, PartyStats, PartyType } from '../types';
import type { StatementMovement, StatementTransactionDetails } from './statementTypes';

interface RawStatementRpcRow {
  line_id: string;
  entry_date: string;
  ref: string;
  operation_type?: string;
  description: string;
  type: string;
  debit: number | string | null;
  credit: number | string | null;
  currency: string;
  balance: number | string | null;
  debit_base?: number | string | null;
  credit_base?: number | string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  payment_status?: string | null;
  paid_amount?: number | string | null;
  remaining_amount?: number | string | null;
  items_count?: number | string | null;
  is_bf?: number | null;
}

export interface StatementQueryOptions {
  startDate?: string;
  endDate?: string;
  currencyCode?: string;
  companyId?: string;
  branchId?: string | null;
}

/** Fetches enriched server-side statement movements for a customer or supplier. */
export async function fetchPartyStatement(
  partyId: string,
  _type: PartyType,
  options?: StatementQueryOptions,
  explicitCompanyId?: string
): Promise<StatementMovement[]> {
  let companyId = explicitCompanyId ?? options?.companyId;

  if (!companyId) {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (userId) {
      const { data: roles } = await supabase
        .from('user_company_roles')
        .select('company_id')
        .eq('user_id', userId)
        .limit(1);
      companyId = roles?.[0]?.company_id;
    }
  }

  if (!companyId) return [];

  const { data, error } = await supabase.rpc('get_party_statement', {
    p_company_id: companyId,
    p_party_id: partyId,
    ...optArg('p_from_date', options?.startDate),
    ...optArg('p_to_date', options?.endDate),
    ...optArg(
      'p_currency_code',
      options?.currencyCode && options.currencyCode !== 'ALL' ? options.currencyCode : null
    ),
  });
  if (error) throw error;

  const rows = (data as unknown as RawStatementRpcRow[]) || [];
  return rows.map((m): StatementMovement => ({
    id: m.line_id,
    date: m.entry_date,
    ref: m.ref,
    operation_type: m.operation_type ?? '',
    desc: m.description,
    type: m.type,
    debit: Number(m.debit) || 0,
    credit: Number(m.credit) || 0,
    currency: m.currency,
    balance: Number(m.balance) || 0,
    debit_base: Number(m.debit_base) || 0,
    credit_base: Number(m.credit_base) || 0,
    reference_id: m.reference_id || null,
    reference_type: m.reference_type || null,
    payment_status: (m.payment_status as StatementMovement['payment_status']) ?? undefined,
    paid_amount: Number(m.paid_amount) || 0,
    remaining_amount: Number(m.remaining_amount) || 0,
    items_count: Number(m.items_count) || 0,
    is_bf: Number(m.is_bf) || 0,
  }));
}

/** Fetches full line-level details for an invoice, bond, or journal row in a statement. */
export async function fetchStatementTransactionDetails(
  companyId: string,
  referenceType: string,
  referenceId: string
): Promise<StatementTransactionDetails | null> {
  if (!companyId) return null;

  const { data, error } = await supabase.rpc('get_statement_transaction_details', {
    p_company_id: companyId,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
  });
  if (error) {
    logger.error('partiesService', 'Failed to fetch transaction details', error);
    return null;
  }
  return data as StatementTransactionDetails | null;
}

const BALANCE_EPSILON = 0.01;

/**
 * Canonical per-currency balance classifier:
 * - Never silently nets opposite-sign SAR & YER balances.
 * - `debtor`: at least one currency > 0.01 and no currency < -0.01
 * - `creditor`: at least one currency < -0.01 and no currency > 0.01
 * - `mixed_currency`: positive in one currency AND negative in another
 * - `settled`: all currencies within ±0.01
 */
export function classifyPartyBalance(party: Pick<Party, 'balance' | 'balances_by_currency'>): PartyBalanceClassification {
  const entries =
    party.balances_by_currency && party.balances_by_currency.length > 0
      ? party.balances_by_currency.map(bc => Number(bc.balance) || 0)
      : [Number(party.balance) || 0];

  let hasPositive = false;
  let hasNegative = false;
  for (const val of entries) {
    if (val > BALANCE_EPSILON) hasPositive = true;
    else if (val < -BALANCE_EPSILON) hasNegative = true;
  }

  if (hasPositive && hasNegative) return 'mixed_currency';
  if (hasPositive) return 'debtor';
  if (hasNegative) return 'creditor';
  return 'settled';
}

/** Computes aggregate counts, receivable/payable totals, and currency breakdowns for parties. */
export function calculatePartyStats(parties: Party[], _type: PartyType = 'customer'): PartyStats {
  const activeCount = parties.filter(p => (p.status ?? 'active') === 'active').length;
  const blockedCount = parties.filter(p => p.status === 'blocked').length;

  let totalReceivable = 0;
  let totalPayable = 0;
  let totalBalance = 0;
  let debtorCount = 0;
  let creditorCount = 0;
  let mixedCurrencyCount = 0;
  let settledCount = 0;

  for (const p of parties) {
    const b = p.balance ?? 0;
    totalBalance += b;
    if (b > BALANCE_EPSILON) {
      totalReceivable += b;
    } else if (b < -BALANCE_EPSILON) {
      totalPayable += Math.abs(b);
    }

    const cls = classifyPartyBalance(p);
    if (cls === 'debtor') debtorCount += 1;
    else if (cls === 'creditor') creditorCount += 1;
    else if (cls === 'mixed_currency') mixedCurrencyCount += 1;
    else settledCount += 1;
  }

  const currMap = new Map<string, { total: number; count: number }>();
  const recordCurrencyBalance = (currency: string, balance: number) => {
    const entry = currMap.get(currency) ?? { total: 0, count: 0 };
    entry.total += balance;
    entry.count += 1;
    currMap.set(currency, entry);
  };

  for (const p of parties) {
    if (p.balances_by_currency && p.balances_by_currency.length > 0) {
      for (const bc of p.balances_by_currency) {
        if (Math.abs(bc.balance) > BALANCE_EPSILON) {
          recordCurrencyBalance(bc.currency, bc.balance);
        }
      }
    } else if (p.balance !== undefined && Math.abs(p.balance) > BALANCE_EPSILON) {
      recordCurrencyBalance('SAR', p.balance);
    }
  }

  const byCurrency = Array.from(currMap.entries()).map(([currency, item]) => ({
    currency,
    balance: Math.round(item.total * 100) / 100,
    count: item.count,
  }));

  return {
    totalCount: parties.length,
    totalBalance: Math.round(totalBalance * 100) / 100,
    totalReceivable: Math.round(totalReceivable * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
    activeCount,
    blockedCount,
    debtorCount,
    creditorCount,
    mixedCurrencyCount,
    settledCount,
    byCurrency,
  };
}
