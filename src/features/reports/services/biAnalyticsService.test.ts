import { describe, it, expect, vi, beforeEach } from 'vitest';
import { biAnalyticsService } from './biAnalyticsService';
import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('../../../core/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('biAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls get_customer_bi_analytics and extracts server-computed summary without client math', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          party_id: 'c1',
          party_name: 'عميل تجريبي',
          total_records: 42,
          summary_total_revenue: 150000,
          summary_total_profit: 35000,
          summary_champions_count: 5,
        },
      ],
      error: null,
    } as never);

    const res = await biAnalyticsService.getCustomerAnalytics('comp-1', {
      branchId: 'br-1',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-16',
      metric: 'revenue',
      segment: 'all',
      page: 1,
      pageSize: 20,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_customer_bi_analytics', {
      p_company_id: 'comp-1',
      p_branch_id: 'br-1',
      p_date_from: '2026-11-01',
      p_date_to: '2026-11-16',
      p_metric: 'revenue',
      p_loyalty_segment: 'all',
      p_page: 1,
      p_page_size: 20,
      p_search: null,
    });
    expect(res.totalCount).toBe(42);
    expect(res.summary).toEqual({
      totalRevenue: 150000,
      totalProfit: 35000,
      championsCount: 5,
    });
  });

  it('calls get_inventory_bi_analytics and returns backend JSON payload', async () => {
    const payload = {
      summary: { total_products: 100, total_quantity: 500, total_valuation: 75000 },
      by_branch: [],
      by_category: [],
      by_brand: [],
    };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: payload, error: null } as never);

    const res = await biAnalyticsService.getInventoryBiAnalytics('comp-1', null, '2026-11-01', '2026-11-16');

    expect(supabase.rpc).toHaveBeenCalledWith('get_inventory_bi_analytics', {
      p_company_id: 'comp-1',
      p_branch_id: null,
      p_date_from: '2026-11-01',
      p_date_to: '2026-11-16',
    });
    expect(res).toEqual(payload);
  });

  it('logs and rethrows when RPC returns an error', async () => {
    const rpcErr = { message: 'Access denied' };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: rpcErr } as never);

    await expect(
      biAnalyticsService.getSupplierPriceComparison('comp-1', { page: 1, pageSize: 20 })
    ).rejects.toEqual(rpcErr);

    expect(logger.error).toHaveBeenCalledWith(
      'BI',
      'Failed to fetch supplier price comparison: Access denied',
      rpcErr
    );
  });
});
