import { describe, it, expect } from 'vitest';
import {
  resolveCustomerBalanceForCurrency,
  convertSarToInvoiceCurrency,
} from './customerBalanceDisplay';

describe('customerBalanceDisplay — Currency-Accurate Previous Customer Balance', () => {
  it('never mislabels a 200 SAR balance as 200 YER when opening a YER invoice', () => {
    const result = resolveCustomerBalanceForCurrency({
      baseBalanceSar: 200,
      balancesByCurrency: [{ currency_code: 'SAR', balance: 200 }],
      invoiceCurrency: 'YER',
      exchangeRate: 430,
      exchangeOperator: 'divide',
    });

    expect(result.status).toBe('debt');
    expect(result.primaryAmount).toBe(200);
    expect(result.primaryCurrency).toBe('SAR');
    expect(result.matchesInvoiceCurrency).toBe(false);
    expect(result.convertedEquivalent).toEqual({
      amount: 86000,
      currency: 'YER',
    });
  });

  it('switches immediately between native currency balances when invoice currency changes', () => {
    const balances = [
      { currency_code: 'SAR', balance: 200 },
      { currency_code: 'YER', balance: 50000 },
    ];

    const inYer = resolveCustomerBalanceForCurrency({
      baseBalanceSar: 316.28,
      balancesByCurrency: balances,
      invoiceCurrency: 'YER',
      exchangeRate: 430,
    });
    expect(inYer.primaryAmount).toBe(50000);
    expect(inYer.primaryCurrency).toBe('YER');
    expect(inYer.matchesInvoiceCurrency).toBe(true);
    expect(inYer.otherBalances).toEqual([{ currency_code: 'SAR', balance: 200 }]);

    const inSar = resolveCustomerBalanceForCurrency({
      baseBalanceSar: 316.28,
      balancesByCurrency: balances,
      invoiceCurrency: 'SAR',
      exchangeRate: 1,
    });
    expect(inSar.primaryAmount).toBe(200);
    expect(inSar.primaryCurrency).toBe('SAR');
    expect(inSar.matchesInvoiceCurrency).toBe(true);
    expect(inSar.otherBalances).toEqual([{ currency_code: 'YER', balance: 50000 }]);
  });

  it('handles legacy fallback where balancesByCurrency is empty (base balance is SAR, never invoiceCurrency)', () => {
    const result = resolveCustomerBalanceForCurrency({
      baseBalanceSar: 200,
      balancesByCurrency: [],
      invoiceCurrency: 'YER',
      exchangeRate: 430,
    });

    expect(result.primaryCurrency).toBe('SAR');
    expect(result.primaryAmount).toBe(200);
    expect(result.convertedEquivalent).toEqual({ amount: 86000, currency: 'YER' });
  });

  it('converts SAR to YER correctly for both >1 and <1 exchange rates', () => {
    expect(convertSarToInvoiceCurrency(200, 'YER', 430, 'divide')).toBe(86000);
    expect(Math.round(convertSarToInvoiceCurrency(200, 'YER', 0.00232558, 'multiply') ?? 0)).toBe(
      86000
    );
    expect(convertSarToInvoiceCurrency(200, 'SAR', 1, 'multiply')).toBe(200);
  });

  it('returns settled when all currency balances are zero', () => {
    const result = resolveCustomerBalanceForCurrency({
      baseBalanceSar: 0,
      balancesByCurrency: [{ currency_code: 'SAR', balance: 0 }],
      invoiceCurrency: 'YER',
      exchangeRate: 430,
    });
    expect(result.status).toBe('settled');
    expect(result.primaryAmount).toBe(0);
  });
});
