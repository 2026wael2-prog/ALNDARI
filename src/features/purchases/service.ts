import { purchasesApi } from './api';
import type { CreatePurchaseDTO, PurchaseInvoiceResponse, PurchaseStats } from './types';
import { purchaseAccountingService } from './services/purchaseAccounting';
import { messagingService } from '../notifications/messagingService';
import { toBaseCurrency } from '../../core/utils/currencyUtils';
import { validatePurchasePayload, assertValid } from '../../core/utils/validationUtils';
import { logger } from '../../core/utils/logger';
import { resolveStrictPaymentAccount, type RoutableAccount } from '../../core/utils/accountRouting';
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

type PurchaseStatsPayload = PurchaseStats & {
  topSuppliers?: unknown;
  chartData?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asSupplierRows = (value: unknown): SupplierAnalyticsRow[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(row => ({
    name: typeof row.name === 'string' ? row.name : '',
    value: asNumber(row.value),
  }));
};

const asTrendRows = (value: unknown): PurchaseTrendRow[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(row => ({
    date: typeof row.date === 'string' ? row.date : '',
    amount: asNumber(row.amount),
  }));
};

const asPurchaseStats = (value: unknown): PurchaseStatsPayload => {
  if (!isRecord(value)) {
    return {
      invoiceCount: 0,
      totalPurchases: 0,
      pendingPaymentCount: 0,
      totalDebt: 0,
    };
  }

  return {
    invoiceCount: asNumber(value.invoiceCount),
    totalPurchases: asNumber(value.totalPurchases),
    pendingPaymentCount: asNumber(value.pendingPaymentCount),
    totalDebt: asNumber(value.totalDebt),
    topSuppliers: value.topSuppliers,
    chartData: value.chartData,
  };
};

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
  getPurchases: async (companyId: string, branchId?: string | null, limit = 150) => {
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
    const limit = params.limit ?? 500;
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

  getStats: async (companyId: string, branchId?: string | null) => {
    const { data, error } = await supabase.rpc('get_purchase_stats', {
      p_company_id: companyId,
      ...(branchId !== undefined && branchId !== null && branchId !== ''
        ? { p_branch_id: branchId }
        : {}),
    });
    if (error) {
      logger.error('PurchaseService', 'Error fetching purchase stats', { companyId, error });
      throw error;
    }

    const result = asPurchaseStats(data);
    return {
      invoiceCount: result.invoiceCount,
      totalPurchases: result.totalPurchases,
      pendingPaymentCount: result.pendingPaymentCount,
      totalDebt: result.totalDebt,
    };
  },

  getAnalytics: async (companyId: string, branchId?: string | null) => {
    const { data, error } = await supabase.rpc('get_purchase_stats', {
      p_company_id: companyId,
      ...(branchId !== undefined && branchId !== null && branchId !== ''
        ? { p_branch_id: branchId }
        : {}),
    });
    if (error) {
      logger.error('PurchaseService', 'Error fetching purchase analytics', { companyId, error });
      return { topSuppliers: [], chartData: [] };
    }

    const result = asPurchaseStats(data);
    return {
      topSuppliers: asSupplierRows(result.topSuppliers),
      chartData: asTrendRows(result.chartData),
    };
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
