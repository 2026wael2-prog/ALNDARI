import { describe, expect, it } from 'vitest';
import { addDaysToIsoDate, resolveSaleInvoiceDueDate } from './dueDate';

/**
 * اختبارات تاريخ استحقاق الفاتورة (§18 من تقرير إصلاح الديون).
 * الهدف: منع تكرار عيب «الاستحقاق = الإصدار» الذي جعل 100% من المديونية
 * تظهر متأخرة، وضمان عدم انزياح اليوم عبر المناطق الزمنية.
 */
describe('resolveSaleInvoiceDueDate', () => {
  it('بيع آجل مع مدة سماح معروفة ⇒ الإصدار + المدة', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        paymentMethod: 'credit',
        paymentTermsDays: 30,
      })
    ).toBe('2026-12-03');
  });

  it('بيع آجل ومدة السماح مجهولة ⇒ null ليحسمها الخادم (لا تخمين في الواجهة)', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        paymentMethod: 'credit',
        paymentTermsDays: null,
      })
    ).toBeNull();
  });

  it('بيع نقدي ⇒ الاستحقاق = تاريخ الإصدار', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        paymentMethod: 'cash',
        paymentTermsDays: 30,
      })
    ).toBe('2026-11-03');
  });

  it('تاريخ صريح صالح ⇒ يُحترم كما هو', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        explicitDueDate: '2026-12-31',
        paymentMethod: 'credit',
        paymentTermsDays: 30,
      })
    ).toBe('2026-12-31');
  });

  it('تاريخ صريح قبل الإصدار ⇒ يُقيَّد بالإصدار بدل خرق chk_due_after_issue', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        explicitDueDate: '2026-10-01',
        paymentMethod: 'credit',
      })
    ).toBe('2026-11-03');
  });

  it('تاريخ صريح غير صالح ⇒ يُتجاهل ويُشتق من المدة', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        explicitDueDate: '31/12/2026',
        paymentMethod: 'credit',
        paymentTermsDays: 15,
      })
    ).toBe('2026-11-18');
  });

  it('مدة سماح صفرية ⇒ الاستحقاق = الإصدار', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        paymentMethod: 'credit',
        paymentTermsDays: 0,
      })
    ).toBe('2026-11-03');
  });

  it('مدة سماح سالبة أو كسرية ⇒ تُقيَّد بالصفر ويُقتطع الكسر', () => {
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        paymentMethod: 'credit',
        paymentTermsDays: -5,
      })
    ).toBe('2026-11-03');
    expect(
      resolveSaleInvoiceDueDate({
        issueDate: '2026-11-03',
        paymentMethod: 'credit',
        paymentTermsDays: 10.9,
      })
    ).toBe('2026-11-13');
  });

  it('بدون تاريخ إصدار ⇒ يعتمد تاريخ اليوم المحلي (بلا UTC shift)', () => {
    const now = new Date();
    const expected = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(resolveSaleInvoiceDueDate({ paymentMethod: 'cash' })).toBe(expected);
  });
});

describe('addDaysToIsoDate', () => {
  it('يعبر حدود الشهر بلا انزياح', () => {
    expect(addDaysToIsoDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToIsoDate('2026-03-01', 30)).toBe('2026-03-31');
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('يعمل عبر تغيير التوقيت الصيفي (حساب باليوم لا بالميلي ثانية)', () => {
    expect(addDaysToIsoDate('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDaysToIsoDate('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('يدعم الأيام السالبة وتاريخاً غير صالح', () => {
    expect(addDaysToIsoDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToIsoDate('2026-02-30', 1)).toBe('');
    expect(addDaysToIsoDate('not-a-date', 5)).toBe('');
  });
});
