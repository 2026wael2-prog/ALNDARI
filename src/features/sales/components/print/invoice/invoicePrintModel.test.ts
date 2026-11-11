import { describe, expect, it } from 'vitest';
import {
  buildInvoiceDisplayItems,
  buildInvoiceDocumentMeta,
  buildInvoicePrintView,
  computeInvoiceTotals,
  invoiceCurrencyUnit,
} from './invoicePrintModel';

describe('computeInvoiceTotals', () => {
  it('يشتق الضريبة (15/115) والمجموع قبل الضريبة عند غياب القيم المحفوظة', () => {
    const totals = computeInvoiceTotals({ total_amount: 1150 });
    expect(totals.total).toBe(1150);
    expect(totals.tax).toBe(150);
    expect(totals.subtotal).toBe(1000);
  });

  it('يحترم القيم المحفوظة في القاعدة ولا يعيد اشتقاقها', () => {
    const totals = computeInvoiceTotals({
      total_amount: 1150,
      tax_amount: 160,
      subtotal: 990,
      discount_amount: 25,
      paid_amount: 400,
    });
    expect(totals).toMatchObject({ tax: 160, subtotal: 990, discount: 25, paid: 400 });
  });

  it('يحافظ على إشارة الخصم السالبة (لا Math.abs) ويقيّد المتبقي عند الصفر', () => {
    const totals = computeInvoiceTotals({
      total_amount: 100,
      tax_amount: 0,
      subtotal: 100,
      discount_amount: -15,
      paid_amount: 250,
    });
    expect(totals.discount).toBe(-15);
    expect(totals.remaining).toBe(0);
  });

  it('يتعامل مع الفاتورة الفارغة بأصفار بلا NaN', () => {
    expect(computeInvoiceTotals({})).toEqual({
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      paid: 0,
      remaining: 0,
    });
  });
});

describe('buildInvoiceDisplayItems', () => {
  it('يستبعد الصفوف بلا اسم ويحسب إجمالي السطر والضريبة منه', () => {
    const items = buildInvoiceDisplayItems([
      { id: 'a1', name: 'فلتر زيت', quantity: 2, price: 50 },
      { id: 'a2', description: '' },
      { id: 'a3', product: { name_ar: 'بوجيهات' }, quantity: '3', unit_price: '115' },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      name: 'فلتر زيت',
      quantity: 2,
      unitPrice: 50,
      lineTotal: 100,
      taxAmount: 13.04,
    });
    expect(items[1]).toMatchObject({ name: 'بوجيهات', quantity: 3, lineTotal: 345 });
  });

  it('لا يعرض UUID خاماً كاسم صنف', () => {
    const items = buildInvoiceDisplayItems([
      { name: '51e12d3b-6709-40c2-99ae-80cd03e6f562', quantity: 1, price: 10 },
    ]);
    expect(items[0]?.name).not.toBe('51e12d3b-6709-40c2-99ae-80cd03e6f562');
  });
});

describe('buildInvoiceDocumentMeta', () => {
  it('يصف فاتورة البيع النقدي المبسطة', () => {
    expect(buildInvoiceDocumentMeta({ invoice_number: 'INV-9', issue_date: '2026-11-05' })).toEqual({
      titleAr: 'فاتورة ضريبية مبسطة',
      titleEn: 'Simplified Tax Invoice',
      documentNumber: 'INV-9',
      documentDate: '2026-11-05',
      badge: 'نقدية',
    });
  });

  it('يبدّل العنوان إلى إشعار دائن لمرتجع المبيعات', () => {
    const meta = buildInvoiceDocumentMeta({ type: 'sale_return', payment_method: 'credit' });
    expect(meta.titleAr).toBe('إشعار دائن (فاتورة مرتجع مبيعات)');
    expect(meta.badge).toBe('مرتجع مبيعات');
    expect(meta.documentNumber).toBe('INV-000');
  });
});

describe('buildInvoicePrintView', () => {
  it('يجمع العملة والمبلغ كتابةً واسم العميل الافتراضي', () => {
    const view = buildInvoicePrintView({
      total_amount: 115,
      currency_code: 'YER',
      issue_date: '2026-11-05',
    });
    expect(view.currencyUnit).toBe('ريال يمني');
    expect(view.partyName).toBe('عميل نقدي');
    expect(view.amountInWords.length).toBeGreaterThan(0);
    expect(view.paymentLabel).toBe('نقداً');
  });

  it('يترجم رموز العملات المعروفة ويعيد غيرها كما هو', () => {
    expect(invoiceCurrencyUnit('SAR')).toBe('ريال سعودي');
    expect(invoiceCurrencyUnit('USD')).toBe('USD');
  });
});
