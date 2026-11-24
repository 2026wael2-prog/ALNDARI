import { describe, it, expect } from 'vitest';
import {
  calculatePartyStats,
  classifyPartyBalance,
  filterPartiesStrict,
  getPartyActiveCurrencies,
  getPartyCurrencyBalance,
  hasMultipleActiveCurrencies,
} from './partyStatementService';
import type { Party } from '../types';

const makeParty = (overrides: Partial<Party>): Party =>
  ({
    id: 'p-1',
    company_id: 'c-1',
    name: 'عميل اختبار',
    type: 'customer',
    status: 'active',
    balance: 0,
    balances_by_currency: [],
    ...overrides,
  }) as Party;

describe('classifyPartyBalance & calculatePartyStats', () => {
  it('classifies single-currency debtor, creditor, and settled (including dust <= 0.01)', () => {
    expect(
      classifyPartyBalance({ balance: 150, balances_by_currency: [{ currency: 'SAR', balance: 150 }] })
    ).toBe('debtor');
    expect(
      classifyPartyBalance({ balance: -855, balances_by_currency: [{ currency: 'SAR', balance: -855 }] })
    ).toBe('creditor');
    expect(
      classifyPartyBalance({ balance: 0.004, balances_by_currency: [{ currency: 'SAR', balance: 0.004 }] })
    ).toBe('settled');
  });

  it('detects opposite-sign multi-currency customers and computes strict per-currency receivables/payables', () => {
    const mixed = makeParty({
      id: 'p-mixed',
      balance: 200,
      balances_by_currency: [
        { currency: 'SAR', balance: 500 },
        { currency: 'YER', balance: -127500 },
      ],
    });
    expect(classifyPartyBalance(mixed)).toBe('mixed_currency');
    expect(hasMultipleActiveCurrencies(mixed)).toBe(true);
    expect(getPartyCurrencyBalance(mixed, 'SAR')).toBe(500);
    expect(getPartyCurrencyBalance(mixed, 'YER')).toBe(-127500);
    expect(getPartyActiveCurrencies(mixed)).toEqual([
      { currency: 'SAR', balance: 500 },
      { currency: 'YER', balance: -127500 },
    ]);

    const sarDebtor = makeParty({
      id: 'p-debtor',
      balance: 1000,
      balances_by_currency: [{ currency: 'SAR', balance: 1000 }],
    });
    const sarCreditor = makeParty({
      id: 'p-creditor',
      balance: -300,
      balances_by_currency: [{ currency: 'SAR', balance: -300 }],
    });
    const yerDebtor = makeParty({
      id: 'p-yer-debtor',
      balance: 100,
      balances_by_currency: [{ currency: 'YER', balance: 42500 }],
    });
    const settled = makeParty({
      id: 'p-settled',
      balance: 0.005,
      balances_by_currency: [{ currency: 'YER', balance: 0.005 }],
    });

    const all = [mixed, sarDebtor, sarCreditor, yerDebtor, settled];
    const stats = calculatePartyStats(all);

    expect(stats.debtorCount).toBe(2);
    expect(stats.creditorCount).toBe(1);
    expect(stats.mixedCurrencyCount).toBe(1);
    expect(stats.settledCount).toBe(1);

    const sarStat = stats.byCurrency?.find(c => c.currency === 'SAR');
    const yerStat = stats.byCurrency?.find(c => c.currency === 'YER');

    expect(sarStat).toEqual({
      currency: 'SAR',
      balance: 1200,
      receivable: 1500,
      payable: 300,
      count: 3,
      debtorCount: 2,
      creditorCount: 1,
    });
    expect(yerStat).toEqual({
      currency: 'YER',
      balance: -85000,
      receivable: 42500,
      payable: 127500,
      count: 2,
      debtorCount: 1,
      creditorCount: 1,
    });

    // Strict per-currency filtering: YER creditors must include `mixed` even though its converted SAR net is +200!
    const yerCreditors = filterPartiesStrict({
      parties: all,
      currencyFilter: 'YER',
      statusFilter: 'creditors',
    });
    expect(yerCreditors.map(p => p.id)).toEqual(['p-mixed']);

    const sarDebtors = filterPartiesStrict({
      parties: all,
      currencyFilter: 'SAR',
      statusFilter: 'debtors',
    });
    expect(sarDebtors.map(p => p.id)).toEqual(['p-mixed', 'p-debtor']);

    const mixedOnly = filterPartiesStrict({
      parties: all,
      currencyFilter: 'MIXED',
      statusFilter: 'all',
    });
    expect(mixedOnly.map(p => p.id)).toEqual(['p-mixed']);
  });
});
