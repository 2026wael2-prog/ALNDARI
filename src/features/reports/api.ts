import { supabase } from '../../lib/supabaseClient';

// Typed result shapes for Supabase queries
interface AccountWithLines {
  id: string;
  code: string;
  name_ar: string;
  type: string;
  balance: number;
  journal_entry_lines?: Array<{
    debit_amount: number;
    credit_amount: number;
    journal_entries: { entry_date: string; status: string };
  }>;
}

interface PartyInvoice {
  invoice_number: string | null;
  issue_date: string;
  total_amount: number | null;
  type: string;
  status: string;
}

interface PartyJournal {
  debit_amount: number | null;
  credit_amount: number | null;
  description: string | null;
  journal_entries: {
    entry_number: number;
    entry_date: string;
    description: string | null;
    status: string;
  };
}

interface JournalLineRaw {
  id: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  account_id: string;
  account: { id: string; code: string; name_ar: string; type: string };
  journal: {
    id: string;
    entry_date: string;
    entry_number: number;
    status: string;
    company_id: string;
  };
}

interface PartyWithBalance {
  id: string;
  name: string;
  type: string;
  balance: number;
}

export const reportsApi = {
  /**
   * Fetch accounting data with journal lines
   */
  getAccountingData: async (companyId: string, branchId?: string | null) => {
    let accountsQuery = supabase
      .from('accounts')
      .select(
        `
          id, code, name_ar, type,
          journal_entry_lines (
            debit_amount, credit_amount,
            journal_entries!inner ( entry_date, status, branch_id )
          )
        `
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('journal_entry_lines.journal_entries.status', 'posted');

    if (branchId) {
      accountsQuery = accountsQuery.eq('journal_entry_lines.journal_entries.branch_id', branchId);
    }

    const [{ data: accounts }, balancesRes] = await Promise.all([
      accountsQuery,
      branchId
        ? Promise.resolve({ data: null })
        : supabase.from('account_balances').select('account_id, balance').eq('company_id', companyId),
    ]);

    if (!accounts) return { data: null, error: { message: 'Failed to fetch accounts' } };

    const balanceMap = new Map(
      (balancesRes.data ?? []).map(b => [b.account_id, Number(b.balance)])
    );

    const merged = accounts.map(a => {
      if (branchId) {
        const lines = (a.journal_entry_lines ?? []) as Array<{
          debit_amount: number | null;
          credit_amount: number | null;
        }>;
        const net = lines.reduce(
          (sum, l) => sum + Number(l.debit_amount ?? 0) - Number(l.credit_amount ?? 0),
          0
        );
        return { ...a, balance: net };
      }
      return {
        ...a,
        balance: (balanceMap.get(a.id) ?? 0) !== 0 ? (balanceMap.get(a.id) ?? 0) : 0,
      };
    });

    return {
      data: merged as AccountWithLines[],
      error: null,
    };
  },

  // استخدام دالة SQL المحسنة لجلب ميزان المراجعة
  getTrialBalanceRPC: async (
    companyId: string,
    fromDate: string,
    toDate: string,
    branchId?: string | null
  ) => {
    return await supabase.rpc('report_trial_balance', {
      p_company_id: companyId,
      p_from: fromDate,
      p_to: toDate,
      ...(branchId ? { p_branch_id: branchId } : {}),
    });
  },

  // تشغيل محرك التدقيق والرقابة المحاسبية الذاتي
  auditErpIntegrityRPC: async (companyId: string) => {
    return await supabase.rpc('fn_audit_erp_integrity' as any, {
      p_company_id: companyId,
    });
  },

  // جلب كشف حساب لجهة معينة (عميل أو مورد)
  getPartyLedger: async (partyId: string) => {
    const { data: invoices } = (await supabase
      .from('invoices')
      .select('invoice_number, issue_date, total_amount, type, status')
      .eq('party_id', partyId)
      .neq('status', 'void')
      .order('issue_date', { ascending: true })) as unknown as { data: PartyInvoice[] | null };

    const { data: journals } = (await supabase
      .from('journal_entry_lines')
      .select(
        `
        debit_amount, credit_amount, description,
        journal_entries!inner ( entry_number, entry_date, description, status )
      `
      )
      .eq('party_id', partyId)
      .eq('journal_entries.status', 'posted')
      .order('journal_entries(entry_date)', { ascending: true })) as unknown as {
      data: PartyJournal[] | null;
    };

    return { invoices, journals };
  },

  // جلب البيانات الخام للتقارير المخصصة الأخرى عند الحاجة
  getJournalLinesRaw: async (
    companyId: string,
    fromDate?: string,
    toDate?: string,
    branchId?: string | null
  ) => {
    let query = supabase
      .from('journal_entry_lines')
      .select(
        `
        id, debit_amount, credit_amount, description, account_id,
        account:accounts!inner(id, code, name_ar, type),
        journal:journal_entries!inner(id, entry_date, entry_number, status, company_id, branch_id)
      `
      )
      .eq('journal.company_id', companyId)
      .eq('journal.status', 'posted');

    if (branchId) query = query.eq('journal.branch_id', branchId);
    if (fromDate) query = query.gte('journal.entry_date', fromDate);
    if (toDate) query = query.lte('journal.entry_date', toDate);

    return (await query) as unknown as {
      data: JournalLineRaw[] | null;
      error: { message: string } | null;
    };
  },

  getPartiesWithBalances: async (companyId: string, branchId?: string | null) => {
    let partiesQuery = supabase
      .from('parties')
      .select('id, name, type')
      .eq('company_id', companyId)
      .is('deleted_at', null);

    if (branchId) {
      partiesQuery = partiesQuery.eq('branch_id', branchId);
    }

    const [{ data: parties }, { data: balances }] = await Promise.all([
      partiesQuery,
      supabase.rpc('get_party_balances_by_company', {
        p_company_id: companyId,
      }),
    ]);

    if (!parties) return { data: null, error: { message: 'Failed to fetch parties' } };

    const balanceMap = new Map((balances ?? []).map(b => [b.party_id, Number(b.balance)]));

    const merged = parties.map(p => ({
      ...p,
      balance: balanceMap.get(p.id) ?? 0,
    }));

    return { data: merged as PartyWithBalance[], error: null };
  },

  getCompanyCurrency: async (companyId: string) => {
    return (await supabase
      .from('companies')
      .select('base_currency')
      .eq('id', companyId)
      .single()) as unknown as {
      data: { base_currency: string } | null;
      error: { message: string } | null;
    };
  },

  getDebtAgingInvoices: async (companyId: string, branchId?: string | null) => {
    // [CROSS-BRANCH FIX] Exclude internal cross-branch invoices (suffixed -INT)
    // They are cost-price transfers, not real customer debts.
    let query = supabase
      .from('invoices')
      .select(
        'id, invoice_number, issue_date, due_date, total_amount, paid_amount, status, type, party_id, parties(name, type), currency_code, exchange_rate'
      )
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('payment_method', 'cash')
      .is('deleted_at', null)
      .not('invoice_number', 'ilike', '%-INT')
      .in('status', ['posted', 'confirmed', 'partially_paid']);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    return (await query.order('due_date', { ascending: true })) as unknown as {
      data: Array<{
        id: string;
        invoice_number: string | null;
        issue_date: string;
        due_date: string | null;
        total_amount: number;
        paid_amount: number;
        status: string;
        type: string;
        party_id: string | null;
        parties: { name: string; type: string } | null;
        currency_code: string | null;
        exchange_rate: number | null;
      }> | null;
      error: { message: string } | null;
    };
  },

  /**
   * Fetch unpaid credit sales returns and posted customer receipt bonds (with allocations)
   * so Debt Aging deducts unallocated bonds and credit returns per AGENTS.md Rule 3.
   */
  getDebtAgingCredits: async (companyId: string, branchId?: string | null) => {
    let returnsQuery = supabase
      .from('invoices')
      .select('id, party_id, total_amount, paid_amount, currency_code, exchange_rate')
      .eq('company_id', companyId)
      .in('type', ['sale_return', 'return_sale'])
      .neq('payment_method', 'cash')
      .is('deleted_at', null)
      .not('invoice_number', 'ilike', '%-INT')
      .in('status', ['posted', 'confirmed', 'partially_paid']);

    if (branchId) {
      returnsQuery = returnsQuery.eq('branch_id', branchId);
    }

    let receiptsQuery = supabase
      .from('payments')
      .select('id, party_id, amount, currency_code, exchange_rate, parties!inner(type)')
      .eq('company_id', companyId)
      .eq('type', 'receipt')
      .eq('status', 'posted')
      .is('deleted_at', null)
      .in('parties.type', ['customer', 'both']);

    if (branchId) {
      receiptsQuery = receiptsQuery.eq('branch_id', branchId);
    }

    const [returnsRes, receiptsRes] = await Promise.all([returnsQuery, receiptsQuery]);
    if (returnsRes.error) return { creditReturns: [], unallocatedReceipts: [], error: returnsRes.error };
    if (receiptsRes.error) return { creditReturns: [], unallocatedReceipts: [], error: receiptsRes.error };

    const receiptRows = (receiptsRes.data || []) as Array<{
      id: string;
      party_id: string | null;
      amount: number;
      currency_code: string | null;
      exchange_rate: number | null;
    }>;

    const allocMap = new Map<string, number>();
    if (receiptRows.length > 0) {
      const paymentIds = receiptRows.map(r => r.id);
      const { data: allocRows, error: allocError } = await supabase
        .from('payment_allocations')
        .select('payment_id, amount')
        .eq('company_id', companyId)
        .in('payment_id', paymentIds);

      if (allocError) return { creditReturns: [], unallocatedReceipts: [], error: allocError };

      for (const a of (allocRows || []) as Array<{ payment_id: string; amount: number }>) {
        allocMap.set(a.payment_id, (allocMap.get(a.payment_id) ?? 0) + (a.amount ?? 0));
      }
    }

    const unallocatedReceipts = receiptRows
      .map(r => ({
        party_id: r.party_id,
        unallocated_amount: Math.max(0, (r.amount || 0) - (allocMap.get(r.id) ?? 0)),
        currency_code: r.currency_code,
        exchange_rate: r.exchange_rate,
      }))
      .filter(r => r.unallocated_amount > 0.01);

    return {
      creditReturns: (returnsRes.data || []) as Array<{
        id: string;
        party_id: string | null;
        total_amount: number;
        paid_amount: number;
        currency_code: string | null;
        exchange_rate: number | null;
      }>,
      unallocatedReceipts,
      error: null,
    };
  },

  getDailySalesInvoices: async (
    companyId: string,
    fromDateISO: string,
    branchId?: string | null
  ) => {
    // [CROSS-BRANCH FIX] Exclude internal cross-branch invoices (suffixed -INT)
    // from daily sales totals to prevent double-counting revenue.
    let query = supabase
      .from('invoices')
      .select(
        'id, invoice_number, issue_date, total_amount, status, type, party_id, parties(name), exchange_rate, currency_code'
      )
      .eq('company_id', companyId)
      .in('type', ['sale', 'sale_return', 'return_sale'])
      .neq('status', 'void')
      .is('deleted_at', null)
      .not('invoice_number', 'ilike', '%-INT')
      .gte('issue_date', fromDateISO);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    return (await query.order('issue_date', { ascending: false })) as unknown as {
      data: Array<{
        id: string;
        invoice_number: string | null;
        issue_date: string;
        total_amount: number;
        status: string;
        type: string;
        party_id: string | null;
        parties: { name: string } | null;
        exchange_rate: number | null;
        currency_code: string | null;
      }> | null;
      error: { message: string } | null;
    };
  },

  getOperationalExpensesLines: async (
    companyId: string,
    fromDateISO: string,
    branchId?: string | null
  ) => {
    let query = supabase
      .from('journal_entry_lines')
      .select(
        `
          id, debit_amount, credit_amount, description, branch_id,
          account:accounts!inner(id, code, name_ar, type),
          journal:journal_entries!inner(id, entry_date, status, company_id, branch_id)
        `
      )
      .eq('journal.company_id', companyId)
      .eq('journal.status', 'posted')
      .is('deleted_at', null)
      .is('journal.deleted_at', null)
      .eq('account.type', 'expense')
      .neq('account.code', '5100')
      .not('account.code', 'like', '51%')
      .gte('journal.entry_date', fromDateISO);

    if (branchId) {
      query = query.eq('journal.branch_id', branchId);
    }

    return await query;
  },
};
