import { describe, expect, it } from 'vitest';
import { getStatementRowSemanticTone } from './statementExcelHelpers';

describe('getStatementRowSemanticTone — تلوين معاملات كشف الحساب (أحمر وأخضر)', () => {
  it('يلوّن فاتورة مبيعات العميل غير المسددة بالأحمر وسند القبض بالأخضر', () => {
    expect(
      getStatementRowSemanticTone(
        { debit: 500, credit: 0, payment_status: 'unpaid', type: 'sale' },
        'customer'
      )
    ).toBe('rose');

    expect(
      getStatementRowSemanticTone(
        { debit: 0, credit: 300, payment_status: undefined, type: 'receipt' },
        'customer'
      )
    ).toBe('emerald');
  });

  it('يلوّن الفاتورة الخالصة بالكامل بالأخضر', () => {
    expect(
      getStatementRowSemanticTone(
        { debit: 250, credit: 0, payment_status: 'paid', type: 'sale' },
        'customer'
      )
    ).toBe('emerald');
  });

  it('يلوّن فاتورة مشتريات المورد غير المسددة بالأحمر وسند الصرف بالأخضر', () => {
    expect(
      getStatementRowSemanticTone(
        { debit: 0, credit: 800, payment_status: 'unpaid', type: 'purchase' },
        'supplier'
      )
    ).toBe('rose');

    expect(
      getStatementRowSemanticTone(
        { debit: 400, credit: 0, payment_status: undefined, type: 'payment' },
        'supplier'
      )
    ).toBe('emerald');
  });
});
