-- =============================================================================
-- Wave 30: Automated Month-End Rent Accruals (Wael Al-Nadari Branch Only)
-- - Enables pg_cron
-- - Adds recurring_rent_schedules & recurring_rent_runs tables with RLS and
--   strict UNIQUE(schedule_id, period_month) idempotency
-- - Seeds the 2 monthly rent schedules for فرع وائل النظاري only:
--     1) ايجار المحل والسحبيات: 1,100 SAR (DR 3211020011 / CR MZ-121556)
--     2) ايجار المستودع بن عقيل: 100,000 YER (DR 3211020003 / CR MZ-1211209)
-- - Creates post_due_monthly_rents() RPC and schedules pg_cron job at 23:55
--   Asia/Riyadh (20:55 UTC) on days 28-31 (executing only on exact month-end)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS public.recurring_rent_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL DEFAULT 'SAR',
  debit_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  last_posted_month date,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_recurring_rent_branch_name UNIQUE (company_id, branch_id, name),
  CONSTRAINT chk_recurring_rent_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_recurring_rent_schedules_active
  ON public.recurring_rent_schedules (company_id, branch_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.recurring_rent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.recurring_rent_schedules(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  period_month date NOT NULL,
  posting_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency_code text NOT NULL,
  exchange_rate numeric(14,6) NOT NULL,
  base_amount numeric(14,2) NOT NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('posted', 'skipped', 'failed')),
  error_message text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_recurring_rent_run_schedule_month UNIQUE (schedule_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_recurring_rent_runs_company_month
  ON public.recurring_rent_runs (company_id, branch_id, period_month DESC);

ALTER TABLE public.recurring_rent_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_rent_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recurring_rent_schedules' AND policyname = 'recurring_rent_schedules_select'
  ) THEN
    CREATE POLICY recurring_rent_schedules_select ON public.recurring_rent_schedules
      FOR SELECT TO authenticated
      USING (
        (SELECT public.is_super_admin())
        OR (
          company_id IN (SELECT public.get_auth_companies())
          AND (
            company_id IN (SELECT public.fn_auth_all_branch_companies())
            OR branch_id IN (SELECT public.fn_auth_allowed_branches())
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recurring_rent_schedules' AND policyname = 'recurring_rent_schedules_manage'
  ) THEN
    CREATE POLICY recurring_rent_schedules_manage ON public.recurring_rent_schedules
      FOR ALL TO authenticated
      USING (
        (SELECT public.is_super_admin())
        OR (
          company_id IN (SELECT public.get_auth_companies())
          AND public.get_user_role(company_id) IN ('owner', 'admin', 'accountant', 'manager')
          AND (
            company_id IN (SELECT public.fn_auth_all_branch_companies())
            OR branch_id IN (SELECT public.fn_auth_allowed_branches())
          )
        )
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR (
          company_id IN (SELECT public.get_auth_companies())
          AND public.get_user_role(company_id) IN ('owner', 'admin', 'accountant', 'manager')
          AND public.is_valid_branch(company_id, branch_id)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recurring_rent_runs' AND policyname = 'recurring_rent_runs_select'
  ) THEN
    CREATE POLICY recurring_rent_runs_select ON public.recurring_rent_runs
      FOR SELECT TO authenticated
      USING (
        (SELECT public.is_super_admin())
        OR (
          company_id IN (SELECT public.get_auth_companies())
          AND (
            company_id IN (SELECT public.fn_auth_all_branch_companies())
            OR branch_id IN (SELECT public.fn_auth_allowed_branches())
          )
        )
      );
  END IF;
END $$;

INSERT INTO public.expense_categories (company_id, name, account_id, is_system, color)
SELECT '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47', v.name, v.account_id, true, v.color
FROM (VALUES
  ('إيجار المحل الشهري', 'd09f48a2-8414-46de-aa65-0fa87e40e7ee'::uuid, '#2563eb'),
  ('إيجار المستودع الشهري', 'd661e0b2-fcd6-4aea-bb43-3f68eabfd127'::uuid, '#4f46e5')
) AS v(name, account_id, color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories ec
  WHERE ec.company_id = '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47'
    AND ec.account_id = v.account_id
    AND ec.deleted_at IS NULL
);

INSERT INTO public.recurring_rent_schedules (
  company_id, branch_id, name, amount, currency_code,
  debit_account_id, credit_account_id, party_id,
  is_active, start_date, notes, created_by
)
VALUES
  (
    '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47',
    'd8771318-20f8-4260-9ac6-e40c3378a5e1',
    'ايجار المحل والسحبيات',
    1100.00,
    'SAR',
    'd09f48a2-8414-46de-aa65-0fa87e40e7ee',
    '07ae1ddc-50d1-5bca-a836-be39c3ca7523',
    'a1be0811-bdc8-4188-ba83-b373a8ab214a',
    true,
    '2026-11-01',
    'استحقاق إيجار المحل الشهري - فرع وائل النظاري فقط (1100 ر.س نهاية كل شهر)',
    'ed408868-2de1-451c-9dbd-abbe734c253c'
  ),
  (
    '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47',
    'd8771318-20f8-4260-9ac6-e40c3378a5e1',
    'ايجار المستودع بن عقيل',
    100000.00,
    'YER',
    'd661e0b2-fcd6-4aea-bb43-3f68eabfd127',
    '2ad630cd-2c15-5901-9dc9-402a13a94e0c',
    '1f5c32af-5eab-4a39-9b07-fdb516d8137f',
    true,
    '2026-11-01',
    'استحقاق إيجار المستودع الشهري - فرع وائل النظاري فقط (100,000 ر.ي نهاية كل شهر)',
    'ed408868-2de1-451c-9dbd-abbe734c253c'
  )
ON CONFLICT (company_id, branch_id, name) DO UPDATE SET
  amount = EXCLUDED.amount,
  currency_code = EXCLUDED.currency_code,
  debit_account_id = EXCLUDED.debit_account_id,
  credit_account_id = EXCLUDED.credit_account_id,
  party_id = EXCLUDED.party_id,
  is_active = true,
  notes = EXCLUDED.notes,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.post_due_monthly_rents(
  p_target_date date DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $func$
DECLARE
  v_eff_date        date := COALESCE(p_target_date, (now() AT TIME ZONE 'Asia/Riyadh')::date);
  v_month_start     date := date_trunc('month', v_eff_date)::date;
  v_month_end       date := (date_trunc('month', v_eff_date) + INTERVAL '1 month - 1 day')::date;
  v_period_ym       text := to_char(v_month_start, 'YYYY-MM');
  v_uid             uuid := auth.uid();
  v_rec             RECORD;
  v_rate            numeric;
  v_base_amount     numeric;
  v_fiscal_year_id  uuid;
  v_je_id           uuid;
  v_actor_id        uuid;
  v_posted_count    int := 0;
  v_skipped_count   int := 0;
  v_failed_count    int := 0;
  v_details         jsonb := '[]'::jsonb;
  v_err             text;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.is_super_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = v_uid
        AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
    ) THEN
      RAISE EXCEPTION 'access_denied: لا تملك صلاحية ترحيل الإيجارات الشهرية' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT p_force AND v_eff_date <> v_month_end THEN
    RETURN jsonb_build_object(
      'success', true,
      'ran', false,
      'reason', 'not_month_end',
      'effective_date', v_eff_date,
      'month_end', v_month_end,
      'posted_count', 0,
      'skipped_count', 0,
      'failed_count', 0
    );
  END IF;

  FOR v_rec IN
    SELECT s.*
    FROM public.recurring_rent_schedules s
    WHERE s.is_active = true
      AND v_month_end >= s.start_date
      AND (s.end_date IS NULL OR v_month_end <= s.end_date)
      AND (
        v_uid IS NULL
        OR public.is_super_admin()
        OR s.company_id IN (SELECT public.get_auth_companies())
      )
    ORDER BY s.company_id, s.branch_id, s.created_at
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.recurring_rent_runs r
      WHERE r.schedule_id = v_rec.id
        AND r.period_month = v_month_start
        AND r.status = 'posted'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_details := v_details || jsonb_build_object(
        'schedule', v_rec.name,
        'status', 'skipped',
        'reason', 'already_posted_for_month'
      );
      CONTINUE;
    END IF;

    BEGIN
      IF UPPER(TRIM(v_rec.currency_code)) = 'SAR' THEN
        v_rate := 1;
      ELSE
        SELECT er.rate_to_base INTO v_rate
        FROM public.exchange_rates er
        WHERE er.company_id = v_rec.company_id
          AND UPPER(TRIM(er.currency_code)) = UPPER(TRIM(v_rec.currency_code))
          AND er.effective_date <= v_month_end
        ORDER BY er.effective_date DESC, er.created_at DESC
        LIMIT 1;

        IF v_rate IS NULL OR v_rate <= 0 THEN
          RAISE EXCEPTION 'لا يوجد سعر صرف فعّال للعملة % حتى تاريخ %', v_rec.currency_code, v_month_end;
        END IF;
      END IF;

      v_base_amount := ROUND(public.fn_to_base_amount(v_rec.currency_code, v_rec.amount, v_rate), 2);
      IF v_base_amount <= 0 THEN
        RAISE EXCEPTION 'المبلغ المحوّل بالعملة الأساسية غير صالح (%)', v_base_amount;
      END IF;

      SELECT fy.id INTO v_fiscal_year_id
      FROM public.fiscal_years fy
      WHERE fy.company_id = v_rec.company_id
        AND fy.is_closed = false
        AND v_month_end BETWEEN fy.start_date AND fy.end_date
      LIMIT 1;

      IF v_fiscal_year_id IS NULL THEN
        RAISE EXCEPTION 'لا توجد سنة مالية مفتوحة تغطي تاريخ %', v_month_end;
      END IF;

      v_actor_id := COALESCE(v_uid, v_rec.created_by);
      IF v_actor_id IS NULL THEN
        SELECT c.owner_id INTO v_actor_id FROM public.companies c WHERE c.id = v_rec.company_id;
      END IF;

      PERFORM set_config('app.rpc_authorized', 'true', true);

      INSERT INTO public.journal_entries (
        company_id, branch_id, fiscal_year_id,
        entry_date, description, reference_type, reference_id,
        status, created_by
      )
      VALUES (
        v_rec.company_id,
        v_rec.branch_id,
        v_fiscal_year_id,
        v_month_end,
        'استحقاق إيجار شهري تلقائي: ' || v_rec.name || ' - شهر ' || v_period_ym,
        'recurring_rent',
        v_rec.id,
        'draft',
        v_actor_id
      )
      RETURNING id INTO v_je_id;

      INSERT INTO public.journal_entry_lines (
        journal_entry_id, account_id, company_id, branch_id, party_id,
        debit_amount, credit_amount, currency_code, exchange_rate, foreign_amount, description
      )
      VALUES
        (
          v_je_id, v_rec.debit_account_id, v_rec.company_id, v_rec.branch_id, NULL,
          v_base_amount, 0, UPPER(TRIM(v_rec.currency_code)), v_rate, v_rec.amount,
          'مصروف ' || v_rec.name || ' - شهر ' || v_period_ym
        ),
        (
          v_je_id, v_rec.credit_account_id, v_rec.company_id, v_rec.branch_id, v_rec.party_id,
          0, v_base_amount, UPPER(TRIM(v_rec.currency_code)), v_rate, v_rec.amount,
          'استحقاق ' || v_rec.name || ' - شهر ' || v_period_ym
        );

      UPDATE public.journal_entries SET status = 'posted' WHERE id = v_je_id;

      INSERT INTO public.recurring_rent_runs (
        schedule_id, company_id, branch_id, period_month, posting_date,
        amount, currency_code, exchange_rate, base_amount,
        journal_entry_id, status, error_message, executed_at
      )
      VALUES (
        v_rec.id, v_rec.company_id, v_rec.branch_id, v_month_start, v_month_end,
        v_rec.amount, UPPER(TRIM(v_rec.currency_code)), v_rate, v_base_amount,
        v_je_id, 'posted', NULL, now()
      )
      ON CONFLICT (schedule_id, period_month) DO UPDATE SET
        posting_date = EXCLUDED.posting_date,
        amount = EXCLUDED.amount,
        currency_code = EXCLUDED.currency_code,
        exchange_rate = EXCLUDED.exchange_rate,
        base_amount = EXCLUDED.base_amount,
        journal_entry_id = EXCLUDED.journal_entry_id,
        status = 'posted',
        error_message = NULL,
        executed_at = now();

      UPDATE public.recurring_rent_schedules
      SET last_posted_month = v_month_start, updated_at = now()
      WHERE id = v_rec.id;

      v_posted_count := v_posted_count + 1;
      v_details := v_details || jsonb_build_object(
        'schedule', v_rec.name,
        'status', 'posted',
        'period', v_period_ym,
        'posting_date', v_month_end,
        'amount', v_rec.amount,
        'currency_code', v_rec.currency_code,
        'base_amount', v_base_amount,
        'journal_entry_id', v_je_id
      );

    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      INSERT INTO public.recurring_rent_runs (
        schedule_id, company_id, branch_id, period_month, posting_date,
        amount, currency_code, exchange_rate, base_amount,
        journal_entry_id, status, error_message, executed_at
      )
      VALUES (
        v_rec.id, v_rec.company_id, v_rec.branch_id, v_month_start, v_month_end,
        v_rec.amount, UPPER(TRIM(v_rec.currency_code)), COALESCE(v_rate, 1), COALESCE(v_base_amount, 0),
        NULL, 'failed', v_err, now()
      )
      ON CONFLICT (schedule_id, period_month) DO UPDATE SET
        status = 'failed',
        error_message = EXCLUDED.error_message,
        executed_at = now();

      v_failed_count := v_failed_count + 1;
      v_details := v_details || jsonb_build_object(
        'schedule', v_rec.name,
        'status', 'failed',
        'error', v_err
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', v_failed_count = 0,
    'ran', true,
    'period', v_period_ym,
    'posting_date', v_month_end,
    'posted_count', v_posted_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'details', v_details
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.post_due_monthly_rents(date, boolean) TO authenticated, service_role;

SELECT cron.schedule(
  'wael-branch-monthly-rent-accrual',
  '55 20 28-31 * *',
  $cron$SELECT public.post_due_monthly_rents(NULL, false);$cron$
);
