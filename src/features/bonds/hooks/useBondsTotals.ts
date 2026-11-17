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
    const serverCount = (safeAnalytics?.count as number) || 0;
    const serverTotal = (safeAnalytics?.totalAmount as number) || 0;

    const resolvedTotal = serverTotal > 0 ? serverTotal : localTotal;
    const resolvedCount = serverCount > 0 ? serverCount : localCount;
    const serverAvg = (safeAnalytics?.avgAmount as number) || 0;
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
    const safeTotals = (safeAnalytics?.totals as Record<string, number>) || {};

    // Server data has real values — use it
    if (safeTotals && (safeTotals.receiptAmount > 0 || safeTotals.paymentAmount > 0)) {
      return {
        receiptCount: safeTotals.receiptCount || 0,
        receiptAmount: safeTotals.receiptAmount || 0,
        paymentCount: safeTotals.paymentCount || 0,
        paymentAmount: safeTotals.paymentAmount || 0,
        netAmount: safeTotals.netAmount || 0,
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
