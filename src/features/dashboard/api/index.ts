import { supabase } from '@/lib/supabaseClient';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { logger } from '../../../core/utils/logger';
import {
  dashboardRpc,
  EMPTY_RAW_DASHBOARD_DATA,
  normalizeRawDashboardPayload,
} from './rpcHelpers';
import type { DashResult, FetchRawDashboardOptions } from './types';

export const dashboardApi = {
  /**
   * Fetches the core dashboard raw data in parallel
   * @param companyId The current active company ID
   * @param opts Optional parameters: signal, branchId, dateFrom, dateTo
   */
  async fetchRawDashboardData(companyId: string, opts: FetchRawDashboardOptions = {}) {
    const { signal, branchId, dateFrom, dateTo } = opts;
    const todayStr = formatLocalDate();
    const effectiveDateTo = dateTo || todayStr;
    const effectiveDateFrom = dateFrom !== undefined ? dateFrom : null;
    const ALL_TIME_START = '1900-01-01';
    const branchParam = branchId ?? undefined;

    const activeSignal: AbortSignal =
      signal && 'addEventListener' in signal ? signal : new AbortController().signal;

    // Consolidated single-RPC Dashboard bundle (reduces 10 HTTP calls -> 1 under concurrency)
    const bundleRes = await (supabase.rpc as Function)(
      'get_dashboard_bundle',
      {
        p_company_id: companyId,
        p_date_from: effectiveDateFrom || null,
        p_date_to: effectiveDateTo,
        ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
      }
    );

    const bundleErr = bundleRes.error as { code?: string; message?: string } | null;
    const isMissingBundleRpc =
      bundleErr?.code === '42883' ||
      bundleErr?.code === 'PGRST202' ||
      (bundleErr?.message ?? '').includes('Could not find the function');

    if (!bundleErr && bundleRes.data) {
      const b = bundleRes.data as Record<string, unknown>;
      const ok = (d: unknown): DashResult => ({ status: 'fulfilled', value: { data: d, error: null } });
      return normalizeRawDashboardPayload({
        summaryRes: ok(b.summary),
        plRes: ok(b.profit_loss),
        debtFollowupRes: ok(b.debt_followup),
        lowStockRes: ok(b.low_stock),
        recentInvoicesRes: ok(b.recent_invoices),
        recentExpensesRes: ok(b.recent_expenses),
        chartRes: ok(b.sales_chart),
        topRes: ok(b.top_data),
        topSellingRes: ok(b.top_selling),
        productCategoriesRes: ok(b.product_categories),
        trialBalanceRows: [],
      });
    }

    if (bundleErr && !isMissingBundleRpc) {
      logger.warn('DashboardApi', 'get_dashboard_bundle failed, falling back to parallel RPCs:', bundleErr);
    }

    const [
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
    ] = await Promise.allSettled([
      dashboardRpc(
        'get_dashboard_summary',
        {
          p_company_id: companyId,
          ...(effectiveDateFrom ? { p_date_from: effectiveDateFrom } : {}),
          ...(effectiveDateTo ? { p_date_to: effectiveDateTo } : {}),
          ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
        },
        activeSignal
      ),
      dashboardRpc(
        'report_profit_loss',
        {
          p_company_id: companyId,
          p_from: effectiveDateFrom || ALL_TIME_START,
          p_to: effectiveDateTo,
          ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
        },
        activeSignal
      ),
      dashboardRpc(
        'get_debt_followup_dashboard',
        {
          p_company_id: companyId,
          p_due_soon_days: 7,
          p_critical_days: 30,
          p_reminder_window_days: 3,
          p_limit: 50,
          ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
        },
        activeSignal
      ),
      dashboardRpc(
        'get_low_stock_products',
        {
          p_company_id: companyId,
          ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
        },
        activeSignal
      ),
      (() => {
        let q = supabase
          .from('invoices')
          .select(
            'id, invoice_number, type, issue_date, created_at, total_amount, currency_code, party_id, parties!invoices_party_id_fkey(name)'
          )
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('type', ['sale', 'purchase', 'sale_return', 'purchase_return']);
        if (branchParam !== undefined) {
          q = q.eq('branch_id', branchParam);
        }
        return q.order('created_at', { ascending: false }).limit(10).abortSignal(activeSignal);
      })(),
      (() => {
        let q = supabase
          .from('expenses')
          .select(
            'id, voucher_number, expense_date, created_at, description, amount, currency_code, expense_categories!fk_expenses_company_category(name)'
          )
          .eq('company_id', companyId)
          .is('deleted_at', null);
        if (branchParam !== undefined) {
          q = q.eq('branch_id', branchParam);
        }
        return q.order('created_at', { ascending: false }).limit(10).abortSignal(activeSignal);
      })(),
      dashboardRpc(
        'get_sales_chart_data',
        {
          p_company_id: companyId,
          ...(effectiveDateFrom ? { p_date_from: effectiveDateFrom } : {}),
          ...(effectiveDateTo ? { p_date_to: effectiveDateTo } : {}),
          ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
        },
        activeSignal
      ),
      dashboardRpc(
        'get_top_products_and_customers',
        {
          p_company_id: companyId,
          p_limit: 15,
          ...(effectiveDateFrom ? { p_date_from: effectiveDateFrom } : {}),
          ...(effectiveDateTo ? { p_date_to: effectiveDateTo } : {}),
          ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
        },
        activeSignal
      ),
      dashboardRpc(
        'get_top_selling_products',
        {
          p_company_id: companyId,
          p_days: 30,
          p_limit: 20,
          ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
        },
        activeSignal
      ),
      supabase
        .from('product_categories')
        .select('id, name')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .abortSignal(activeSignal),
    ]);

    let trialBalanceRows: unknown[] = [];
    const plFailed =
      plRes.status === 'rejected' || (plRes.status === 'fulfilled' && plRes.value.error != null);
    if (plFailed) {
      try {
        const tbRes = await dashboardRpc(
          'report_trial_balance',
          {
            p_company_id: companyId,
            p_from: effectiveDateFrom ?? ALL_TIME_START,
            p_to: effectiveDateTo,
            ...(branchParam !== undefined ? { p_branch_id: branchParam } : {}),
          },
          activeSignal
        );
        if (tbRes.error == null && Array.isArray(tbRes.data)) {
          trialBalanceRows = tbRes.data as unknown[];
        }
      } catch {
        trialBalanceRows = [];
      }
    }

    try {
      return normalizeRawDashboardPayload({
        summaryRes: summaryRes as DashResult,
        plRes: plRes as DashResult,
        debtFollowupRes: debtFollowupRes as DashResult,
        lowStockRes: lowStockRes as DashResult,
        recentInvoicesRes: recentInvoicesRes as DashResult,
        recentExpensesRes: recentExpensesRes as DashResult,
        chartRes: chartRes as DashResult,
        topRes: topRes as DashResult,
        topSellingRes: topSellingRes as DashResult,
        productCategoriesRes: productCategoriesRes as DashResult,
        trialBalanceRows,
      });
    } catch (error) {
      logger.error(
        'DashboardAPI',
        'Unexpected error in fetchRawDashboardData, using safe fallback',
        error
      );
      return EMPTY_RAW_DASHBOARD_DATA;
    }
  },
};
