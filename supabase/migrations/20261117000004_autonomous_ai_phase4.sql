-- Phase 4: Autonomous AI Inventory Management System
-- Migration: 20261117000004_autonomous_ai_phase4.sql
-- SAFETY: Pending controlled staging validation. pg_cron remains DISABLED.

-- 1. Extend inv_intelligence_recommendations with full lifecycle, idempotency, and audit columns
ALTER TABLE public.inv_intelligence_recommendations
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS agent_id text DEFAULT 'operational_execution',
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'awaiting_approval'
    CHECK (lifecycle_state IN (
      'detected', 'analyzed', 'recommended', 'awaiting_approval',
      'approved', 'executed', 'verified', 'closed',
      'rejected', 'postponed', 'cancelled', 'failed', 'retrying'
    )),
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS expected_financial_impact numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outcome_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_intel_recs_company_idempotency
  ON public.inv_intelligence_recommendations (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Autonomous Background Job Queue (browser-independent worker queue)
CREATE TABLE IF NOT EXISTS public.inv_autonomous_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('full_orchestration', 'outcome_verification', 'snapshot_refresh')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'retrying', 'cancelled')),
  idempotency_key text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_by text,
  locked_at timestamptz,
  timeout_at timestamptz,
  next_retry_at timestamptz DEFAULT now(),
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT uq_inv_autonomous_jobs_idempotency UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inv_autonomous_jobs_claim
  ON public.inv_autonomous_jobs (status, next_retry_at, created_at);

ALTER TABLE public.inv_autonomous_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_autonomous_jobs_company_isolation ON public.inv_autonomous_jobs;
CREATE POLICY inv_autonomous_jobs_company_isolation
  ON public.inv_autonomous_jobs
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 3. Immutable Agent Execution Logs
CREATE TABLE IF NOT EXISTS public.inv_agent_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.inv_autonomous_jobs(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('healthy', 'warning', 'error')),
  items_scanned integer NOT NULL DEFAULT 0,
  decisions_generated integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  summary text,
  error_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_agent_logs_company_created
  ON public.inv_agent_execution_logs (company_id, created_at DESC);

ALTER TABLE public.inv_agent_execution_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_agent_logs_company_isolation ON public.inv_agent_execution_logs;
CREATE POLICY inv_agent_logs_company_isolation
  ON public.inv_agent_execution_logs
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 4. Append-Only Decision Lifecycle Audit Trail
CREATE TABLE IF NOT EXISTS public.inv_decision_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES public.inv_intelligence_recommendations(id) ON DELETE CASCADE,
  from_state text NOT NULL,
  to_state text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_decision_audit_rec
  ON public.inv_decision_audit_trail (company_id, recommendation_id, created_at DESC);

ALTER TABLE public.inv_decision_audit_trail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_decision_audit_company_isolation ON public.inv_decision_audit_trail;
CREATE POLICY inv_decision_audit_company_isolation
  ON public.inv_decision_audit_trail
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 5. Transactional Job Claim RPC (FOR UPDATE SKIP LOCKED + stale lock timeout recovery)
CREATE OR REPLACE FUNCTION public.fn_claim_next_autonomous_job(
  p_worker_id text,
  p_lock_timeout_seconds integer DEFAULT 120
)
RETURNS public.inv_autonomous_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.inv_autonomous_jobs;
BEGIN
  -- Recover timed-out running jobs first
  UPDATE public.inv_autonomous_jobs
  SET
    status = CASE WHEN attempts < max_attempts THEN 'retrying' ELSE 'failed' END,
    error_message = COALESCE(error_message, 'Worker lock timeout exceeded'),
    locked_by = NULL,
    locked_at = NULL,
    next_retry_at = now() + interval '1 minute'
  WHERE status = 'running'
    AND timeout_at IS NOT NULL
    AND timeout_at < now();

  SELECT * INTO v_job
  FROM public.inv_autonomous_jobs
  WHERE status IN ('queued', 'retrying')
    AND COALESCE(next_retry_at, now()) <= now()
    AND attempts < max_attempts
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.inv_autonomous_jobs
  SET
    status = 'running',
    attempts = attempts + 1,
    locked_by = p_worker_id,
    locked_at = now(),
    timeout_at = now() + make_interval(secs => GREATEST(30, p_lock_timeout_seconds))
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- 6. Transactional Decision Lifecycle Transition RPC
CREATE OR REPLACE FUNCTION public.fn_transition_intelligence_decision(
  p_company_id uuid,
  p_recommendation_id uuid,
  p_to_state text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rec public.inv_intelligence_recommendations;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT * INTO v_rec
  FROM public.inv_intelligence_recommendations
  WHERE id = p_recommendation_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation not found for company';
  END IF;

  UPDATE public.inv_intelligence_recommendations
  SET
    lifecycle_state = p_to_state,
    outcome_verified_at = CASE WHEN p_to_state = 'verified' THEN now() ELSE outcome_verified_at END,
    outcome_notes = CASE WHEN p_to_state IN ('verified', 'closed', 'failed') THEN COALESCE(p_reason, outcome_notes) ELSE outcome_notes END
  WHERE id = p_recommendation_id AND company_id = p_company_id;

  INSERT INTO public.inv_decision_audit_trail (
    company_id, recommendation_id, from_state, to_state, actor_id, reason, metadata
  ) VALUES (
    p_company_id, p_recommendation_id, v_rec.lifecycle_state, p_to_state, auth.uid(), p_reason, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'recommendation_id', p_recommendation_id,
    'from_state', v_rec.lifecycle_state,
    'to_state', p_to_state
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_transition_intelligence_decision(uuid, uuid, text, text, jsonb) TO authenticated;
