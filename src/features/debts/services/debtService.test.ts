import { describe, it, expect } from 'vitest';
import { debtsService, normalizeAnalytics, resolveEngineParams } from './debtService';
import { DEBT_ENGINE_DEFAULTS } from '../api/debtApi';
import type { DebtAnalytics, FollowUpDashboardRow } from '../types';

const row = (partial: Partial<FollowUpDashboardRow>): FollowUpDashboardRow => ({
  party_id: 'p1',
  party_name: 'عميل',
  party_phone: '777123456',
  category: 'عام',
  credit_limit: 0,
  currency_code: 'SAR',
  outstanding_balance: 100,
  overdue_amount: 0,
  oldest_due_date: '2026-08-01',
  next_due_date: '2026-09-01',
  days_overdue: 0,
  classification: 'current',
  reminder_status: 'needs_reminder',
  last_reminded_at: null,
  last_contact_date: null,
  has_broken_promise: false,
  pending_promise_count: 0,
  pending_promise_amount: 0,
  pending_promise_date: null,
  invoice_count: 1,
  opening_balance: 0,
  ...partial,
}) as unknown as FollowUpDashboardRow;

describe('debtsService.filterByTab', () => {
  const rows: FollowUpDashboardRow[] = [
    row({ party_id: 'a', classification: 'critical', reminder_status: 'needs_reminder' }),
    row({
      party_id: 'b',
      classification: 'overdue',
      reminder_status: 'reminded',
      has_broken_promise: true,
    }),
    row({ party_id: 'c', classification: 'due_today', reminder_status: 'needs_reminder' }),
    row({
      party_id: 'd',
      classification: 'due_soon',
      reminder_status: 'reminded',
      pending_promise_count: 2,
    }),
    row({ party_id: 'e', classification: 'current', reminder_status: 'needs_reminder' }),
  ];

  it('returns everything for the "all" tab', () => {
    expect(debtsService.filterByTab(rows, 'all')).toHaveLength(5);
  });

  it('selects needs_reminder rows', () => {
    const out = debtsService.filterByTab(rows, 'needs_reminder');
    expect(out.map(r => r.party_id)).toEqual(['a', 'c', 'e']);
  });

  it('selects reminded rows', () => {
    const out = debtsService.filterByTab(rows, 'reminded');
    expect(out.map(r => r.party_id)).toEqual(['b', 'd']);
  });

  it('selects overdue + critical for the overdue tab', () => {
    const out = debtsService.filterByTab(rows, 'overdue');
    expect(out.map(r => r.party_id)).toEqual(['a', 'b']);
  });

  it('selects due today rows', () => {
    const out = debtsService.filterByTab(rows, 'today');
    expect(out.map(r => r.party_id)).toEqual(['c']);
  });
});

describe('debtsService.prepareReminder', () => {
  it('builds the message and wa.me link, flags missing phone', () => {
    const prepared = debtsService.prepareReminder(
      row({ party_phone: '777123456', outstanding_balance: 250, days_overdue: 5 }),
      'مرحباً {{customer_name}}، مستحق {{amount}} — تأخير {{days_overdue}} أيام.',
      { companyName: 'الجعفري', signature: 'التحصيل' }
    );
    expect(prepared.message).toContain('250.00');
    expect(prepared.recipient).toBe('777123456');
    expect(prepared.whatsappLink).toContain('https://wa.me/777123456?text=');
    expect(prepared.phoneMissing).toBe(false);
  });

  it('flags a missing phone', () => {
    const prepared = debtsService.prepareReminder(row({ party_phone: '' }), 'نص', {});
    expect(prepared.phoneMissing).toBe(true);
    expect(prepared.whatsappLink).toBeNull();
  });
});

describe('normalizeAnalytics (M-9: لا بيانات ≠ صفر)', () => {
  it('returns null when the RPC is missing (server returned null)', () => {
    expect(normalizeAnalytics(null)).toBeNull();
  });

  it('returns null for an undefined payload', () => {
    expect(normalizeAnalytics(undefined)).toBeNull();
  });

  it('returns null for the empty object the server sends when no branch resolves', () => {
    // get_debt_analytics_summary returns '{}'::json when get_auth_branches is empty,
    // which used to render every KPI card as a confident zero.
    expect(normalizeAnalytics({})).toBeNull();
  });

  it('passes a real payload through unchanged', () => {
    const payload = {
      total_receivables: 1200,
      overdue_receivables: 300,
      due_today: 0,
      total_debtors: 2,
      aging: [],
      by_currency: [],
    };
    const out = normalizeAnalytics(payload);
    expect(out).toBe(payload as unknown as DebtAnalytics);
    expect(out?.total_receivables).toBe(1200);
  });

  it('keeps an all-zero payload (a real zero is not "unavailable")', () => {
    const payload = { total_receivables: 0, overdue_receivables: 0, total_debtors: 0 };
    const out = normalizeAnalytics(payload);
    expect(out).not.toBeNull();
    expect(out?.total_receivables).toBe(0);
  });
});

describe('resolveEngineParams', () => {
  it('falls back to engine defaults when no config exists', () => {
    expect(resolveEngineParams(null)).toEqual({
      dueSoonDays: DEBT_ENGINE_DEFAULTS.dueSoonDays,
      criticalDays: DEBT_ENGINE_DEFAULTS.criticalDays,
      reminderWindowDays: DEBT_ENGINE_DEFAULTS.reminderWindowDays,
    });
    expect(resolveEngineParams(undefined)).toEqual({ ...DEBT_ENGINE_DEFAULTS });
  });

  it('uses the saved company config values', () => {
    expect(
      resolveEngineParams({ due_soon_days: 14, critical_days: 60, reminder_window_days: 5 })
    ).toEqual({ dueSoonDays: 14, criticalDays: 60, reminderWindowDays: 5 });
  });

  it('fills only the missing fields from defaults', () => {
    expect(
      resolveEngineParams({
        due_soon_days: 14,
        critical_days: null,
        reminder_window_days: undefined,
      })
    ).toEqual({
      dueSoonDays: 14,
      criticalDays: DEBT_ENGINE_DEFAULTS.criticalDays,
      reminderWindowDays: DEBT_ENGINE_DEFAULTS.reminderWindowDays,
    });
  });
});
