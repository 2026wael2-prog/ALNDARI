import { describe, it, expect, beforeEach } from 'vitest';
import {
  useAnalyticsFilterStore,
  computePeriodDateRange,
  formatLocalDate,
} from './analyticsFilterStore';

describe('analyticsFilterStore', () => {
  beforeEach(() => {
    useAnalyticsFilterStore.getState().resetFilters();
  });

  it('initializes with default month period and ALL filters', () => {
    const state = useAnalyticsFilterStore.getState();
    expect(state.period).toBe('month');
    expect(state.currency).toBe('ALL');
    expect(state.paymentType).toBe('ALL');
    expect(state.branchId).toBeNull();
  });

  it('computes correct date range for today', () => {
    const range = computePeriodDateRange('today');
    const today = formatLocalDate(new Date());
    expect(range.startDate).toBe(today);
    expect(range.endDate).toBe(today);
  });

  it('updates currency and payment type correctly', () => {
    const { setCurrency, setPaymentType } = useAnalyticsFilterStore.getState();
    setCurrency('SAR');
    expect(useAnalyticsFilterStore.getState().currency).toBe('SAR');

    setPaymentType('cash');
    expect(useAnalyticsFilterStore.getState().paymentType).toBe('cash');
  });

  it('updates branchId correctly', () => {
    const { setBranchId } = useAnalyticsFilterStore.getState();
    setBranchId('branch-123');
    expect(useAnalyticsFilterStore.getState().branchId).toBe('branch-123');
  });

  it('supports custom date range', () => {
    const { setPeriod } = useAnalyticsFilterStore.getState();
    setPeriod('custom', { startDate: '2026-01-01', endDate: '2026-01-31' });
    const state = useAnalyticsFilterStore.getState();
    expect(state.period).toBe('custom');
    expect(state.startDate).toBe('2026-01-01');
    expect(state.endDate).toBe('2026-01-31');
  });

  it('resets filters cleanly', () => {
    const { setCurrency, setPaymentType, setBranchId, resetFilters } =
      useAnalyticsFilterStore.getState();
    setCurrency('YER');
    setPaymentType('credit');
    setBranchId('b-999');

    resetFilters();
    const state = useAnalyticsFilterStore.getState();
    expect(state.currency).toBe('ALL');
    expect(state.paymentType).toBe('ALL');
    expect(state.branchId).toBeNull();
    expect(state.period).toBe('month');
  });
});
