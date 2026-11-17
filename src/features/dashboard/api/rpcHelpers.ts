import { supabase } from '@/lib/supabaseClient';
import { logger } from '../../../core/utils/logger';
import type {
  DashResult,
  RawDebtFollowupRow,
  RawLowStockProduct,
  RawProductCategory,
  RawRecentExpense,
  RawRecentInvoice,
  RawTopCustomer,
  RawTopPayload,
  RawTopProduct,
  RawTopSellingProduct,
  SummaryRow,
} from './types';

// Session cache for RPCs missing from Postgres schema (prevents repeat 404 PGRST202 storms)
const missingDashboardRpcs = new Set<string>();

function toDetail(value: string | object | null | undefined): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}

/** Wrapper around supabase.rpc that short-circuits known-missing functions. */
export function dashboardRpc(name: string, args: Record<string, unknown>, signal: AbortSignal) {
  if (missingDashboardRpcs.has(name)) {
    return Promise.resolve({
      data: null,
      error: { message: `${name} unavailable (previously failed)` },
    });
  }
  return (
    supabase.rpc as unknown as (
      fn: string,
      params: Record<string, unknown>
    ) => ReturnType<typeof supabase.rpc>
  )
    .call(supabase, name, args)
    .abortSignal(signal);
}

function isAbort(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; message?: string };
  if (anyErr.name === 'AbortError') return true;
  return typeof anyErr.message === 'string' && anyErr.message.toLowerCase().includes('abort');
}

export function safeData<T>(result: DashResult, fallback: T, name = 'RPC'): T {
  if (result.status === 'fulfilled') {
    if (result.value.error) {
      const err = result.value.error;
      if (isAbort(err)) return fallback;
      const detail = toDetail(err.message);
      if (err.code === 'PGRST202') {
        missingDashboardRpcs.add(name);
      }
      logger.logOnce(
        'warn',
        'api',
        `[Dashboard API] ${name} unavailable, using fallback: ${detail}`,
        { name, error: detail }
      );
      return fallback;
    }
    return result.value.data !== null ? (result.value.data as T) : fallback;
  }

  const reason = result.reason as { name?: string; message?: string } | null | undefined;
  if (isAbort(reason)) return fallback;
  const detail = toDetail(reason?.message);
  logger.logOnce('warn', 'api', `[Dashboard API] ${name} rejected, using fallback: ${detail}`, {
    name,
    error: detail,
  });
  return fallback;
}

export const EMPTY_RAW_DASHBOARD_DATA = {
  summary: {} as SummaryRow,
  salesChart: [] as unknown[],
  topData: {
    top_products: [] as ReturnType<typeof mapTopProducts>,
    top_customers: [] as ReturnType<typeof mapTopCustomers>,
  },
  lowStockProducts: [] as { id: string; name: string; quantity: number; min_quantity: number }[],
  categoryData: [] as unknown[],
  trialBalanceRows: [] as unknown[],
  profitLossRows: [] as unknown[],
  topSellingProducts: [] as RawTopSellingProduct[],
  productCategories: [] as RawProductCategory[],
  recentInvoices: [] as RawRecentInvoice[],
  recentExpenses: [] as RawRecentExpense[],
  overdueInvoices: [] as { id: string; partyName: string; daysOverdue: number }[],
};

const mapTopProducts = (items: RawTopProduct[] | null | undefined) =>
  Array.isArray(items)
    ? items.map((p: RawTopProduct, i: number) => ({
        id: p?.id ?? p?.sku ?? `prod-${String(i)}`,
        name: p?.name ?? p?.name_ar ?? 'غير معروف',
        part_number: p?.part_number ?? null,
        brand: p?.brand ?? null,
        sku: p?.sku ?? '',
        category_name: p?.category_name ?? null,
        revenue: p?.total_revenue ?? p?.revenue ?? 0,
        quantity: p?.total_quantity ?? p?.quantity ?? 0,
        cost: p?.total_cost ?? p?.cost ?? 0,
        gross_profit: p?.gross_profit ?? 0,
        margin_percentage: p?.margin_percentage ?? 0,
        revenue_yer: p?.total_revenue_yer ?? p?.revenue_yer,
        cost_yer: p?.total_cost_yer ?? p?.cost_yer,
        gross_profit_yer: p?.gross_profit_yer,
        price: p?.price ?? 0,
        current_stock: p?.current_stock ?? 0,
        min_stock_level: p?.min_stock_level ?? 0,
        is_low_stock: Boolean(p?.is_low_stock),
        is_out_of_stock: Boolean(p?.is_out_of_stock),
        value: p?.total_quantity ?? p?.quantity ?? 0,
      }))
    : [];

const mapTopCustomers = (items: RawTopCustomer[] | null | undefined) =>
  Array.isArray(items)
    ? items.map((cu: RawTopCustomer, i: number) => ({
        id: cu?.id ?? cu?.customer_id ?? `cust-${String(i)}`,
        name: cu?.name ?? 'غير معروف',
        total: cu?.total_revenue ?? cu?.total ?? 0,
        invoices: cu?.invoice_count ?? cu?.invoices ?? 0,
      }))
    : [];

interface NormalizePayloadArgs {
  summaryRes: DashResult;
  plRes: DashResult;
  debtFollowupRes: DashResult;
  lowStockRes: DashResult;
  recentInvoicesRes: DashResult;
  recentExpensesRes: DashResult;
  chartRes: DashResult;
  topRes: DashResult;
  topSellingRes: DashResult;
  productCategoriesRes: DashResult;
  trialBalanceRows: unknown[];
}

export function normalizeRawDashboardPayload({
  summaryRes,
  plRes,
  debtFollowupRes,
  lowStockRes,
  recentInvoicesRes,
  recentExpensesRes,
  chartRes,
  topRes,
  topSellingRes,
  productCategoriesRes,
  trialBalanceRows,
}: NormalizePayloadArgs) {
  const rawSummary = safeData<SummaryRow | SummaryRow[]>(summaryRes, {}, 'get_dashboard_summary');
  const summary: SummaryRow = Array.isArray(rawSummary)
    ? (rawSummary[0] ?? {})
    : rawSummary && typeof rawSummary === 'object'
      ? rawSummary
      : {};

  const salesChart = safeData(chartRes, [], 'get_sales_chart_data');

  const rawTop = safeData<RawTopPayload | RawTopPayload[]>(
    topRes,
    { top_products: [], top_customers: [] },
    'get_top_products_and_customers'
  );
  const topDataObj: RawTopPayload = Array.isArray(rawTop)
    ? (rawTop[0] ?? {})
    : rawTop && typeof rawTop === 'object'
      ? rawTop
      : {};

  const lowStockProducts = safeData(lowStockRes, [], 'get_low_stock_products');
  const profitLossRows = safeData(plRes, [], 'report_profit_loss');
  const topSellingProducts = safeData<RawTopSellingProduct[]>(
    topSellingRes,
    [],
    'get_top_selling_products'
  );
  const productCategories = safeData<RawProductCategory[]>(
    productCategoriesRes,
    [],
    'product_categories'
  );
  const recentInvoices = safeData<RawRecentInvoice[]>(recentInvoicesRes, [], 'recent_invoices');
  const recentExpenses = safeData<RawRecentExpense[]>(recentExpensesRes, [], 'recent_expenses');
  const rawDebtFollowup = safeData<RawDebtFollowupRow[]>(
    debtFollowupRes,
    [],
    'get_debt_followup_dashboard'
  );

  const overdueInvoices = (Array.isArray(rawDebtFollowup) ? rawDebtFollowup : [])
    .filter(row => row && (row.classification === 'overdue' || row.classification === 'critical'))
    .map(row => ({
      id: row.party_id,
      partyName: row.party_name ?? 'غير محدد',
      daysOverdue: Number(row.days_overdue) || 0,
    }));

  const safeLowStock = Array.isArray(lowStockProducts)
    ? (lowStockProducts as RawLowStockProduct[]).map(p => ({
        id: p?.id ?? '',
        name: p?.name_ar ?? '',
        quantity: Number(p?.quantity) || 0,
        min_quantity: Number(p?.min_quantity) || 0,
      }))
    : [];

  return {
    summary,
    salesChart: Array.isArray(salesChart) ? salesChart : [],
    topData: {
      top_products: mapTopProducts(topDataObj?.top_products),
      top_customers: mapTopCustomers(topDataObj?.top_customers),
    },
    lowStockProducts: safeLowStock,
    categoryData: [],
    trialBalanceRows: Array.isArray(trialBalanceRows) ? trialBalanceRows : [],
    profitLossRows: Array.isArray(profitLossRows) ? profitLossRows : [],
    topSellingProducts: Array.isArray(topSellingProducts) ? topSellingProducts : [],
    productCategories: Array.isArray(productCategories) ? productCategories : [],
    recentInvoices: Array.isArray(recentInvoices) ? recentInvoices : [],
    recentExpenses: Array.isArray(recentExpenses) ? recentExpenses : [],
    overdueInvoices,
  };
}
