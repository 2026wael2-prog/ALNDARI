-- ============================================================================
-- Wave 11B/11C: Strict Branch Isolation — RPC Hardening & Fast InitPlan RLS
-- ----------------------------------------------------------------------------
-- Applied live on dagfjncoullstrhbjssr across:
--   wave11b_part1_financial_report_rpcs
--   wave11b_part2_party_statement_and_core_bi_rpcs
--   wave11b_part3_param_n_read_rpcs
--   wave11b_part4_void_and_transfer_guards
--   wave11b_part5_enforce_branch_on_33_rpcs
--   wave11b_part6_special_rpcs
--   wave11b_part7_tighten_stats_and_debt_rpcs
--   wave11c_fast_initplan_rls
-- ============================================================================

-- 1. Zero-argument InitPlan-friendly RLS helpers (evaluated ONCE per query!)
CREATE OR REPLACE FUNCTION public.fn_auth_all_branch_companies()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
  v_uid uuid := auth.uid();
BEGIN
  IF public.is_super_admin()
     OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
     OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'))
  THEN
    RETURN QUERY SELECT c.id FROM public.companies c;
    RETURN;
  END IF;

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ucr.company_id
  FROM public.user_company_roles ucr
  WHERE ucr.user_id = v_uid
    AND (ucr.role IN ('owner', 'admin') OR ucr.branch_id IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auth_allowed_branches()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
  v_uid uuid := auth.uid();
BEGIN
  IF public.is_super_admin()
     OR (v_claims IS NOT NULL AND btrim(v_claims) <> '' AND left(btrim(v_claims), 1) = '{' AND (v_claims::jsonb ->> 'role') = 'service_role')
     OR ((v_claims IS NULL OR btrim(v_claims) = '') AND session_user IN ('postgres', 'supabase_admin'))
  THEN
    RETURN QUERY SELECT b.id FROM public.branches b;
    RETURN;
  END IF;

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT b.id
  FROM public.branches b
  JOIN public.user_company_roles ucr
    ON ucr.company_id = b.company_id
   AND ucr.user_id = v_uid
  WHERE ucr.role IN ('owner', 'admin')
     OR ucr.branch_id IS NULL
     OR ucr.branch_id = b.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_auth_all_branch_companies() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_auth_allowed_branches() TO authenticated, service_role;

-- 2. Upgrade all Wave 11 RLS policies atomically via ALTER POLICY to pure InitPlan expressions
DO $$
DECLARE
  v_pol RECORD;
  v_qual TEXT;
  v_check TEXT;
  v_sql TEXT;
  v_changed BOOLEAN;
BEGIN
  FOR v_pol IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') ILIKE '%fn_is_branch_scoped_row_allowed%'
        OR COALESCE(with_check, '') ILIKE '%fn_is_branch_scoped_row_allowed%'
        OR COALESCE(qual, '') ILIKE '%fn_has_all_branch_access%'
        OR COALESCE(with_check, '') ILIKE '%fn_has_all_branch_access%'
      )
  LOOP
    v_qual := v_pol.qual;
    v_check := v_pol.with_check;
    v_changed := false;

    IF v_qual IS NOT NULL THEN
      v_qual := regexp_replace(
        v_qual,
        'fn_is_branch_scoped_row_allowed\(([a-zA-Z0-9_\.]+),\s*([a-zA-Z0-9_\.]+)\)',
        '((\1 IN (SELECT public.fn_auth_all_branch_companies())) OR (\2 IS NOT NULL AND \2 IN (SELECT public.fn_auth_allowed_branches())))',
        'g'
      );
      v_qual := regexp_replace(
        v_qual,
        'fn_has_all_branch_access\(([a-zA-Z0-9_\.]+)\)',
        '(\1 IN (SELECT public.fn_auth_all_branch_companies()))',
        'g'
      );
      v_qual := regexp_replace(
        v_qual,
        '(?<!SELECT )(?<!public\.)is_super_admin\(\)',
        '(SELECT public.is_super_admin())',
        'g'
      );
      IF v_qual IS DISTINCT FROM v_pol.qual THEN
        v_changed := true;
      END IF;
    END IF;

    IF v_check IS NOT NULL THEN
      v_check := regexp_replace(
        v_check,
        'fn_is_branch_scoped_row_allowed\(([a-zA-Z0-9_\.]+),\s*([a-zA-Z0-9_\.]+)\)',
        '((\1 IN (SELECT public.fn_auth_all_branch_companies())) OR (\2 IS NOT NULL AND \2 IN (SELECT public.fn_auth_allowed_branches())))',
        'g'
      );
      v_check := regexp_replace(
        v_check,
        'fn_has_all_branch_access\(([a-zA-Z0-9_\.]+)\)',
        '(\1 IN (SELECT public.fn_auth_all_branch_companies()))',
        'g'
      );
      v_check := regexp_replace(
        v_check,
        '(?<!SELECT )(?<!public\.)is_super_admin\(\)',
        '(SELECT public.is_super_admin())',
        'g'
      );
      IF v_check IS DISTINCT FROM v_pol.with_check THEN
        v_changed := true;
      END IF;
    END IF;

    IF v_changed THEN
      v_sql := format('ALTER POLICY %I ON %I.%I', v_pol.policyname, v_pol.schemaname, v_pol.tablename);
      IF v_qual IS NOT NULL THEN
        v_sql := v_sql || format(' USING (%s)', v_qual);
      END IF;
      IF v_check IS NOT NULL THEN
        v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
      END IF;
      EXECUTE v_sql;
    END IF;
  END LOOP;
END;
$$;

-- 3. Tighten remaining stats & debt RPCs (eliminating NULL-branch bypass for branch-scoped callers)
DO $$
DECLARE
  v_rec RECORD;
  v_def TEXT;
  v_new_def TEXT;
BEGIN
  FOR v_rec IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_sales_stats_summary',
        'get_purchases_stats_summary',
        'get_debt_analytics_summary',
        'get_debt_followup_dashboard',
        'get_debt_followup_actions',
        'get_debt_task_queue',
        'get_debt_today_tasks'
      )
  LOOP
    v_def := pg_get_functiondef(v_rec.oid);
    v_new_def := v_def;

    IF v_new_def NOT ILIKE '%fn_resolve_authorized_branch%' THEN
      v_new_def := regexp_replace(
        v_new_def,
        E'(\\nBEGIN\\r?\\n)',
        E'\\1    p_branch_id := public.fn_resolve_authorized_branch(p_company_id, p_branch_id);\n',
        'n'
      );
    END IF;

    IF v_rec.proname = 'get_debt_followup_actions' THEN
      v_new_def := replace(
        v_new_def,
        'OR p.branch_id IS NULL OR p.branch_id = ANY(v_target_branches)',
        'OR p.branch_id = ANY(v_target_branches)'
      );
    ELSIF v_rec.proname = 'get_debt_followup_dashboard' THEN
      v_new_def := replace(
        v_new_def,
        'AND (p_branch_id IS NULL OR p.branch_id = p_branch_id OR p.branch_id IS NULL)',
        'AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)'
      );
    ELSIF v_rec.proname = 'get_debt_task_queue' THEN
      v_new_def := replace(
        v_new_def,
        'OR i.branch_id IS NULL OR i.branch_id = ANY(v_target_branches)',
        'OR i.branch_id = ANY(v_target_branches)'
      );
      v_new_def := replace(
        v_new_def,
        'OR cp.branch_id IS NULL OR cp.branch_id = ANY(v_target_branches)',
        'OR cp.branch_id = ANY(v_target_branches)'
      );
      v_new_def := replace(
        v_new_def,
        'OR p.branch_id IS NULL OR p.branch_id = ANY(v_target_branches)',
        'OR p.branch_id = ANY(v_target_branches)'
      );
    END IF;

    IF v_new_def IS DISTINCT FROM v_def THEN
      EXECUTE v_new_def;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_party_all_balances(
  p_company_id uuid,
  p_party_id uuid
)
RETURNS TABLE(
  party_id uuid,
  currency_code text,
  balance numeric,
  transaction_count integer,
  last_activity_date date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.id = p_party_id
      AND p.company_id = p_company_id
      AND public.fn_is_branch_scoped_row_allowed(p_company_id, p.branch_id)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pb.party_id, pb.currency_code, pb.balance, pb.transaction_count, pb.last_activity_date
  FROM public.party_balances_by_currency pb
  WHERE pb.company_id = p_company_id
    AND pb.party_id = p_party_id
  ORDER BY pb.currency_code;
END;
$function$;
