import { describe, it, expect } from 'vitest';
import {
  INVOICE_AMOUNT_EPSILON,
  buildOverAllocationMessage,
  computeRequestedAllocation,
  evaluateInvoiceSettlement,
  exceedsInvoiceRemaining,
  resolveInvoiceDocumentAmounts,
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

    it('appends currency code when provided', () => {
      const message = buildOverAllocationMessage(40000, 35000, 'YER');
      expect(message).toContain('40,000 YER');
      expect(message).toContain('35,000 YER');
    });
  });

  describe('resolveInvoiceDocumentAmounts & evaluateInvoiceSettlement', () => {
    it('resolves YER document total/paid/remaining cleanly without comparing YER against SAR', () => {
      // Invoice: 130,000 YER (305.89 SAR), already paid 100,000 YER (235.30 SAR)
      const resolved = resolveInvoiceDocumentAmounts({
        currency_code: 'YER',
        exchange_rate: 0.002353,
        total_amount: 305.89,
        total_document_amount: 130000,
        paid_amount: 235.3,
      });

      expect(resolved.currency).toBe('YER');
      expect(resolved.isForeign).toBe(true);
      expect(resolved.docTotal).toBe(130000);
      expect(resolved.docPaid).toBe(100000);
      expect(resolved.docRemaining).toBe(30000);
      expect(resolved.displayRate).toBe(425);
      expect(resolved.isPartial).toBe(true);

      // Partial payment of 10,000 YER must NOT exceed remaining (30,000 YER) and must evaluate as 'partial'
      expect(exceedsInvoiceRemaining(10000, resolved.docRemaining)).toBe(false);

      const partialEval = evaluateInvoiceSettlement({
        enteredAmount: 10000,
        docTotal: resolved.docTotal,
        docPaid: resolved.docPaid,
        docRemaining: resolved.docRemaining,
        invoiceCurrency: resolved.currency,
        bondCurrency: 'YER',
      });
      expect(partialEval.mode).toBe('partial');
      expect(partialEval.remainingAfter).toBe(20000);

      const fullEval = evaluateInvoiceSettlement({
        enteredAmount: 30000,
        docTotal: resolved.docTotal,
        docPaid: resolved.docPaid,
        docRemaining: resolved.docRemaining,
        invoiceCurrency: resolved.currency,
        bondCurrency: 'YER',
      });
      expect(fullEval.mode).toBe('full');
      expect(fullEval.remainingAfter).toBe(0);
    });

    it('flags currency mismatch when bond currency differs from invoice currency', () => {
      const evalRes = evaluateInvoiceSettlement({
        enteredAmount: 500,
        docTotal: 35000,
        docPaid: 0,
        docRemaining: 35000,
        invoiceCurrency: 'YER',
        bondCurrency: 'SAR',
      });
      expect(evalRes.mode).toBe('currency_mismatch');
    });
  });
});
