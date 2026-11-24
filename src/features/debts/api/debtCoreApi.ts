import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';
import type {
  DebtFollowupConfig,
  DebtFollowupConfigUpdate,
  FollowUpDashboardRow,
  PartyBalanceByCurrency,
  PartyDebtOverview,
  PaymentPromise,
  PaymentPromiseInsert,
  PaymentPromiseUpdate,
  PaymentPromiseWithParty,
  TodayTask,
} from '../types';
import { optArg } from '@/core/utils/rpcArgs';

/** Engine defaults — also the migration defaults; kept in sync. */
export const DEBT_ENGINE_DEFAULTS = {
  dueSoonDays: 7,
  criticalDays: 30,
  reminderWindowDays: 3,
} as const;

export interface DebtEngineParams {
  dueSoonDays: number;
  criticalDays: number;
  reminderWindowDays: number;
}

interface UntypedRpcResult {
  data: unknown;
  error: (Error & { code?: string }) | null;
}
type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<UntypedRpcResult>;

export const untypedRpc: UntypedRpc = (fn, args) =>
  (supabase.rpc as unknown as UntypedRpc)(fn, args);

export const isMissingRpcError = (error: { code?: string | undefined; message?: string | undefined }): boolean =>
  error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');

export const debtApi = {
  getDashboard: async (
    companyId: string,
    branchId?: string | null,
    engine?: DebtEngineParams
  ): Promise<FollowUpDashboardRow[]> => {
    const params: DebtEngineParams = engine ?? DEBT_ENGINE_DEFAULTS;
    const { data, error } = await supabase.rpc('get_debt_followup_dashboard', {
      p_company_id: companyId,
      p_due_soon_days: params.dueSoonDays,
      p_critical_days: params.criticalDays,
      p_reminder_window_days: params.reminderWindowDays,
      ...optArg('p_branch_id', branchId),
    });
    if (error) throw error;
    return data;
  },

  getAnalytics: async (
    companyId: string,
    branchId?: string | null
  ): Promise<Record<string, unknown> | null> => {
    const { data, error } = await supabase.rpc('get_debt_analytics_summary', {
      p_company_id: companyId,
      ...optArg('p_branch_id', branchId),
    });
    if (error) {
      if (isMissingRpcError(error)) {
        logger.warn('DebtAPI', 'get_debt_analytics_summary RPC not found on server', { companyId });
        return null;
      }
      throw error;
    }
    return data as Record<string, unknown>;
  },

  getTodayTasks: async (companyId: string, branchId?: string | null): Promise<TodayTask[]> => {
    const { data, error } = await supabase.rpc('get_debt_today_tasks', {
      p_company_id: companyId,
      ...optArg('p_branch_id', branchId),
    });
    if (error) {
      if (isMissingRpcError(error)) {
        logger.warn(
          'DebtAPI',
          'get_debt_today_tasks RPC not found on server — apply migration 20260814000006',
          { companyId }
        );
        return [];
      }
      throw error;
    }
    return data ?? [];
  },

  getPartyOverview: async (
    companyId: string,
    partyId: string
  ): Promise<PartyDebtOverview | null> => {
    const { data, error } = await supabase.rpc('get_debt_party_overview', {
      p_company_id: companyId,
      p_party_id: partyId,
    });
    if (error) throw error;
    return data.length > 0 ? data[0] : null;
  },

  getPartyBalances: async (
    companyId: string,
    partyId: string
  ): Promise<PartyBalanceByCurrency[]> => {
    const { data, error } = await supabase.rpc('get_party_all_balances', {
      p_company_id: companyId,
      p_party_id: partyId,
    });
    if (error) throw error;
    return data;
  },

  getFollowupConfig: async (companyId: string): Promise<DebtFollowupConfig | null> => {
    const { data, error } = await supabase
      .from('debt_followup_config')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  upsertFollowupConfig: async (
    companyId: string,
    config: DebtFollowupConfigUpdate
  ): Promise<DebtFollowupConfig> => {
    const { data, error } = await supabase
      .from('debt_followup_config')
      .upsert({ company_id: companyId, ...config }, { onConflict: 'company_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  getPromises: async (
    companyId: string,
    filters?: { partyId?: string; status?: string; branchId?: string | null }
  ): Promise<PaymentPromiseWithParty[]> => {
    let query = supabase
      .from('debt_payment_promises')
      .select('*, parties!inner(name, phone, branch_id)')
      .eq('company_id', companyId)
      .order('promise_date', { ascending: true });
    if (filters?.partyId != null) query = query.eq('party_id', filters.partyId);
    if (filters?.status != null) query = query.eq('status', filters.status);
    if (filters?.branchId) query = query.eq('parties.branch_id', filters.branchId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  createPromise: async (payload: PaymentPromiseInsert): Promise<PaymentPromise> => {
    const { data, error } = await supabase
      .from('debt_payment_promises')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updatePromise: async (
    companyId: string,
    id: string,
    payload: PaymentPromiseUpdate
  ): Promise<PaymentPromise> => {
    const { data, error } = await supabase
      .from('debt_payment_promises')
      .update(payload)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deletePromise: async (companyId: string, id: string): Promise<void> => {
    const { error } = await supabase
      .from('debt_payment_promises')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  },

  breakOverduePromises: async (companyId: string): Promise<string[]> => {
    const { data, error } = await supabase.rpc('break_overdue_promises', {
      p_company_id: companyId,
    });
    if (error) throw error;
    return data;
  },

  completePromise: async (
    companyId: string,
    promiseId: string,
    paymentId?: string
  ): Promise<void> => {
    const { error } = await supabase.rpc('complete_promise', {
      p_company_id: companyId,
      p_promise_id: promiseId,
      ...(paymentId ? { p_payment_id: paymentId } : {}),
    });
    if (error) throw error;
  },
};
