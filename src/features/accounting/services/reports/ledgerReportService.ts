import type { LedgerEntry } from '../../types/index';
import { supabase } from '../../../../lib/supabaseClient';
import { isRecord } from './accountClassifiers';

interface LedgerRpcLine {
  entry_date: string | undefined;
  journal_id: string | undefined;
  entry_number: number | undefined;
  branch_id?: string | null | undefined;
  description: string | undefined;
  debit_amount: number | undefined;
  credit_amount: number | undefined;
  balance: number | undefined;
  foreign_balance?: number | undefined;
  currency_code: string | undefined;
  exchange_rate: number | undefined;
  foreign_amount: number | undefined;
  party_id: string | undefined;
  party_name: string | undefined;
  reference_type?: string | undefined;
  reference_id?: string | undefined;
}

interface LedgerRpcResult {
  entries?: LedgerRpcLine[];
}

const toLedgerResult = (value: unknown): LedgerRpcResult => {
  if (!isRecord(value) || !Array.isArray(value.entries)) return { entries: [] };
  return {
    entries: value.entries.filter(isRecord).map(line => ({
      entry_date: typeof line.entry_date === 'string' ? line.entry_date : undefined,
      journal_id: typeof line.journal_id === 'string' ? line.journal_id : undefined,
      entry_number: typeof line.entry_number === 'number' ? line.entry_number : undefined,
      description: typeof line.description === 'string' ? line.description : undefined,
      debit_amount: typeof line.debit_amount === 'number' ? line.debit_amount : undefined,
      credit_amount: typeof line.credit_amount === 'number' ? line.credit_amount : undefined,
      balance: typeof line.balance === 'number' ? line.balance : undefined,
      foreign_balance: typeof line.foreign_balance === 'number' ? line.foreign_balance : undefined,
      currency_code: typeof line.currency_code === 'string' ? line.currency_code : undefined,
      exchange_rate: typeof line.exchange_rate === 'number' ? line.exchange_rate : undefined,
      foreign_amount: typeof line.foreign_amount === 'number' ? line.foreign_amount : undefined,
      branch_id: typeof line.branch_id === 'string' ? line.branch_id : undefined,
      party_id: typeof line.party_id === 'string' ? line.party_id : undefined,
      party_name: typeof line.party_name === 'string' ? line.party_name : undefined,
      reference_type: typeof line.reference_type === 'string' ? line.reference_type : undefined,
      reference_id: typeof line.reference_id === 'string' ? line.reference_id : undefined,
    })),
  };
};

export async function getLedger(
  companyId: string,
  accountId: string,
  branchId?: string | null,
  fromDate?: string,
  toDate?: string
): Promise<LedgerEntry[]> {
  const { data, error } = await supabase.rpc('get_account_ledger', {
    p_company_id: companyId,
    p_account_id: accountId,
    ...(fromDate ? { p_from: fromDate } : {}),
    ...(toDate ? { p_to: toDate } : {}),
    ...(branchId ? { p_branch_id: branchId } : {}),
  });
  if (error) throw error;

  const result = toLedgerResult(data);
  const rawData = data as unknown as {
    openingBalance?: number | null;
    openingForeignBalance?: number | null;
    foreignBalance?: number | null;
    currencyCode?: string | null;
    accountType?: string | null;
  } | null;

  const openingBalance = Number(rawData?.openingBalance ?? 0);
  const openingForeignBalance = Number(rawData?.openingForeignBalance ?? 0);
  const accountCurrency = rawData?.currencyCode ?? 'SAR';
  const accountType = rawData?.accountType ?? undefined;

  const entries = (result.entries ?? []).map((line: LedgerRpcLine) => ({
    date: line.entry_date ?? '',
    journal_id: line.journal_id ?? '',
    journal_entry_id: line.journal_id ?? '',
    entry_number: line.entry_number ?? 0,
    description: line.description ?? '',
    debit_amount: line.debit_amount ?? 0,
    credit_amount: line.credit_amount ?? 0,
    balance: line.balance ?? 0,
    foreign_balance: line.foreign_balance ?? (line.currency_code === 'SAR' ? line.balance : 0),
    ...(accountType ? { accountType } : {}),
    currency_code: line.currency_code ?? accountCurrency,
    exchange_rate: line.exchange_rate ?? 1,
    foreign_amount: line.foreign_amount ?? 0,
    ...(line.branch_id != null ? { branch_id: line.branch_id } : {}),
    ...(line.party_id ? { party_id: line.party_id } : {}),
    ...(line.party_name ? { party_name: line.party_name } : {}),
    ...(line.reference_type ? { reference_type: line.reference_type } : {}),
    ...(line.reference_id ? { reference_id: line.reference_id } : {}),
  }));

  if (openingBalance !== 0 || openingForeignBalance !== 0) {
    entries.unshift({
      date: fromDate || '',
      journal_id: '',
      journal_entry_id: '',
      entry_number: 0,
      description: 'رصيد افتتاحي',
      debit_amount: 0,
      credit_amount: 0,
      balance: openingBalance,
      foreign_balance: openingForeignBalance,
      ...(accountType ? { accountType } : {}),
      currency_code: accountCurrency,
      exchange_rate: 1,
      foreign_amount: 0,
    });
  }

  return entries;
}
