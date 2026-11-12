import { describe, it, expect } from 'vitest';
import type { DebtPriorityQueueRow } from '../types';
import {
  EMPTY_QUEUE_FILTERS,
  QUEUE_SAVED_VIEWS,
  buildQueueFilterOptions,
  coverageShare,
  filterQueueRows,
  heatLevel,
  isFilterActive,
  isSavedViewActive,
  isStaleContact,
  matchesQueueFilters,
  queueRowId,
  scoreBand,
  summarizeQueue,
  type QueueFilters,
} from './queueGrid';

const row = (overrides: Partial<DebtPriorityQueueRow> = {}): DebtPriorityQueueRow => ({
  task_id: 'inv:1',
  task_type: 'overdue',
  party_id: 'p1',
  party_name: 'مؤسسة النور',
  party_phone: '777123456',
  currency_code: 'SAR',
  amount: 1000,
  reference_info: 'INV-100',
  urgency: 'high',
  priority: 'high',
  due_at: '2026-10-01T00:00:00Z',
  is_overdue: true,
  assigned_to: 'u1',
  assigned_name: 'محصّل أول',
  escalation_stage: 'call',
  amount_base: 1000,
  days_late: 20,
  days_since_contact: 3,
  priority_score: 80,
  next_action: 'اتصل بالعميل اليوم',
  score_drivers: ['متأخر 20 يوماً'],
  ...overrides,
});

const withFilters = (patch: Partial<QueueFilters>): QueueFilters => ({
  ...EMPTY_QUEUE_FILTERS,
  ...patch,
});

describe('queueRowId', () => {
  it('uses the task id because one party can own several queue tasks', () => {
    expect(queueRowId(row())).toBe('inv:1');
    expect(queueRowId(undefined)).toBe('');
    expect(queueRowId(null)).toBe('');
  });
});

describe('filterQueueRows', () => {
  const rows = [
    row(),
    row({
      task_id: 'inv:2',
      party_name: 'شركة الفجر',
      party_phone: null,
      reference_info: null,
      currency_code: 'YER',
      amount_base: 250,
      days_late: 0,
      days_since_contact: 40,
      priority_score: 30,
      escalation_stage: 'monitor',
      task_type: 'upcoming',
      score_drivers: null,
    }),
  ];

  it('matches the party name through Arabic normalisation', () => {
    expect(filterQueueRows(rows, withFilters({ search: 'الفجر' }))).toHaveLength(1);
  });

  it('matches phone, reference and score drivers', () => {
    expect(filterQueueRows(rows, withFilters({ search: '777123456' }))).toHaveLength(1);
    expect(filterQueueRows(rows, withFilters({ search: 'INV-100' }))).toHaveLength(1);
    expect(filterQueueRows(rows, withFilters({ search: '20 يوماً' }))).toHaveLength(1);
  });

  it('applies score and lateness thresholds', () => {
    expect(filterQueueRows(rows, withFilters({ minScore: 70 }))).toHaveLength(1);
    expect(filterQueueRows(rows, withFilters({ minDaysLate: 30 }))).toHaveLength(0);
  });

  it('filters by currency, stage and assignee', () => {
    expect(filterQueueRows(rows, withFilters({ currency: 'YER' }))).toHaveLength(1);
    expect(filterQueueRows(rows, withFilters({ stage: 'monitor' }))).toHaveLength(1);
    expect(filterQueueRows(rows, withFilters({ assignee: 'u1' }))).toHaveLength(2);
    expect(filterQueueRows(rows, withFilters({ assignee: 'u9' }))).toHaveLength(0);
  });

  it('filters rows without phone and rows that are overdue', () => {
    expect(filterQueueRows(rows, withFilters({ onlyPhone: true }))).toHaveLength(1);
    expect(filterQueueRows(rows, withFilters({ onlyOverdue: true }))).toHaveLength(1);
  });

  it('treats a missing contact record as a stale contact', () => {
    const stale = filterQueueRows(rows, withFilters({ onlyStaleContact: true }));
    expect(stale.map(item => item.task_id)).toEqual(['inv:2']);
  });

  it('keeps every row when filters are empty', () => {
    const sample = row();
    expect(matchesQueueFilters(sample, EMPTY_QUEUE_FILTERS)).toBe(true);
    expect(filterQueueRows(rows, EMPTY_QUEUE_FILTERS)).toHaveLength(2);
  });
});

describe('isStaleContact', () => {
  it('flags null and 7+ days only', () => {
    expect(isStaleContact(null)).toBe(true);
    expect(isStaleContact(7)).toBe(true);
    expect(isStaleContact(6)).toBe(false);
  });
});

describe('summarizeQueue', () => {
  it('sums the base-currency amount only and averages the rest', () => {
    const summary = summarizeQueue([
      row(),
      row({ task_id: 'inv:2', amount_base: 500, amount: 500, days_late: 0, priority_score: 40 }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.baseTotal).toBe(1500);
    expect(summary.overdueBaseTotal).toBe(1000);
    expect(summary.avgDaysLate).toBe(10);
    expect(summary.maxDaysLate).toBe(20);
    expect(summary.avgScore).toBe(60);
    expect(summary.currencies).toBe(1);
    expect(summary.withPhone).toBe(2);
  });

  it('is safe on an empty queue', () => {
    const summary = summarizeQueue([]);
    expect(summary).toMatchObject({ count: 0, baseTotal: 0, avgDaysLate: 0, maxDaysLate: 0 });
  });
});

describe('coverageShare', () => {
  it('returns a one-decimal percentage and never divides by zero', () => {
    expect(coverageShare(250, 1000)).toBe(25);
    expect(coverageShare(1, 3)).toBe(33.3);
    expect(coverageShare(10, 0)).toBe(0);
  });
});

describe('heatLevel', () => {
  it('maps relative intensity to three heat buckets', () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(100, 100)).toBe(3);
    expect(heatLevel(50, 100)).toBe(2);
    expect(heatLevel(10, 100)).toBe(1);
    expect(heatLevel(10, 0)).toBe(0);
  });
});

describe('scoreBand', () => {
  it('splits scores at 45 and 70', () => {
    expect(scoreBand(70)).toBe('critical');
    expect(scoreBand(69)).toBe('high');
    expect(scoreBand(44)).toBe('normal');
  });
});

describe('QUEUE_SAVED_VIEWS', () => {
  it('exposes a critical preset that activates only when fully applied', () => {
    const view = QUEUE_SAVED_VIEWS.find(item => item.id === 'critical');
    if (view === undefined) throw new Error('critical preset is missing');
    expect(isSavedViewActive(withFilters({ minScore: 70 }), view)).toBe(true);
    expect(isSavedViewActive(withFilters({ minScore: 70, onlyPhone: true }), view)).toBe(false);
  });
});

describe('buildQueueFilterOptions', () => {
  it('derives currencies, stages and assignees from the rows themselves', () => {
    const options = buildQueueFilterOptions([
      row(),
      row({ task_id: 'inv:2', currency_code: 'YER', escalation_stage: 'visit', assigned_to: 'u2' }),
      row({ task_id: 'inv:3', currency_code: null, escalation_stage: null, assigned_to: null }),
    ]);
    expect(options.currencies).toEqual(['SAR', 'YER']);
    expect(options.stages).toEqual(['call', 'visit']);
    expect(options.assignees.map(item => item.id)).toEqual(['u1', 'u2']);
  });
});

describe('isFilterActive', () => {
  it('detects when filters deviate from defaults', () => {
    expect(isFilterActive(EMPTY_QUEUE_FILTERS)).toBe(false);
    expect(isFilterActive(withFilters({ search: 'أحمد' }))).toBe(true);
    expect(isFilterActive(withFilters({ minScore: 50 }))).toBe(true);
    expect(isFilterActive(withFilters({ onlyPhone: true }))).toBe(true);
  });
});
