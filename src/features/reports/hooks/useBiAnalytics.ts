import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';
import { biAnalyticsService } from '../services/biAnalyticsService';
import type { BiFilterParams } from '../types/biAnalytics';

export const useCustomerBiAnalytics = (params: BiFilterParams) => {
  const { user } = useAuthStore();
  const { branchId: globalBranchId } = useBranchFilter();
  const companyId = user?.company_id;
  const effectiveBranchId = params.branchId !== undefined ? params.branchId : globalBranchId;

  return useQuery({
    queryKey: ['customer_bi_analytics', companyId, effectiveBranchId, params],
    queryFn: () =>
      companyId
        ? biAnalyticsService.getCustomerAnalytics(companyId, {
            ...params,
            branchId: effectiveBranchId,
          })
        : { data: [], totalCount: 0, summary: { totalRevenue: 0, totalProfit: 0, championsCount: 0 } },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
};

export const useSupplierBiAnalytics = (params: BiFilterParams) => {
  const { user } = useAuthStore();
  const { branchId: globalBranchId } = useBranchFilter();
  const companyId = user?.company_id;
  const effectiveBranchId = params.branchId !== undefined ? params.branchId : globalBranchId;

  return useQuery({
    queryKey: ['supplier_bi_analytics', companyId, effectiveBranchId, params],
    queryFn: () =>
      companyId
        ? biAnalyticsService.getSupplierAnalytics(companyId, {
            ...params,
            branchId: effectiveBranchId,
          })
        : { data: [], totalCount: 0, summary: { totalPurchases: 0, totalDues: 0, avgPaymentRatio: 100 } },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
};

export const useProductBiAnalytics = (params: BiFilterParams) => {
  const { user } = useAuthStore();
  const { branchId: globalBranchId } = useBranchFilter();
  const companyId = user?.company_id;
  const effectiveBranchId = params.branchId !== undefined ? params.branchId : globalBranchId;

  return useQuery({
    queryKey: ['product_bi_analytics', companyId, effectiveBranchId, params],
    queryFn: () =>
      companyId
        ? biAnalyticsService.getProductAnalytics(companyId, {
            ...params,
            branchId: effectiveBranchId,
          })
        : { data: [], totalCount: 0, summary: { totalRevenue: 0, totalCogs: 0, totalProfit: 0, stockValuation: 0 } },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
};

export const useEntity360Profile = (
  entityType: 'customer' | 'supplier' | 'product' | null,
  entityId: string | null,
  dateFrom?: string,
  dateTo?: string
) => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['entity_360_profile', companyId, entityType, entityId, dateFrom, dateTo],
    queryFn: () =>
      companyId && entityType && entityId
        ? biAnalyticsService.getEntity360Profile(companyId, entityType, entityId, dateFrom, dateTo)
        : null,
    enabled: !!companyId && !!entityType && !!entityId,
    staleTime: 60 * 1000,
  });
};

export const useExecutiveBiSummary = (
  branchId?: string | null,
  dateFrom?: string,
  dateTo?: string
) => {
  const { user } = useAuthStore();
  const { branchId: globalBranchId } = useBranchFilter();
  const companyId = user?.company_id;
  const effectiveBranchId = branchId !== undefined ? branchId : globalBranchId;

  return useQuery({
    queryKey: ['executive_bi_summary', companyId, effectiveBranchId, dateFrom, dateTo],
    queryFn: () =>
      companyId
        ? biAnalyticsService.getExecutiveBiSummary(companyId, effectiveBranchId, dateFrom, dateTo)
        : null,
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
};

export const useSalesBiAnalytics = (
  branchId?: string | null,
  dateFrom?: string,
  dateTo?: string
) => {
  const { user } = useAuthStore();
  const { branchId: globalBranchId } = useBranchFilter();
  const companyId = user?.company_id;
  const effectiveBranchId = branchId !== undefined ? branchId : globalBranchId;

  return useQuery({
    queryKey: ['sales_bi_analytics', companyId, effectiveBranchId, dateFrom, dateTo],
    queryFn: () =>
      companyId
        ? biAnalyticsService.getSalesBiAnalytics(companyId, effectiveBranchId, dateFrom, dateTo)
        : null,
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
};

export const useInventoryBiAnalytics = (
  branchId?: string | null,
  dateFrom?: string,
  dateTo?: string
) => {
  const { user } = useAuthStore();
  const { branchId: globalBranchId } = useBranchFilter();
  const companyId = user?.company_id;
  const effectiveBranchId = branchId !== undefined ? branchId : globalBranchId;

  return useQuery({
    queryKey: ['inventory_bi_analytics', companyId, effectiveBranchId, dateFrom, dateTo],
    queryFn: () =>
      companyId
        ? biAnalyticsService.getInventoryBiAnalytics(companyId, effectiveBranchId, dateFrom, dateTo)
        : null,
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
};

export const useSupplierPriceComparison = (params: BiFilterParams) => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['supplier_price_comparison', companyId, params],
    queryFn: () =>
      companyId
        ? biAnalyticsService.getSupplierPriceComparison(companyId, params)
        : { data: [], totalCount: 0 },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
};
