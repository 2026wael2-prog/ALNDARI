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
    const { data, error } = await (supabase as unknown as { from: (t: string) => any })
      .from('inv_autonomous_jobs')
      .upsert(
        {
          company_id: params.companyId,
          job_type: params.jobType,
          status: 'queued',
          idempotency_key: key,
        },
        { onConflict: 'company_id,idempotency_key', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();

    if (error) {
      return { queued: false, reason: error.message };
    }
    return { queued: true, jobId: data?.id };
  } catch (err) {
    return {
      queued: false,
      reason: err instanceof Error ? err.message : 'Phase 4 job queue table not yet migrated',
    };
  }
}
