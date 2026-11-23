import { formatCurrency } from '../../../core/utils/currencyUtils';
import type {
  ChartDataPoint,
  DashboardDataPayload,
  LowStockProduct,
  RecentActivityItem,
  TopPerformer,
} from '../models';
import { calculateDashboardInsights, resolveNetProfit } from '../services/dashboardInsights';
import { buildTopCategoryData } from '../services/topCategoryData';

export interface RawSummary {
  total_sales?: number | string;
  total_purchases?: number | string;
  total_expenses?: number | string;
  receipt_bonds?: number | string;
  payment_bonds?: number | string;
  total_debts?: number | string;
  total_supplier_debts?: number | string;
  invoice_count?: number | string;
}

export interface RawTrialBalanceRow {
  code?: string;
  account_code?: string;
  netBalance?: number;
  balance?: number;
}

export interface RawTopData {
  top_customers?: TopPerformer[];
  top_products?: TopPerformer[];
}

export interface RawDashboardData {
  summary: RawSummary;
  salesChart: unknown[];
  topData: RawTopData;
  lowStockProducts: LowStockProduct[];
  categoryData: ChartDataPoint[];
  trialBalanceRows: unknown[];
  profitLossRows?: Array<{ type?: string; amount?: number | string }>;
  topSellingProducts?: Array<{
    category_id: string;
    id: string;
    name_ar?: string;
    total_revenue?: number;
    total_sold?: number;
  }>;
  productCategories?: Array<{ id: string; name: string }>;
  recentInvoices: Array<{
    id: string;
    invoice_number?: string | null;
    type?: string | null;
    issue_date: string;
    created_at?: string | null;
    total_amount?: number | null;
    currency_code?: string | null;
    parties?: { name?: string | null } | null;
  }>;
  recentExpenses: Array<{
    id: string;
    voucher_number?: string | null;
    expense_date: string;
    created_at?: string | null;
    description?: string | null;
    amount?: number | null;
    currency_code?: string | null;
    expense_categories?: { name?: string | null } | null;
  }>;
  overdueInvoices: Array<{ id: string; partyName?: string; daysOverdue?: number }>;
}

const INVOICE_ACTIVITY_META: Record<string, { title: string; color: string }> = {
  sale: { title: 'فاتورة مبيعات', color: 'blue' },
  purchase: { title: 'فاتورة مشتريات', color: 'violet' },
  sale_return: { title: 'مرتجع مبيعات', color: 'orange' },
  purchase_return: { title: 'مرتجع مشتريات', color: 'amber' },
};

export const toNumber = (value: number | string | undefined | null): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const buildRecentActivities = (
  invoices: RawDashboardData['recentInvoices'],
  expenses: RawDashboardData['recentExpenses']
): RecentActivityItem[] => {
  const items: RecentActivityItem[] = [
    ...(invoices || []).map(inv => {
      const meta = INVOICE_ACTIVITY_META[inv.type ?? ''] ?? { title: 'فاتورة', color: 'gray' };
      const baseAmount = toNumber(inv.total_amount);
      const docAmount = toNumber(
        (inv as { total_document_amount?: number | string | null }).total_document_amount
      );
      const rawCurrency = (inv.currency_code || 'SAR').toUpperCase();
      // [AUDIT FIX 11] Never pair a base SAR total_amount with a foreign currency symbol (e.g. YER)
      const useDoc = rawCurrency !== 'SAR' && docAmount > 0;
      const amount = useDoc ? docAmount : baseAmount;
      const currency = useDoc ? rawCurrency : 'SAR';
      const formattedAmount = formatCurrency(amount, currency);
      const partyName = inv.parties?.name?.trim();
      const invoiceNum = inv.invoice_number ? `#${inv.invoice_number}` : '';
      const title = invoiceNum ? `${meta.title} (${invoiceNum})` : meta.title;
      const desc = partyName ? `${formattedAmount} • ${partyName}` : formattedAmount;

      return {
        id: inv.id,
        type: inv.type ?? 'invoice',
        title,
        desc,
        amount,
        currency_code: currency,
        ...(inv.invoice_number ? { reference_number: inv.invoice_number } : {}),
        date: inv.issue_date,
        time: inv.created_at || inv.issue_date,
        color: meta.color,
      };
    }),
    ...(expenses || []).map(exp => {
      const amount = toNumber(exp.amount);
      const currency = exp.currency_code || 'SAR';
      const formattedAmount = formatCurrency(amount, currency);
      const categoryOrDesc = exp.description || exp.expense_categories?.name || 'غير محدد';
      const voucherNum = exp.voucher_number ? `#${exp.voucher_number}` : '';
      const title = voucherNum
        ? `مصروف (${voucherNum}): ${categoryOrDesc}`
        : `مصروف: ${categoryOrDesc}`;

      return {
        id: exp.id,
        type: 'expense',
        title,
        desc: formattedAmount,
        amount,
        currency_code: currency,
        ...(exp.voucher_number ? { reference_number: exp.voucher_number } : {}),
        date: exp.expense_date,
        time: exp.created_at || exp.expense_date,
        color: 'rose',
      };
    }),
  ];

  return items
    .filter(item => Boolean(item.time || item.date))
    .sort((a, b) => new Date(b.time || b.date).getTime() - new Date(a.time || a.date).getTime())
    .slice(0, 8);
};

export function transformRawDashboardData(
  raw: RawDashboardData | null | undefined
): DashboardDataPayload | null {
  if (!raw) return null;

  const {
    summary,
    salesChart,
    topData,
    lowStockProducts,
    trialBalanceRows,
    profitLossRows = [],
    topSellingProducts = [],
    productCategories = [],
    recentInvoices,
    recentExpenses,
    overdueInvoices,
  } = raw;

  if (!summary || typeof summary !== 'object') {
    return null;
  }

  const safeTrialBalance: RawTrialBalanceRow[] = Array.isArray(trialBalanceRows)
    ? (trialBalanceRows as RawTrialBalanceRow[])
    : [];

  const summaryWithCogs = summary as typeof summary & {
    gross_profit?: number | null;
    total_cogs?: number | null;
  };
  const resolvedAccountingProfit = resolveNetProfit(profitLossRows, safeTrialBalance);
  const netProfit =
    summaryWithCogs.gross_profit !== undefined && summaryWithCogs.gross_profit !== null
      ? toNumber(summaryWithCogs.gross_profit)
      : resolvedAccountingProfit;
  const netCashPosition = toNumber(summary.receipt_bonds) - toNumber(summary.payment_bonds);
  const safeLowStockProducts = Array.isArray(lowStockProducts) ? lowStockProducts : [];
  const productCategoryData = buildTopCategoryData(topSellingProducts, productCategories);
  const safeSalesChart: ChartDataPoint[] = Array.isArray(salesChart)
    ? (salesChart as ChartDataPoint[])
    : [];
  const safeTopData: RawTopData = topData && typeof topData === 'object' ? topData : {};

  const insightsResult = calculateDashboardInsights({
    receiptBonds: toNumber(summary.receipt_bonds),
    paymentBonds: toNumber(summary.payment_bonds),
    totalSales: toNumber(summary.total_sales),
    totalPurchases: toNumber(summary.total_purchases),
    totalExpenses: toNumber(summary.total_expenses),
    netProfit,
    totalCustomerDebts: toNumber(summary.total_debts),
    totalSupplierDebts: toNumber(summary.total_supplier_debts),
    salesChartData: safeSalesChart,
    lowStockProducts: safeLowStockProducts,
    overdueInvoices,
  });

  return {
    stats: {
      sales: toNumber(summary.total_sales),
      purchases: toNumber(summary.total_purchases),
      expenses: toNumber(summary.total_expenses),
      debts: toNumber(summary.total_debts),
      supplierDebts: toNumber(summary.total_supplier_debts),
      invoices: toNumber(summary.invoice_count),
      profit: netProfit,
      netCash: netCashPosition,
      salesTrend: Math.round(insightsResult.salesTrend * 10) / 10,
      purchasesTrend: Math.round(insightsResult.purchasesTrend * 10) / 10,
      expensesTrend: Math.round(insightsResult.expensesTrend * 10) / 10,
      profitTrend: 0,
    },
    salesData: safeSalesChart.length ? safeSalesChart : [{ name: 'اليوم', value: 0 }],
    categoryData: productCategoryData.length
      ? productCategoryData
      : [{ name: 'لا توجد بيانات', value: 0, color: '#94a3b8' }],
    recentActivities: buildRecentActivities(recentInvoices, recentExpenses),
    customers: safeTopData.top_customers ?? [],
    topProducts: safeTopData.top_products ?? [],
    topCustomers: safeTopData.top_customers ?? [],
    targets: insightsResult.targets,
    cashFlow: {
      inflow: toNumber(summary.receipt_bonds),
      outflow: toNumber(summary.payment_bonds),
      net: netCashPosition,
    },
    alerts: insightsResult.alerts,
    insights: insightsResult.insights,
    lowStockProducts: safeLowStockProducts,
  };
}

export const DASHBOARD_FALLBACK_DATA: DashboardDataPayload = {
  stats: {
    sales: 0,
    purchases: 0,
    expenses: 0,
    debts: 0,
    supplierDebts: 0,
    invoices: 0,
    profit: 0,
    netCash: 0,
    salesTrend: 0,
    purchasesTrend: 0,
    expensesTrend: 0,
    profitTrend: 0,
  },
  salesData: [],
  categoryData: [],
  recentActivities: [],
  customers: [],
  topProducts: [],
  topCustomers: [],
  targets: { salesProgress: 0, collectionRate: 0 },
  cashFlow: { inflow: 0, outflow: 0, net: 0 },
  alerts: [],
  insights: [],
  lowStockProducts: [],
};
