import { describe, it, expect } from 'vitest';
import { computeDebtAgingData } from './useDebtAging';

describe('computeDebtAgingData — خصم السندات والمرتجعات وتعدد العملات', () => {
  const today = '2026-11-13';

  it('deducts unallocated receipt bonds oldest-first (days90 -> days60 -> days30 -> current)', () => {
    const result = computeDebtAgingData(
      [
        {
          id: 'inv-old',
          issue_date: '2026-06-01',
          due_date: '2026-06-01', // > 90 days
          total_amount: 1000,
          paid_amount: 0,
          party_id: 'c1',
          parties: { name: 'عميل 1', type: 'customer' },
          currency_code: 'SAR',
          exchange_rate: 1,
        },
        {
          id: 'inv-curr',
          issue_date: '2026-11-10',
          due_date: '2026-11-10', // current (<= 30 days)
          total_amount: 500,
          paid_amount: 0,
          party_id: 'c1',
          parties: { name: 'عميل 1', type: 'customer' },
          currency_code: 'SAR',
          exchange_rate: 1,
        },
      ],
      {
        creditReturns: [],
        unallocatedReceipts: [
          {
            party_id: 'c1',
            unallocated_amount: 1200,
            currency_code: 'SAR',
            exchange_rate: 1,
          },
        ],
      },
      today
    );

    expect(result.totalOutstanding).toBeCloseTo(300, 2);
    expect(result.partiesList).toHaveLength(1);
    expect(result.partiesList[0]!.days90).toBeCloseTo(0, 2);
    expect(result.partiesList[0]!.current).toBeCloseTo(300, 2);
    expect(result.criticalCount).toBe(0);
  });

  it('deducts unpaid credit sales returns and converts foreign currency (YER) via toBaseCurrency', () => {
    const result = computeDebtAgingData(
      [
        {
          id: 'inv-yer',
          issue_date: '2026-11-01',
          due_date: '2026-11-01',
          total_amount: 41000, // 100 SAR at rate 410
          paid_amount: 0,
          party_id: 'c2',
          parties: { name: 'عميل 2', type: 'both' },
          currency_code: 'YER',
          exchange_rate: 410,
        },
      ],
      {
        creditReturns: [
          {
            party_id: 'c2',
            total_amount: 20500, // 50 SAR at rate 410
            paid_amount: 0,
            currency_code: 'YER',
            exchange_rate: 410,
          },
        ],
        unallocatedReceipts: [],
      },
      today
    );

    expect(result.totalOutstanding).toBeCloseTo(50, 2);
    expect(result.agingBuckets.current).toBeCloseTo(50, 2);
  });

  it('excludes parties whose credits fully cover their gross debt and never goes negative', () => {
    const result = computeDebtAgingData(
      [
        {
          id: 'inv-1',
          issue_date: '2026-11-01',
          due_date: '2026-11-01',
          total_amount: 400,
          paid_amount: 0,
          party_id: 'c3',
          parties: { name: 'عميل مسدد', type: 'customer' },
          currency_code: 'SAR',
          exchange_rate: 1,
        },
      ],
      {
        creditReturns: [],
        unallocatedReceipts: [
          {
            party_id: 'c3',
            unallocated_amount: 600,
            currency_code: 'SAR',
            exchange_rate: 1,
          },
        ],
      },
      today
    );

    expect(result.partiesList).toHaveLength(0);
    expect(result.totalOutstanding).toBe(0);
  });
});

