import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInvoicePaymentStatus } from './useInvoicePaymentStatus';

describe('useInvoicePaymentStatus', () => {
  it('does NOT mark a partially-paid YER invoice as fully paid when payment.amount is in YER', () => {
    // Invoice: 130,000 YER (305.89 SAR), partial payment: 30,000 YER (70.59 SAR allocated)
    const invoice = {
      id: 'inv-yer-1',
      currency_code: 'YER',
      exchange_rate: 0.002353,
      total_amount: 305.89,
      total_document_amount: 130000,
      paid_amount: 70.59,
      advance_payment: 0,
      payment_method: 'credit',
      status: 'partially_paid',
      payment_allocations: [
        {
          amount: 70.59, // base currency (SAR)
          deleted_at: null,
          payments: {
            amount: 30000, // document currency (YER) — previously caused false isPaid=true!
            currency_code: 'YER',
            status: 'posted',
          },
        },
      ],
    };

    const { result } = renderHook(() => useInvoicePaymentStatus(invoice));
    expect(result.current).not.toBeNull();
    expect(result.current?.isPaid).toBe(false);
    expect(result.current?.isPartial).toBe(true);
    expect(result.current?.paid).toBe(70.59);
    expect(result.current?.remaining).toBe(235.3);
    expect(result.current?.docTotal).toBe(130000);
    expect(result.current?.docPaid).toBe(30000);
    expect(result.current?.docRemaining).toBe(100000);
  });

  it('marks an invoice as paid only when remaining is within 0.01 SAR', () => {
    const invoice = {
      id: 'inv-sar-full',
      currency_code: 'SAR',
      exchange_rate: 1,
      total_amount: 1360,
      total_document_amount: 1360,
      paid_amount: 1360,
      advance_payment: 0,
      payment_method: 'credit',
      status: 'paid',
      payment_allocations: [{ amount: 1360, deleted_at: null, payments: { amount: 1360, status: 'posted' } }],
    };

    const { result } = renderHook(() => useInvoicePaymentStatus(invoice));
    expect(result.current?.isPaid).toBe(true);
    expect(result.current?.isPartial).toBe(false);
    expect(result.current?.remaining).toBe(0);
  });
});
