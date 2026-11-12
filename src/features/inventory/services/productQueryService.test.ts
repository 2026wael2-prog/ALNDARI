import { describe, it, expect, vi, beforeEach } from 'vitest';
import { productQueryService, productQueryKeys } from './productQueryService';
import { supabase } from '../../../lib/supabaseClient';

vi.mock('../../../lib/supabaseClient', () => {
  const rpcMock = vi.fn();
  const fromMock = vi.fn();
  return {
    supabase: {
      rpc: rpcMock,
      from: fromMock,
    },
  };
});

describe('productQueryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query keys factory', () => {
    it('generates consistent paginated query keys', () => {
      const key = productQueryKeys.paginated('company-123', {
        page: 2,
        pageSize: 25,
        searchTerm: 'فلتر',
        sortKey: 'name_ar',
        sortDir: 'asc',
      });
      expect(key).toEqual([
        'products',
        'paginated',
        'company-123',
        2,
        25,
        'فلتر',
        'name_ar',
        'asc',
        null,
        null,
        null,
      ]);
    });

    it('generates minimal query key with limit', () => {
      const key = productQueryKeys.minimal('company-123', 500);
      expect(key).toEqual(['products', 'minimal', 'company-123', 500]);
    });
  });

  describe('fetchPaginated', () => {
    it('returns empty result when companyId is missing', async () => {
      const res = await productQueryService.fetchPaginated('');
      expect(res.data).toEqual([]);
      expect(res.totalCount).toBe(0);
      expect(res.totalPages).toBe(0);
    });

    it('calls search_inventory_paginated RPC with normalized term and branch', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            id: 'prod-1',
            company_id: 'c1',
            name_ar: 'فلتر زيت تويوتا',
            sku: 'TOY-1',
            part_number: '04152-YZZA6',
            brand: 'Toyota',
            sale_price: 25,
            purchase_price: 15,
            min_stock_level: 5,
            unit: 'حبه',
            total_count: 1,
            stock: [{ warehouse_id: 'w1', quantity: 10 }],
          },
        ],
        error: null,
      } as any);

      const res = await productQueryService.fetchPaginated('c1', {
        searchTerm: '  فلتر  ',
        page: 1,
        pageSize: 20,
        branchId: 'b1',
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'search_inventory_paginated',
        expect.objectContaining({
          p_company_id: 'c1',
          p_term: 'فلتر',
          p_limit: 20,
          p_offset: 0,
          p_branch_id: 'b1',
        })
      );

      expect(res.data.length).toBe(1);
      expect(res.totalCount).toBe(1);
      expect(res.data[0].name_ar).toBe('فلتر زيت تويوتا');
      expect(res.data[0].stock_quantity).toBe(10);
    });
  });

  describe('searchQuick', () => {
    it('returns empty array when query is blank', async () => {
      const res = await productQueryService.searchQuick('c1', '   ');
      expect(res).toEqual([]);
    });

    it('returns mapped products when RPC succeeds', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            id: 'prod-1',
            company_id: 'c1',
            name_ar: 'بواجي بوش',
            sku: 'BOSCH-1',
            sale_price: 40,
            stock: [{ warehouse_id: 'w1', quantity: 20 }],
          },
        ],
        error: null,
      } as any);

      const res = await productQueryService.searchQuick('c1', 'بواجي', 'b1', 10);
      expect(res.length).toBe(1);
      expect(res[0].name_ar).toBe('بواجي بوش');
    });
  });
});

