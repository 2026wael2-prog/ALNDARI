import { describe, expect, it } from 'vitest';
import { calculateAuditStats } from './auditStats';

describe('calculateAuditStats', () => {
  it('returns zero totals for an empty session', () => {
    expect(calculateAuditStats([])).toEqual({
      total: 0,
      counted: 0,
      pending: 0,
      discrepancies: 0,
      matched: 0,
      discrepancyValue: 0,
    });
  });

  it('distinguishes uncounted items from a counted zero and preserves signed differences', () => {
    const items = [
      { counted_quantity: null, expected_quantity: 4 },
      { counted_quantity: undefined, expected_quantity: 4 },
      { counted_quantity: '', expected_quantity: 4 },
      { counted_quantity: 0, expected_quantity: 2, products: { cost_price: 10 } },
      { counted_quantity: '3', expected_quantity: 3 },
      { counted_quantity: 5, expected_quantity: 3, purchase_price: 4 },
    ];
    expect(calculateAuditStats(items)).toEqual({
      total: 6,
      counted: 3,
      pending: 3,
      discrepancies: 2,
      matched: 1,
      discrepancyValue: -12,
    });
    expect(items[3]?.counted_quantity).toBe(0);
  });

  it('uses cost price before purchase price and rounds the final value', () => {
    expect(
      calculateAuditStats([
        {
          counted_quantity: 2,
          expected_quantity: 1,
          products: { cost_price: 0, purchase_price: 99 },
        },
        { counted_quantity: 2, expected_quantity: 1, products: { purchase_price: 1.235 } },
      ]).discrepancyValue
    ).toBe(1.24);
  });

  it('treats NaN/Infinity counted quantities as not counted (never poisons totals)', () => {
    const stats = calculateAuditStats([
      { counted_quantity: Number.NaN, expected_quantity: 3, products: { cost_price: 10 } },
      { counted_quantity: Number.POSITIVE_INFINITY, expected_quantity: 3 },
      { counted_quantity: '   ', expected_quantity: 3 },
      { counted_quantity: 4, expected_quantity: 3, products: { cost_price: 5 } },
    ]);
    expect(stats).toEqual({
      total: 4,
      counted: 1,
      pending: 3,
      discrepancies: 1,
      matched: 0,
      discrepancyValue: 5,
    });
    expect(Number.isNaN(stats.discrepancyValue)).toBe(false);
  });

  it('falls back to zero when expected quantity or unit cost is not finite', () => {
    expect(
      calculateAuditStats([
        {
          counted_quantity: 5,
          expected_quantity: Number.NaN,
          products: { cost_price: 'غير رقمي' },
        },
      ])
    ).toMatchObject({ counted: 1, discrepancies: 1, discrepancyValue: 0 });
  });
});
