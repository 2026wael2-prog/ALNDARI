import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * autonomous-intelligence-worker
 * Browser-independent backend worker for the AI Inventory Intelligence System.
 * - Claims queued/retrying jobs via `fn_claim_next_autonomous_job` (FOR UPDATE SKIP LOCKED)
 * - Performs REAL database outcome verification against `stock_transfers` and `prc_purchase_orders`
 * - Escalates cancelled/reversed documents and exhausted job retries to `notification_log`
 * - Logs immutable agent execution records to `inv_agent_execution_logs`
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const workerSecret = Deno.env.get('AUTONOMOUS_WORKER_SECRET');
    if (workerSecret) {
      const incoming = req.headers.get('x-worker-secret') ?? '';
      if (incoming !== workerSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized worker secret' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
    const { data: job, error: claimErr } = await supabase.rpc('fn_claim_next_autonomous_job', {
      p_worker_id: workerId,
      p_lock_timeout_seconds: 120,
    });

    if (claimErr) {
      return new Response(JSON.stringify({ ok: false, error: claimErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!job || !job.id) {
      return new Response(JSON.stringify({ ok: true, status: 'idle', message: 'No queued jobs' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startMs = Date.now();
    const companyId = job.company_id as string;

    try {
      // 1) Run Phase 2 scheduled maintenance (stale recommendations + daily availability snapshot)
      if (job.job_type === 'snapshot_refresh' || job.job_type === 'full_orchestration') {
        await supabase.rpc('fn_run_scheduled_inventory_intelligence', { p_company_id: companyId });
      }

      // 2) Real DB outcome verification against stock_transfers & prc_purchase_orders
      const { data: executedRecs } = await supabase
        .from('inv_intelligence_recommendations')
        .select('id, rec_type, linked_transfer_id, linked_po_id, lifecycle_state')
        .eq('company_id', companyId)
        .eq('status', 'executed')
        .is('outcome_verified_at', null)
        .limit(50);

      let verifiedCount = 0;
      let escalatedCount = 0;

      for (const r of executedRecs ?? []) {
        if (r.rec_type === 'transfer' && r.linked_transfer_id) {
          const { data: tr } = await supabase
            .from('stock_transfers')
            .select('id, status, reversed_at')
            .eq('id', r.linked_transfer_id)
            .eq('company_id', companyId)
            .maybeSingle();

          if (!tr || tr.reversed_at || tr.status === 'cancelled') {
            await supabase
              .from('inv_intelligence_recommendations')
              .update({
                lifecycle_state: 'failed',
                last_error: 'Transfer missing, cancelled, or reversed in DB',
                outcome_notes: 'فشل التحقق: سند التحويل ملغى أو معكوس في قاعدة البيانات',
              })
              .eq('id', r.id)
              .eq('company_id', companyId);
            escalatedCount += 1;
          } else if (tr.status === 'completed' || tr.status === 'in_transit' || tr.status === 'pending' || tr.status === 'approved') {
            await supabase
              .from('inv_intelligence_recommendations')
              .update({
                lifecycle_state: tr.status === 'completed' ? 'verified' : 'executed',
                outcome_verified_at: tr.status === 'completed' ? new Date().toISOString() : null,
                outcome_notes: `حالة التحويل الفعلية في قاعدة البيانات: ${tr.status}`,
              })
              .eq('id', r.id)
              .eq('company_id', companyId);
            if (tr.status === 'completed') verifiedCount += 1;
          }
        } else if (r.rec_type === 'purchase' && r.linked_po_id) {
          const { data: po } = await supabase
            .from('prc_purchase_orders')
            .select('po_id, status')
            .eq('po_id', r.linked_po_id)
            .eq('company_id', companyId)
            .maybeSingle();

          if (!po || po.status === 'cancelled') {
            await supabase
              .from('inv_intelligence_recommendations')
              .update({
                lifecycle_state: 'failed',
                last_error: 'Purchase order missing or cancelled in DB',
                outcome_notes: 'فشل التحقق: أمر الشراء ملغى أو غير موجود في قاعدة البيانات',
              })
              .eq('id', r.id)
              .eq('company_id', companyId);
            escalatedCount += 1;
          } else {
            const isReceived = po.status === 'received' || po.status === 'partially_received' || po.status === 'issued' || po.status === 'approved';
            await supabase
              .from('inv_intelligence_recommendations')
              .update({
                lifecycle_state: isReceived ? 'verified' : 'executed',
                outcome_verified_at: isReceived ? new Date().toISOString() : null,
                outcome_notes: `حالة أمر الشراء الفعلية في قاعدة البيانات: ${po.status}`,
              })
              .eq('id', r.id)
              .eq('company_id', companyId);
            if (isReceived) verifiedCount += 1;
          }
        }
      }

      if (escalatedCount > 0) {
        await supabase.from('notification_log').insert({
          company_id: companyId,
          channel: 'system_escalation',
          event_type: 'autonomous_verification_escalation',
          message: `تصعيد آلي: تم رصد ${escalatedCount} عملية تحويل أو شراء ملغاة/فاشلة أثناء التحقق في قاعدة البيانات`,
          status: 'pending',
        });
      }

      // 3) Mark job completed & log agent execution
      await supabase
        .from('inv_autonomous_jobs')
        .update({
          status: 'completed',
          locked_by: null,
          locked_at: null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      await supabase.from('inv_agent_execution_logs').insert({
        company_id: companyId,
        job_id: job.id,
        agent_id: 'operational_execution',
        status: escalatedCount > 0 ? 'warning' : 'healthy',
        items_scanned: (executedRecs ?? []).length,
        decisions_generated: verifiedCount,
        duration_ms: Date.now() - startMs,
        summary: `Job ${job.job_type}: ${verifiedCount} verified, ${escalatedCount} escalated`,
      });

      return new Response(
        JSON.stringify({ ok: true, jobId: job.id, verifiedCount, escalatedCount }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (jobErr) {
      const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
      const nextStatus = job.attempts < job.max_attempts ? 'retrying' : 'failed';
      await supabase
        .from('inv_autonomous_jobs')
        .update({
          status: nextStatus,
          error_message: msg,
          locked_by: null,
          locked_at: null,
          next_retry_at: new Date(Date.now() + 60_000 * job.attempts).toISOString(),
        })
        .eq('id', job.id);

      if (nextStatus === 'failed') {
        await supabase.from('notification_log').insert({
          company_id: companyId,
          channel: 'system_escalation',
          event_type: 'autonomous_job_failed',
          message: `تصعيد فشل مهمة خلفية (${job.job_type}) بعد ${job.attempts} محاولات: ${msg}`,
          status: 'failed',
          error_message: msg,
        });
      }

      return new Response(JSON.stringify({ ok: false, jobId: job.id, status: nextStatus, error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
