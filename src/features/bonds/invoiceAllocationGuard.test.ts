import { describe, it, expect } from 'vitest';
import {
  INVOICE_AMOUNT_EPSILON,
  buildOverAllocationMessage,
  computeRequestedAllocation,
  exceedsInvoiceRemaining,
} from './invoiceAllocationGuard';

describe('invoiceAllocationGuard', () => {
  describe('computeRequestedAllocation', () => {
    it('returns the main amount when no commission is provided', () => {
      expect(computeRequestedAllocation({ mainAmount: 950, currencyCode: 'SAR' })).toBe(950);
    });

    it('adds the commission for base-currency (SAR) bonds', () => {
      expect(
        computeRequestedAllocation({
          mainAmount: 950,
          commissionAmount: 50,
          currencyCode: 'SAR',
        })
      ).toBe(1000);
    });

    it('ignores the commission for foreign-currency bonds (different unit)', () => {
      expect(
        computeRequestedAllocation({
          mainAmount: 100000,
          commissionAmount: 50,
          currencyCode: 'YER',
        })
      ).toBe(100000);
    });

    it('treats missing/invalid numbers as zero', () => {
      expect(
        computeRequestedAllocation({
          mainAmount: Number.NaN,
          commissionAmount: null,
          currencyCode: 'SAR',
        })
      ).toBe(0);
    });
  });

  describe('exceedsInvoiceRemaining', () => {
    it('detects an allocation above the remaining balance', () => {
      expect(exceedsInvoiceRemaining(1050, 1000)).toBe(true);
    });

    it('accepts an allocation equal to the remaining balance', () => {
      expect(exceedsInvoiceRemaining(1000, 1000)).toBe(false);
    });

    it('tolerates rounding inside the accounting epsilon', () => {
      expect(exceedsInvoiceRemaining(1000 + INVOICE_AMOUNT_EPSILON / 2, 1000)).toBe(false);
    });

    it('blocks any allocation on a fully paid invoice', () => {
      expect(exceedsInvoiceRemaining(1, 0)).toBe(true);
    });

    it('defers to the server when the remaining balance is unknown', () => {
      expect(exceedsInvoiceRemaining(9999, null)).toBe(false);
      expect(exceedsInvoiceRemaining(9999, undefined)).toBe(false);
    });

    it('rejects any allocation when the invoice is already overpaid', () => {
      // paid_amount > total_amount: لا يوجد متبقٍ أصلاً، فأي تخصيص مرفوض.
      expect(exceedsInvoiceRemaining(0, -50)).toBe(true);
    });
  });

  describe('buildOverAllocationMessage', () => {
    it('mentions both the requested amount and the remaining balance', () => {
      const message = buildOverAllocationMessage(1050.5, 1000);
      expect(message).toContain('1,050.5');
      expect(message).toContain('1,000');
      expect(message).toContain('يتجاوز المتبقي على الفاتورة');
    });
  });
});
