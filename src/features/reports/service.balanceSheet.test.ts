import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsService } from './service';
import { formatLocalDate } from '../../core/utils/dateUtils';

/**
 * اختبار انحدار لـ P0-1: الميزانية العمومية يجب أن تتزن دائماً.
 *   الأصول = الالتزامات + حقوق الملكية (بما فيها صافي ربح الفترة غير المُقفلة)
 *
 * يعتمد على أن `report_balance_sheet` تُرجع صف type='retained_earnings'، وأن
 * `report_balance_sheet_detailed` تُرجع سطر 3999 لصافي ربح الفترة — وأن الواجهة
 * لا تطرح رصيد 3200 (الأرباح المبقاة المرحّلة) كما كان يحدث سابقاً.
 */
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { rpc: vi.fn(), from: vi.fn() } }));

vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseMock }));

interface SummaryRowItem {
  category: string;
  amount: number;
  type: string;
}
interface DetailRowItem {
  account_id: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  balance: number;
  total_debit: number;
  total_credit: number;
}

const summary: SummaryRowItem[] = [
  { category: 'الأصول', amount: 200_000, type: 'asset' },
  { category: 'الالتزامات', amount: 75_000, type: 'liability' },
  { category: 'حقوق الملكية', amount: 125_000, type: 'equity' },
  { category: 'صافي ربح/خسارة الفترة غير المُقفلة', amount: 25_000, type: 'retained_earnings' },
];

const details: DetailRowItem[] = [
  { account_id: 'a1', account_code: '1010', account_name: 'الصندوق', account_type: 'asset', balance: 60_000, total_debit: 60_000, total_credit: 0 },
  { account_id: 'a2', account_code: '1100', account_name: 'ذمم العملاء', account_type: 'asset', balance: 60_000, total_debit: 60_000, total_credit: 0 },
  { account_id: 'a3', account_code: '1200', account_name: 'المخزون', account_type: 'asset', balance: 80_000, total_debit: 80_000, total_credit: 0 },
  { account_id: 'l1', account_code: '2100', account_name: 'ذمم الموردين', account_type: 'liability', balance: 75_000, total_debit: 0, total_credit: 75_000 },
  { account_id: 'e1', account_code: '3100', account_name: 'رأس المال', account_type: 'equity', balance: 100_000, total_debit: 0, total_credit: 100_000 },
  { account_id: 'e2', account_code: '3200', account_name: 'أرباح مبقاة', account_type: 'equity', balance: 0, total_debit: 0, total_credit: 0 },
  { account_id: null, account_code: '3999', account_name: 'صافي ربح/خسارة الفترة غير المُقفلة', account_type: 'equity', balance: 25_000, total_debit: 0, total_credit: 25_000 },
];

/** يحاكي الاستجابتين: الملخص + التفصيل (ويمكن تعطيل التفصيل بخطأ). */
const mockRpc = (options?: { detailedError?: boolean; omitNetProfitRow?: boolean }) => {
  const detailedRows =
    options?.omitNetProfitRow === true
      ? details.filter((row) => row.account_code !== '3999')
      : details;

  supabaseMock.rpc.mockImplementation((name: string) => {
    if (name === 'report_balance_sheet') {
      return Promise.resolve({ data: summary, error: null });
    }
    if (name === 'report_balance_sheet_detailed') {
      return options?.detailedError === true
        ? Promise.resolve({ data: null, error: { message: 'function not found' } })
        : Promise.resolve({ data: detailedRows, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
};

describe('reportsService.getBalanceSheet — اتزان الميزانية (P0-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('تُبني الأقسام من RPC التفصيلي وتتزن المعادلة المحاسبية', async () => {
    mockRpc();

    const result = await reportsService.getBalanceSheet('c1');

    const expectedArgs = { p_company_id: 'c1', p_as_of_date: formatLocalDate() };
    expect(supabaseMock.rpc).toHaveBeenCalledWith('report_balance_sheet', expectedArgs);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('report_balance_sheet_detailed', expectedArgs);

    expect(result.assets).toHaveLength(3);
    expect(result.liabilities).toHaveLength(1);
    // بندان حقوق ملكية + سطر صافي ربح الفترة (3999) القادم من الخادم
    expect(result.equity.map((row) => row.code)).toEqual(['3100', '3200', '3999']);

    expect(result.totalAssets).toBe(200_000);
    expect(result.totalLiabEquity).toBe(200_000);
    expect(result.totalAssets - result.totalLiabEquity).toBe(0);
  });

  it('لا تُلغي رصيد 3200 ولا تضاعف صافي الربح', async () => {
    mockRpc();

    const result = await reportsService.getBalanceSheet('c1');
    const retained = result.equity.find((row) => row.code === '3200');
    const netProfitRows = result.equity.filter((row) => row.code === '3999');

    // صافي ربح الفترة يظهر مرة واحدة فقط
    expect(netProfitRows).toHaveLength(1);
    expect(netProfitRows[0].netBalance).toBe(25_000);

    // الأرباح المبقاة المرحّلة لا تُمس (كانت تُلغى بـ -(رصيد 3200) عبر سطر 3999 مصطنع)
    const equityTotal = result.equity.reduce((sum, row) => sum + row.netBalance, 0);
    expect(equityTotal).toBe(125_000);
    expect(retained?.netBalance).toBe(0);
  });

  it('تضيف سطر 3999 احتياطياً إذا لم يُرجعه الخادم رغم وجود صافي ربح', async () => {
    mockRpc({ omitNetProfitRow: true });

    const result = await reportsService.getBalanceSheet('c1');

    expect(result.equity.filter((row) => row.code === '3999')).toHaveLength(1);
    expect(result.totalLiabEquity).toBe(200_000);
    expect(result.totalAssets).toBe(result.totalLiabEquity);
  });

  it('تعود لمجاميع الملخص إذا فشل RPC التفصيلي (توافق قاعدة بيانات قديمة)', async () => {
    mockRpc({ detailedError: true });

    const result = await reportsService.getBalanceSheet('c1');

    expect(result.assets).toHaveLength(1);
    expect(result.equity).toHaveLength(1);
    expect(result.totalAssets).toBe(200_000);
    // الملخص من الخادم يشمل صافي الربح داخل equity (migration 20261105000001)
    expect(result.totalLiabEquity).toBe(75_000 + 125_000);
    expect(result.totalAssets - result.totalLiabEquity).toBe(0);
  });
});
