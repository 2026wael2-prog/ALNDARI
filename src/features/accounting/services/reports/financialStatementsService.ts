import type { TrialBalanceItem } from '../../types/index';
import { supabase } from '../../../../lib/supabaseClient';
import { logger } from '../../../../core/utils/logger';
import { formatLocalDate, getLocalYearStart } from '../../../../core/utils/dateUtils';
import { fetchAllRpcPages } from '../../../../core/utils/dataFetching';
import {
  isCogsAccount,
  mapRpcRowToTrialBalanceItem,
  toTrialBalanceRows,
  type TrialBalanceRpcRow,
} from './accountClassifiers';

async function fetchIncomeStatementData(
  companyId: string,
  from: string,
  to: string,
  branchId?: string | null
) {
  const toPnlItem = (row: TrialBalanceRpcRow): TrialBalanceItem => ({
    ...mapRpcRowToTrialBalanceItem(row),
    is_cogs: isCogsAccount(row.account_code, row.account_name, row.is_cogs),
  });

  const { data: detailRows, error: detailError } = await fetchAllRpcPages(
    supabase,
    'report_profit_loss_detailed',
    {
      p_company_id: companyId,
      p_from: from,
      p_to: to,
      ...(branchId ? { p_branch_id: branchId } : {}),
    },
    ['account_code', 'account_id']
  );

  let revenues: TrialBalanceItem[];
  let expenses: TrialBalanceItem[];
  let totalRevenue = 0;
  let totalExpense = 0;
  let netIncome = 0;

  if (detailError === null) {
    const rows = toTrialBalanceRows(detailRows);
    revenues = rows.filter(r => r.account_type === 'revenue').map(toPnlItem);
    expenses = rows.filter(r => r.account_type === 'expense').map(toPnlItem);
    totalRevenue = revenues.reduce((sum, item) => sum + item.net_balance, 0);
    totalExpense = expenses.reduce((sum, item) => sum + item.net_balance, 0);
    netIncome = totalRevenue - totalExpense;
  } else {
    const detailMessage = String((detailError as { message?: string }).message ?? '');
    if (!/does not exist|PGRST202|42883/i.test(detailMessage)) throw detailError;

    logger.warn(
      'reportService',
      'report_profit_loss_detailed not available — falling back to aggregate report_profit_loss (apply migration 20260826000012)'
    );

    const { data: plRows, error: plError } = await supabase.rpc('report_profit_loss', {
      p_company_id: companyId,
      p_from: from,
      p_to: to,
      ...(branchId ? { p_branch_id: branchId } : {}),
    });
    if (plError) throw plError;

    const plData = (plRows || []) as Array<{ category: string; amount: number; type: string }>;
    const revenueRow = plData.find(r => r.type === 'revenue');
    const expenseRow = plData.find(r => r.type === 'expense');
    const netRow = plData.find(r => r.type === 'net_profit');

    totalRevenue = Number(revenueRow?.amount) || 0;
    totalExpense = Number(expenseRow?.amount) || 0;
    netIncome = Number(netRow?.amount) || totalRevenue - totalExpense;

    revenues = revenueRow
      ? [
          {
            account_id: 'revenue-total',
            code: '4',
            name: revenueRow.category,
            type: 'revenue',
            total_debit: 0,
            total_credit: totalRevenue,
            net_balance: totalRevenue,
          },
        ]
      : [];
    expenses = expenseRow
      ? [
          {
            account_id: 'expense-total',
            code: '5',
            name: expenseRow.category,
            type: 'expense',
            total_debit: totalExpense,
            total_credit: 0,
            net_balance: totalExpense,
          },
        ]
      : [];
  }

  const cogsItems = expenses.filter(item => isCogsAccount(item.code, item.name, item.is_cogs));
  const totalCogs = cogsItems.reduce((sum, item) => sum + item.net_balance, 0);
  const operatingExpenses = totalExpense - totalCogs;
  const grossProfit = totalRevenue - totalCogs;

  return {
    revenues,
    expenses,
    netIncome,
    totalRevenue,
    totalExpense,
    totalCogs,
    grossProfit,
    operatingExpenses,
  };
}

async function fetchBalanceSheetData(
  companyId: string,
  to: string,
  netIncome: number,
  branchId?: string | null
) {
  const { data: bsRows, error: bsError } = await supabase.rpc('report_balance_sheet', {
    p_company_id: companyId,
    p_as_of_date: to,
    ...(branchId ? { p_branch_id: branchId } : {}),
  });
  if (bsError) throw bsError;

  const bsData = (bsRows || []) as Array<{ category: string; amount: number; type: string }>;
  const assetRow = bsData.find(r => r.type === 'asset');
  const liabilityRow = bsData.find(r => r.type === 'liability');
  const equityRow = bsData.find(r => r.type === 'equity');
  const retainedRow = bsData.find(r => r.type === 'retained_earnings');

  const equityFromServer = Number(equityRow?.amount) || 0;
  let totalAssets = Number(assetRow?.amount) || 0;
  let totalLiabilities = Number(liabilityRow?.amount) || 0;
  const totalRetainedToDate = Number(retainedRow?.amount) || 0;
  const totalEquity = retainedRow ? equityFromServer : equityFromServer + netIncome;

  let assetTBI: TrialBalanceItem[] = [];
  let liabilityTBI: TrialBalanceItem[] = [];
  let equityTBI: TrialBalanceItem[] = [];

  const [{ data: detailBsData, error: detailBsError }, { data: tbData, error: tbError }] =
    await Promise.all([
      fetchAllRpcPages(
        supabase,
        'report_balance_sheet_detailed',
        {
          p_company_id: companyId,
          p_as_of_date: to,
          ...(branchId ? { p_branch_id: branchId } : {}),
        },
        ['account_code', 'account_id']
      ),
      fetchAllRpcPages(
        supabase,
        'report_trial_balance',
        {
          p_company_id: companyId,
          p_from: '1970-01-01',
          p_to: to,
          ...(branchId ? { p_branch_id: branchId } : {}),
        },
        ['account_code', 'account_id']
      ),
    ]);

  if (detailBsError === null && Array.isArray(detailBsData)) {
    const rows = toTrialBalanceRows(detailBsData);
    assetTBI = rows.filter(r => r.account_type === 'asset').map(mapRpcRowToTrialBalanceItem);
    liabilityTBI = rows
      .filter(r => r.account_type === 'liability')
      .map(mapRpcRowToTrialBalanceItem);
    equityTBI = rows.filter(r => r.account_type === 'equity').map(mapRpcRowToTrialBalanceItem);

    if (tbError === null && Array.isArray(tbData)) {
      const detailAssetsSum = assetTBI.reduce((sum, item) => sum + item.net_balance, 0);
      const detailLiabilitiesSum = liabilityTBI.reduce((sum, item) => sum + item.net_balance, 0);
      const existingIds = new Set(
        [...assetTBI, ...liabilityTBI, ...equityTBI].map(item => item.account_id)
      );
      let missingAssetTotal = 0;
      let missingLiabilityTotal = 0;

      for (const r of toTrialBalanceRows(tbData)) {
        if (existingIds.has(r.account_id)) continue;
        if (r.account_type === 'asset') {
          const net = r.total_debit - r.total_credit;
          if (Math.abs(net) > 0.001) {
            assetTBI.push({ ...mapRpcRowToTrialBalanceItem(r), net_balance: net });
            missingAssetTotal += net;
          }
        } else if (r.account_type === 'liability') {
          const net = r.total_credit - r.total_debit;
          if (Math.abs(net) > 0.001) {
            liabilityTBI.push({ ...mapRpcRowToTrialBalanceItem(r), net_balance: net });
            missingLiabilityTotal += net;
          }
        } else if (r.account_type === 'equity') {
          const net = r.total_credit - r.total_debit;
          if (Math.abs(net) > 0.001) {
            equityTBI.push({ ...mapRpcRowToTrialBalanceItem(r), net_balance: net });
          }
        }
      }

      if (Math.abs(missingAssetTotal) > 0.01 && Math.abs(detailAssetsSum - totalAssets) < 1) {
        totalAssets += missingAssetTotal;
      }
      if (
        Math.abs(missingLiabilityTotal) > 0.01 &&
        Math.abs(detailLiabilitiesSum - totalLiabilities) < 1
      ) {
        totalLiabilities += missingLiabilityTotal;
      }
    }

    const existingRetainedAcc = equityTBI.find(e => e.code === '3200');
    const existingRetainedBalance = existingRetainedAcc?.net_balance || 0;
    const priorEarnings = totalRetainedToDate - netIncome - existingRetainedBalance;

    if (priorEarnings > 0.001 || priorEarnings < -0.001) {
      equityTBI.push({
        account_id: 'prior-retained-earnings',
        code: '3200-PRIOR',
        name: 'أرباح/خسائر مدورة من فترات سابقة',
        type: 'equity',
        total_debit: priorEarnings < 0 ? -priorEarnings : 0,
        total_credit: priorEarnings > 0 ? priorEarnings : 0,
        net_balance: priorEarnings,
      });
    }
  } else {
    const baseEquity = retainedRow ? equityFromServer - netIncome : equityFromServer;
    assetTBI = assetRow
      ? [
          {
            account_id: 'asset-total',
            code: '1',
            name: assetRow.category,
            type: 'asset',
            total_debit: totalAssets,
            total_credit: 0,
            net_balance: totalAssets,
          },
        ]
      : [];
    liabilityTBI = liabilityRow
      ? [
          {
            account_id: 'liability-total',
            code: '2',
            name: liabilityRow.category,
            type: 'liability',
            total_debit: 0,
            total_credit: totalLiabilities,
            net_balance: totalLiabilities,
          },
        ]
      : [];
    equityTBI = equityRow
      ? [
          {
            account_id: 'equity-total',
            code: '3',
            name: equityRow.category,
            type: 'equity',
            total_debit: 0,
            total_credit: baseEquity,
            net_balance: baseEquity,
          },
        ]
      : [];
  }

  const difference = totalAssets - (totalLiabilities + totalEquity);
  return {
    assets: assetTBI,
    liabilities: liabilityTBI,
    equity: equityTBI,
    netIncome,
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      equity: totalEquity,
    },
    isBalanced: difference > -1 && difference < 1,
    difference,
  };
}

export async function getFinancials(
  companyId: string,
  branchId?: string | null,
  fromDate?: string,
  toDate?: string
) {
  const from = fromDate || getLocalYearStart();
  const to = toDate || formatLocalDate();

  const incomeStatement = await fetchIncomeStatementData(companyId, from, to, branchId);
  const balanceSheet = await fetchBalanceSheetData(
    companyId,
    to,
    incomeStatement.netIncome,
    branchId
  );

  return { incomeStatement, balanceSheet };
}
