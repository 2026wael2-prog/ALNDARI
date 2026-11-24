import { describe, it, expect } from 'vitest';
import { collectCommitBlockers, type ReconciliationView } from './DailyReconciliationPage.helpers';

const baseView = (overrides: Partial<ReconciliationView> = {}): ReconciliationView => ({
  currency: 'SAR',
  currencyLabel: 'ر.س',
  actualCashCounted: 0,
  expectedCash: 911.78,
  cashVarianceInfo: {
    variance: -911.78,
    status: 'shortage',
    isWithinTolerance: false,
  },
  salesByCurrency: [],
  hasMixedCurrencySales: false,
  cashRows: [],
  hasForeignCurrencyCounts: false,
  missingRateCurrencies: [],
  tolerance: 10,
  cardVariance: 0,
  expectedCard: 0,
  isAlreadyClosed: false,
  isOwner: true,
  isLocked: false,
  cashToOwner: 0,
  netIsNegative: false,
  ...overrides,
});

describe('DailyReconciliation zero-count guard', () => {
  it('blocks closing with 0 counted cash when expected cash exceeds tolerance and no reason is given', () => {
    const blockers = collectCommitBlockers({
      view: baseView(),
      varianceReason: '',
    });
    expect(blockers.length).toBeGreaterThanOrEqual(1);
    expect(blockers.some(b => b.includes('بصفر كاش'))).toBe(true);
  });

  it('allows closing once an explicit variance reason is provided', () => {
    const blockers = collectCommitBlockers({
      view: baseView(),
      varianceReason: 'تم تسليم كامل الكاش للمالك في منتصف اليوم',
    });
    expect(blockers).toHaveLength(0);
  });
});
