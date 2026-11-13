import { purchasesApi } from './api';
import type { CreatePurchaseDTO, PurchaseInvoiceResponse, PurchaseStats } from './types';
import { purchaseAccountingService } from './services/purchaseAccounting';
import { messagingService } from '../notifications/messagingService';
import { toBaseCurrency } from '../../core/utils/currencyUtils';
import { validatePurchasePayload, assertValid } from '../../core/utils/validationUtils';
import { logger } from '../../core/utils/logger';
import { resolveStrictPaymentAccount, type RoutableAccount } from '../../core/utils/accountRouting';
import { batchLookupParties } from '../../core/utils/dataFetching';
import { accountsService } from '../accounting/services/accountsService';
import { supabase } from '../../lib/supabaseClient';

type PurchaseListResponse = Awaited<ReturnType<typeof purchasesApi.getPurchases>>;
export type PurchaseListRow = NonNullable<PurchaseListResponse['data']>[number];
export interface SupplierAnalyticsRow {
  name: string;
  value: number;
}

export interface PurchaseTrendRow {
  date: string;
  amount: number;
}

export interface PurchaseStatsFilters {
  branchId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  currency?: 'ALL' | 'SAR' | 'YER';
  paymentType?: 'ALL' | 'cash' | 'credit' | 'bank' | 'network';
}

const isPurchaseReturn = (purchase: PurchaseListRow): boolean =>
  purchase.type === 'purchase_return';

/** Converts a purchase amount to base currency without throwing on bad rates. */
const safeToBase = (purchase: PurchaseListRow): number => {
  try {
    return toBaseCurrency({
      amount: purchase.total_amount,
      currency_code: purchase.currency_code,
      exchange_rate: purchase.exchange_rate,
    });
  } catch (err) {
    logger.warn('PurchaseService', 'Invalid exchange rate — purchase amount treated as 0', {
      currency_code: purchase.currency_code,
      exchange_rate: purchase.exchange_rate,
      error: err,
    });
    return 0;
  }
};

export { purchasesApi };

export const purchasesService = {
  getPurchases: async (companyId: string, branchId?: string | null, limit = 80) => {
    const { data, error } = await purchasesApi.getPurchases(companyId, branchId, limit);
    if (error) throw error;
    type RawRow = NonNullable<typeof data>[number];
    return (data ?? []).map((row: RawRow) => {
      const party = row.party as { phone?: string | null } | null;
      const items = Array.isArray(row.invoice_items) ? row.invoice_items : [];
      return {
        ...row,
        party_phone: party?.phone ?? null,
        matched_items: items.map(item => {
          const prod = item.product as {
            name_ar?: string | null;
            sku?: string | null;
            part_number?: string | null;
            brand?: string | null;
          } | null;
          return {
            id: item.id,
            product_id: item.product_id ?? '',
            product_name: prod?.name_ar ?? item.description ?? 'صنف غير محدد',
            sku: prod?.sku ?? null,
            part_number: prod?.part_number ?? null,
            brand: prod?.brand ?? null,
            quantity: item.quantity ?? 0,
            unit_price: (item.cost_price ?? item.unit_price) ?? 0,
            total: item.total ?? 0,
            is_direct_match: false,
          };
        }),
      };
    });
  },

  searchPurchases: async (
    companyId: string,
    params: {
      query?: string | undefined;
      dateFrom?: string | undefined;
      dateTo?: string | undefined;
      status?: string | undefined;
      paymentMethod?: string | undefined;
      branchId?: string | null | undefined;
      type?: string | undefined;
      page?: number | undefined;
      limit?: number | undefined;
    }
  ) => {
    const page = params.page ?? 0;
    const limit = params.limit ?? 80;
    const offset = page * limit;

    const rows = await purchasesApi.searchPurchasesAdvanced(companyId, {
      type: params.type,
      query: params.query,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      status: params.status,
      paymentMethod: params.paymentMethod,
      branchId: params.branchId,
      limit,
      offset,
    });

    return rows.map(r => ({
      id: r.id,
      invoice_number: r.invoice_number,
      party: r.party_name ? { name: r.party_name, phone: r.party_phone ?? null } : null,
      party_phone: r.party_phone ?? null,

      issue_date: r.issue_date,
      total_amount: r.total_amount ?? 0,
      currency_code: r.currency_code,
      exchange_rate: r.exchange_rate ?? 1,
      status: r.status,
      type: r.type,
      payment_method: r.payment_method,
      notes: r.notes ?? null,
      reference_invoice_id: r.reference_invoice_id ?? null,
      reference_invoice: null as { id: string; invoice_number: string } | null,
      return_reason: null as string | null,
      created_at: r.issue_date,
      invoice_items: [] as Array<{
        id: string;
        product_id: string | null;
        cost_price: number | null;
        quantity: number;
        unit_price: number;
        total: number;
        description: string | null;
        product: {
          id: string;
          name_ar: string | null;
          sku: string | null;
          part_number: string | null;
          brand: string | null;
        } | null;
      }>,

      item_count: r.item_count ?? 0,
      matched_items: Array.isArray(r.matched_items)
        ? r.matched_items.map((item) => ({
            id: item.id ?? '',
            product_id: item.product_id ?? '',
            product_name: item.product_name ?? '',
            sku: item.sku ?? null,
            part_number: item.part_number ?? null,
            brand: item.brand ?? null,
            quantity: Number(item.quantity ?? 0),
            unit_price: Number(item.unit_price ?? 0),
            total: Number(item.total ?? 0),
            is_direct_match: Boolean(item.is_direct_match),
          }))
        : [],
      total_matching_count: r.total_matching_count ?? 0,
    }));
  },

  processPurchase: async (data: CreatePurchaseDTO, companyId: string, userId: string) => {
    assertValid(
      validatePurchasePayload({
        items: data.items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          costPrice: i.costPrice,
        })),
        issueDate: data.issueDate,
      })
    );

    // Strict multi-currency and payment method resolution:
    // - Credit (آجل): credits AP (2100). If paidAmount > 0, cashAccountId is also resolved to fund down payment
    // - Cash (نقداً): resolved strictly to currency cashbox (SAR -> صندوق الريال السعودي, YER -> صندوق الريال اليمني)
    let finalCashAccountId = data.cashAccountId;
    const hasPartialPayment = (data.paidAmount ?? 0) > 0;
    if (data.paymentMethod !== 'credit' || hasPartialPayment) {
      const accounts = await accountsService.getAccounts(companyId);
      finalCashAccountId = resolveStrictPaymentAccount(
        accounts as unknown as RoutableAccount[],
        'cash',
        data.currency || 'SAR',
        data.cashAccountId
      );
    }

    const enhancedData: CreatePurchaseDTO = {
      ...data,
      cashAccountId:
        data.paymentMethod === 'credit' && !hasPartialPayment ? undefined : finalCashAccountId,
      bankAccountId:
        data.paymentMethod === 'credit' && !hasPartialPayment ? undefined : data.bankAccountId,
    };

    const result = await purchasesApi.createPurchaseRPC(companyId, userId, enhancedData);

    {
      const typedResult = result as unknown as PurchaseInvoiceResponse;
      // Include per-line discounts so notifications match the screen total.
      const totalAmount = data.items.reduce(
        (sum, item) => sum + Math.max(0, item.quantity * item.costPrice - (item.discount ?? 0)),
        0
      );

      // Fire-and-forget verification: warns if the RPC did not create the
      // journal entry (never blocks the save flow).
      void purchaseAccountingService.handleNewPurchase(
        typedResult.id,
        data,
        companyId,
        userId,
        totalAmount
      );

      messagingService.notify(
        companyId,
        'purchase',
        {
          invoiceNumber: typedResult.invoice_number,
          supplierName: 'مورد',
          amount: totalAmount,
          currency: data.currency ?? 'YER',
          date: new Date().toLocaleDateString('en-GB'),
          paymentMethod: data.paymentMethod,
          itemCount: data.items.length,
        },
        typedResult.id
      );
    }

    return result;
  },

  processPurchaseReturn: async (data: CreatePurchaseDTO, companyId: string, userId: string) =>
    purchasesApi.createPurchaseReturnRPC(companyId, userId, data),

  getStats: async (
    companyId: string,
    branchIdOrFilters?: string | null | PurchaseStatsFilters
  ): Promise<PurchaseStats> => {
    const filters: PurchaseStatsFilters =
      typeof branchIdOrFilters === 'string' || branchIdOrFilters === null
        ? { branchId: branchIdOrFilters }
        : (branchIdOrFilters ?? {});

    let query = supabase
      .from('invoices')
      .select(
        'id, type, total_amount, paid_amount, issue_date, payment_method, currency_code, exchange_rate, status'
      )
      .eq('company_id', companyId)
      .in('type', ['purchase', 'purchase_return'])
      .neq('status', 'void')
      .neq('status', 'cancelled')
      .is('deleted_at', null);

    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }
    if (filters.currency && filters.currency !== 'ALL') {
      query = query.eq('currency_code', filters.currency);
    }
    if (filters.paymentType && filters.paymentType !== 'ALL') {
      query = query.eq('payment_method', filters.paymentType);
    }
    if (filters.startDate) {
      query = query.gte('issue_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('issue_date', filters.endDate);
    }

    const { data: invRows, error } = await query;
    if (error) {
      logger.error('PurchaseService', 'Error fetching purchase stats', { companyId, error });
      throw error;
    }

    let invoiceCount = 0;
    let totalPurchases = 0;
    let pendingPaymentCount = 0;
    let totalDebt = 0;

    let totalPurchasesSAR = 0;
    let totalPurchasesYER = 0;
    let totalDebtSAR = 0;
    let totalDebtYER = 0;
    let cashPurchasesSAR = 0;
    let cashPurchasesYER = 0;
    let creditPurchasesSAR = 0;
    let creditPurchasesYER = 0;

    for (const r of invRows || []) {
      const amt = r.total_amount ?? 0;
      const paid = r.paid_amount ?? 0;
      const debt = Math.max(0, amt - paid);
      const rate = r.exchange_rate ?? 1;
      const curr = (r.currency_code || 'SAR').toUpperCase();
      const method = r.payment_method || 'cash';

      let baseAmt = amt;
      let baseDebt = debt;
      if (filters.currency && filters.currency !== 'ALL') {
        baseAmt = amt;
        baseDebt = debt;
      } else {
        try {
          baseAmt = toBaseCurrency({ amount: amt, currency_code: curr, exchange_rate: rate });
          baseDebt = toBaseCurrency({ amount: debt, currency_code: curr, exchange_rate: rate });
        } catch {
          baseAmt = amt;
          baseDebt = debt;
        }
      }

      if (r.type === 'purchase') {
        invoiceCount += 1;
        totalPurchases += baseAmt;
        // Cash invoices are already paid at purchase; only non-cash invoices carry unpaid debt.
        if (method !== 'cash') {
          totalDebt += baseDebt;
          if (debt > 0 || r.status !== 'paid') {
            pendingPaymentCount += 1;
          }
          if (curr === 'SAR') {
            totalDebtSAR += debt;
          } else if (curr === 'YER') {
            totalDebtYER += debt;
          }
        }

        if (curr === 'SAR') {
          totalPurchasesSAR += amt;
          if (method === 'cash') cashPurchasesSAR += amt;
          else if (method === 'credit') creditPurchasesSAR += amt;
        } else if (curr === 'YER') {
          totalPurchasesYER += amt;
          if (method === 'cash') cashPurchasesYER += amt;
          else if (method === 'credit') creditPurchasesYER += amt;
        }
      } else if (r.type === 'purchase_return') {
        totalPurchases -= baseAmt;
        if (method !== 'cash') {
          totalDebt -= baseDebt;
          if (curr === 'SAR') totalDebtSAR -= debt;
          else if (curr === 'YER') totalDebtYER -= debt;
        }
        if (curr === 'SAR') totalPurchasesSAR -= amt;
        else if (curr === 'YER') totalPurchasesYER -= amt;
      }
    }

    // Subtract unallocated supplier payment/disbursement/discount bonds so they reduce totalDebt
    if (filters.paymentType !== 'cash') {
      let payQuery = supabase
        .from('payments')
        .select('id, amount, currency_code, exchange_rate, party:parties!inner(type)')
        .eq('company_id', companyId)
        .in('type', ['disbursement', 'payment'])
        .eq('status', 'posted')
        .is('deleted_at', null)
        .in('party.type', ['supplier', 'both']);

      if (filters.branchId) payQuery = payQuery.eq('branch_id', filters.branchId);
      if (filters.currency && filters.currency !== 'ALL') {
        payQuery = payQuery.eq('currency_code', filters.currency);
      }
      if (filters.startDate) payQuery = payQuery.gte('payment_date', filters.startDate);
      if (filters.endDate) payQuery = payQuery.lte('payment_date', filters.endDate);

      const { data: payRows } = await payQuery;
      if (payRows && payRows.length > 0) {
        const paymentIds = payRows.map(p => p.id);
        const { data: allocRows } = await supabase
          .from('payment_allocations')
          .select('payment_id, amount')
          .eq('company_id', companyId)
          .in('payment_id', paymentIds);

        const allocMap = new Map<string, number>();
        for (const a of allocRows || []) {
          allocMap.set(a.payment_id, (allocMap.get(a.payment_id) ?? 0) + (a.amount ?? 0));
        }

        for (const p of payRows) {
          const unalloc = Math.max(0, (p.amount ?? 0) - (allocMap.get(p.id) ?? 0));
          if (unalloc <= 0) continue;
          const pCurr = (p.currency_code || 'SAR').toUpperCase();
          const pRate = p.exchange_rate ?? 1;
          let baseUnalloc = unalloc;
          if (!filters.currency || filters.currency === 'ALL') {
            try {
              baseUnalloc = toBaseCurrency({ amount: unalloc, currency_code: pCurr, exchange_rate: pRate });
            } catch {
              baseUnalloc = unalloc;
            }
          }
          totalDebt -= baseUnalloc;
          if (pCurr === 'SAR') totalDebtSAR -= unalloc;
          else if (pCurr === 'YER') totalDebtYER -= unalloc;
        }
      }
    }

    return {
      invoiceCount,
      totalPurchases,
      pendingPaymentCount,
      totalDebt: Math.max(0, totalDebt),
      totalPurchasesSAR,
      totalPurchasesYER,
      totalDebtSAR: Math.max(0, totalDebtSAR),
      totalDebtYER: Math.max(0, totalDebtYER),
      cashPurchasesSAR,
      cashPurchasesYER,
      creditPurchasesSAR,
      creditPurchasesYER,
    };
  },

  getAnalytics: async (
    companyId: string,
    branchIdOrFilters?: string | null | PurchaseStatsFilters
  ) => {
    const filters: PurchaseStatsFilters =
      typeof branchIdOrFilters === 'string' || branchIdOrFilters === null
        ? { branchId: branchIdOrFilters }
        : (branchIdOrFilters ?? {});

    let query = supabase
      .from('invoices')
      .select('id, type, total_amount, issue_date, currency_code, exchange_rate, party_id')
      .eq('company_id', companyId)
      .eq('type', 'purchase')
      .neq('status', 'void')
      .neq('status', 'cancelled')
      .is('deleted_at', null);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.currency && filters.currency !== 'ALL') query = query.eq('currency_code', filters.currency);
    if (filters.paymentType && filters.paymentType !== 'ALL') query = query.eq('payment_method', filters.paymentType);
    if (filters.startDate) query = query.gte('issue_date', filters.startDate);
    if (filters.endDate) query = query.lte('issue_date', filters.endDate);

    const { data: invRows, error } = await query;
    if (error) {
      logger.error('PurchaseService', 'Error fetching purchase analytics', { companyId, error });
      return { topSuppliers: [], chartData: [] };
    }

    const supplierMap = new Map<string, { name: string; value: number }>();
    const trendMap = new Map<string, number>();

    for (const r of invRows || []) {
      const amt = r.total_amount ?? 0;
      const rate = r.exchange_rate ?? 1;
      let baseAmt = amt;
      if (filters.currency && filters.currency !== 'ALL') {
        baseAmt = amt;
      } else {
        try {
          baseAmt = toBaseCurrency({
            amount: amt,
            currency_code: r.currency_code || 'SAR',
            exchange_rate: rate,
          });
        } catch {
          baseAmt = amt;
        }
      }

      const partyId = r.party_id;
      if (partyId) {
        const sEntry = supplierMap.get(partyId) ?? { name: 'مورد', value: 0 };
        sEntry.value += baseAmt;
        supplierMap.set(partyId, sEntry);
      }

      const day = r.issue_date || '';
      if (day) {
        trendMap.set(day, (trendMap.get(day) ?? 0) + baseAmt);
      }
    }

    // Fast decoupled batch lookup for top 8 supplier names
    const topSupplierEntries = Array.from(supplierMap.entries())
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 8);
    const topSupplierIds = topSupplierEntries.map(([id]) => id);

    if (topSupplierIds.length > 0) {
      const partyMap = await batchLookupParties(topSupplierIds, supabase);
      for (const entry of topSupplierEntries) {
        const found = partyMap.get(entry[0]);
        if (found) entry[1].name = found.name;
      }
    }

    const topSuppliers: SupplierAnalyticsRow[] = topSupplierEntries.map(([, v]) => ({
      name: v.name,
      value: v.value,
    }));

    const chartData: PurchaseTrendRow[] = Array.from(trendMap.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { topSuppliers, chartData };
  },

  getPurchaseReturns: async (companyId: string, branchId?: string | null) => {
    const { data, error } = await purchasesApi.getPurchases(companyId, branchId);
    if (error) throw error;
    return data.filter(isPurchaseReturn);
  },

  getPurchaseReturnsStats: async (companyId: string, branchId?: string | null) => {
    const { data, error } = await purchasesApi.getPurchases(companyId, branchId);
    if (error) {
      logger.error('PurchaseService', 'Error in getPurchaseReturnsStats', { error });
      throw error;
    }

    const returns = data.filter(
      p => isPurchaseReturn(p) && p.status !== 'void' && p.status !== 'cancelled'
    );
    const totalReturns = returns.reduce((sum, purchase) => sum + safeToBase(purchase), 0);
    const pendingCount = returns.filter(
      purchase => purchase.status === 'draft' || purchase.status === 'pending'
    ).length;

    return {
      returnCount: returns.length,
      totalReturns,
      pendingCount,
    };
  },
};
