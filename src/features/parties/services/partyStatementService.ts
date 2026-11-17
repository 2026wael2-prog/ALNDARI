import { optArg } from '@/core/utils/rpcArgs';
import { logger } from '../../../core/utils/logger';
import { supabase } from '../../../lib/supabaseClient';
import type { Party, PartyStats, PartyType } from '../types';
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

/** Computes aggregate counts, receivable/payable totals, and currency breakdowns for parties. */
export function calculatePartyStats(parties: Party[], _type: PartyType = 'customer'): PartyStats {
  const activeCount = parties.filter(p => (p.status ?? 'active') === 'active').length;
  const blockedCount = parties.filter(p => p.status === 'blocked').length;

  let totalReceivable = 0;
  let totalPayable = 0;
  let totalBalance = 0;

  for (const p of parties) {
    const b = p.balance ?? 0;
    totalBalance += b;
    if (b > 0) {
      totalReceivable += b;
    } else if (b < 0) {
      totalPayable += Math.abs(b);
    }
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
        if (bc.balance !== 0) {
          recordCurrencyBalance(bc.currency, bc.balance);
        }
      }
    } else if (p.balance !== undefined && p.balance !== 0) {
      recordCurrencyBalance('SAR', p.balance);
    }
  }

  const byCurrency = Array.from(currMap.entries()).map(([currency, item]) => ({
    currency,
    balance: item.total,
    count: item.count,
  }));

  return {
    totalCount: parties.length,
    totalBalance,
    totalReceivable,
    totalPayable,
    activeCount,
    blockedCount,
    byCurrency,
  };
}
