import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBondsFilter } from './useBondsFilter';
import type { Bond } from '../types';

const makeBond = (overrides: Partial<Bond>): Bond => ({
  id: 'b1',
  payment_number: 'PAY-1',
  date: '2026-11-26',
  description: 'سند تجريبي',
  amount: 500,
  currency_code: 'SAR',
  type: 'receipt',
  account_name: 'الصندوق الرئيسي',
  status: 'posted',
  ...overrides,
});

describe('useBondsFilter newest-first ordering', () => {
  it('places the latest bond first even when multiple bonds share the same date', () => {
    const bonds: Bond[] = [
      makeBond({ id: 'b1', payment_number: 'REC-001', date: '2026-11-20', created_at: '2026-11-20T08:00:00Z' }),
      makeBond({ id: 'b2', payment_number: 'REC-002', date: '2026-11-26', created_at: '2026-11-26T09:00:00Z' }),
      makeBond({ id: 'b3', payment_number: 'REC-003', date: '2026-11-26', created_at: '2026-11-26T14:30:00Z' }),
      makeBond({ id: 'b4', payment_number: 'REC-010', date: '2026-11-26', created_at: '2026-11-26T14:30:00Z' }),
    ];

    const { result } = renderHook(() => useBondsFilter(bonds));

    expect(result.current.displayedBonds.map(b => b.id)).toEqual(['b4', 'b3', 'b2', 'b1']);
  });
});
