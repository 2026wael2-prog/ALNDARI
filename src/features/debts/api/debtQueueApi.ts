import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';
import type {
  CollectionActivityRecord,
  CompleteDebtTaskResult,
  DebtCollector,
  DebtFollowupAction,
  DebtPriorityQueueRow,
  DebtQueueBucket,
  DebtTaskQueueRow,
  PartyTimelineEntry,
} from '../types';
import { optArg } from '@/core/utils/rpcArgs';
import { isMissingRpcError, untypedRpc } from './debtCoreApi';

export const debtQueueApi = {
  logCollectionActivity: async (params: {
    companyId: string;
    partyId: string;
    activityType: string;
    subject: string;
    outcome?: string | null | undefined;
    notes?: string | null | undefined;
    nextActionDate?: string | null | undefined;
    priority?: string | undefined;
  }): Promise<CollectionActivityRecord> => {
    const { data, error } = await supabase.rpc('log_collection_activity', {
      p_company_id: params.companyId,
      p_party_id: params.partyId,
      p_activity_type: params.activityType,
      p_subject: params.subject,
      ...(params.outcome != null ? { p_outcome: params.outcome } : {}),
      ...(params.notes != null ? { p_notes: params.notes } : {}),
      ...(params.nextActionDate != null ? { p_next_action_date: params.nextActionDate } : {}),
      ...(params.priority != null ? { p_priority: params.priority } : {}),
    });
    if (error) throw error;
    if (data.length === 0) throw new Error('تعذر تسجيل نشاط التحصيل');
    return data[0];
  },

  getPartyTimeline: async (
    companyId: string,
    partyId: string,
    limit = 20
  ): Promise<PartyTimelineEntry[]> => {
    const { data, error } = await supabase.rpc('get_party_collection_timeline', {
      p_company_id: companyId,
      p_party_id: partyId,
      p_limit: limit,
    });
    if (error) {
      if (isMissingRpcError(error)) {
        logger.warn('DebtAPI', 'get_party_collection_timeline RPC not found on server', {
          companyId,
        });
        return [];
      }
      throw error;
    }
    return data ?? [];
  },

  getFollowupActions: async (
    companyId: string,
    branchId?: string | null,
    limit = 50
  ): Promise<DebtFollowupAction[]> => {
    const { data, error } = await supabase.rpc('get_debt_followup_actions', {
      p_company_id: companyId,
      p_limit: limit,
      ...optArg('p_branch_id', branchId),
    });
    if (error) {
      if (isMissingRpcError(error)) {
        logger.warn('DebtAPI', 'get_debt_followup_actions RPC not found on server', {
          companyId,
        });
        return [];
      }
      throw error;
    }
    return data ?? [];
  },

  getTaskQueue: async (
    companyId: string,
    options: {
      branchId?: string | null;
      collectorId?: string | null;
      windowDays?: number;
      limit?: number;
    } = {}
  ): Promise<DebtTaskQueueRow[]> => {
    const { data, error } = await supabase.rpc('get_debt_task_queue', {
      p_company_id: companyId,
      p_limit: options.limit ?? 200,
      p_window_days: options.windowDays ?? 7,
      ...(options.branchId != null ? { p_branch_id: options.branchId } : {}),
      ...(options.collectorId != null ? { p_collector_id: options.collectorId } : {}),
    });
    if (error) {
      if (isMissingRpcError(error)) {
        logger.warn('DebtAPI', 'get_debt_task_queue RPC not found on server', { companyId });
        return [];
      }
      throw error;
    }
    return data ?? [];
  },

  getPriorityQueue: async (
    companyId: string,
    options: {
      branchId?: string | null;
      collectorId?: string | null;
      limit?: number;
      bucket?: DebtQueueBucket | null;
    } = {}
  ): Promise<DebtPriorityQueueRow[]> => {
    const params: Record<string, unknown> = {
      p_company_id: companyId,
      p_limit: options.limit ?? 50,
    };
    if (options.bucket != null) params.p_bucket = options.bucket;
    if (options.branchId != null) params.p_branch_id = options.branchId;
    if (options.collectorId != null) params.p_collector_id = options.collectorId;

    const { data, error } = await untypedRpc('get_debt_priority_queue', params);
    if (error) {
      if (isMissingRpcError(error)) {
        logger.warn('DebtAPI', 'get_debt_priority_queue RPC not found on server', { companyId });
        return [];
      }
      throw error;
    }
    return (data ?? []) as DebtPriorityQueueRow[];
  },

  getCollectors: async (companyId: string): Promise<DebtCollector[]> => {
    const { data, error } = await supabase.rpc('get_debt_collectors', {
      p_company_id: companyId,
    });
    if (error) {
      if (isMissingRpcError(error)) {
        logger.warn('DebtAPI', 'get_debt_collectors RPC not found on server', { companyId });
        return [];
      }
      throw error;
    }
    return data ?? [];
  },

  getCollectorAssignments: async (
    companyId: string,
    branchId?: string | null
  ): Promise<Record<string, { collectorId: string; collectorName: string }>> => {
    try {
      let query = supabase
        .from('debt_collector_assignments')
        .select(
          branchId
            ? 'party_id, collector_id, profiles:collector_id(full_name), parties!inner(branch_id)'
            : 'party_id, collector_id, profiles:collector_id(full_name)'
        )
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (branchId) {
        query = query.eq('parties.branch_id', branchId);
      }

      const { data, error } = await query;
      if (error || !data) return {};

      const assignments = new Map<string, { collectorId: string; collectorName: string }>();
      for (const item of data as unknown as Array<{
        party_id: string;
        collector_id: string;
        profiles?: { full_name?: string | null } | null;
      }>) {
        assignments.set(item.party_id, {
          collectorId: item.collector_id,
          collectorName: item.profiles?.full_name || 'مسند',
        });
      }
      return Object.fromEntries(assignments);
    } catch {
      return {};
    }
  },

  completeTask: async (params: {
    activityId: string;
    outcome?: string | null;
    notes?: string | null;
    nextActionDate?: string | null;
  }): Promise<CompleteDebtTaskResult> => {
    const { data, error } = await supabase.rpc('complete_debt_task', {
      p_activity_id: params.activityId,
      ...(params.outcome != null ? { p_outcome: params.outcome } : {}),
      ...(params.notes != null ? { p_notes: params.notes } : {}),
      ...(params.nextActionDate != null ? { p_next_action_date: params.nextActionDate } : {}),
    });
    if (error) throw error;
    if (data.length === 0) throw new Error('تعذر إتمام المهمة');
    return data[0];
  },

  assignParties: async (params: {
    companyId: string;
    partyIds: string[];
    collectorId: string | null;
    priority?: string;
    notes?: string | null;
  }): Promise<number> => {
    const { data, error } = await supabase.rpc('assign_debt_parties', {
      p_company_id: params.companyId,
      p_party_ids: params.partyIds,
      ...(params.collectorId != null ? { p_collector_id: params.collectorId } : {}),
      ...(params.priority != null ? { p_priority: params.priority } : {}),
      ...(params.notes != null ? { p_notes: params.notes } : {}),
    });
    if (error) throw error;
    return data ?? 0;
  },
};
