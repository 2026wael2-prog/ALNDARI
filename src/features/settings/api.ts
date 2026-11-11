import { supabase } from '../../lib/supabaseClient';
import type { TableUpdate } from '@/core/types/supabase-helpers';
import type {
  CompanyFormData,
  WarehouseFormData,
  FiscalYearFormData,
  ExchangeRateFormData,
  BranchFormData,
} from './types';
import { logger } from '../../core/utils/logger';

export const settingsApi = {
  getCompany: async (companyId: string) => {
    // ⚡ maybeSingle (وليس single): عندما لا توجد الشركة أو لا تُرى عبر RLS،
    // .single() تجعل PostgREST يرد بـ HTTP 406 / PGRST116
    // ("JSON object requested, multiple (or no) rows returned") وتُعالجه
    // React Query كخطأ يُعاد 3 مرات — عاصفة طلبات متكررة.
    // maybeSingle ترجع { data: null, error: null } بدلاً من رمي خطأ.
    return await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
  },

  updateCompany: async (companyId: string, data: CompanyFormData) => {
    return await supabase
      .from('companies')
      .update(data as unknown as TableUpdate<'companies'>)
      .eq('id', companyId)
      .select()
      .single();
  },

  getBranches: async (companyId: string) => {
    const res = await supabase
      .from('branches')
      .select('*, warehouses(id, name_ar, location, is_primary, deleted_at)')
      .eq('company_id', companyId)
      .order('is_main', { ascending: false })
      .order('name', { ascending: true });

    if (res.data) {
      res.data = res.data.map(b => ({
        ...b,
        warehouses: (b.warehouses || [])
          .filter(w => !w.deleted_at)
          .map(w => ({
            ...w,
            name: w.name_ar,
          })),
      }));
    }
    return res;
  },

  createBranch: async (companyId: string, data: BranchFormData) => {
    const { code, integration_mode, ...rest } = data;
    const payload = {
      ...rest,
      code: code?.trim() ? code.trim().toUpperCase() : null,
      ...(integration_mode ? { integration_mode } : {}),
      company_id: companyId,
    };
    const res = await supabase.from('branches').insert(payload).select().single();

    // التأكد من إنشاء مستودع رئيسي خاص بالفرع الجديد تلقائياً إذا لم ينشئه الـ Trigger بعد
    if (res.data && !res.error) {
      const { data: existingWh } = await supabase
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('branch_id', res.data.id)
        .is('deleted_at', null)
        .limit(1);

      if (!existingWh || existingWh.length === 0) {
        await supabase.from('warehouses').insert({
          company_id: companyId,
          branch_id: res.data.id,
          name_ar: `مستودع ${res.data.name}`,
          location: res.data.address || null,
          is_primary: true,
          status: 'active',
        });
      }
    }

    return res;
  },

  updateBranch: async (id: string, data: BranchFormData) => {
    const { code, integration_mode, ...rest } = data;
    const payload = {
      ...rest,
      ...(code !== undefined ? { code: code?.trim() ? code.trim().toUpperCase() : null } : {}),
      ...(integration_mode ? { integration_mode } : {}),
    };
    return await supabase.from('branches').update(payload).eq('id', id).select().single();
  },

  deleteBranch: async (id: string) => {
    const res = await supabase.from('branches').delete().eq('id', id);
    // إذا كان الفرع مرتبطاً بفواتير أو مستودعات أو حركات (23503)، نقوم بتعطيله بدلاً من الانهيار
    if (res.error && res.error.code === '23503') {
      return await supabase.from('branches').update({ status: 'inactive' }).eq('id', id);
    }
    return res;
  },

  // إدارة الفريق والدعوات (Team Management)
  getInvitations: async (companyId: string) => {
    return await supabase
      .from('invitations')
      .select('*, branches(name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
  },
  inviteUser: async (
    email: string,
    role: string,
    companyId: string,
    _userId: string,
    branchId?: string | null
  ) => {
    // استدعاء الدالة الخلفية لإرسال إيميل حقيقي عبر Supabase Auth
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: {
        email,
        role,
        company_id: companyId,
        branch_id: branchId || null,
      },
    });

    if (error) {
      throw error;
    }

    // الدالة الخلفية ستقوم بإرجاع بيانات الدعوة بعد نجاحها
    return { data, error: null };
  },
  revokeInvitation: async (id: string) => {
    return await supabase.from('invitations').delete().eq('id', id);
  },

  getAuditLogs: async (companyId: string) => {
    return await supabase
      .from('audit_logs')
      .select('*, profiles:user_id(full_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100);
  },

  getWarehouses: async (companyId: string, branchId?: string | null) => {
    let query = supabase
      .from('warehouses')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name_ar', { ascending: true });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    return await query;
  },

  createWarehouse: async (companyId: string, data: WarehouseFormData) => {
    return await supabase
      .from('warehouses')
      .insert({ ...data, company_id: companyId })
      .select()
      .single();
  },

  deleteWarehouse: async (id: string) => {
    return await supabase
      .from('warehouses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
  },

  setPrimaryWarehouse: async (companyId: string, warehouseId: string) => {
    // جلب الفرع التابع له هذا المستودع لحصر إلغاء (is_primary) ضمن نفس الفرع فقط
    const { data: targetWh } = await supabase
      .from('warehouses')
      .select('branch_id')
      .eq('id', warehouseId)
      .maybeSingle();

    let resetQuery = supabase
      .from('warehouses')
      .update({ is_primary: false })
      .eq('company_id', companyId);

    if (targetWh?.branch_id) {
      resetQuery = resetQuery.eq('branch_id', targetWh.branch_id);
    }

    const { error: resetError } = await resetQuery;
    if (resetError) throw resetError;

    // ثانياً: تعيين المستودع المحدد كأساسي
    const result = await supabase
      .from('warehouses')
      .update({ is_primary: true })
      .eq('id', warehouseId)
      .select()
      .single();

    if (result.error) {
      logger.error(
        'api',
        '[Settings] setPrimaryWarehouse failed, attempting no rollback available:',
        result.error
      );
    }

    return result;
  },

  getSupportedCurrencies: async () => {
    return await supabase.from('supported_currencies').select('*');
  },

  createCurrency: async (data: {
    code: string;
    name_ar: string;
    symbol: string;
    exchange_operator?: 'multiply' | 'divide';
  }) => {
    return await supabase.from('supported_currencies').insert({ ...data, is_base: false });
  },

  deleteCurrency: async (code: string) => {
    return await supabase.from('supported_currencies').delete().eq('code', code);
  },

  getExchangeRates: async (companyId: string) => {
    return await supabase
      .from('exchange_rates')
      .select('*')
      .eq('company_id', companyId)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false });
  },

  updateExchangeRate: async (companyId: string, data: ExchangeRateFormData, userId: string) => {
    return await supabase
      .from('exchange_rates')
      .insert({
        company_id: companyId,
        currency_code: data.currency_code,
        rate_to_base: data.rate_to_base,
        effective_date: data.effective_date,
        created_by: userId,
      })
      .select()
      .single();
  },

  getFiscalYears: async (companyId: string) => {
    return await supabase
      .from('fiscal_years')
      .select('*')
      .eq('company_id', companyId)
      .order('start_date', { ascending: false });
  },

  createFiscalYear: async (companyId: string, data: FiscalYearFormData) => {
    return await supabase
      .from('fiscal_years')
      .insert({ ...data, company_id: companyId, is_closed: false })
      .select()
      .single();
  },

  closeFiscalYear: async (id: string) => {
    return await supabase.rpc('fn_close_fiscal_year', {
      p_fiscal_year_id: id,
    });
  },

  /**
   * جلب أسعار الصرف من السوق (Edge Function)
   */
  fetchMarketRates: async (companyId?: string) => {
    const { data, error } = await supabase.functions.invoke('fetch-exchange-rates-aden', {
      body: { company_id: companyId },
    });
    if (error) throw error;
    return data;
  },
};

export default settingsApi;
