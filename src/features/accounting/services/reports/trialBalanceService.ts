import type { TrialBalanceItem } from '../../types/index';
import { supabase } from '../../../../lib/supabaseClient';
import { formatLocalDate, getLocalYearStart } from '../../../../core/utils/dateUtils';
import { fetchAllRpcPages } from '../../../../core/utils/dataFetching';
import { mapRpcRowToTrialBalanceItem, toTrialBalanceRows } from './accountClassifiers';

export async function getTrialBalance(
  companyId: string,
  branchId?: string | null,
  fromDate?: string,
  toDate?: string
): Promise<TrialBalanceItem[]> {
  const from = fromDate || getLocalYearStart();
  const to = toDate || formatLocalDate();

  const { data, error } = await fetchAllRpcPages(
    supabase,
    'report_trial_balance',
    {
      p_company_id: companyId,
      p_from: from,
      p_to: to,
      ...(branchId ? { p_branch_id: branchId } : {}),
    },
    ['account_code', 'account_id']
  );
  if (error) throw error;

  return toTrialBalanceRows(data).map(mapRpcRowToTrialBalanceItem);
}

export async function getMonthlyPerformance(
  companyId: string,
  year: number,
  branchId?: string | null
) {
  const { data, error } = await supabase.rpc('get_monthly_performance', {
    p_company_id: companyId,
    p_year: year,
    ...(branchId ? { p_branch_id: branchId } : {}),
  });

  if (error) throw error;

  return (data || []).map(d => ({
    name: new Date(year, d.month_index, 1).toLocaleString('en-US', { month: 'long' }),
    revenues: Number(d.revenues) || 0,
    expenses: Number(d.expenses) || 0,
    monthIndex: d.month_index,
  }));
}

export async function getVatReturnReport(
  companyId: string,
  startDate: string,
  endDate: string,
  branchId?: string | null
) {
  let { data, error } = await supabase.rpc('fn_get_vat_return_report', {
    p_company_id: companyId,
    p_start_date: startDate,
    p_end_date: endDate,
    ...(branchId ? { p_branch_id: branchId } : {}),
  });
  if (
    error &&
    branchId &&
    /does not exist|PGRST202|42883|42703/i.test(String(error.message ?? ''))
  ) {
    const fallback = await supabase.rpc('fn_get_vat_return_report', {
      p_company_id: companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return data as {
    success: boolean;
    start_date: string;
    end_date: string;
    sales: { taxable_amount: number; tax_amount: number };
    purchases: { taxable_amount: number; tax_amount: number };
    net_vat_payable: number;
    vat_account_summary: {
      total_credits: number;
      total_debits: number;
      net_balance: number;
    };
  };
}
