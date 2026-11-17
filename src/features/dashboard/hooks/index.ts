import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logger } from '../../../core/utils/logger';
import { useAuthStore } from '../../auth/store';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';
import { dashboardApi } from '../api/index';
import type { DashboardDataPayload } from '../models';
import { type DashboardPeriod, getPeriodDates } from '../types';
import {
  DASHBOARD_FALLBACK_DATA,
  type RawDashboardData,
  transformRawDashboardData,
} from './dashboardMappers';
import { useDashboardRealtime } from './useDashboardRealtime';

interface UseDashboardDataResult extends DashboardDataPayload {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isFetching: boolean;
  data: DashboardDataPayload | null;
}

export const useDashboardData = (period: DashboardPeriod = 'today'): UseDashboardDataResult => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();

  const { dateFrom, dateTo } = useMemo(() => getPeriodDates(period), [period]);

  useDashboardRealtime(companyId, branchId);

  const rawDataQuery = useQuery({
    queryKey: ['dashboard_raw_data', companyId, branchId, period],
    queryFn: async ({ signal }): Promise<RawDashboardData | null> => {
      if (!companyId) return null;
      try {
        const result = await dashboardApi.fetchRawDashboardData(companyId, {
          signal,
          branchId,
          dateFrom,
          dateTo,
        });
        return result as unknown as RawDashboardData;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (err.name !== 'AbortError' && !signal.aborted) {
          logger.warn('hooks', 'Dashboard data fetch failed, using fallback', {
            message: err.message,
          });
        }
        return null;
      }
    },
    enabled: !!companyId,
    placeholderData: prev => prev,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const processedData = useMemo<DashboardDataPayload | null>(
    () => transformRawDashboardData(rawDataQuery.data),
    [rawDataQuery.data]
  );

  return {
    ...rawDataQuery,
    data: processedData,
    ...(processedData ?? DASHBOARD_FALLBACK_DATA),
  };
};

export const useDashboardStats = () => {
  const { stats, isLoading, error } = useDashboardData();
  return { stats, isLoading, error };
};

export const useSalesChart = (_period: 'today' | 'week' | 'month' | 'year' = 'week') => {
  const { salesData, isLoading } = useDashboardData();
  return { chartData: salesData, isLoading };
};

export const useInventoryChart = () => {
  const { categoryData, isLoading } = useDashboardData();
  return { chartData: categoryData, isLoading };
};

export const useRecentActivity = (limit = 5) => {
  const { recentActivities, isLoading } = useDashboardData();
  return { activities: recentActivities.slice(0, limit), isLoading };
};

export const useTopProducts = (limit = 5) => {
  const { topProducts, isLoading } = useDashboardData();
  return { products: topProducts.slice(0, limit), isLoading };
};

export const useTopCustomers = (limit = 5) => {
  const { topCustomers, isLoading } = useDashboardData();
  return { customers: topCustomers.slice(0, limit), isLoading };
};

export const useDashboardAlerts = () => {
  const { alerts, isLoading } = useDashboardData();
  return { alerts, isLoading, hasAlerts: alerts.length > 0 };
};

export default useDashboardData;
