import type { Account, AccountFormData } from '../types/index';
import { accountsApi } from '../api/accountsApi';
// Fix: Added missing supabase import
import { supabase } from '../../../lib/supabaseClient';
import { parseError } from '../../../core/utils/errorUtils';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { fetchAllRpcPages } from '../../../core/utils/dataFetching';

// دليل الحسابات الافتراضي (بالريال السعودي) — يستخدمه seedDefaultAccounts
const DEFAULT_CHART_OF_ACCOUNTS: Array<{
  code: string;
  name_ar: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parent?: string;
}> = [
  { code: '1000', name_ar: 'الأصول', type: 'asset' },
  { code: '1010', name_ar: 'الصناديق', type: 'asset', parent: '1000' },
  { code: '1020', name_ar: 'البنوك', type: 'asset', parent: '1000' },
  { code: '1030', name_ar: 'شركات الصرافة', type: 'asset', parent: '1000' },
  { code: '1100', name_ar: 'ذمم العملاء', type: 'asset', parent: '1000' },
  { code: '1200', name_ar: 'المخزون', type: 'asset', parent: '1000' },
  { code: '2000', name_ar: 'الخصوم', type: 'liability' },
  { code: '2100', name_ar: 'ذمم الموردين', type: 'liability', parent: '2000' },
  { code: '2200', name_ar: 'ضريبة القيمة المضافة', type: 'liability', parent: '2000' },
  { code: '3000', name_ar: 'حقوق الملكية', type: 'equity' },
  { code: '3100', name_ar: 'رأس المال', type: 'equity', parent: '3000' },
  { code: '3900', name_ar: 'رصيد افتتاحي', type: 'equity', parent: '3000' },
  { code: '4000', name_ar: 'الإيرادات', type: 'revenue' },
  { code: '4100', name_ar: 'المبيعات', type: 'revenue', parent: '4000' },
  { code: '5000', name_ar: 'المصروفات', type: 'expense' },
  { code: '5100', name_ar: 'تكلفة البضاعة المباعة', type: 'expense', parent: '5000' },
];

// Verification point
export const accountsService = {
  getAccounts: async (
    companyId: string,
    options?: { includeBalances?: boolean; branchId?: string | null }
  ): Promise<Account[]> => {
    // جلب متزامن لهيكل الحسابات وأرصدتها التراكمية وعزل صناديق الفروع الأخرى
    const accountsPromise = accountsApi.getAccounts(companyId);
    const balancesPromise = options?.includeBalances
      ? fetchAllRpcPages(
          supabase,
          'report_account_balances',
          {
            p_company_id: companyId,
            p_as_of_date: formatLocalDate(),
            ...(options.branchId ? { p_branch_id: options.branchId } : {}),
          },
          ['account_id']
        )
      : Promise.resolve({ data: null, error: null });

    const otherBranchTreasuryPromise = options?.branchId
      ? (supabase.rpc as unknown as (
          fn: string,
          params: Record<string, unknown>
        ) => Promise<{ data: Array<{ account_id: string }> | null; error: unknown }>)(
          'fn_get_other_branch_treasury_account_ids',
          { p_company_id: companyId, p_branch_id: options.branchId }
        ).catch(() => ({ data: null, error: null }))
      : Promise.resolve({ data: null, error: null });

    const [accountsRes, balancesRes, otherBranchRes] = await Promise.all([
      accountsPromise,
      balancesPromise,
      otherBranchTreasuryPromise,
    ]);

    if (accountsRes.error) throw parseError(accountsRes.error);
    if (balancesRes.error) throw parseError(balancesRes.error);

    const otherBranchTreasuryIds = new Set<string>(
      (otherBranchRes?.data ?? [])
        .map(r => r.account_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const balanceMap = new Map<string, number>();
    const foreignBalanceMap = new Map<string, number>();
    const totalDebitMap = new Map<string, number>();
    const totalCreditMap = new Map<string, number>();
    if (options?.includeBalances && balancesRes.data) {
      for (const row of balancesRes.data) {
        const r = row as {
          account_id: string;
          balance?: number | null;
          foreign_balance?: number | null;
          total_debit?: number | null;
          total_credit?: number | null;
        };
        balanceMap.set(r.account_id, Number(r.balance) || 0);
        foreignBalanceMap.set(r.account_id, Number(r.foreign_balance) || 0);
        if (r.total_debit !== undefined && r.total_debit !== null) {
          totalDebitMap.set(r.account_id, Number(r.total_debit) || 0);
        }
        if (r.total_credit !== undefined && r.total_credit !== null) {
          totalCreditMap.set(r.account_id, Number(r.total_credit) || 0);
        }
      }
    }

    // Map to Account model — exclude cashboxes/exchange companies owned by other branches
    return (accountsRes.data ?? [])
      .filter(acc => !otherBranchTreasuryIds.has(acc.id))
      .map(acc => {
      // report_trial_balance returns flat `balance = SUM(debit) - SUM(credit)`
      // for every account type. Normalise the sign by type so that
      // liabilities / equity / revenue appear as positive CREDIT balances
      // (standard accounting presentation) instead of negative numbers.
      const rawBalance = balanceMap.get(acc.id) ?? 0;
      const rawForeignBalance = foreignBalanceMap.get(acc.id) ?? 0;
      const totalDebit = totalDebitMap.get(acc.id);
      const totalCredit = totalCreditMap.get(acc.id);
      const isCreditNormal =
        acc.type === 'liability' || acc.type === 'equity' || acc.type === 'revenue';
      return {
        id: acc.id,
        company_id: acc.company_id,
        code: acc.code,
        name: acc.name_ar,
        type: acc.type as Account['type'],
        balance: isCreditNormal ? -rawBalance : rawBalance,
        foreign_balance: isCreditNormal ? -rawForeignBalance : rawForeignBalance,
        ...(totalDebit !== undefined ? { total_debit: totalDebit } : {}),
        ...(totalCredit !== undefined ? { total_credit: totalCredit } : {}),
        currency_code: acc.currency_code || 'SAR',
        is_system: acc.is_system,
        parent_id: acc.parent_id ?? undefined,
        allow_posting: acc.allow_posting ?? true,
      };
    });
  },

  createAccount: async (data: AccountFormData, companyId: string): Promise<Account> => {
    const { data: account, error } = await accountsApi.createAccount({
      company_id: companyId,
      code: data.code,
      name_ar: data.name,
      type: data.type,
      parent_id: data.parent_id || null,
      currency_code: data.currency_code ?? 'SAR',
      is_system: false,
    });

    if (error) throw parseError(error);

    return {
      id: account.id,
      company_id: account.company_id,
      code: account.code,
      name: account.name_ar,
      type: account.type as Account['type'],
      balance: 0,
      currency_code: account.currency_code,
      is_system: account.is_system,
      parent_id: account.parent_id ?? undefined,
    };
  },

  // حذف حساب من دليل الحسابات — يعبر عبر accountsApi الذري (RPC + fallback)
  deleteAccount: async (companyId: string, id: string, isSystem: boolean) => {
    if (isSystem) throw new Error('لا يمكن حذف حساب نظام');
    await accountsApi.deleteAccount(companyId, id);
  },

  // Fix: Added missing seedDefaultAccounts method
  // إنشاء دليل الحسابات الافتراضي — إدراج الرموز الناقصة فقط (idempotent)
  seedDefaultAccounts: async (companyId: string) => {
    const { data: existing } = await supabase
      .from('accounts')
      .select('code')
      .eq('company_id', companyId)
      .is('deleted_at', null);
    const existingCodes = new Set(existing?.map(a => a.code) || []);
    const codeToId = new Map<string, string>();

    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      if (existingCodes.has(acc.code)) {
        const { data: row } = await supabase
          .from('accounts')
          .select('id')
          .eq('company_id', companyId)
          .eq('code', acc.code)
          .maybeSingle();
        if (row) codeToId.set(acc.code, row.id);
        continue;
      }

      const { data: created, error } = await supabase
        .from('accounts')
        .insert({
          company_id: companyId,
          code: acc.code,
          name_ar: acc.name_ar,
          type: acc.type,
          currency_code: 'SAR',
          is_system: true,
          parent_id: typeof acc.parent === 'string' ? (codeToId.get(acc.parent) ?? null) : null,
        })
        .select()
        .single();
      if (error) throw error;
      codeToId.set(acc.code, created.id);
    }

    return true;
  },

  seedSubCashboxes: async (companyId: string) => {
    const { data, error } = await (supabase.rpc as Function)('seed_sub_cashboxes_atomic', {
      p_company_id: companyId,
    });
    if (error) throw error;
    return Boolean(data ?? true);
  },

  seedYemeniExchanges: async (companyId: string) => {
    const { data, error } = await (supabase.rpc as Function)('seed_yemeni_exchanges_atomic', {
      p_company_id: companyId,
    });
    if (error) throw error;
    return Boolean(data ?? true);
  },

  findAccountByCode: async (companyId: string, code: string) => {
    // Fix: supabase is now imported
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('company_id', companyId)
      .eq('code', code)
      .single();
    return data;
  },
};
