import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconciliationApi } from './reconciliationApi';
import type { CommitDailyReconciliationDTO } from '../types';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { rpc: vi.fn() } }));

vi.mock('../../../lib/supabaseClient', () => ({ supabase: supabaseMock }));

/**
 * عقد RPC المطابقة: أسماء الوسائط يجب أن تطابق توقيع الدالة في قاعدة البيانات
 * حرفياً (PostgREST يرفض أي وسيط غير معروف). هذا الاختبار يحمي:
 *   1. p_cash_rates الجديد (الخادم يحوّل الفئات بالسعر الذي رآه المستخدم).
 *   2. أن رقم المجاميع لا يُرسل بلا فئات/أسعار (لا مطابقة عمياء).
 */
describe('reconciliationApi.commitReconciliation', () => {
  const basePayload: CommitDailyReconciliationDTO = {
    company_id: 'company-1',
    date: '2026-11-03',
    branch_id: 'branch-1',
    opening_float: 20_000,
    actual_cash_counted: 128_000,
    cash_denominations: { YER: { '1000': 5 }, SAR: { '100': 3 } },
    cash_rates: { YER: 1, SAR: 410 },
    card_terminal_receipt_total: 0,
    float_retained_for_tomorrow: 20_000,
    cash_handed_to_owner: 108_000,
    variance_reason: null,
    notes: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.rpc.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('sends the twelve RPC arguments including the cash rates snapshot', async () => {
    await reconciliationApi.commitReconciliation(basePayload);

    expect(supabaseMock.rpc).toHaveBeenCalledWith('commit_daily_reconciliation', {
      p_company_id: 'company-1',
      p_date: '2026-11-03',
      p_branch_id: 'branch-1',
      p_opening_float: 20_000,
      p_actual_cash_counted: 128_000,
      p_cash_denominations: { YER: { '1000': 5 }, SAR: { '100': 3 } },
      p_cash_rates: { YER: 1, SAR: 410 },
      p_card_terminal_receipt_total: 0,
      p_float_retained_for_tomorrow: 20_000,
      p_cash_handed_to_owner: 108_000,
      p_variance_reason: null,
      p_notes: null,
    });
  });

  it('passes null (not undefined) when no rates were provided', async () => {
    await reconciliationApi.commitReconciliation({ ...basePayload, cash_rates: undefined });

    const args = supabaseMock.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_cash_rates).toBeNull();
    expect(args.p_branch_id).toBe('branch-1');
  });
});
