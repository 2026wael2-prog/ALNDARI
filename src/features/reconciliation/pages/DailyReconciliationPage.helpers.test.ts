import { describe, it, expect } from 'vitest';
import {
  planSummarySync,
  deriveReconciliationView,
  buildCommitPayload,
  collectCommitBlockers,
  type ReconciliationFormValues,
} from './DailyReconciliationPage.helpers';
import type { DailyDrawerSummary } from '../types';

const buildSummary = (overrides: Partial<DailyDrawerSummary> = {}): DailyDrawerSummary => ({
  date: '2026-11-03',
  opening_float: 0,
  total_sales: 0,
  cash_sales: 0,
  card_sales: 0,
  transfer_sales: 0,
  returns_cash: 0,
  returns_card: 0,
  petty_expenses_cash: 0,
  expected_cash_in_drawer: 0,
  expected_card_terminal: 0,
  employee_breakdown: [],
  existing_reconciliation: null,
  is_already_closed: false,
  ...overrides,
});

const buildForm = (overrides: Partial<ReconciliationFormValues> = {}): ReconciliationFormValues => ({
  countMode: 'denominations',
  cashCountsByCurrency: {},
  activeCurrency: 'YER',
  rates: { YER: 1 },
  manualCashTotal: 0,
  actualCard: 0,
  cardEntered: false,
  cardTerminalRef: '',
  floatRetained: 0,
  varianceReason: '',
  notes: '',
  ...overrides,
});

describe('planSummarySync — صدق مطابقة الشبكة', () => {
  it('returns null when there is no summary yet', () => {
    expect(planSummarySync(null)).toBeNull();
    expect(planSummarySync(undefined)).toBeNull();
  });

  it('starts a fresh day WITHOUT auto-filling the card report from the expected value', () => {
    const summary = buildSummary({ expected_card_terminal: 12_400 });
    const plan = planSummarySync(summary);

    expect(plan).toEqual({ kind: 'fresh' });
    // لا يوجد أي «actualCard» مُفترض: المطابقة لا تُعلن قبل قراءة تقرير Z
    expect(plan).not.toHaveProperty('actualCard');
  });

  it('reads legacy flat saved counts under the base currency and keeps a zero float', () => {
    const summary = buildSummary({
      base_currency: 'YER',
      existing_reconciliation: {
        id: 'r1',
        company_id: 'c1',
        branch_id: null,
        reconciliation_date: '2026-11-02',
        shift_number: 1,
        status: 'closed',
        opening_float: 0,
        float_retained_for_tomorrow: 0,
        cash_handed_to_owner: 6000,
        total_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        transfer_sales: 0,
        returns_cash: 0,
        returns_card: 0,
        petty_expenses_cash: 0,
        expected_cash_in_drawer: 0,
        actual_cash_counted: 6000,
        cash_denominations: { '1000': 6 },
        card_terminal_receipt_total: 0,
        cash_variance: 0,
        card_variance: 0,
        variance_reason: null,
        employee_breakdown: [],
        notes: null,
        closed_by: 'u1',
        closed_at: '2026-11-02T20:00:00Z',
        is_locked: true,
      },
    });

    const plan = planSummarySync(summary);
    expect(plan).toMatchObject({
      kind: 'existing',
      cashCountsByCurrency: { YER: { '1000': 6 } },
      manualCashTotal: 6000,
      countMode: 'denominations',
      cardEntered: false,
      floatRetained: 0,
    });
  });
});

describe('deriveReconciliationView — عملات متعددة وصافي غير مقصوص', () => {
  const summary = buildSummary({ base_currency: 'YER', expected_cash_in_drawer: 100_000 });

  it('sums each currency by its own rate and flags foreign currency', () => {
    const view = deriveReconciliationView(
      summary,
      buildForm({
        cashCountsByCurrency: { YER: { '1000': 5 }, SAR: { '100': 3 } },
        rates: { YER: 1, SAR: 410 },
      }),
      'accountant'
    );

    expect(view.cashRows).toHaveLength(2);
    expect(view.actualCashCounted).toBe(128_000);
    expect(view.hasForeignCurrencyCounts).toBe(true);
    expect(view.missingRateCurrencies).toEqual([]);
  });

  it('keeps a negative net and flags it instead of clamping to zero', () => {
    const view = deriveReconciliationView(
      summary,
      buildForm({ cashCountsByCurrency: { YER: { '1000': 1 } }, floatRetained: 5_000 }),
      'manager'
    );

    expect(view.actualCashCounted).toBe(1_000);
    expect(view.cashToOwner).toBe(-4_000);
    expect(view.netIsNegative).toBe(true);
  });

  it('reports no card variance until the terminal report is entered', () => {
    const view = deriveReconciliationView(
      summary,
      buildForm({ actualCard: 99_999, cardEntered: false }),
      'owner'
    );

    expect(view.cardVariance).toBeNull();
  });

  it('exposes currencies that have counts but no exchange rate', () => {
    const view = deriveReconciliationView(
      summary,
      buildForm({
        cashCountsByCurrency: { YER: { '1000': 1 }, USD: { '1': 2 } },
        rates: { YER: 1 },
      }),
      'owner'
    );

    expect(view.missingRateCurrencies).toEqual(['USD']);
  });
});

describe('buildCommitPayload', () => {
  it('persists nested multi-currency counts', () => {
    const payload = buildCommitPayload('c1', '2026-11-03', {
      branchId: 'b1',
      summary: buildSummary(),
      actualCashCounted: 128_000,
      countMode: 'denominations',
      cashCountsByCurrency: { YER: { '1000': 5 }, SAR: { '100': 3 } },
      cashRates: { YER: 1, SAR: 410 },
      actualCard: 0,
      floatRetained: 20_000,
      cashToOwner: 108_000,
      varianceReason: '',
      notes: '',
    });

    expect(payload.cash_denominations).toEqual({ YER: { '1000': 5 }, SAR: { '100': 3 } });
    expect(payload.actual_cash_counted).toBe(128_000);
    expect(payload.cash_handed_to_owner).toBe(108_000);
  });

  it('always sends the rates the user saw so the server can recompute the count', () => {
    const payload = buildCommitPayload('c1', '2026-11-03', {
      branchId: null,
      summary: buildSummary({ base_currency: 'YER' }),
      actualCashCounted: 4_100,
      countMode: 'quick',
      cashCountsByCurrency: {},
      cashRates: { YER: 1, USD: 540 },
      actualCard: 0,
      floatRetained: 0,
      cashToOwner: 4_100,
      varianceReason: '',
      notes: '',
    });

    expect(payload.cash_rates).toEqual({ YER: 1, USD: 540 });
    // الوضع السريع لا يحفظ فئات وهمية صفرية
    expect(payload.cash_denominations).toEqual({});
  });
});

describe('collectCommitBlockers', () => {
  const summary = buildSummary({ base_currency: 'YER', expected_cash_in_drawer: 10_000 });

  it('blocks a negative net even when the variance is within tolerance', () => {
    const form = buildForm({
      cashCountsByCurrency: { YER: { '1000': 10 } },
      floatRetained: 15_000,
    });
    const view = deriveReconciliationView(summary, form, 'owner');
    const blockers = collectCommitBlockers({ view, varianceReason: '' });

    expect(blockers.some(message => message.includes('سالب'))).toBe(true);
  });

  it('blocks when a counted currency has no exchange rate', () => {
    const form = buildForm({ cashCountsByCurrency: { YER: { '1000': 10 }, USD: { '1': 1 } } });
    const view = deriveReconciliationView(summary, form, 'owner');
    const blockers = collectCommitBlockers({ view, varianceReason: '' });

    expect(blockers.some(message => message.includes('USD'))).toBe(true);
  });

  it('requires a reason only outside the tolerance', () => {
    const balanced = deriveReconciliationView(
      summary,
      buildForm({ cashCountsByCurrency: { YER: { '1000': 10 } } }),
      'owner'
    );
    expect(collectCommitBlockers({ view: balanced, varianceReason: '' })).toEqual([]);

    const shortage = deriveReconciliationView(
      summary,
      buildForm({ cashCountsByCurrency: { YER: { '1000': 5 } } }),
      'owner'
    );
    expect(collectCommitBlockers({ view: shortage, varianceReason: '' }).length).toBe(1);
    expect(collectCommitBlockers({ view: shortage, varianceReason: 'فرق فكة' })).toEqual([]);
  });
});
