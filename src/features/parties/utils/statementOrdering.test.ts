import { describe, expect, it } from 'vitest';
import type { StatementMovement } from '../services/statementTypes';
import {
  orderStatementNewestFirst,
  resolveEffectivePartyType,
  summarizeStatementByCurrency,
} from './statementOrdering';

const makeMov = (overrides: Partial<StatementMovement>): StatementMovement => ({
  id: 'm1',
  date: '2026-11-01',
  ref: 'INV-1',
  desc: 'حركة',
  type: 'invoice',
  debit: 0,
  credit: 0,
  currency: 'SAR',
  balance: 0,
  ...overrides,
});

describe('statementOrdering', () => {
  it('reverses regular movements to newest-first while anchoring opening balance at the bottom and preserving running balances', () => {
    const chronological: StatementMovement[] = [
      makeMov({ id: 'bf', date: '2026-01-01', ref: 'BF', type: 'opening_balance', is_bf: 1, debit: 500, balance: 500 }),
      makeMov({ id: 'inv-1', date: '2026-11-10', ref: 'INV-101', debit: 1000, balance: 1500 }),
      makeMov({ id: 'pay-1', date: '2026-11-10', ref: 'REC-201', credit: 400, balance: 1100 }),
      makeMov({ id: 'inv-2', date: '2026-11-20', ref: 'INV-102', debit: 250, balance: 1350 }),
    ];

    const newestFirst = orderStatementNewestFirst(chronological);

    expect(newestFirst.map(r => r.id)).toEqual(['inv-2', 'pay-1', 'inv-1', 'bf']);
    // Running balance on the newest row must remain the exact closing balance (1350)
    expect(newestFirst[0]?.balance).toBe(1350);
    // Same-day payment after invoice stays above the earlier same-day invoice
    expect(newestFirst[1]?.balance).toBe(1100);
    expect(newestFirst[2]?.balance).toBe(1500);
    // Opening balance stays at the bottom
    expect(newestFirst[3]?.id).toBe('bf');
  });

  it('summarizes multi-currency final balances identically for chronological and newest_first inputs', () => {
    const chronological: StatementMovement[] = [
      makeMov({ id: 's1', date: '2026-11-01', currency: 'SAR', debit: 1500, balance: 1500 }),
      makeMov({ id: 's2', date: '2026-11-05', currency: 'SAR', credit: 500, balance: 1000 }),
      makeMov({ id: 'y1', date: '2026-11-02', currency: 'YER', debit: 40000, balance: 40000 }),
      makeMov({ id: 'y2', date: '2026-11-06', currency: 'YER', credit: 15000, balance: 25000 }),
    ];

    const newestFirst = orderStatementNewestFirst(chronological);
    const chronoSummary = summarizeStatementByCurrency(chronological, 'chronological');
    const newestSummary = summarizeStatementByCurrency(newestFirst, 'newest_first');

    expect(newestSummary).toEqual(chronoSummary);
    expect(newestSummary[0]).toMatchObject({ currency: 'SAR', totalDebit: 1500, totalCredit: 500, finalBalance: 1000 });
    expect(newestSummary[1]).toMatchObject({ currency: 'YER', totalDebit: 40000, totalCredit: 15000, finalBalance: 25000 });
  });

  it('resolves effective party type accurately when unified scope is active', () => {
    expect(resolveEffectivePartyType('all', 'supplier')).toBe('supplier');
    expect(resolveEffectivePartyType('all', 'customer')).toBe('customer');
    expect(resolveEffectivePartyType('all', 'both')).toBe('customer');
    expect(resolveEffectivePartyType('supplier', 'both')).toBe('supplier');
    expect(resolveEffectivePartyType('customer', 'supplier')).toBe('customer');
  });
});
