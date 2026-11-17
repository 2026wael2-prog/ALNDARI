import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';
import type {
  BiFilterParams,
  CustomerBiRecord,
  SupplierBiRecord,
  ProductBiRecord,
  Entity360Profile,
  ExecutiveBiSummary,
  SalesBiAnalyticsData,
  InventoryBiData,
  SupplierPriceComparisonRecord,
} from '../types/biAnalytics';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export const biAnalyticsService = {
  /**
   * جلب تحليلات وترتيب العملاء من قاعدة البيانات مباشرة (Backend RPC)
   */
  getCustomerAnalytics: async (
    companyId: string,
    params: BiFilterParams
  ): Promise<{
    data: CustomerBiRecord[];
    totalCount: number;
    summary: {
      totalRevenue: number;
      totalProfit: number;
      championsCount: number;
    };
  }> => {
    const { data, error } = await rpc('get_customer_bi_analytics', {
      p_company_id: companyId,
      p_branch_id: params.branchId || null,
      p_date_from: params.dateFrom || null,
      p_date_to: params.dateTo || null,
      p_metric: params.metric || 'revenue',
      p_loyalty_segment: params.segment || 'all',
      p_page: params.page || 1,
      p_page_size: params.pageSize || 25,
      p_search: params.search || null,
    });

    if (error) {
      logger.error('BI', `Failed to fetch customer BI analytics: ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    const records = (data as unknown as CustomerBiRecord[]) || [];
    const first = records[0];
    return {
      data: records,
      totalCount: first ? Number(first.total_records || 0) : 0,
      summary: {
        totalRevenue: first ? Number(first.summary_total_revenue || 0) : 0,
        totalProfit: first ? Number(first.summary_total_profit || 0) : 0,
        championsCount: first ? Number(first.summary_champions_count || 0) : 0,
      },
    };
  },

  /**
   * جلب تحليلات وترتيب الموردين من قاعدة البيانات مباشرة (Backend RPC)
   */
  getSupplierAnalytics: async (
    companyId: string,
    params: BiFilterParams
  ): Promise<{
    data: SupplierBiRecord[];
    totalCount: number;
    summary: {
      totalPurchases: number;
      totalDues: number;
      avgPaymentRatio: number;
    };
  }> => {
    const { data, error } = await rpc('get_supplier_bi_analytics', {
      p_company_id: companyId,
      p_branch_id: params.branchId || null,
      p_date_from: params.dateFrom || null,
      p_date_to: params.dateTo || null,
      p_metric: params.metric || 'spend',
      p_page: params.page || 1,
      p_page_size: params.pageSize || 25,
      p_search: params.search || null,
    });

    if (error) {
      logger.error('BI', `Failed to fetch supplier BI analytics: ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    const records = (data as unknown as SupplierBiRecord[]) || [];
    const first = records[0];
    return {
      data: records,
      totalCount: first ? Number(first.total_records || 0) : 0,
      summary: {
        totalPurchases: first ? Number(first.summary_total_purchases || 0) : 0,
        totalDues: first ? Number(first.summary_total_dues || 0) : 0,
        avgPaymentRatio: first ? Number(first.summary_avg_payment_ratio || 100) : 100,
      },
    };
  },

  /**
   * جلب تحليلات وحركة وربحية الأصناف من قاعدة البيانات مباشرة (Backend RPC)
   */
  getProductAnalytics: async (
    companyId: string,
    params: BiFilterParams
  ): Promise<{
    data: ProductBiRecord[];
    totalCount: number;
    summary: {
      totalRevenue: number;
      totalCogs: number;
      totalProfit: number;
      stockValuation: number;
    };
  }> => {
    const { data, error } = await rpc('get_product_bi_analytics_v2', {
      p_company_id: companyId,
      p_branch_id: params.branchId || null,
      p_category_id: params.categoryId || null,
      p_date_from: params.dateFrom || null,
      p_date_to: params.dateTo || null,
      p_view_type: params.viewType || 'profitability',
      p_page: params.page || 1,
      p_page_size: params.pageSize || 25,
      p_search: params.search || null,
      p_brand: params.brand || null,
    });

    if (error) {
      logger.error('BI', `Failed to fetch product BI analytics: ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    const records = (data as unknown as ProductBiRecord[]) || [];
    const first = records[0];
    return {
      data: records,
      totalCount: first ? Number(first.total_records || 0) : 0,
      summary: {
        totalRevenue: first ? Number(first.summary_total_revenue || 0) : 0,
        totalCogs: first ? Number(first.summary_total_cogs || 0) : 0,
        totalProfit: first ? Number(first.summary_total_profit || 0) : 0,
        stockValuation: first ? Number(first.summary_stock_valuation || 0) : 0,
      },
    };
  },

  /**
   * جلب الملف التحليلي الشامل 360° لعميل أو مورد أو منتج
   */
  getEntity360Profile: async (
    companyId: string,
    entityType: 'customer' | 'supplier' | 'product',
    entityId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<Entity360Profile | null> => {
    const { data, error } = await rpc('get_entity_360_profile', {
      p_company_id: companyId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
    });

    if (error) {
      logger.error('BI', `Failed to fetch 360 profile (${entityType}:${entityId}): ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    return (data as unknown as Entity360Profile) || null;
  },

  /**
   * جلب ملخص لوحة القيادة التنفيذية العليا ومقارنة الفترات
   */
  getExecutiveBiSummary: async (
    companyId: string,
    branchId?: string | null,
    dateFrom?: string,
    dateTo?: string
  ): Promise<ExecutiveBiSummary | null> => {
    const { data, error } = await rpc('get_executive_bi_summary', {
      p_company_id: companyId,
      p_branch_id: branchId || null,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_compare_period: true,
    });

    if (error) {
      logger.error('BI', `Failed to fetch executive BI summary: ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    return (data as unknown as ExecutiveBiSummary) || null;
  },

  /**
   * جلب تحليلات المبيعات حسب الفروع وطرق الدفع والاتجاه اليومي
   */
  getSalesBiAnalytics: async (
    companyId: string,
    branchId?: string | null,
    dateFrom?: string,
    dateTo?: string
  ): Promise<SalesBiAnalyticsData | null> => {
    const { data, error } = await rpc('get_sales_bi_analytics', {
      p_company_id: companyId,
      p_branch_id: branchId || null,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
    });

    if (error) {
      logger.error('BI', `Failed to fetch sales BI analytics: ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    return (data as unknown as SalesBiAnalyticsData) || null;
  },

  /**
   * جلب تحليلات المخزون المتقدمة حسب الفروع والتصنيفات والماركات والتحويلات والجرد
   */
  getInventoryBiAnalytics: async (
    companyId: string,
    branchId?: string | null,
    dateFrom?: string,
    dateTo?: string
  ): Promise<InventoryBiData | null> => {
    const { data, error } = await rpc('get_inventory_bi_analytics', {
      p_company_id: companyId,
      p_branch_id: branchId || null,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
    });

    if (error) {
      logger.error('BI', `Failed to fetch inventory BI analytics: ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    return (data as unknown as InventoryBiData) || null;
  },

  /**
   * مقارنة أسعار الشراء التاريخية للمنتجات بين الموردين
   */
  getSupplierPriceComparison: async (
    companyId: string,
    params: BiFilterParams
  ): Promise<{ data: SupplierPriceComparisonRecord[]; totalCount: number }> => {
    const { data, error } = await rpc('get_supplier_price_comparison_v2', {
      p_company_id: companyId,
      p_date_from: params.dateFrom || null,
      p_date_to: params.dateTo || null,
      p_page: params.page || 1,
      p_page_size: params.pageSize || 25,
      p_search: params.search || null,
    });

    if (error) {
      logger.error('BI', `Failed to fetch supplier price comparison: ${error.message ?? 'unknown'}`, error);
      throw error;
    }

    const records = (data as unknown as SupplierPriceComparisonRecord[]) || [];
    const first = records[0];
    return {
      data: records,
      totalCount: first ? Number(first.total_records || 0) : 0,
    };
  },
};
