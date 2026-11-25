import { supabase } from '../../../../lib/supabaseClient';
import { optArg } from '@/core/utils/rpcArgs';
import type {
  AdminCompany,
  AdminUser,
  SubscriptionPlan,
  TrialExtensionResult,
} from '../../types';
import {
  collectPaginatedChunks,
  toAdminCompany,
  toAdminUser,
  toSubscriptionPlan,
} from './adminMappers';

export const adminCompaniesAndPlansService = {
  async getCompanies(params?: {
    search?: string | undefined;
    status?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<AdminCompany[]> {
    const { data, error } = await supabase.rpc('get_admin_companies_list', {
      ...optArg('p_search', params?.search?.trim()),
      ...optArg('p_status', params?.status),
      p_limit: params?.limit ?? 50,
      p_offset: params?.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []).map(toAdminCompany);
  },

  async getCompaniesCount(params?: {
    search?: string | undefined;
    status?: string | undefined;
  }): Promise<number> {
    const { data, error } = await supabase.rpc('get_admin_companies_count', {
      ...optArg('p_search', params?.search?.trim()),
      ...optArg('p_status', params?.status),
    });
    if (error) throw error;
    return data ?? 0;
  },

  async toggleCompanyStatus(
    companyId: string,
    isActive: boolean,
    status: string
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('toggle_company_status', {
      p_company_id: companyId,
      p_is_active: isActive,
      p_status: status,
    });
    if (error) throw error;
    return data;
  },

  async extendTrial(companyId: string, days: number): Promise<TrialExtensionResult> {
    const { data, error } = await supabase.rpc('extend_company_trial', {
      p_company_id: companyId,
      p_days: days,
    });
    if (error) throw error;
    const res = data as unknown as { trial_ends_at?: string; subscription_status?: string };
    return {
      trial_ends_at: res?.trial_ends_at ?? '',
      subscription_status: (res?.subscription_status ??
        'trial') as AdminCompany['subscription_status'],
    };
  },

  async assignCompanyPlan(companyId: string, planId: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('admin_assign_company_plan', {
      p_company_id: companyId,
      p_plan_id: planId as string,
    });
    if (error) throw error;
    return data;
  },

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;

    const companyCounts = new Map<string, number>();
    try {
      const { data: companiesData } = await supabase
        .from('companies')
        .select('plan_id')
        .not('plan_id', 'is', null);

      if (companiesData) {
        for (const row of companiesData) {
          if (row.plan_id) {
            companyCounts.set(row.plan_id, (companyCounts.get(row.plan_id) ?? 0) + 1);
          }
        }
      }
    } catch {
      // في حال تعذر احتساب المنشآت، يستمر العرض دون إيقاف الواجهة
    }

    return (data ?? []).map(row => {
      const plan = toSubscriptionPlan(row);
      if (plan.id) {
        plan.companies_count = companyCounts.get(plan.id) ?? 0;
      }
      return plan;
    });
  },

  async saveSubscriptionPlan(plan: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const payload = {
      name_ar: plan.name_ar ?? '',
      name_en: plan.name_en ?? '',
      price_monthly: plan.price_monthly ?? 0,
      price_yearly: plan.price_yearly ?? 0,
      max_users: plan.max_users ?? 5,
      max_products: plan.max_products ?? 1000,
      max_invoices_monthly: plan.max_invoices_monthly ?? 500,
      ai_tokens_monthly: plan.ai_tokens_monthly ?? 100000,
      features: plan.features ?? [],
      is_active: plan.is_active ?? true,
      color: plan.color ?? '#3B82F6',
      sort_order: plan.sort_order ?? 0,
    };

    const query = plan.id
      ? supabase.from('subscription_plans').update(payload).eq('id', plan.id).select().single()
      : supabase.from('subscription_plans').insert(payload).select().single();

    const { data, error } = await query;
    if (error) {
      if (error.code === '23505') {
        throw new Error('اسم باقة الاشتراك مسجل مسبقاً، يرجى اختيار اسم مختلف');
      }
      throw error;
    }
    return toSubscriptionPlan(data);
  },

  async deleteSubscriptionPlan(planId: string): Promise<void> {
    const { error } = await supabase.from('subscription_plans').delete().eq('id', planId);
    if (error) {
      if (
        error.code === '23503' ||
        error.message?.includes('foreign key') ||
        error.message?.includes('companies')
      ) {
        throw new Error(
          'لا يمكن حذف هذه الباقة لوجود منشآت مشتركة بها حالياً. قم بإلغاء أو تعديل اشتراك المنشآت أولاً.'
        );
      }
      throw error;
    }
  },

  async getUsers(params?: {
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<AdminUser[]> {
    const { data, error } = await supabase.rpc('get_admin_users_list', {
      ...optArg('p_search', params?.search?.trim()),
      p_limit: params?.limit ?? 50,
      p_offset: params?.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []).map(toAdminUser);
  },

  async getUsersCount(search?: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_admin_users_count', {
      ...optArg('p_search', search?.trim()),
    });
    if (error) throw error;
    return data ?? 0;
  },

  async toggleSuperAdmin(userId: string, makeSuperAdmin: boolean): Promise<boolean> {
    const { data, error } = await supabase.rpc('toggle_super_admin', {
      p_target_user_id: userId,
      p_make_super_admin: makeSuperAdmin,
    });
    if (error) throw error;
    return data;
  },

  async exportAllCompanies(
    chunkSize: number,
    params?: { search?: string | undefined; status?: string | undefined }
  ): Promise<AdminCompany[]> {
    return collectPaginatedChunks(
      chunkSize,
      async (offset, limit) => {
        const { data, error } = await supabase.rpc('get_admin_companies_list', {
          ...optArg('p_search', params?.search?.trim()),
          ...optArg('p_status', params?.status),
          p_limit: limit,
          p_offset: offset,
        });
        if (error) throw error;
        return data ?? [];
      },
      toAdminCompany
    );
  },

  async exportAllUsers(chunkSize: number, search?: string): Promise<AdminUser[]> {
    return collectPaginatedChunks(
      chunkSize,
      async (offset, limit) => {
        const { data, error } = await supabase.rpc('get_admin_users_list', {
          ...optArg('p_search', search?.trim()),
          p_limit: limit,
          p_offset: offset,
        });
        if (error) throw error;
        return data ?? [];
      },
      toAdminUser
    );
  },
};
