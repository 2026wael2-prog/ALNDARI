import { describe, it, expect } from 'vitest';
import { calculatePartyStats, classifyPartyBalance } from './partyStatementService';
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

  it('detects opposite-sign multi-currency customers instead of silently netting them', () => {
    const mixed = makeParty({
      id: 'p-mixed',
      balance: 200,
      balances_by_currency: [
        { currency: 'SAR', balance: 500 },
        { currency: 'YER', balance: -127500 },
      ],
    });
    expect(classifyPartyBalance(mixed)).toBe('mixed_currency');

    const stats = calculatePartyStats([
      mixed,
      makeParty({
        id: 'p-debtor',
        balance: 1000,
        balances_by_currency: [{ currency: 'SAR', balance: 1000 }],
      }),
      makeParty({
        id: 'p-creditor',
        balance: -300,
        balances_by_currency: [{ currency: 'SAR', balance: -300 }],
      }),
      makeParty({
        id: 'p-settled',
        balance: 0.005,
        balances_by_currency: [{ currency: 'YER', balance: 0.005 }],
      }),
    ]);

    expect(stats.debtorCount).toBe(1);
    expect(stats.creditorCount).toBe(1);
    expect(stats.mixedCurrencyCount).toBe(1);
    expect(stats.settledCount).toBe(1);
    expect(stats.totalReceivable).toBe(1200);
    expect(stats.totalPayable).toBe(300);
    expect(stats.totalBalance).toBe(900.01);
  });
});
