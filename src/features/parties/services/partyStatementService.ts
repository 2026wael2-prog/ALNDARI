import { optArg } from '@/core/utils/rpcArgs';
import { logger } from '../../../core/utils/logger';
import { supabase } from '../../../lib/supabaseClient';
import type {
  Party,
  PartyBalanceClassification,
  PartyCurrencyBalance,
  PartyCurrencyFilter,
  PartyCurrencyStat,
  PartyStats,
  PartyType,
} from '../types';
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

export const PARTY_BALANCE_EPSILON = 0.01;
const CURRENCY_ORDER: Record<string, number> = { SAR: 0, YER: 1, USD: 2, OMR: 3 };

/**
 * يعيد الرصيد الدقيق للطرف في عملة محددة فقط (مثلاً SAR أو YER) دون خلط أو تحويل عملات أخرى.
 */
export function getPartyCurrencyBalance(
  party: Pick<Party, 'balance' | 'balances_by_currency'>,
  currencyCode: string
): number {
  const target = (currencyCode || 'SAR').toUpperCase().trim();
  const list = party.balances_by_currency;
  if (Array.isArray(list) && list.length > 0) {
    let total = 0;
    for (const item of list) {
      if ((item.currency || 'SAR').toUpperCase().trim() === target) {
        total += Number(item.balance) || 0;
      }
    }
    return Math.abs(total) > PARTY_BALANCE_EPSILON ? Math.round(total * 100) / 100 : 0;
  }
  // Fallback فقط لعملة الأساس SAR عندما لا تتوفر مصفوفة تفصيل العملات
  if (target === 'SAR') {
    const val = Number(party.balance) || 0;
    return Math.abs(val) > PARTY_BALANCE_EPSILON ? Math.round(val * 100) / 100 : 0;
  }
  return 0;
}

/** يعيد جميع العملات النشطة (غير الصفرية) للطرف مرتبةً (SAR ثم YER ثم البقية). */
export function getPartyActiveCurrencies(
  party: Pick<Party, 'balance' | 'balances_by_currency'>
): PartyCurrencyBalance[] {
  const map = new Map<string, number>();
  if (Array.isArray(party.balances_by_currency) && party.balances_by_currency.length > 0) {
    for (const item of party.balances_by_currency) {
      const code = (item.currency || 'SAR').toUpperCase().trim();
      map.set(code, (map.get(code) ?? 0) + (Number(item.balance) || 0));
    }
  } else if (party.balance !== undefined && Math.abs(Number(party.balance) || 0) > PARTY_BALANCE_EPSILON) {
    map.set('SAR', Number(party.balance) || 0);
  }

  return Array.from(map.entries())
    .filter(([, bal]) => Math.abs(bal) > PARTY_BALANCE_EPSILON)
    .map(([currency, bal]) => ({ currency, balance: Math.round(bal * 100) / 100 }))
    .sort((a, b) => (CURRENCY_ORDER[a.currency] ?? 99) - (CURRENCY_ORDER[b.currency] ?? 99));
}

/** هل لدى الطرف أرصدة نشطة في أكثر من عملة في آنٍ واحد (مثل SAR و YER معاً)؟ */
export function hasMultipleActiveCurrencies(
  party: Pick<Party, 'balance' | 'balances_by_currency'>
): boolean {
  return getPartyActiveCurrencies(party).length > 1;
}

/**
 * Canonical per-currency balance classifier:
 * - Never silently nets opposite-sign SAR & YER balances.
 * - `debtor`: at least one currency > 0.01 and no currency < -0.01
 * - `creditor`: at least one currency < -0.01 and no currency > 0.01
 * - `mixed_currency`: positive in one currency AND negative in another
 * - `settled`: all currencies within ±0.01
 */
export function classifyPartyBalance(
  party: Pick<Party, 'balance' | 'balances_by_currency'>
): PartyBalanceClassification {
  const entries =
    party.balances_by_currency && party.balances_by_currency.length > 0
      ? party.balances_by_currency.map(bc => Number(bc.balance) || 0)
      : [Number(party.balance) || 0];

  let hasPositive = false;
  let hasNegative = false;
  for (const val of entries) {
    if (val > PARTY_BALANCE_EPSILON) hasPositive = true;
    else if (val < -PARTY_BALANCE_EPSILON) hasNegative = true;
  }

  if (hasPositive && hasNegative) return 'mixed_currency';
  if (hasPositive) return 'debtor';
  if (hasNegative) return 'creditor';
  return 'settled';
}

export type PartyListStatusFilter =
  | 'all'
  | 'debtors'
  | 'creditors'
  | 'mixed'
  | 'settled'
  | 'active'
  | 'blocked';

/**
 * فلترة الأطراف بدقة حسب العملة وحالة المديونية:
 * - عند اختيار SAR أو YER، تُحتسب المديونية والدائنية من رصيد تلك العملة وحدها (دون خلط).
 * - عند اختيار MIXED، يُعرض العملاء ذوو الأرصدة النشطة في أكثر من عملة معاً.
 */
export function filterPartiesStrict(params: {
  parties: Party[];
  currencyFilter: PartyCurrencyFilter;
  statusFilter: PartyListStatusFilter;
  selectedCategory?: string;
}): Party[] {
  const { parties, currencyFilter, statusFilter, selectedCategory = 'all' } = params;

  return parties.filter(p => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) {
      return false;
    }

    // 1. Currency scope filter
    if (currencyFilter === 'SAR') {
      const sar = getPartyCurrencyBalance(p, 'SAR');
      if (Math.abs(sar) <= PARTY_BALANCE_EPSILON) return false;
    } else if (currencyFilter === 'YER') {
      const yer = getPartyCurrencyBalance(p, 'YER');
      if (Math.abs(yer) <= PARTY_BALANCE_EPSILON) return false;
    } else if (currencyFilter === 'MIXED') {
      if (!hasMultipleActiveCurrencies(p)) return false;
    }

    // 2. Status / debt filter strictly scoped to the selected currency
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return (p.status ?? 'active') === 'active';
    if (statusFilter === 'blocked') return p.status === 'blocked';

    if (currencyFilter === 'SAR' || currencyFilter === 'YER') {
      const curBal = getPartyCurrencyBalance(p, currencyFilter);
      if (statusFilter === 'debtors') return curBal > PARTY_BALANCE_EPSILON;
      if (statusFilter === 'creditors') return curBal < -PARTY_BALANCE_EPSILON;
      if (statusFilter === 'settled') return Math.abs(curBal) <= PARTY_BALANCE_EPSILON;
      if (statusFilter === 'mixed') return classifyPartyBalance(p) === 'mixed_currency';
      return true;
    }

    const cls = classifyPartyBalance(p);
    if (statusFilter === 'debtors') return cls === 'debtor' || (cls === 'mixed_currency' && (p.balance ?? 0) > PARTY_BALANCE_EPSILON);
    if (statusFilter === 'creditors') return cls === 'creditor' || (cls === 'mixed_currency' && (p.balance ?? 0) < -PARTY_BALANCE_EPSILON);
    if (statusFilter === 'mixed') return cls === 'mixed_currency';
    if (statusFilter === 'settled') return cls === 'settled';
    return true;
  });
}

/** Computes aggregate counts, receivable/payable totals, and strict per-currency breakdowns for parties. */
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
    if (b > PARTY_BALANCE_EPSILON) {
      totalReceivable += b;
    } else if (b < -PARTY_BALANCE_EPSILON) {
      totalPayable += Math.abs(b);
    }

    const cls = classifyPartyBalance(p);
    if (cls === 'debtor') debtorCount += 1;
    else if (cls === 'creditor') creditorCount += 1;
    else if (cls === 'mixed_currency') mixedCurrencyCount += 1;
    else settledCount += 1;
  }

  const currMap = new Map<
    string,
    {
      total: number;
      receivable: number;
      payable: number;
      count: number;
      debtorCount: number;
      creditorCount: number;
    }
  >();

  const recordCurrencyBalance = (currency: string, balance: number) => {
    const code = (currency || 'SAR').toUpperCase().trim();
    const entry = currMap.get(code) ?? {
      total: 0,
      receivable: 0,
      payable: 0,
      count: 0,
      debtorCount: 0,
      creditorCount: 0,
    };
    entry.total += balance;
    entry.count += 1;
    if (balance > PARTY_BALANCE_EPSILON) {
      entry.receivable += balance;
      entry.debtorCount += 1;
    } else if (balance < -PARTY_BALANCE_EPSILON) {
      entry.payable += Math.abs(balance);
      entry.creditorCount += 1;
    }
    currMap.set(code, entry);
  };

  for (const p of parties) {
    const active = getPartyActiveCurrencies(p);
    for (const bc of active) {
      recordCurrencyBalance(bc.currency, bc.balance);
    }
  }

  const byCurrency: PartyCurrencyStat[] = Array.from(currMap.entries())
    .map(([currency, item]) => ({
      currency,
      balance: Math.round(item.total * 100) / 100,
      receivable: Math.round(item.receivable * 100) / 100,
      payable: Math.round(item.payable * 100) / 100,
      count: item.count,
      debtorCount: item.debtorCount,
      creditorCount: item.creditorCount,
    }))
    .sort((a, b) => (CURRENCY_ORDER[a.currency] ?? 99) - (CURRENCY_ORDER[b.currency] ?? 99));

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
