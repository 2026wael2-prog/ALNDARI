/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-optional-chain, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-explicit-any */
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import type { PartyFormData, PartyType } from './types';
import { mapToInsert, mapToUpdate } from '../../core/utils/supabaseMappers';
import { fetchAllRpcPages } from '../../core/utils/dataFetching';

const toCleanStr = (val: unknown): string | null => {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * واجهة التفاعل مع جدول العملاء والموردين
 * تتبع هيكلية قاعدة البيانات v2.0
 */
async function fetchPartyCurrencies(
  companyId: string
): Promise<Map<string, Array<{ currency: string; balance: number; transaction_count?: number }>>> {
  // Single-call JSONB RPC bypasses PostgREST's 1,000-row cap (1 round-trip instead of 4 sequential scans).
  let rows: Array<Record<string, unknown>> | null = null;
  type JsonRpcFn = (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  const { data: jsonData, error: jsonError } = await (
    supabase.rpc as unknown as JsonRpcFn
  )('get_party_currencies_by_company_json', { p_company_id: companyId });

  if (!jsonError && Array.isArray(jsonData)) {
    rows = jsonData as Array<Record<string, unknown>>;
  } else {
    const { data } = await fetchAllRpcPages(
      supabase,
      'get_party_currencies_by_company',
      { p_company_id: companyId },
      ['party_id', 'currency_code']
    );
    rows = data;
  }

  type CurrencyRow = {
    party_id?: string;
    currency_code?: string;
    balance?: number;
    transaction_count?: number;
  };

  const map = new Map<
    string,
    Array<{ currency: string; balance: number; transaction_count?: number }>
  >();
  if (rows !== null && Array.isArray(rows)) {
    (rows as CurrencyRow[]).forEach(c => {
      if (typeof c.party_id === 'string' && typeof c.currency_code === 'string') {
        const list = map.get(c.party_id) ?? [];
        const item: { currency: string; balance: number; transaction_count?: number } = {
          currency: c.currency_code,
          balance: Number(c.balance) || 0,
        };
        if (typeof c.transaction_count === 'number') {
          item.transaction_count = c.transaction_count;
        }
        list.push(item);
        map.set(c.party_id, list);
      }
    });
  }
  return map;
}

const PARTIES_PAGE_SIZE = 1000;

async function fetchAllParties(
  companyId: string,
  typeFilter: string[],
  branchId?: string | null
): Promise<{ data: Array<Record<string, unknown>>; error: PostgrestError | null }> {
  const buildPageQuery = (from: number, includeCount = false) => {
    let query = supabase
      .from('parties')
      .select(
        '*, party_categories(id, name)',
        includeCount ? { count: 'exact' } : undefined
      )
      .eq('company_id', companyId)
      .in('type', typeFilter)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PARTIES_PAGE_SIZE - 1);

    if (branchId) {
      // شمول أطراف الفرع النشط + الأطراف غير المخصصة لفرع (branch_id IS NULL)
      // حتى لا يختفي أي عميل أُنشئ بدون فرع من قوائم البحث والكشوفات والمبيعات.
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    return query;
  };

  // الصفحة الأولى مع count لتحديد عدد الصفحات المتبقية وجلبها بالتوازي بدل الانتظار المتسلسل
  const firstRes = await buildPageQuery(0, true);
  if (firstRes.error !== null) return { data: [], error: firstRes.error };
  const firstBatch = (firstRes.data || []) as Array<Record<string, unknown>>;
  if (firstBatch.length < PARTIES_PAGE_SIZE) {
    return { data: firstBatch, error: null };
  }

  const totalCount = firstRes.count ?? 0;
  if (totalCount > PARTIES_PAGE_SIZE) {
    const offsets: number[] = [];
    for (let off = PARTIES_PAGE_SIZE; off < totalCount; off += PARTIES_PAGE_SIZE) {
      offsets.push(off);
    }
    const restResults = await Promise.all(offsets.map(off => buildPageQuery(off, false)));
    const allRows = [...firstBatch];
    for (const res of restResults) {
      if (res.error !== null) return { data: [], error: res.error };
      if (Array.isArray(res.data)) allRows.push(...(res.data as Array<Record<string, unknown>>));
    }
    return { data: allRows, error: null };
  }

  // Fallback إذا لم يرجع count
  const allRows = [...firstBatch];
  let from = PARTIES_PAGE_SIZE;
  while (true) {
    const { data, error } = await buildPageQuery(from, false);
    if (error !== null) return { data: [], error };
    const batch = (data || []) as Array<Record<string, unknown>>;
    allRows.push(...batch);
    if (batch.length < PARTIES_PAGE_SIZE) break;
    from += PARTIES_PAGE_SIZE;
  }

  return { data: allRows, error: null };
}

let partyBalancesJsonRpcUnavailable = false;

export const partiesApi = {
  getParties: async (companyId: string, type: PartyType, branchId?: string | null) => {
    // 'all' → جلب جميع الأطراف بغض النظر عن النوع (عملاء وموردين وموظفين)
    const typeFilter =
      type === 'all'
        ? ['customer', 'supplier', 'both', 'employee']
        : type === 'employee'
          ? ['employee']
          : [type, 'both'];

    // جلب متزامن للأطراف والأرصدة والعملات — استخدام دالة JSONB بطلب واحد بدل 3 مسوحات متتالية
    const fetchBalances = async (): Promise<{
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    }> => {
      try {
        if (!partyBalancesJsonRpcUnavailable) {
          type JsonRpcFn = (
            fn: string,
            args: Record<string, unknown>
          ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;
          const { data: jsonData, error: jsonError } = await (
            supabase.rpc as unknown as JsonRpcFn
          )('get_party_balances_by_company_json', { p_company_id: companyId });

          if (!jsonError && Array.isArray(jsonData)) {
            return { data: jsonData as Array<Record<string, unknown>>, error: null };
          }
          if (jsonError?.code === 'PGRST202' || jsonError?.code === '42883') {
            partyBalancesJsonRpcUnavailable = true;
          }
        }

        return await fetchAllRpcPages(
          supabase,
          'get_party_balances_by_company',
          { p_company_id: companyId },
          ['party_id']
        );
      } catch (error) {
        return { data: null, error };
      }
    };

    const fetchCurrencies = async (): Promise<
      Map<string, Array<{ currency: string; balance: number; transaction_count?: number }>>
    > => {
      try {
        return await fetchPartyCurrencies(companyId);
      } catch {
        return new Map<
          string,
          Array<{ currency: string; balance: number; transaction_count?: number }>
        >();
      }
    };

    const [partiesRes, balancesRes, currencyMap] = await Promise.all([
      fetchAllParties(companyId, typeFilter, branchId),
      fetchBalances(),
      fetchCurrencies(),
    ]);

    if (partiesRes.error !== null) return { data: null, error: partiesRes.error };
    const partiesData = partiesRes.data || [];
    if (partiesData.length === 0) return { data: [], error: null };

    const balancesMap = new Map<string, Record<string, unknown>>();
    if (balancesRes && !balancesRes.error && Array.isArray(balancesRes.data)) {
      balancesRes.data.forEach(b => {
        if (typeof b.party_id === 'string' && b.party_id.length > 0) {
          balancesMap.set(b.party_id, b);
        }
      });
    }

    const mergedData = partiesData.map(p => {
      const partyId = typeof p.id === 'string' ? p.id : '';
      return {
        ...p,
        party_balances: balancesMap.has(partyId) ? [balancesMap.get(partyId)] : [],
        balances_by_currency: currencyMap.get(partyId) ?? [],
      };
    });

    return { data: mergedData, error: null };
  },

  createParty: async (data: PartyFormData, companyId: string, branchId?: string | null) => {
    const extended = data as unknown as Record<string, unknown>;

    const insertPayload = mapToInsert<'parties'>({
      company_id: companyId,
      branch_id: branchId ?? (extended.branch_id as string | undefined) ?? null,
      type: data.type,
      name: data.name,
      phone: toCleanStr(data.phone),
      email: toCleanStr(extended.email),
      tax_number: toCleanStr(extended.tax_number),
      address: toCleanStr(extended.address),
      status: toCleanStr(extended.status) ?? 'active',
      category_id: toCleanStr(extended.category_id),
    });
    return await supabase.from('parties').insert(insertPayload).select().single();
  },

  updateParty: async (id: string, data: PartyFormData) => {
    const extended = data as unknown as Record<string, unknown>;

    const updatePayload = mapToUpdate<'parties'>({
      type: data.type,
      name: data.name,
      phone: toCleanStr(data.phone),
      email: toCleanStr(extended.email),
      tax_number: toCleanStr(extended.tax_number),
      address: toCleanStr(extended.address),
      status: toCleanStr(extended.status) ?? 'active',
      category_id: toCleanStr(extended.category_id),
    });
    return await supabase.from('parties').update(updatePayload).eq('id', id).select().single();
  },

  deleteParty: async (id: string) => {
    // Safety check: prevent deleting parties with existing invoices
    const { count, error: checkError } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('party_id', id);
    if (checkError !== null) throw checkError;
    if (typeof count === 'number' && count > 0) {
      throw new Error('لا يمكن حذف طرف له فواتير مرتبطة. قم بحظره بدلاً من حذفه.');
    }
    return await supabase
      .from('parties')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
  },

  search: async (
    companyId: string,
    type: PartyType,
    query: string,
    branchId?: string | null
  ) => {
    const sanitized = query.replace(/[%_\\*()]/g, '');
    if (!sanitized.trim()) return { data: [], error: null };
    // 'all' → البحث في جميع الأطراف؛ غير ذلك نشمل 'both' أيضاً
    const typeFilter = type === 'all' ? ['customer', 'supplier', 'both'] : [type, 'both'];
    let req = supabase
      .from('parties')
      .select('*')
      .eq('company_id', companyId)
      .in('type', typeFilter)
      .is('deleted_at', null);

    if (branchId) {
      req = req.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    return await req
      .textSearch('search_vector', sanitized, {
        config: 'simple',
        type: 'plain',
      })
      .limit(10);
  },

  getTransactionDetails: async (partyId: string) => {
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, issue_date, total_amount, type, status, payment_method, currency_code, exchange_rate'
      )
      .eq('party_id', partyId)
      .order('issue_date', { ascending: true });

    if (invError) throw invError;

    const { data: payments, error: payError } = await supabase
      .from('payments')
      .select(
        'id, payment_number, payment_date, amount, type, notes, currency_code, exchange_rate, payment_method'
      )
      .eq('party_id', partyId)
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('payment_date', { ascending: true });

    if (payError) throw payError;

    const { data: journalLines, error: journalError } = await supabase
      .from('journal_entry_lines')
      .select(
        `
        id, description, debit_amount, credit_amount, currency_code, exchange_rate,
        journal_entries(id, entry_date, entry_number, reference_type, reference_id),
        account:accounts(id, code, type)
      `
      )
      .eq('party_id', partyId)
      .is('deleted_at', null);

    if (journalError) throw journalError;

    return { invoices, payments, journalLines };
  },

  // دمج طرفين مكررين ذرياً ونقل كافة الفواتير والقيود للطرف الأساسي
  mergePartiesRPC: async (companyId: string, sourcePartyId: string, targetPartyId: string) => {
    return await supabase.rpc('merge_duplicate_parties' as any, {
      p_company_id: companyId,
      p_source_id: sourcePartyId,
      p_target_id: targetPartyId,
    });
  },
};

export { customerApi } from './api/enhanced/customerApi';
