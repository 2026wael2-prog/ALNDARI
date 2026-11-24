import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBondsTotals } from './useBondsTotals';
import type { Bond } from '../types';

const sampleReceiptBonds: Bond[] = [
  {
    id: 'b-1',
    payment_number: 'R-001',
    date: '2026-11-24',
    description: 'قبض 1',
    amount: 500,
    base_amount: 500,
    currency_code: 'SAR',
    exchange_rate: 1,
    type: 'receipt',
    party_id: 'p-1',
    party_name: 'عميل 1',
    account_name: 'الصندوق',
    status: 'posted',
    payment_method: 'cash',
  },
];

describe('useBondsTotals', () => {
  it('reads flat get_bonds_stats SQL aggregate payload including non-zero payment vouchers', () => {
    const serverStats = {
      totalAmount: 18041584.24,
      totalCount: 10908,
      receiptCount: 7489,
      receiptAmount: 7581389.0,
      paymentCount: 3419,
      paymentAmount: 10460195.24,
      avgAmount: 1653.98,
    };

    // Even when only receipt bonds (e.g. first page of 200) are loaded in memory,
    // unfiltered KPI totals MUST reflect the full SQL aggregates (not 0 for payments!).
    const { result } = renderHook(() => useBondsTotals(serverStats, sampleReceiptBonds, false));

    expect(result.current.totals.receiptCount).toBe(7489);
    expect(result.current.totals.receiptAmount).toBe(7581389.0);
    expect(result.current.totals.paymentCount).toBe(3419);
    expect(result.current.totals.paymentAmount).toBe(10460195.24);
    expect(result.current.totals.netAmount).toBeCloseTo(-2878806.24, 2);
    expect(result.current.analytics.count).toBe(10908);
    expect(result.current.analytics.avgAmount).toBe(1653.98);
  });

  it('remains backwards compatible with nested totals shape', () => {
    const legacyStats = {
      count: 10,
      totalAmount: 3000,
      avgAmount: 300,
      totals: {
        receiptCount: 6,
        receiptAmount: 2000,
        paymentCount: 4,
        paymentAmount: 1000,
        netAmount: 1000,
      },
    };

    const { result } = renderHook(() => useBondsTotals(legacyStats, sampleReceiptBonds, false));
    expect(result.current.totals.receiptAmount).toBe(2000);
    expect(result.current.totals.paymentAmount).toBe(1000);
    expect(result.current.totals.netAmount).toBe(1000);
  });

  it('uses filtered list totals only when filters are active', () => {
    const serverStats = {
      totalAmount: 999999,
      totalCount: 5000,
      receiptCount: 3000,
      receiptAmount: 600000,
      paymentCount: 2000,
      paymentAmount: 399999,
      avgAmount: 200,
    };

    const { result } = renderHook(() => useBondsTotals(serverStats, sampleReceiptBonds, true));
    expect(result.current.totals.receiptCount).toBe(1);
    expect(result.current.totals.receiptAmount).toBe(500);
    expect(result.current.totals.paymentCount).toBe(0);
    expect(result.current.analytics.count).toBe(1);
  });
});
