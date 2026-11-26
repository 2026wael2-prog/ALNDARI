import { describe, it, expect } from 'vitest';
import {
  buildSmartCollectionMessage,
  computeCustomerEcl,
  enrichCreditCustomer,
  type CustomerCreditRawRow,
} from './creditScoring';

const makeRow = (overrides: Partial<CustomerCreditRawRow> = {}): CustomerCreditRawRow => ({
  party_id: 'p-1',
  name: 'ورشة النجاح',
  phone: '777123456',
  status: 'active',
  party_type: 'customer',
  category_name: 'ورش',
  credit_limit: 20000,
  payment_terms_days: 30,
  customer_since: '2024-01-01',
  balance: 0,
  other_currency_balance: 0,
  other_currency_code: 'YER',
  aging_current: 0,
  aging_1_30: 0,
  aging_31_60: 0,
  aging_61_90: 0,
  aging_90_plus: 0,
  overdue_amount: 0,
  oldest_unpaid_date: null,
  max_days_overdue: 0,
  sales_12m: 50000,
  credit_sales_12m: 40000,
  returns_12m: 500,
  invoices_count_12m: 14,
  last_invoice_date: new Date().toISOString().slice(0, 10),
  collections_12m: 40000,
  last_payment_date: new Date().toISOString().slice(0, 10),
  last_payment_amount: 5000,
  days_since_last_payment: 4,
  next_promise_date: null,
  next_promise_subject: null,
  next_promise_status: null,
  ...overrides,
});

describe('Scientific Credit Scoring & IFRS 9 ECL Engine', () => {
  it('grades a disciplined active buyer with current balance as A+ Champion', () => {
    const res = enrichCreditCustomer(
      makeRow({
        balance: 5000,
        aging_current: 5000,
        overdue_amount: 0,
        credit_limit: 20000,
      })
    );
    expect(res.creditGrade).toBe('A+');
    expect(res.creditScore).toBeGreaterThanOrEqual(90);
    expect(res.rfmSegment).toBe('champions');
    expect(res.isOverLimit).toBe(false);
    expect(res.utilizationPercent).toBe(25);
    expect(res.eclAmount).toBe(25); // 5000 * 0.005
  });

  it('NEVER classifies a delinquent +90d debtor with huge balance as Champion/VIP', () => {
    const res = enrichCreditCustomer(
      makeRow({
        balance: 35000,
        aging_90_plus: 35000,
        overdue_amount: 35000,
        max_days_overdue: 140,
        credit_limit: 20000,
        collections_12m: 0,
        days_since_last_payment: 180,
        invoices_count_12m: 2,
      })
    );
    expect(res.rfmSegment).not.toBe('champions');
    expect(['D', 'F']).toContain(res.creditGrade);
    expect(res.isOverLimit).toBe(true);
    expect(res.utilizationPercent).toBe(175);
    expect(res.eclAmount).toBe(21000); // 35000 * 0.60
  });

  it('identifies High-Value High-Risk buyers separately from low-activity defaulters', () => {
    const res = enrichCreditCustomer(
      makeRow({
        balance: 25000,
        aging_61_90: 15000,
        aging_90_plus: 10000,
        overdue_amount: 25000,
        max_days_overdue: 105,
        invoices_count_12m: 12,
        sales_12m: 120000,
        collections_12m: 15000,
        days_since_last_payment: 75,
      })
    );
    expect(res.rfmSegment).toBe('high_value_risk');
    expect(res.creditScore).toBeLessThan(60);
  });

  it('computes exact IFRS 9 Simplified ECL across all 5 aging buckets', () => {
    const ecl = computeCustomerEcl(
      makeRow({
        balance: 10000,
        aging_current: 2000, // 10
        aging_1_30: 2000, // 40
        aging_31_60: 2000, // 160
        aging_61_90: 2000, // 500
        aging_90_plus: 2000, // 1200
      })
    );
    expect(ecl).toBe(1910);
  });

  it('caps blocked accounts to low credit score and adapts WhatsApp message urgency', () => {
    const blocked = enrichCreditCustomer(
      makeRow({
        status: 'blocked',
        balance: 8000,
        aging_90_plus: 8000,
        overdue_amount: 8000,
        max_days_overdue: 95,
      })
    );
    expect(blocked.creditScore).toBeLessThanOrEqual(35);
    const urgentMsg = buildSmartCollectionMessage(blocked, 'SAR');
    expect(urgentMsg).toContain('تجميد المبيعات الآجلة');

    const gentle = enrichCreditCustomer(
      makeRow({
        balance: 2000,
        aging_current: 2000,
        overdue_amount: 0,
        max_days_overdue: 0,
      })
    );
    const gentleMsg = buildSmartCollectionMessage(gentle, 'YER');
    expect(gentleMsg).toContain('بلطف');
    expect(gentleMsg).not.toContain('تجميد');
  });
});
