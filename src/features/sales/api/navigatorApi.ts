import { supabase } from '@/lib/supabaseClient';
import { parseError } from '@/core/utils/errorUtils';
import type { InvoiceNavSummary } from './types';

const NAV_SELECT_COLS =
  'id, invoice_number, created_at, issue_date, total_amount, currency_code, party:party_id(name)';

const mapNavSummaryRow = (row: unknown): InvoiceNavSummary | null => {
  if (!row || typeof row !== 'object') return null;
  const r = row as {
    id: string;
    invoice_number?: string | null;
    created_at?: string | null;
    issue_date?: string | null;
    total_amount?: number | string | null;
    currency_code?: string | null;
    party?: { name?: string | null } | null;
  };
  return {
    id: r.id,
    invoice_number: r.invoice_number || '',
    created_at: r.created_at || '',
    issue_date: r.issue_date || '',
    total_amount: Number(r.total_amount) || 0,
    currency_code: r.currency_code || 'SAR',
    party_name: r.party?.name || null,
  };
};

const baseSaleNavQuery = (companyId: string, branchId?: string | null) => {
  let q = supabase
    .from('invoices')
    .select(NAV_SELECT_COLS)
    .eq('company_id', companyId)
    .eq('type', 'sale')
    .neq('status', 'void')
    .is('deleted_at', null);

  if (branchId) {
    q = q.eq('branch_id', branchId);
  }
  return q;
};

export const navigatorApi = {
  getInvoiceNavigatorBoundaries: async (
    companyId: string,
    branchId?: string | null
  ): Promise<{ first: InvoiceNavSummary | null; last: InvoiceNavSummary | null }> => {
    const firstQuery = baseSaleNavQuery(companyId, branchId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1);

    const lastQuery = baseSaleNavQuery(companyId, branchId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    const [firstRes, lastRes] = await Promise.all([firstQuery, lastQuery]);
    if (firstRes.error) throw parseError(firstRes.error);
    if (lastRes.error) throw parseError(lastRes.error);

    return {
      first: mapNavSummaryRow(firstRes.data?.[0]),
      last: mapNavSummaryRow(lastRes.data?.[0]),
    };
  },

  getAdjacentInvoices: async (
    companyId: string,
    currentCreatedAt: string,
    currentId: string,
    branchId?: string | null
  ): Promise<{ prev: InvoiceNavSummary | null; next: InvoiceNavSummary | null }> => {
    const prevQuery = baseSaleNavQuery(companyId, branchId)
      .or(`created_at.lt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.lt.${currentId})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    const nextQuery = baseSaleNavQuery(companyId, branchId)
      .or(`created_at.gt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.gt.${currentId})`)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1);

    const [prevRes, nextRes] = await Promise.all([prevQuery, nextQuery]);
    if (prevRes.error) throw parseError(prevRes.error);
    if (nextRes.error) throw parseError(nextRes.error);

    return {
      prev: mapNavSummaryRow(prevRes.data?.[0]),
      next: mapNavSummaryRow(nextRes.data?.[0]),
    };
  },

  searchInvoiceForNavigation: async (
    companyId: string,
    invoiceNumber: string,
    branchId?: string | null
  ): Promise<InvoiceNavSummary | null> => {
    const cleanNum = invoiceNumber.trim();
    if (!cleanNum) return null;

    const { data: exactData, error: exactError } = await baseSaleNavQuery(companyId, branchId)
      .eq('invoice_number', cleanNum)
      .limit(1);
    if (exactError) throw parseError(exactError);

    if (exactData && exactData.length > 0) {
      return mapNavSummaryRow(exactData[0]);
    }

    const { data: likeData, error: likeError } = await baseSaleNavQuery(companyId, branchId)
      .ilike('invoice_number', `%${cleanNum}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (likeError) throw parseError(likeError);

    if (likeData && likeData.length > 0) {
      return mapNavSummaryRow(likeData[0]);
    }

    return null;
  },
};
