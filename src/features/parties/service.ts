import { parseError } from '../../core/utils/errorUtils';
import { supabase } from '../../lib/supabaseClient';
import { partiesApi } from './api';
import {
  calculatePartyStats,
  fetchPartyStatement,
  fetchStatementTransactionDetails,
  getPartyCurrencyBalance,
} from './services/partyStatementService';
import { validateAndSanitizePartyData } from './services/partyValidationService';
import type { Party, PartyCategory, PartyFormData, PartyType } from './types';

export type {
  StatementMovement,
  StatementTransactionDetails,
  StatementTransactionItem,
} from './services/statementTypes';

export const partiesService = {
  getParties: async (
    companyId: string,
    type: PartyType,
    branchId?: string | null
  ): Promise<Party[]> => {
    const { data, error } = await partiesApi.getParties(companyId, type, branchId);
    if (error) throw error;
    return (data || []).map((p: Record<string, unknown>) => {
      const balanceRecords = p.party_balances as Array<{ balance: number; type: string }> | null;
      const firstRecord = balanceRecords?.[0];
      const balance = firstRecord ? firstRecord.balance : 0;
      const balancesByCurrency = (p.balances_by_currency as Party['balances_by_currency']) ?? [];
      const sar_balance = getPartyCurrencyBalance(
        { balance, balances_by_currency: balancesByCurrency },
        'SAR'
      );
      const yer_balance = getPartyCurrencyBalance(
        { balance, balances_by_currency: balancesByCurrency },
        'YER'
      );
      return {
        ...p,
        category_id: p.category_id,
        category: (p.party_categories as Record<string, unknown>)?.name || 'عام',
        balance,
        sar_balance,
        yer_balance,
        balances_by_currency: balancesByCurrency,
        status: p.status || 'active',
      };
    }) as Party[];
  },

  getStatement: fetchPartyStatement,

  getTransactionDetails: fetchStatementTransactionDetails,

  getCategoriesWithStats: async (companyId: string, type: PartyType): Promise<PartyCategory[]> => {
    const { data: categories, error: catError } = await supabase
      .from('party_categories')
      .select('*')
      .eq('company_id', companyId)
      .eq('type', type)
      .order('name', { ascending: true });

    if (catError) throw catError;

    const { data: parties } = await partiesApi.getParties(companyId, type);
    const partyList = Array.isArray(parties) ? parties : [];

    return (Array.isArray(categories) ? categories : []).map((cat: Record<string, unknown>) => {
      const matchingParties = partyList.filter(
        (p: Record<string, unknown>) => p.category_id === cat.id
      );
      const totalBalance = matchingParties.reduce((sum: number, p: Record<string, unknown>) => {
        const bal = (p.party_balances as Array<{ balance: number }> | null)?.[0]?.balance ?? 0;
        return sum + bal;
      }, 0);
      return {
        id: cat.id as string,
        name: cat.name as string,
        type: cat.type as PartyType,
        count: matchingParties.length,
        totalBalance,
      };
    });
  },

  calculateStats: calculatePartyStats,

  saveParty: async (
    companyId: string,
    data: PartyFormData,
    id?: string,
    branchId?: string | null
  ) => {
    const sanitizedData = await validateAndSanitizePartyData(companyId, data, id);

    try {
      if (id) {
        const { error } = await partiesApi.updateParty(id, sanitizedData);
        if (error) throw parseError(error);
      } else {
        const effectiveBranchId =
          branchId ?? (data as { branch_id?: string | null }).branch_id ?? null;
        const { error } = await partiesApi.createParty(sanitizedData, companyId, effectiveBranchId);
        if (error) throw parseError(error);
      }
    } catch (error: unknown) {
      throw error instanceof Error ? error : parseError(error);
    }
  },

  deleteParty: async (id: string) => {
    const { error } = await partiesApi.deleteParty(id);
    if (error) throw parseError(error);
  },

  saveCategory: async (companyId: string, data: { name: string; type: PartyType }, id?: string) => {
    try {
      if (id) {
        const { data: result, error } = await supabase
          .from('party_categories')
          .update({ name: data.name })
          .eq('id', id)
          .select()
          .single();
        if (error) throw parseError(error);
        return result;
      }
      const { data: result, error } = await supabase
        .from('party_categories')
        .insert({ company_id: companyId, name: data.name, type: data.type })
        .select()
        .single();
      if (error) throw parseError(error);
      return result;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        throw new Error('عذراً، هذا الاسم موجود مسبقاً في قائمة الفئات');
      }
      throw error instanceof Error ? error : parseError(error);
    }
  },

  deleteCategory: async (id: string) => {
    const { error } = await supabase.from('party_categories').delete().eq('id', id);
    if (error) throw parseError(error);
    return true;
  },

  search: async (companyId: string, type: PartyType, query: string) => {
    const { data, error } = await partiesApi.search(companyId, type, query);
    if (error) throw parseError(error);
    return (data || []) as unknown as Party[];
  },

  getCompanyDetails: async (companyId: string) => {
    const { data, error } = await supabase
      .from('companies')
      .select('name_ar, address, phone, tax_number, logo_url')
      .eq('id', companyId)
      .single();
    if (error) throw parseError(error);
    return data;
  },

  getOrCreateGeneralParty: async (companyId: string, type: PartyType): Promise<Party> => {
    const name = type === 'customer' ? 'الزبون العام' : 'المورد العام';
    const { data: searchResults, error: searchError } = await partiesApi.search(
      companyId,
      type,
      name
    );
    if (searchError) throw parseError(searchError);

    const existing = (searchResults || []).find((p: Record<string, unknown>) => p.name === name);
    if (existing) return existing as unknown as Party;

    const { data: created, error: createError } = await partiesApi.createParty(
      {
        name,
        type: type === 'all' ? 'customer' : type,
        status: 'active',
      },
      companyId
    );

    if (createError) throw parseError(createError);
    return created as unknown as Party;
  },
};
