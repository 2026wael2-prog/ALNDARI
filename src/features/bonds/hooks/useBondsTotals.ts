/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/explicit-function-return-type, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import { useMemo } from 'react';
import type { Bond } from '../types';
import type { BondsQuickAnalytics, BondsQuickTotals } from '../components/BondsQuickKpiBar';
import { toBaseCurrency } from '../../../core/utils';

const toBondBaseAmount = (b: Bond): number => {
  if (b.base_amount !== undefined && b.base_amount !== null) return b.base_amount;
  try {
    return toBaseCurrency({
      amount: b.amount || 0,
      currency_code: b.currency_code || 'SAR',
      exchange_rate: b.exchange_rate ?? 1,
    });
  } catch {
    return b.amount || 0;
  }
};

export function useBondsTotals(
  serverAnalytics: unknown,
  allBondsData: Bond[] | undefined,
  isFiltered = false
): { totals: BondsQuickTotals; analytics: BondsQuickAnalytics } {
  const analytics = useMemo(() => {
    // If active filter is applied, calculate dynamically from filtered bonds data
    const allBonds = allBondsData || [];
    const localTotal = allBonds.reduce((sum, b) => sum + toBondBaseAmount(b), 0);
    const localCount = allBonds.length;

    if (isFiltered) {
      const avg = localCount > 0 ? localTotal / localCount : 0;
      return {
        avgAmount: Math.round(avg * 100) / 100,
        count: localCount,
      };
    }

    const safeAnalytics = serverAnalytics as Record<string, unknown> | null;
    const serverCount =
      Number(safeAnalytics?.totalCount ?? safeAnalytics?.count ?? 0) || 0;
    const serverTotal = Number(safeAnalytics?.totalAmount ?? 0) || 0;

    const resolvedTotal = serverTotal > 0 ? serverTotal : localTotal;
    const resolvedCount = serverCount > 0 ? serverCount : localCount;
    const serverAvg = Number(safeAnalytics?.avgAmount ?? 0) || 0;
    const resolvedAvg =
      serverAvg > 0 ? serverAvg : resolvedCount > 0 ? resolvedTotal / resolvedCount : 0;

    return {
      avgAmount: Math.round(resolvedAvg * 100) / 100,
      count: resolvedCount,
    };
  }, [serverAnalytics, allBondsData, isFiltered]);

  const totals = useMemo(() => {
    // If active filter is applied, compute totals strictly from filtered bonds
    if (isFiltered) {
      const allBonds = allBondsData || [];
      const receiptBonds = allBonds.filter(b => b.type === 'receipt');
      const paymentBonds = allBonds.filter(b => b.type === 'payment');
      const receiptAmount = receiptBonds.reduce((s, b) => s + toBondBaseAmount(b), 0);
      const paymentAmount = paymentBonds.reduce((s, b) => s + toBondBaseAmount(b), 0);
      return {
        receiptCount: receiptBonds.length,
        receiptAmount,
        paymentCount: paymentBonds.length,
        paymentAmount,
        netAmount: receiptAmount - paymentAmount,
      };
    }

    const safeAnalytics = serverAnalytics as Record<string, unknown> | null;
    // Support both flat `get_bonds_stats` payload (receiptAmount/paymentAmount at root)
    // and legacy nested `totals` shape so SQL aggregate totals are always authoritative.
    const nestedTotals = (safeAnalytics?.totals as Record<string, number> | undefined) ?? undefined;
    const serverReceiptCount = Number(
      nestedTotals?.receiptCount ?? safeAnalytics?.receiptCount ?? 0
    );
    const serverReceiptAmount = Number(
      nestedTotals?.receiptAmount ?? safeAnalytics?.receiptAmount ?? 0
    );
    const serverPaymentCount = Number(
      nestedTotals?.paymentCount ?? safeAnalytics?.paymentCount ?? 0
    );
    const serverPaymentAmount = Number(
      nestedTotals?.paymentAmount ?? safeAnalytics?.paymentAmount ?? 0
    );

    if (
      serverReceiptCount > 0 ||
      serverPaymentCount > 0 ||
      serverReceiptAmount > 0 ||
      serverPaymentAmount > 0
    ) {
      const netAmount =
        nestedTotals?.netAmount !== undefined
          ? Number(nestedTotals.netAmount)
          : Math.round((serverReceiptAmount - serverPaymentAmount) * 100) / 100;
      return {
        receiptCount: serverReceiptCount,
        receiptAmount: serverReceiptAmount,
        paymentCount: serverPaymentCount,
        paymentAmount: serverPaymentAmount,
        netAmount,
      };
    }

    // Local fallback: compute from ALL loaded bonds
    const allBonds = allBondsData || [];
    const receiptBonds = allBonds.filter(b => b.type === 'receipt');
    const paymentBonds = allBonds.filter(b => b.type === 'payment');
    const receiptAmount = receiptBonds.reduce((s, b) => s + toBondBaseAmount(b), 0);
    const paymentAmount = paymentBonds.reduce((s, b) => s + toBondBaseAmount(b), 0);
    return {
      receiptCount: receiptBonds.length,
      receiptAmount,
      paymentCount: paymentBonds.length,
      paymentAmount,
      netAmount: receiptAmount - paymentAmount,
    };
  }, [serverAnalytics, allBondsData, isFiltered]);

  return { totals, analytics };
}
