import { supabase } from '../../../lib/supabaseClient';
import type { BackgroundJobRecord } from '../types';

export async function getBackgroundJobs(companyId: string): Promise<BackgroundJobRecord[]> {
  try {
    const { data, error } = await (supabase as unknown as { from: (t: string) => any })
      .from('inv_autonomous_jobs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return [];
    return (data ?? []) as BackgroundJobRecord[];
  } catch {
    return [];
  }
}

export async function enqueueIntelligenceJob(params: {
  companyId: string;
  jobType: 'full_orchestration' | 'outcome_verification' | 'snapshot_refresh';
  idempotencyKey?: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
  const key =
    params.idempotencyKey ??
    `${params.jobType}:${params.companyId}:${new Date().toISOString().slice(0, 13)}`;
  try {
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: { queued?: boolean; job_id?: string } | null; error: { message: string } | null }>)(
      'fn_enqueue_autonomous_job',
      {
        p_company_id: params.companyId,
        p_job_type: params.jobType,
        p_idempotency_key: key,
      }
    );

    if (error) {
      return { queued: false, reason: error.message };
    }
    return {
      queued: Boolean(data?.queued),
      ...(data?.job_id ? { jobId: data.job_id } : {}),
    };
  } catch (err) {
    return {
      queued: false,
      reason: err instanceof Error ? err.message : 'Phase 4 job queue table not yet migrated',
    };
  }
}
