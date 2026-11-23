import { describe, expect, it } from 'vitest';
import {
  computeBondBalanceDelta,
  getBalanceDirection,
  resolveBondPartyBalance,
  resolveVoucherBalanceFromStatement,
} from './bondPartyBalance';

describe('bondPartyBalance', () => {
  describe('getBalanceDirection', () => {
    it('classifies positive balance as عليه (debit)', () => {
      const dir = getBalanceDirection(1500);
      expect(dir.status).toBe('debit');
      expect(dir.label).toBe('عليه');
      expect(dir.absAmount).toBe(1500);
    });

    it('classifies negative balance as له (credit)', () => {
      const dir = getBalanceDirection(-850);
      expect(dir.status).toBe('credit');
      expect(dir.label).toBe('له');
      expect(dir.absAmount).toBe(850);
    });

    it('classifies near-zero balance as متوازن (settled)', () => {
      expect(getBalanceDirection(0).status).toBe('settled');
      expect(getBalanceDirection(0.002).label).toBe('متوازن');
      expect(getBalanceDirection(-0.004).label).toBe('متوازن');
    });
  });

  describe('computeBondBalanceDelta', () => {
    it('subtracts for receipt bonds and adds for payment bonds', () => {
      expect(computeBondBalanceDelta('receipt', 400)).toBe(-400);
      expect(computeBondBalanceDelta('payment', 400)).toBe(400);
      expect(computeBondBalanceDelta('transfer', 400)).toBe(0);
    });
  });

  describe('resolveBondPartyBalance', () => {
    it('reduces customer debt (عليه) on receipt bond and flips to له if overpaid', () => {
      const partial = resolveBondPartyBalance({
        party: { balance: 1000, balances_by_currency: [{ currency: 'SAR', balance: 1000 }] },
        bondType: 'receipt',
        bondCurrency: 'SAR',
        bondAmount: 400,
      });
      expect(partial?.previousDirection.label).toBe('عليه');
      expect(partial?.afterInBondCurrency).toBe(600);
      expect(partial?.afterDirection.label).toBe('عليه');

      const overpaid = resolveBondPartyBalance({
        party: { balance: 1000, balances_by_currency: [{ currency: 'SAR', balance: 1000 }] },
        bondType: 'receipt',
        bondCurrency: 'SAR',
        bondAmount: 1200,
      });
      expect(overpaid?.afterInBondCurrency).toBe(-200);
      expect(overpaid?.afterDirection.label).toBe('له');
      expect(overpaid?.afterDirection.absAmount).toBe(200);
    });

    it('reduces supplier payable (له) on payment bond and flips to عليه if overpaid', () => {
      const partial = resolveBondPartyBalance({
        party: { balance: -1000, balances_by_currency: [{ currency: 'SAR', balance: -1000 }] },
        bondType: 'payment',
        bondCurrency: 'SAR',
        bondAmount: 400,
      });
      expect(partial?.previousDirection.label).toBe('له');
      expect(partial?.afterInBondCurrency).toBe(-600);
      expect(partial?.afterDirection.label).toBe('له');

      const overpaid = resolveBondPartyBalance({
        party: { balance: -1000, balances_by_currency: [{ currency: 'SAR', balance: -1000 }] },
        bondType: 'payment',
        bondCurrency: 'SAR',
        bondAmount: 1250,
      });
      expect(overpaid?.afterInBondCurrency).toBe(250);
      expect(overpaid?.afterDirection.label).toBe('عليه');
    });

    it('resolves multi-currency balances accurately when switching bond currency', () => {
      const party = {
        balance: 500,
        balances_by_currency: [
          { currency: 'SAR', balance: 500 },
          { currency: 'YER', balance: -20000 },
        ],
      };

      const yerBond = resolveBondPartyBalance({
        party,
        bondType: 'payment',
        bondCurrency: 'YER',
        bondAmount: 5000,
      });
      expect(yerBond?.previous.primaryCurrency).toBe('YER');
      expect(yerBond?.previousDirection.label).toBe('له');
      expect(yerBond?.afterInBondCurrency).toBe(-15000);
      expect(yerBond?.afterDirection.label).toBe('له');
      expect(yerBond?.previous.otherBalances).toHaveLength(1);
      expect(yerBond?.previous.otherBalances[0].currency_code).toBe('SAR');
    });

    it('provides converted equivalent when party balance is in a different currency', () => {
      const res = resolveBondPartyBalance({
        party: { balance: 200, balances_by_currency: [{ currency: 'SAR', balance: 200 }] },
        bondType: 'receipt',
        bondCurrency: 'YER',
        bondAmount: 43000,
        exchangeRate: 430,
        exchangeOperator: 'divide',
      });
      expect(res?.previous.matchesInvoiceCurrency).toBe(false);
      expect(res?.previous.primaryCurrency).toBe('SAR');
      expect(res?.previous.convertedEquivalent?.amount).toBe(86000);
      expect(res?.convertedAfterApprox?.amount).toBe(43000);
      expect(res?.convertedAfterApprox?.direction.label).toBe('عليه');
    });
  });

  describe('resolveVoucherBalanceFromStatement', () => {
    it('extracts exact historical previous and post-bond balances from matching statement row', () => {
      const snapshot = resolveVoucherBalanceFromStatement({
        movements: [
          {
            id: '1',
            ref: 'INV-100',
            reference_id: 'inv-1',
            debit: 1000,
            credit: 0,
            balance: 1000,
            currency: 'SAR',
          },
          {
            id: '2',
            ref: 'RV-2026-010',
            reference_id: 'bond-10',
            debit: 0,
            credit: 400,
            balance: 600,
            currency: 'SAR',
          },
          {
            id: '3',
            ref: 'INV-101',
            reference_id: 'inv-2',
            debit: 500,
            credit: 0,
            balance: 1100,
            currency: 'SAR',
          },
        ],
        bondId: 'bond-10',
        paymentNumber: 'RV-2026-010',
        bondCurrency: 'SAR',
        bondType: 'receipt',
        bondAmount: 400,
        bondStatus: 'posted',
      });

      expect(snapshot?.source).toBe('statement_exact');
      expect(snapshot?.previousBalance).toBe(1000);
      expect(snapshot?.previousDirection.label).toBe('عليه');
      expect(snapshot?.afterBalance).toBe(600);
      expect(snapshot?.afterDirection.label).toBe('عليه');
    });

    it('reconstructs supplier payment bond balance when falling back to latest balance', () => {
      const snapshot = resolveVoucherBalanceFromStatement({
        movements: [
          {
            id: '1',
            ref: 'PINV-1',
            reference_id: 'pinv-1',
            debit: 0,
            credit: 1000,
            balance: -600,
            currency: 'SAR',
          },
        ],
        bondId: 'bond-missing',
        paymentNumber: 'PV-2026-099',
        bondCurrency: 'SAR',
        bondType: 'payment',
        bondAmount: 400,
        bondStatus: 'posted',
      });

      expect(snapshot?.source).toBe('live_reconstructed');
      expect(snapshot?.previousBalance).toBe(-1000);
      expect(snapshot?.previousDirection.label).toBe('له');
      expect(snapshot?.afterBalance).toBe(-600);
      expect(snapshot?.afterDirection.label).toBe('له');
    });
  });
});
