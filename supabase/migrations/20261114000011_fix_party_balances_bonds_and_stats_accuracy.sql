BEGIN;

-- ============================================================================
-- Migration: 20261114000011_fix_party_balances_bonds_and_stats_accuracy
-- Purpose:
--   1. Enforce single-leg party_id tagging (AR/AP only) in fn_auto_post_payment_journal.
--   2. Remediate historical non-AR/AP party_id links, duplicate 2025 opening balances,
--      and fake ledger accounts imported as parties.
--   3. Add partial composite indexes on journal_entry_lines, journal_entries,
--      invoices, and payments for fast analytics & debt queries.
--   4. Fix party balance functions/views, get_party_statement, recalculate_party_balance_from_ledger,
--      and get_dashboard_summary (no double currency conversion on JEL/invoices,
--      strictly AR/AP account codes without 221% equity accounts).
--   5. Create get_purchases_stats_summary & get_sales_stats_summary and upgrade
--      get_purchase_stats & get_sales_stats for net-remaining accuracy.
-- ============================================================================

-- ── 1. Currency helper for invoices (historical YER invoices with rate < 1 already store SAR base) ──
CREATE OR REPLACE FUNCTION public.fn_invoice_to_base_amount(
  p_currency_code text,
  p_amount numeric,
  p_exchange_rate numeric DEFAULT 1
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL OR p_amount = 0 THEN 0::numeric
    WHEN UPPER(TRIM(COALESCE(p_currency_code, 'SAR'))) = 'SAR' THEN ROUND(p_amount, 4)
    WHEN UPPER(TRIM(p_currency_code)) = 'YER' AND COALESCE(p_exchange_rate, 1) < 1 THEN ROUND(p_amount, 4)
    ELSE public.fn_to_base_amount(p_currency_code, p_amount, p_exchange_rate)
  END;
$function$;

-- ── 2. Fix fn_auto_post_payment_journal: single-leg party_id on AR/AP ONLY (NULL on cash/bank) ──
CREATE OR REPLACE FUNCTION public.fn_auto_post_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_je_id uuid;
  v_acc_ar uuid;
  v_acc_ap uuid;
  v_already_posted boolean;
  v_party_type text;
  v_reference_type text;
  v_base_amount numeric;
begin
  if new.status <> 'posted' then return new; end if;

  select exists(select 1 from public.journal_entries je where je.reference_id = new.id and je.deleted_at is null)
    into v_already_posted;
  if v_already_posted then return new; end if;

  if new.account_id is null then
    raise exception 'auto_post_failed: السند % بدون حساب (خزينة/بنك) - يجب اختيار حساب قبل إصدار السند', new.payment_number;
  end if;

  -- وحدة موحّدة: debit/credit دائماً بالعملة الأساس، وقيمة المعاملة الأجنبية في foreign_amount
  v_base_amount := public.fn_to_base_amount(new.currency_code, new.amount, new.exchange_rate);

  -- ── Transfer / general-account counterparty bonds ────────────────────────
  if new.party_id is null then
    if new.counterparty_account_id is null then
      return new;
    end if;

    if not exists (
      select 1 from public.accounts where id = new.counterparty_account_id and company_id = new.company_id
    ) then
      raise exception 'tenant_violation: الحساب المقابل للسند % لا ينتمي لشركة السند', new.payment_number;
    end if;

    v_reference_type := case when new.type = 'transfer' then 'transfer_bond' else 'payment_bond' end;

    insert into journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    values (new.company_id, new.branch_id, new.payment_date, v_reference_type, new.id,
            'ترحيل تلقائي - ' || (case when new.type='transfer' then 'تحويل داخلي ' else 'سند حساب عام ' end) || coalesce(new.payment_number,''),
            'draft', new.created_by)
    returning id into v_je_id;

    if new.type = 'transfer' then
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'تحويل إلى - ' || coalesce(new.payment_number,''));
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'تحويل من - ' || coalesce(new.payment_number,''));
    elsif new.type = 'receipt' then
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'قبض - ' || coalesce(new.payment_number,''));
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'إيراد/مقابل - ' || coalesce(new.payment_number,''));
    else
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'مقابل/صرف - ' || coalesce(new.payment_number,''));
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'صرف - ' || coalesce(new.payment_number,''));
    end if;

    update journal_entries set status = 'posted' where id = v_je_id;
    return new;
  end if;

  -- ── Party bonds (customer / supplier / both) — party_id ONLY on AR/AP leg ──
  select type into v_party_type from public.parties where id = new.party_id;
  if v_party_type is null then
    raise exception 'auto_post_failed: لا يوجد طرف (عميل/مورد) للسند % - party_id % غير موجود', new.payment_number, new.party_id;
  end if;

  v_acc_ar := fn_get_account_id(new.company_id, '1100');
  v_acc_ap := fn_get_account_id(new.company_id, '2100');

  if v_party_type = 'customer' or (v_party_type = 'both' and new.type = 'receipt') then
    if v_acc_ar is null then
      raise exception 'auto_post_failed: حساب AR(1100) غير موجود للشركة % - يجب إنشاؤه قبل إصدار سند %', new.company_id, new.payment_number;
    end if;
    insert into journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    values (new.company_id, new.branch_id, new.payment_date,
      case when new.type = 'receipt' then 'receipt_bond' else 'payment_bond' end, new.id,
      'ترحيل تلقائي - ' || (case when new.type='receipt' then 'سند قبض من عميل ' else 'سند صرف/تحصيل من عميل ' end) || coalesce(new.payment_number,''),
      'draft', new.created_by)
    returning id into v_je_id;

    if new.type = 'receipt' then
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'قبض - ' || coalesce(new.payment_number,''), NULL);
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, v_acc_ar, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'تخفيض مدينون - ' || coalesce(new.payment_number,''), new.party_id);
    else
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, v_acc_ar, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'زيادة مدينون (سند صرف) - ' || coalesce(new.payment_number,''), new.party_id);
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'صرف من خزينة - ' || coalesce(new.payment_number,''), NULL);
    end if;

  elsif v_party_type = 'supplier' or (v_party_type = 'both' and new.type in ('disbursement', 'payment')) then
    if v_acc_ap is null then
      raise exception 'auto_post_failed: حساب AP(2100) غير موجود للشركة % - يجب إنشاؤه قبل إصدار سند %', new.company_id, new.payment_number;
    end if;
    insert into journal_entries (company_id, branch_id, entry_date, reference_type, reference_id, description, status, created_by)
    values (new.company_id, new.branch_id, new.payment_date,
      case when new.type in ('disbursement', 'payment') then 'payment_bond' else 'receipt_bond' end, new.id,
      'ترحيل تلقائي - ' || (case when new.type in ('disbursement', 'payment') then 'سند صرف لمورد ' else 'سند قبض/تحصيل من مورد ' end) || coalesce(new.payment_number,''),
      'draft', new.created_by)
    returning id into v_je_id;

    if new.type in ('disbursement', 'payment') then
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, v_acc_ap, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'تخفيض دائنون - ' || coalesce(new.payment_number,''), new.party_id);
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'صرف - ' || coalesce(new.payment_number,''), NULL);
    else
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'قبض من مورد - ' || coalesce(new.payment_number,''), NULL);
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, v_acc_ap, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'زيادة دائنون (سند قبض) - ' || coalesce(new.payment_number,''), new.party_id);
    end if;

  else
    raise exception 'auto_post_failed: نوع الطرف غير معروف (%) للسند % - يجب أن يكون customer أو supplier', v_party_type, new.payment_number;
  end if;

  update journal_entries set status = 'posted' where id = v_je_id;
  return new;
end;
$function$;

-- ── 3. Historical Data Remediation ──
ALTER TABLE public.journal_entry_lines DISABLE TRIGGER trg_journal_entry_lines_immutability;
ALTER TABLE public.journal_entry_lines DISABLE TRIGGER ensure_journal_balance;
ALTER TABLE public.journal_entry_lines DISABLE TRIGGER trg_check_account_postable;

UPDATE public.journal_entry_lines jel
SET party_id = NULL
FROM public.accounts a
WHERE a.id = jel.account_id
  AND jel.party_id IS NOT NULL
  AND NOT (
    a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
    OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
  );

ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_check_account_postable;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER ensure_journal_balance;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_journal_entry_lines_immutability;

DELETE FROM public.party_opening_balances ob
WHERE ob.notes = 'رصيد افتتاحي من إقفال 2025'
  AND EXISTS (
    SELECT 1
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.party_id = ob.party_id
      AND je.company_id = ob.company_id
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND je.entry_date <= DATE '2025-12-31'
  );

UPDATE public.parties
SET deleted_at = COALESCE(deleted_at, now())
WHERE deleted_at IS NULL
  AND TRIM(name) IN (
    'صندوق سعودي',
    'صندوق ريال يمني',
    'صندوق الفايض والعجز',
    'بضاعة اول المدة',
    'نقد',
    'الفرع وائل حساب بن دول 23173682',
    'محمد عادل النظاري حساب عبر الصرافات',
    'نبيل صرافة الثور',
    'اجارات المحل +  سحبيات المحل',
    'اجار المستودع بن عقيل',
    'نقل البضايع من صنعاء ومن عدن'
  );

-- ── 4. Performance Indexes ──
CREATE INDEX IF NOT EXISTS idx_jel_company_party_account_active
  ON public.journal_entry_lines (company_id, party_id, account_id, journal_entry_id)
  WHERE deleted_at IS NULL AND party_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_je_company_status_date_active
  ON public.journal_entries (company_id, status, entry_date, branch_id)
  WHERE deleted_at IS NULL AND status = 'posted';

CREATE INDEX IF NOT EXISTS idx_invoices_company_type_branch_date_active
  ON public.invoices (company_id, type, branch_id, issue_date)
  WHERE deleted_at IS NULL AND status NOT IN ('void', 'cancelled', 'draft');

CREATE INDEX IF NOT EXISTS idx_payments_company_type_branch_date_active
  ON public.payments (company_id, type, branch_id, payment_date)
  WHERE deleted_at IS NULL AND status = 'posted';

-- ── 5. Rebuild Party Balance Views & Functions (Strictly AR/AP + Currency Conversion on Opening Balances) ──
CREATE OR REPLACE VIEW public.party_balances AS
WITH party_accts AS (
  SELECT a.id
  FROM public.accounts a
  WHERE a.deleted_at IS NULL
    AND (
      a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
      OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
    )
),
journal_bals AS (
  SELECT
    jel.party_id,
    jel.company_id,
    SUM(jel.debit_amount - jel.credit_amount)::numeric(14,2) AS journal_balance
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN party_accts pa ON pa.id = jel.account_id
  WHERE jel.deleted_at IS NULL
    AND jel.party_id IS NOT NULL
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
  GROUP BY jel.party_id, jel.company_id
),
opening_bals AS (
  SELECT
    ob.party_id,
    ob.company_id,
    SUM(
      CASE
        WHEN ob.direction::text = 'debit' THEN
          public.fn_to_base_amount(ob.currency_code, ob.amount, lr.rate_to_base)
        ELSE
          -public.fn_to_base_amount(ob.currency_code, ob.amount, lr.rate_to_base)
      END
    )::numeric(14,2) AS opening_balance
  FROM public.party_opening_balances ob
  LEFT JOIN LATERAL (
    SELECT er.rate_to_base
    FROM public.exchange_rates er
    WHERE er.company_id = ob.company_id
      AND er.currency_code = ob.currency_code
    ORDER BY er.effective_date DESC, er.created_at DESC
    LIMIT 1
  ) lr ON TRUE
  GROUP BY ob.party_id, ob.company_id
)
SELECT
  p.id AS party_id,
  p.company_id,
  p.type,
  (COALESCE(jb.journal_balance, 0::numeric) + COALESCE(ob.opening_balance, 0::numeric))::numeric(14,2) AS balance
FROM public.parties p
LEFT JOIN journal_bals jb ON jb.party_id = p.id AND jb.company_id = p.company_id
LEFT JOIN opening_bals ob ON ob.party_id = p.id AND ob.company_id = p.company_id
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.party_balances_by_currency AS
WITH party_accts AS (
  SELECT a.id
  FROM public.accounts a
  WHERE a.deleted_at IS NULL
    AND (
      a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
      OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
    )
),
combined AS (
  SELECT
    jel.party_id,
    jel.company_id,
    jel.currency_code,
    SUM(
      CASE
        WHEN jel.currency_code IS NOT NULL AND UPPER(TRIM(BOTH FROM jel.currency_code)) <> 'SAR' THEN
          COALESCE(NULLIF(jel.foreign_amount, 0::numeric), ABS(jel.debit_amount - jel.credit_amount))
          * (CASE WHEN jel.debit_amount >= jel.credit_amount THEN 1 ELSE -1 END)::numeric
        ELSE jel.debit_amount - jel.credit_amount
      END
    )::numeric(14,2) AS balance,
    COUNT(*)::integer AS transaction_count,
    MAX(je.entry_date) AS last_activity_date
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN party_accts pa ON pa.id = jel.account_id
  WHERE jel.deleted_at IS NULL
    AND jel.party_id IS NOT NULL
    AND jel.currency_code IS NOT NULL
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
  GROUP BY jel.party_id, jel.company_id, jel.currency_code

  UNION ALL

  SELECT
    ob.party_id,
    ob.company_id,
    ob.currency_code::text AS currency_code,
    SUM(
      CASE WHEN ob.direction::text = 'debit' THEN ob.amount ELSE -ob.amount END
    )::numeric(14,2) AS balance,
    0 AS transaction_count,
    NULL::date AS last_activity_date
  FROM public.party_opening_balances ob
  GROUP BY ob.party_id, ob.company_id, ob.currency_code
)
SELECT
  party_id,
  company_id,
  currency_code,
  SUM(balance)::numeric(14,2) AS balance,
  SUM(transaction_count)::integer AS transaction_count,
  MAX(last_activity_date) AS last_activity_date
FROM combined
GROUP BY party_id, company_id, currency_code;

CREATE OR REPLACE FUNCTION public.get_party_balances_by_company(p_company_id uuid)
RETURNS TABLE(party_id uuid, balance numeric, type text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH journal_bals AS (
    SELECT jel.party_id,
      SUM(jel.debit_amount - jel.credit_amount)::numeric(14,2) AS journal_balance
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE jel.company_id = p_company_id
      AND je.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND (
        a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
        OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
      )
      AND jel.deleted_at IS NULL
      AND jel.party_id IS NOT NULL
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
    GROUP BY jel.party_id
  ),
  opening_bals AS (
    SELECT ob.party_id,
      SUM(
        CASE
          WHEN ob.direction = 'debit' THEN
            public.fn_to_base_amount(ob.currency_code, ob.amount, (
              SELECT lr.rate_to_base FROM public.exchange_rates lr
              WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
              ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
            ))
          ELSE
            -public.fn_to_base_amount(ob.currency_code, ob.amount, (
              SELECT lr.rate_to_base FROM public.exchange_rates lr
              WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
              ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
            ))
        END
      )::numeric(14,2) AS opening_balance
    FROM public.party_opening_balances ob
    WHERE ob.company_id = p_company_id
    GROUP BY ob.party_id
  )
  SELECT
    p.id AS party_id,
    (COALESCE(jb.journal_balance, 0) + COALESCE(ob.opening_balance, 0))::numeric(14,2) AS balance,
    p.type::text
  FROM public.parties p
  LEFT JOIN journal_bals jb ON jb.party_id = p.id
  LEFT JOIN opening_bals ob ON ob.party_id = p.id
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_party_currencies_by_company(p_company_id uuid)
RETURNS TABLE(party_id uuid, currency_code text, balance numeric, transaction_count integer, last_activity_date date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  RETURN QUERY
  WITH combined AS (
    SELECT
      jel.party_id,
      jel.currency_code::text AS cur_code,
      SUM(
        CASE
          WHEN jel.currency_code IS NOT NULL AND UPPER(TRIM(BOTH FROM jel.currency_code)) <> 'SAR'
            THEN COALESCE(NULLIF(jel.foreign_amount, 0), ABS(jel.debit_amount - jel.credit_amount))
                 * CASE WHEN jel.debit_amount >= jel.credit_amount THEN 1 ELSE -1 END
          ELSE jel.debit_amount - jel.credit_amount
        END
      )::numeric(14,2) AS cur_balance,
      COUNT(*)::integer AS tx_count,
      MAX(je.entry_date) AS last_date
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE jel.company_id = p_company_id
      AND je.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND (
        a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
        OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
      )
      AND jel.deleted_at IS NULL
      AND jel.party_id IS NOT NULL
      AND jel.currency_code IS NOT NULL
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
    GROUP BY jel.party_id, jel.currency_code

    UNION ALL

    SELECT
      ob.party_id,
      ob.currency_code::text AS cur_code,
      SUM(
        CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE -ob.amount END
      )::numeric(14,2) AS cur_balance,
      0::integer AS tx_count,
      NULL::date AS last_date
    FROM public.party_opening_balances ob
    WHERE ob.company_id = p_company_id
    GROUP BY ob.party_id, ob.currency_code
  )
  SELECT
    c.party_id,
    c.cur_code AS currency_code,
    SUM(c.cur_balance)::numeric AS balance,
    SUM(c.tx_count)::integer AS transaction_count,
    MAX(c.last_date) AS last_activity_date
  FROM combined c
  GROUP BY c.party_id, c.cur_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_party_balance_from_ledger(p_party_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_balance numeric(14,4);
  v_company_id uuid;
begin
  select company_id into v_company_id from public.parties where id = p_party_id;

  if v_company_id is null then
    raise exception 'access_denied: الطرف غير موجود أو لا تملك صلاحية الوصول إلى شركته.'
      using errcode = '42501';
  end if;

  perform public.verify_company_access(v_company_id);

  -- رصيد الطرف من دفتر الأستاذ على حسابات الذمم (AR/AP) فقط
  select coalesce(sum(jel.debit_amount) - sum(jel.credit_amount), 0)
    into v_balance
  from public.journal_entry_lines jel
  join public.journal_entries je on je.id = jel.journal_entry_id
  join public.accounts a on a.id = jel.account_id
  where jel.party_id = p_party_id
    and a.deleted_at is null
    and (
      a.code like '1100%' or a.code like '1121%' or a.code like '121%' or a.code like 'MZ-121%'
      or a.code like '2100%' or a.code like '231%' or a.code like 'MZ-231%'
    )
    and jel.deleted_at is null
    and je.status = 'posted'
    and je.deleted_at is null;

  return coalesce(v_balance, 0);
end $function$;

CREATE OR REPLACE FUNCTION public.get_party_statement(
  p_company_id uuid,
  p_party_id uuid,
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_currency_code text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_movements json;
  v_party_type text;
  v_base_currency text;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  SELECT type INTO v_party_type
  FROM public.parties
  WHERE id = p_party_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF v_party_type IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(base_currency, 'SAR') INTO v_base_currency
  FROM public.companies
  WHERE id = p_company_id;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.entry_date, t.is_bf DESC, t.created_at, t.line_id), '[]'::json)
  INTO v_movements
  FROM (
    SELECT
      sub.line_id,
      sub.entry_date,
      sub.created_at,
      sub.is_bf,
      sub.ref,
      sub.operation_type,
      sub.description,
      sub.type,
      sub.debit,
      sub.credit,
      sub.currency,
      sub.debit_base,
      sub.credit_base,
      sub.reference_id,
      sub.reference_type,
      sub.payment_status,
      sub.paid_amount,
      sub.remaining_amount,
      sub.items_count,
      SUM(
        CASE
          WHEN v_party_type = 'supplier' THEN sub.credit - sub.debit
          ELSE sub.debit - sub.credit
        END
      ) OVER (
        PARTITION BY sub.currency
        ORDER BY sub.entry_date, sub.is_bf DESC, sub.created_at, sub.line_id
        ROWS UNBOUNDED PRECEDING
      ) AS balance
    FROM (
      -- 1.1 Balance Brought Forward
      SELECT
        'BF-' || ob_prev.currency AS line_id,
        p_from_date AS entry_date,
        (p_from_date::text || ' 00:00:00+00')::timestamptz AS created_at,
        1 AS is_bf,
        'رصيد سابق' AS ref,
        'رصيد ما قبل الفترة' AS operation_type,
        'رصيد مرحل من الفترة السابقة' AS description,
        'brought_forward' AS type,
        ob_prev.debit,
        ob_prev.credit,
        ob_prev.currency,
        ob_prev.debit_base,
        ob_prev.credit_base,
        NULL::uuid AS reference_id,
        'brought_forward' AS reference_type,
        'posted' AS payment_status,
        0::numeric AS paid_amount,
        0::numeric AS remaining_amount,
        0::bigint AS items_count
      FROM (
        SELECT
          prior_raw.currency,
          GREATEST(
            SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit - prior_raw.debit
                ELSE prior_raw.debit - prior_raw.credit
              END
            ), 0
          ) AS debit,
          GREATEST(
            -SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit - prior_raw.debit
                ELSE prior_raw.debit - prior_raw.credit
              END
            ), 0
          ) AS credit,
          GREATEST(
            SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit_base - prior_raw.debit_base
                ELSE prior_raw.debit_base - prior_raw.credit_base
              END
            ), 0
          ) AS debit_base,
          GREATEST(
            -SUM(
              CASE
                WHEN v_party_type = 'supplier' THEN prior_raw.credit_base - prior_raw.debit_base
                ELSE prior_raw.debit_base - prior_raw.credit_base
              END
            ), 0
          ) AS credit_base
        FROM (
          SELECT
            ob.currency_code AS currency,
            CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE 0 END AS debit,
            CASE WHEN ob.direction = 'credit' THEN ob.amount ELSE 0 END AS credit,
            CASE WHEN ob.direction = 'debit' THEN
              public.fn_to_base_amount(ob.currency_code, ob.amount, (
                SELECT lr.rate_to_base FROM public.exchange_rates lr
                WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
                ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
              ))
            ELSE 0 END AS debit_base,
            CASE WHEN ob.direction = 'credit' THEN
              public.fn_to_base_amount(ob.currency_code, ob.amount, (
                SELECT lr.rate_to_base FROM public.exchange_rates lr
                WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
                ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
              ))
            ELSE 0 END AS credit_base
          FROM public.party_opening_balances ob
          WHERE ob.company_id = p_company_id
            AND ob.party_id = p_party_id
            AND (p_from_date IS NOT NULL AND ob.entry_date < p_from_date)
            AND (p_currency_code IS NULL OR ob.currency_code = p_currency_code)

          UNION ALL

          SELECT
            jel.currency_code AS currency,
            CASE WHEN jel.debit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.debit_amount) ELSE 0 END AS debit,
            CASE WHEN jel.credit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.credit_amount) ELSE 0 END AS credit,
            jel.debit_amount AS debit_base,
            jel.credit_amount AS credit_base
          FROM public.journal_entry_lines jel
          JOIN public.journal_entries je ON je.id = jel.journal_entry_id
          JOIN public.accounts a ON a.id = jel.account_id
          WHERE je.company_id = p_company_id
            AND je.status = 'posted'
            AND je.deleted_at IS NULL
            AND jel.deleted_at IS NULL
            AND jel.party_id = p_party_id
            AND a.deleted_at IS NULL
            AND (
              a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
              OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
            )
            AND (p_from_date IS NOT NULL AND je.entry_date < p_from_date)
            AND (p_currency_code IS NULL OR jel.currency_code = p_currency_code)
        ) prior_raw
        GROUP BY prior_raw.currency
        HAVING SUM(
          CASE
            WHEN v_party_type = 'supplier' THEN prior_raw.credit - prior_raw.debit
            ELSE prior_raw.debit - prior_raw.credit
          END
        ) <> 0
      ) ob_prev
      WHERE p_from_date IS NOT NULL

      UNION ALL

      -- 1.2 Opening balance records in date range
      SELECT
        'OB-' || ob.id::text AS line_id,
        ob.entry_date,
        ob.created_at,
        0 AS is_bf,
        'رصيد افتتاحي' AS ref,
        'رصيد افتتاحي' AS operation_type,
        COALESCE(ob.notes, 'رصيد افتتاحي معتمد') AS description,
        'opening_balance' AS type,
        CASE WHEN ob.direction = 'debit' THEN ob.amount ELSE 0 END AS debit,
        CASE WHEN ob.direction = 'credit' THEN ob.amount ELSE 0 END AS credit,
        ob.currency_code AS currency,
        CASE WHEN ob.direction = 'debit' THEN
          public.fn_to_base_amount(ob.currency_code, ob.amount, (
            SELECT lr.rate_to_base FROM public.exchange_rates lr
            WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
            ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
          ))
        ELSE 0 END AS debit_base,
        CASE WHEN ob.direction = 'credit' THEN
          public.fn_to_base_amount(ob.currency_code, ob.amount, (
            SELECT lr.rate_to_base FROM public.exchange_rates lr
            WHERE lr.company_id = p_company_id AND lr.currency_code = ob.currency_code
            ORDER BY lr.effective_date DESC, lr.created_at DESC LIMIT 1
          ))
        ELSE 0 END AS credit_base,
        NULL::uuid AS reference_id,
        'opening_balance' AS reference_type,
        'posted' AS payment_status,
        0::numeric AS paid_amount,
        0::numeric AS remaining_amount,
        0::bigint AS items_count
      FROM public.party_opening_balances ob
      WHERE ob.company_id = p_company_id
        AND ob.party_id = p_party_id
        AND (p_from_date IS NULL OR ob.entry_date >= p_from_date)
        AND (p_to_date IS NULL OR ob.entry_date <= p_to_date)
        AND (p_currency_code IS NULL OR ob.currency_code = p_currency_code)

      UNION ALL

      -- 1.3 Journal lines within the filtered date range with enriched invoice/bond status
      SELECT
        jel.id::text AS line_id,
        je.entry_date,
        jel.created_at,
        0 AS is_bf,
        CASE
          WHEN je.reference_type IN ('sales_invoice', 'invoice') THEN COALESCE(inv.invoice_number, 'INV')
          WHEN je.reference_type = 'purchase_invoice' THEN COALESCE(inv.invoice_number, 'PUR')
          WHEN je.reference_type IN ('payment', 'payment_bond') THEN COALESCE(pay.payment_number, 'PAY')
          WHEN je.reference_type IN ('receipt', 'receipt_bond') THEN COALESCE(pay.payment_number, 'RCV')
          WHEN je.reference_type IN ('sale_return', 'sales_return', 'return_sale') THEN COALESCE(inv.invoice_number, 'RET')
          WHEN je.reference_type IN ('purchase_return', 'return_purchase') THEN COALESCE(inv.invoice_number, 'PRET')
          WHEN je.reference_type = 'expense' THEN 'EXP'
          WHEN je.reference_type = 'settlement' THEN 'SETTLE'
          ELSE COALESCE('JV-' || je.entry_number::text, 'JV')
        END AS ref,
        CASE
          WHEN je.reference_type IN ('sales_invoice', 'invoice') THEN 'فاتورة مبيعات'
          WHEN je.reference_type = 'purchase_invoice' THEN 'فاتورة مشتريات'
          WHEN je.reference_type IN ('payment', 'payment_bond') THEN 'سند صرف'
          WHEN je.reference_type IN ('receipt', 'receipt_bond') THEN 'سند قبض'
          WHEN je.reference_type IN ('sale_return', 'sales_return', 'return_sale') THEN 'مرتجع مبيعات'
          WHEN je.reference_type IN ('purchase_return', 'return_purchase') THEN 'مرتجع مشتريات'
          WHEN je.reference_type = 'expense' THEN 'صرف مصروف'
          WHEN je.reference_type = 'settlement' THEN 'تسوية ومقاصة'
          ELSE 'قيد محاسبي'
        END AS operation_type,
        COALESCE(jel.description, je.description, 'حركة محاسبية') AS description,
        je.reference_type AS type,
        CASE WHEN jel.debit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.debit_amount) ELSE 0 END AS debit,
        CASE WHEN jel.credit_amount > 0 THEN COALESCE(NULLIF(jel.foreign_amount, 0), jel.credit_amount) ELSE 0 END AS credit,
        COALESCE(jel.currency_code, v_base_currency) AS currency,
        jel.debit_amount AS debit_base,
        jel.credit_amount AS credit_base,
        COALESCE(inv.id, pay.id, je.reference_id, je.id) AS reference_id,
        COALESCE(je.reference_type, 'journal_entry') AS reference_type,
        CASE
          WHEN inv.id IS NOT NULL THEN
            CASE
              WHEN inv.status = 'paid' OR (inv.paid_amount >= inv.total_amount AND inv.total_amount > 0) THEN 'paid'
              WHEN inv.paid_amount > 0 THEN 'partial'
              WHEN inv.status = 'void' OR inv.status = 'cancelled' THEN 'void'
              ELSE 'unpaid'
            END
          WHEN pay.id IS NOT NULL THEN
            CASE
              WHEN pay.status = 'posted' THEN 'paid'
              WHEN pay.status = 'void' THEN 'void'
              ELSE 'draft'
            END
          ELSE 'posted'
        END AS payment_status,
        COALESCE(inv.paid_amount, pay.amount, 0)::numeric AS paid_amount,
        COALESCE(GREATEST(inv.total_amount - COALESCE(inv.paid_amount, 0), 0), 0)::numeric AS remaining_amount,
        COALESCE(inv_meta.item_count, 0)::bigint AS items_count
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.accounts a ON a.id = jel.account_id
      LEFT JOIN public.invoices inv ON inv.id = je.reference_id AND je.reference_type IN ('sales_invoice', 'invoice', 'purchase_invoice', 'sale_return', 'sales_return', 'return_sale', 'purchase_return', 'return_purchase')
      LEFT JOIN public.payments pay ON pay.id = je.reference_id AND je.reference_type IN ('payment', 'payment_bond', 'receipt', 'receipt_bond')
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS item_count
        FROM public.invoice_items ii
        WHERE ii.invoice_id = inv.id
      ) inv_meta ON true
      WHERE je.company_id = p_company_id
        AND je.status = 'posted'
        AND je.deleted_at IS NULL
        AND jel.deleted_at IS NULL
        AND jel.party_id = p_party_id
        AND a.deleted_at IS NULL
        AND (
          a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%'
          OR a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%'
        )
        AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
        AND (p_to_date IS NULL OR je.entry_date <= p_to_date)
        AND (p_currency_code IS NULL OR jel.currency_code = p_currency_code)
    ) sub
  ) t;

  RETURN v_movements;
END;
$function$;

-- ── 6. Fix get_dashboard_summary (no double fn_to_base_amount on JEL, strict AR/AP, fn_invoice_to_base_amount) ──
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    vc uuid;
    v_auth_branches uuid[];
    v_target_branch uuid;
    v_total_debts NUMERIC := 0;
    v_total_supplier_debts NUMERIC := 0;
    v_res jsonb;
BEGIN
    vc := public.verify_company_access(p_company_id);

    SELECT array_agg(b) INTO v_auth_branches
    FROM public.get_auth_branches(vc) b;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        IF public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin') THEN
            SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
        END IF;
    END IF;

    IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
        RETURN jsonb_build_object(
            'total_sales', 0, 'total_purchases', 0, 'total_expenses', 0,
            'receipt_bonds', 0, 'payment_bonds', 0, 'total_debts', 0,
            'total_supplier_debts', 0, 'invoice_count', 0
        );
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT public.is_super_admin() AND current_user NOT IN ('postgres', 'supabase_admin') THEN
            RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
        END IF;
        v_target_branch := p_branch_id;
    END IF;

    -- 1. ذمم العملاء الموحدة (AR فقط: 1100%, 1121%, 121%, MZ-121%) — jel.debit_amount/credit_amount مخزنة بالفعل بالعملة الأساس
    SELECT GREATEST(0, COALESCE(ROUND(SUM(jel.debit_amount - jel.credit_amount), 2), 0))
    INTO v_total_debts
    FROM public.journal_entry_lines jel
    JOIN public.accounts a ON a.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%')
      AND jel.deleted_at IS NULL
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      );

    -- ذمم الموردين الموحدة (AP فقط: 2100%, 231%, MZ-231% بدون 221% حقوق الملكية)
    SELECT GREATEST(0, COALESCE(ROUND(SUM(jel.credit_amount - jel.debit_amount), 2), 0))
    INTO v_total_supplier_debts
    FROM public.journal_entry_lines jel
    JOIN public.accounts a ON a.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%')
      AND jel.deleted_at IS NULL
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      );

    -- 2. إحصائيات الفواتير والسندات والمصروفات خلال الفترة المحددة
    WITH inv_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'sale' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('sale_return', 'return_sale') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_sales,

        COALESCE(ROUND(SUM(CASE
          WHEN i.type = 'purchase' AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          WHEN i.type IN ('purchase_return', 'return_purchase') AND i.status IN ('posted','paid','confirmed','partially_paid')
               AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
               AND (p_date_to IS NULL OR i.issue_date <= p_date_to) THEN
            -1 * public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
          ELSE 0
        END), 2), 0) AS total_purchases,

        COUNT(*) FILTER (
          WHERE i.type = 'sale' AND i.status NOT IN ('draft', 'void')
            AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
            AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
        ) AS invoice_count
      FROM public.invoices i
      WHERE i.company_id = vc
        AND i.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
        )
    ),
    pay_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN p.type = 'receipt'
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS receipt_bonds,
        COALESCE(ROUND(SUM(CASE
          WHEN p.type IN ('disbursement', 'payment')
               AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
               AND (p_date_to IS NULL OR p.payment_date <= p_date_to) THEN
            public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)
          ELSE 0
        END), 2), 0) AS payment_bonds
      FROM public.payments p
      WHERE p.company_id = vc AND p.status = 'posted' AND p.deleted_at IS NULL
        AND (
          (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
          OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
        )
    ),
    exp_summary AS (
      SELECT
        COALESCE(ROUND(SUM(CASE
          WHEN a.code LIKE 'MZ-3%' OR (a.type = 'expense' AND a.code NOT LIKE 'MZ-5%' AND a.code NOT LIKE '5%' AND a.code NOT LIKE '312%') THEN
            jel.debit_amount - jel.credit_amount
          ELSE 0
        END), 2), 0) AS total_expenses
      FROM public.journal_entry_lines jel
      JOIN public.accounts a ON a.id = jel.account_id
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      WHERE a.company_id = vc
        AND a.deleted_at IS NULL
        AND jel.deleted_at IS NULL
        AND je.deleted_at IS NULL
        AND je.status = 'posted'
        AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
        AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
        AND (
          (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
          OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
        )
    )
    SELECT jsonb_build_object(
      'total_sales', inv.total_sales,
      'total_purchases', inv.total_purchases,
      'total_expenses', exp.total_expenses,
      'receipt_bonds', pay.receipt_bonds,
      'payment_bonds', pay.payment_bonds,
      'total_debts', v_total_debts,
      'total_supplier_debts', v_total_supplier_debts,
      'invoice_count', inv.invoice_count
    ) INTO v_res
    FROM inv_summary inv
    CROSS JOIN pay_summary pay
    CROSS JOIN exp_summary exp;

    RETURN v_res;
END;
$function$;

-- ── 7. Purchases & Sales Net-Remaining Server RPCs ──
CREATE OR REPLACE FUNCTION public.get_purchases_stats_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_currency text DEFAULT NULL::text,
  p_payment_method text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  vc uuid;
  v_auth_branches uuid[];
  v_target_branch uuid;
  v_curr_filter text;
  v_method_filter text;
  v_invoice_count bigint := 0;
  v_return_count bigint := 0;
  v_pending_payment_count bigint := 0;
  v_gross_purchases numeric := 0;
  v_total_returns numeric := 0;
  v_total_discount numeric := 0;
  v_net_purchases numeric := 0;
  v_cash_purchases numeric := 0;
  v_credit_purchases numeric := 0;
  v_credit_returns numeric := 0;
  v_credit_inline_paid numeric := 0;
  v_total_purchases_sar numeric := 0;
  v_total_purchases_yer numeric := 0;
  v_cash_purchases_sar numeric := 0;
  v_cash_purchases_yer numeric := 0;
  v_credit_purchases_sar numeric := 0;
  v_credit_purchases_yer numeric := 0;
  v_payments_bonds_paid numeric := 0;
  v_gl_ap_debits_extra numeric := 0;
  v_supplier_bonds_paid numeric := 0;
  v_total_paid numeric := 0;
  v_total_debt numeric := 0;
  v_yer_net_base numeric := 0;
  v_total_debt_sar numeric := 0;
  v_total_debt_yer numeric := 0;
BEGIN
  vc := public.verify_company_access(p_company_id);

  SELECT array_agg(b) INTO v_auth_branches
  FROM public.get_auth_branches(vc) b;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    IF public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin') THEN
      SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
    END IF;
  END IF;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    RETURN jsonb_build_object(
      'invoice_count', 0, 'return_count', 0, 'pending_payment_count', 0,
      'gross_purchases', 0, 'total_returns', 0, 'total_discount', 0,
      'net_purchases', 0, 'cash_purchases', 0, 'credit_purchases', 0,
      'supplier_bonds_paid', 0, 'total_paid', 0, 'total_debt', 0,
      'total_purchases_sar', 0, 'total_purchases_yer', 0,
      'total_debt_sar', 0, 'total_debt_yer', 0,
      'cash_purchases_sar', 0, 'cash_purchases_yer', 0,
      'credit_purchases_sar', 0, 'credit_purchases_yer', 0
    );
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT public.is_super_admin() AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
    END IF;
    v_target_branch := p_branch_id;
  END IF;

  v_curr_filter := NULLIF(UPPER(TRIM(COALESCE(p_currency, ''))), '');
  IF v_curr_filter = 'ALL' THEN v_curr_filter := NULL; END IF;

  v_method_filter := NULLIF(LOWER(TRIM(COALESCE(p_payment_method, ''))), '');
  IF v_method_filter = 'all' THEN v_method_filter := NULL; END IF;

  WITH inv_norm AS (
    SELECT
      i.type,
      COALESCE(LOWER(TRIM(i.payment_method)), 'cash') AS method,
      UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) AS curr,
      i.status,
      i.total_amount,
      COALESCE(i.paid_amount, 0) AS paid_amount,
      public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate) AS base_amt,
      public.fn_invoice_to_base_amount(
        i.currency_code,
        LEAST(COALESCE(i.total_amount, 0), GREATEST(0, COALESCE(i.paid_amount, 0))),
        i.exchange_rate
      ) AS base_paid,
      public.fn_invoice_to_base_amount(i.currency_code, COALESCE(i.discount_amount, 0), i.exchange_rate) AS base_disc,
      CASE
        WHEN UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = 'YER'
             AND COALESCE(i.exchange_rate, 1) > 0 AND i.exchange_rate < 1
          THEN ROUND(i.total_amount / i.exchange_rate, 2)
        ELSE COALESCE(i.total_amount, 0)
      END AS nominal_yer_amt
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.deleted_at IS NULL
      AND i.type IN ('purchase', 'purchase_return', 'return_purchase')
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND (
        (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
      AND (v_curr_filter IS NULL OR UPPER(TRIM(COALESCE(i.currency_code, 'SAR'))) = v_curr_filter)
      AND (v_method_filter IS NULL OR COALESCE(LOWER(TRIM(i.payment_method)), 'cash') = v_method_filter)
  )
  SELECT
    COUNT(*) FILTER (WHERE type = 'purchase'),
    COUNT(*) FILTER (WHERE type IN ('purchase_return', 'return_purchase')),
    COUNT(*) FILTER (
      WHERE type = 'purchase'
        AND method <> 'cash'
        AND (total_amount - paid_amount) > 0.01
    ),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('purchase_return', 'return_purchase')), 2), 0),
    COALESCE(ROUND(SUM(base_disc) FILTER (WHERE type = 'purchase'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND method = 'cash'), 2), 0)
      - COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('purchase_return', 'return_purchase') AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('purchase_return', 'return_purchase') AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_paid) FILTER (WHERE type = 'purchase' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(
      CASE
        WHEN type = 'purchase' AND curr = 'SAR' THEN base_amt
        WHEN type IN ('purchase_return', 'return_purchase') AND curr = 'SAR' THEN -base_amt
        ELSE 0
      END
    ), 2), 0),
    COALESCE(ROUND(SUM(
      CASE
        WHEN type = 'purchase' AND curr = 'YER' THEN nominal_yer_amt
        WHEN type IN ('purchase_return', 'return_purchase') AND curr = 'YER' THEN -nominal_yer_amt
        ELSE 0
      END
    ), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND curr = 'SAR' AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(nominal_yer_amt) FILTER (WHERE type = 'purchase' AND curr = 'YER' AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'purchase' AND curr = 'SAR' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(nominal_yer_amt) FILTER (WHERE type = 'purchase' AND curr = 'YER' AND method <> 'cash'), 2), 0)
  INTO
    v_invoice_count,
    v_return_count,
    v_pending_payment_count,
    v_gross_purchases,
    v_total_returns,
    v_total_discount,
    v_cash_purchases,
    v_credit_purchases,
    v_credit_returns,
    v_credit_inline_paid,
    v_total_purchases_sar,
    v_total_purchases_yer,
    v_cash_purchases_sar,
    v_cash_purchases_yer,
    v_credit_purchases_sar,
    v_credit_purchases_yer
  FROM inv_norm;

  v_net_purchases := ROUND(v_gross_purchases - v_total_returns, 2);

  -- سندات الصرف والخصم للموردين من payments + قيود الصرف/التسوية في AP غير المسجلة في payments
  IF COALESCE(v_method_filter, 'credit') <> 'cash' THEN
    SELECT COALESCE(ROUND(SUM(public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)), 2), 0)
    INTO v_payments_bonds_paid
    FROM public.payments p
    JOIN public.parties pt ON pt.id = p.party_id
    WHERE p.company_id = vc
      AND p.deleted_at IS NULL
      AND p.status = 'posted'
      AND p.type IN ('disbursement', 'payment')
      AND pt.deleted_at IS NULL
      AND pt.type IN ('supplier', 'both')
      AND (
        (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
      AND (p_date_to IS NULL OR p.payment_date <= p_date_to)
      AND (v_curr_filter IS NULL OR UPPER(TRIM(COALESCE(p.currency_code, 'SAR'))) = v_curr_filter);

    SELECT COALESCE(ROUND(SUM(jel.debit_amount), 2), 0)
    INTO v_gl_ap_debits_extra
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE je.company_id = vc
      AND a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%')
      AND jel.deleted_at IS NULL
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND je.reference_type IN ('voucher', 'other', 'manual', 'settlement', 'payment_bond')
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p2
        WHERE p2.id = je.reference_id AND p2.deleted_at IS NULL
      )
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
      AND (v_curr_filter IS NULL OR UPPER(TRIM(COALESCE(jel.currency_code, 'SAR'))) = v_curr_filter);
  END IF;

  v_supplier_bonds_paid := ROUND(v_payments_bonds_paid + v_gl_ap_debits_extra, 2);
  v_total_paid := ROUND(GREATEST(0, v_cash_purchases) + v_credit_inline_paid + v_supplier_bonds_paid, 2);

  -- صافي المتبقي للموردين
  IF v_method_filter = 'cash' THEN
    v_total_debt := 0;
    v_pending_payment_count := 0;
    v_total_debt_sar := 0;
    v_total_debt_yer := 0;
  ELSIF v_curr_filter IS NULL AND v_method_filter IS NULL AND p_date_from IS NULL AND p_date_to IS NULL THEN
    -- صافي حسابات الدائنين (2100%, 231%, MZ-231%) مطابق للوحة التحكم والأستاذ العام
    SELECT
      GREATEST(0, COALESCE(ROUND(SUM(jel.credit_amount - jel.debit_amount), 2), 0)),
      COALESCE(ROUND(SUM(jel.credit_amount - jel.debit_amount) FILTER (
        WHERE UPPER(TRIM(COALESCE(jel.currency_code, 'SAR'))) = 'YER'
      ), 2), 0)
    INTO v_total_debt, v_yer_net_base
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%')
      AND jel.deleted_at IS NULL
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      );

    IF v_total_debt <= 0.01 THEN
      v_total_debt := 0;
      v_total_debt_sar := 0;
      v_total_debt_yer := 0;
    ELSIF v_yer_net_base > 0.01 THEN
      v_total_debt_sar := GREATEST(0, ROUND(v_total_debt - LEAST(v_total_debt, v_yer_net_base), 2));
      SELECT COALESCE(ROUND(SUM(
        COALESCE(NULLIF(jel.foreign_amount, 0), jel.credit_amount - jel.debit_amount)
        * CASE WHEN jel.credit_amount >= jel.debit_amount THEN 1 ELSE -1 END
      ), 2), 0)
      INTO v_total_debt_yer
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.accounts a ON a.id = jel.account_id
      WHERE a.company_id = vc
        AND a.deleted_at IS NULL
        AND (a.code LIKE '2100%' OR a.code LIKE '231%' OR a.code LIKE 'MZ-231%')
        AND jel.deleted_at IS NULL
        AND je.deleted_at IS NULL
        AND je.status = 'posted'
        AND UPPER(TRIM(COALESCE(jel.currency_code, 'SAR'))) = 'YER'
        AND (
          (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
          OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
        );
      v_total_debt_yer := GREATEST(0, v_total_debt_yer);
    ELSE
      v_total_debt_sar := v_total_debt;
      v_total_debt_yer := 0;
    END IF;
  ELSE
    v_total_debt := GREATEST(0, ROUND(v_credit_purchases - v_credit_returns - v_credit_inline_paid - v_supplier_bonds_paid, 2));
    IF v_curr_filter = 'YER' THEN
      v_total_debt_sar := 0;
      v_total_debt_yer := v_total_debt;
    ELSE
      v_total_debt_sar := v_total_debt;
      v_total_debt_yer := 0;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'invoice_count', v_invoice_count,
    'return_count', v_return_count,
    'pending_payment_count', v_pending_payment_count,
    'gross_purchases', v_gross_purchases,
    'total_returns', v_total_returns,
    'total_discount', v_total_discount,
    'net_purchases', v_net_purchases,
    'cash_purchases', GREATEST(0, v_cash_purchases),
    'credit_purchases', v_credit_purchases,
    'supplier_bonds_paid', v_supplier_bonds_paid,
    'total_paid', v_total_paid,
    'total_debt', v_total_debt,
    'total_purchases_sar', v_total_purchases_sar,
    'total_purchases_yer', v_total_purchases_yer,
    'total_debt_sar', v_total_debt_sar,
    'total_debt_yer', v_total_debt_yer,
    'cash_purchases_sar', v_cash_purchases_sar,
    'cash_purchases_yer', v_cash_purchases_yer,
    'credit_purchases_sar', v_credit_purchases_sar,
    'credit_purchases_yer', v_credit_purchases_yer
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_purchase_stats(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  vc uuid;
  v_summary jsonb;
  v_top_suppliers jsonb;
  v_chart_data jsonb;
BEGIN
  vc := public.verify_company_access(p_company_id);
  v_summary := public.get_purchases_stats_summary(vc, p_branch_id, NULL, NULL, NULL, NULL);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', COALESCE(p.name, 'غير محدد'), 'value', s.total_base)
    ORDER BY s.total_base DESC
  ), '[]'::jsonb)
  INTO v_top_suppliers
  FROM (
    SELECT
      i.party_id,
      SUM(public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)) AS total_base
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.type = 'purchase'
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.deleted_at IS NULL
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    GROUP BY i.party_id
    ORDER BY total_base DESC
    LIMIT 5
  ) s
  LEFT JOIN public.parties p ON p.id = s.party_id AND p.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('date', d.day, 'amount', d.total)
    ORDER BY d.day
  ), '[]'::jsonb)
  INTO v_chart_data
  FROM (
    SELECT
      to_char(i.issue_date, 'YYYY-MM-DD') AS day,
      SUM(public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)) AS total
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.type = 'purchase'
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND i.deleted_at IS NULL
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    GROUP BY 1
  ) d;

  RETURN jsonb_build_object(
    'invoiceCount', COALESCE((v_summary->>'invoice_count')::bigint, 0),
    'returnCount', COALESCE((v_summary->>'return_count')::bigint, 0),
    'totalPurchases', COALESCE((v_summary->>'net_purchases')::numeric, 0),
    'grossPurchases', COALESCE((v_summary->>'gross_purchases')::numeric, 0),
    'netPurchases', COALESCE((v_summary->>'net_purchases')::numeric, 0),
    'totalReturns', COALESCE((v_summary->>'total_returns')::numeric, 0),
    'totalPaid', COALESCE((v_summary->>'total_paid')::numeric, 0),
    'supplierBondsPaid', COALESCE((v_summary->>'supplier_bonds_paid')::numeric, 0),
    'pendingPaymentCount', COALESCE((v_summary->>'pending_payment_count')::bigint, 0),
    'totalDebt', COALESCE((v_summary->>'total_debt')::numeric, 0),
    'totalPurchasesSAR', COALESCE((v_summary->>'total_purchases_sar')::numeric, 0),
    'totalPurchasesYER', COALESCE((v_summary->>'total_purchases_yer')::numeric, 0),
    'totalDebtSAR', COALESCE((v_summary->>'total_debt_sar')::numeric, 0),
    'totalDebtYER', COALESCE((v_summary->>'total_debt_yer')::numeric, 0),
    'topSuppliers', v_top_suppliers,
    'chartData', v_chart_data
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_stats_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  vc uuid;
  v_auth_branches uuid[];
  v_target_branch uuid;
  v_invoice_count bigint := 0;
  v_return_count bigint := 0;
  v_gross_sales numeric := 0;
  v_total_returns numeric := 0;
  v_total_discount numeric := 0;
  v_net_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_credit_sales numeric := 0;
  v_credit_returns numeric := 0;
  v_credit_inline_paid numeric := 0;
  v_payments_receipts numeric := 0;
  v_gl_ar_credits_extra numeric := 0;
  v_receipt_bonds_collected numeric := 0;
  v_total_collected numeric := 0;
  v_total_remaining_credit numeric := 0;
  v_avg_sale numeric := 0;
  v_last_30_sales numeric := 0;
  v_prev_30_sales numeric := 0;
  v_monthly_growth numeric := NULL;
BEGIN
  vc := public.verify_company_access(p_company_id);

  SELECT array_agg(b) INTO v_auth_branches
  FROM public.get_auth_branches(vc) b;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    IF public.is_super_admin() OR current_user IN ('postgres', 'supabase_admin') THEN
      SELECT array_agg(id) INTO v_auth_branches FROM public.branches WHERE company_id = vc;
    END IF;
  END IF;

  IF v_auth_branches IS NULL OR array_length(v_auth_branches, 1) = 0 THEN
    RETURN jsonb_build_object(
      'invoice_count', 0, 'return_count', 0,
      'gross_sales', 0, 'total_returns', 0, 'total_discount', 0,
      'net_sales', 0, 'cash_sales', 0, 'credit_sales', 0,
      'receipt_bonds_collected', 0, 'total_collected', 0,
      'total_remaining_credit', 0, 'avg_sale', 0, 'monthly_growth', NULL
    );
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT (p_branch_id = ANY(v_auth_branches)) AND NOT public.is_super_admin() AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
    END IF;
    v_target_branch := p_branch_id;
  END IF;

  WITH inv_norm AS (
    SELECT
      i.type,
      COALESCE(LOWER(TRIM(i.payment_method)), 'cash') AS method,
      public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate) AS base_amt,
      public.fn_invoice_to_base_amount(
        i.currency_code,
        LEAST(COALESCE(i.total_amount, 0), GREATEST(0, COALESCE(i.paid_amount, 0))),
        i.exchange_rate
      ) AS base_paid,
      public.fn_invoice_to_base_amount(i.currency_code, COALESCE(i.discount_amount, 0), i.exchange_rate) AS base_disc
    FROM public.invoices i
    WHERE i.company_id = vc
      AND i.deleted_at IS NULL
      AND i.type IN ('sale', 'sale_return', 'return_sale')
      AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
      AND (
        (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
        OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
      )
      AND (p_date_from IS NULL OR i.issue_date >= p_date_from)
      AND (p_date_to IS NULL OR i.issue_date <= p_date_to)
  )
  SELECT
    COUNT(*) FILTER (WHERE type = 'sale'),
    COUNT(*) FILTER (WHERE type IN ('sale_return', 'return_sale')),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'sale'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('sale_return', 'return_sale')), 2), 0),
    COALESCE(ROUND(SUM(base_disc) FILTER (WHERE type = 'sale'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'sale' AND method = 'cash'), 2), 0)
      - COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('sale_return', 'return_sale') AND method = 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type = 'sale' AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_amt) FILTER (WHERE type IN ('sale_return', 'return_sale') AND method <> 'cash'), 2), 0),
    COALESCE(ROUND(SUM(base_paid) FILTER (WHERE type = 'sale' AND method <> 'cash'), 2), 0)
  INTO
    v_invoice_count,
    v_return_count,
    v_gross_sales,
    v_total_returns,
    v_total_discount,
    v_cash_sales,
    v_credit_sales,
    v_credit_returns,
    v_credit_inline_paid
  FROM inv_norm;

  v_net_sales := ROUND(v_gross_sales - v_total_returns, 2);
  v_avg_sale := CASE WHEN v_invoice_count > 0 THEN ROUND(v_net_sales / v_invoice_count, 2) ELSE 0 END;

  -- سندات القبض من العملاء في payments + قيود التحصيل في AR غير المسجلة في payments
  SELECT COALESCE(ROUND(SUM(public.fn_to_base_amount(p.currency_code, p.amount, p.exchange_rate)), 2), 0)
  INTO v_payments_receipts
  FROM public.payments p
  JOIN public.parties pt ON pt.id = p.party_id
  WHERE p.company_id = vc
    AND p.deleted_at IS NULL
    AND p.status = 'posted'
    AND p.type = 'receipt'
    AND pt.deleted_at IS NULL
    AND pt.type IN ('customer', 'both')
    AND (
      (v_target_branch IS NOT NULL AND p.branch_id = v_target_branch)
      OR (v_target_branch IS NULL AND (p.branch_id = ANY(v_auth_branches) OR p.branch_id IS NULL))
    )
    AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
    AND (p_date_to IS NULL OR p.payment_date <= p_date_to);

  SELECT COALESCE(ROUND(SUM(jel.credit_amount), 2), 0)
  INTO v_gl_ar_credits_extra
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE je.company_id = vc
    AND a.company_id = vc
    AND a.deleted_at IS NULL
    AND (a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%')
    AND jel.deleted_at IS NULL
    AND je.deleted_at IS NULL
    AND je.status = 'posted'
    AND je.reference_type IN ('voucher', 'other', 'manual', 'settlement', 'receipt_bond')
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p2
      WHERE p2.id = je.reference_id AND p2.deleted_at IS NULL
    )
    AND (
      (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
      OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
    )
    AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
    AND (p_date_to IS NULL OR je.entry_date <= p_date_to);

  v_receipt_bonds_collected := ROUND(v_payments_receipts + v_gl_ar_credits_extra, 2);
  v_total_collected := ROUND(GREATEST(0, v_cash_sales) + v_credit_inline_paid + v_receipt_bonds_collected, 2);

  IF p_date_from IS NULL AND p_date_to IS NULL THEN
    -- صافي ذمم العملاء الآجلة من حسابات المدينون (1100%, 1121%, 121%, MZ-121%) مطابق للوحة التحكم
    SELECT GREATEST(0, COALESCE(ROUND(SUM(jel.debit_amount - jel.credit_amount), 2), 0))
    INTO v_total_remaining_credit
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.accounts a ON a.id = jel.account_id
    WHERE a.company_id = vc
      AND a.deleted_at IS NULL
      AND (a.code LIKE '1100%' OR a.code LIKE '1121%' OR a.code LIKE '121%' OR a.code LIKE 'MZ-121%')
      AND jel.deleted_at IS NULL
      AND je.deleted_at IS NULL
      AND je.status = 'posted'
      AND (
        (v_target_branch IS NOT NULL AND (jel.branch_id = v_target_branch OR je.branch_id = v_target_branch))
        OR (v_target_branch IS NULL AND (jel.branch_id = ANY(v_auth_branches) OR jel.branch_id IS NULL))
      );
  ELSE
    v_total_remaining_credit := GREATEST(0, ROUND(v_credit_sales - v_credit_returns - v_credit_inline_paid - v_receipt_bonds_collected, 2));
  END IF;

  -- نمو آخر 30 يوماً مقارنة بـ 30 يوماً السابقة
  SELECT
    COALESCE(SUM(CASE
      WHEN i.issue_date >= (CURRENT_DATE - 30) AND i.type = 'sale' THEN
        public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
      WHEN i.issue_date >= (CURRENT_DATE - 30) AND i.type IN ('sale_return', 'return_sale') THEN
        -public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN i.issue_date >= (CURRENT_DATE - 60) AND i.issue_date < (CURRENT_DATE - 30) AND i.type = 'sale' THEN
        public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
      WHEN i.issue_date >= (CURRENT_DATE - 60) AND i.issue_date < (CURRENT_DATE - 30) AND i.type IN ('sale_return', 'return_sale') THEN
        -public.fn_invoice_to_base_amount(i.currency_code, i.total_amount, i.exchange_rate)
      ELSE 0
    END), 0)
  INTO v_last_30_sales, v_prev_30_sales
  FROM public.invoices i
  WHERE i.company_id = vc
    AND i.deleted_at IS NULL
    AND i.type IN ('sale', 'sale_return', 'return_sale')
    AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
    AND i.issue_date >= (CURRENT_DATE - 60)
    AND (
      (v_target_branch IS NOT NULL AND i.branch_id = v_target_branch)
      OR (v_target_branch IS NULL AND (i.branch_id = ANY(v_auth_branches) OR i.branch_id IS NULL))
    );

  IF v_prev_30_sales > 0 THEN
    v_monthly_growth := ROUND(((v_last_30_sales - v_prev_30_sales) / v_prev_30_sales) * 100, 2);
  END IF;

  RETURN jsonb_build_object(
    'invoice_count', v_invoice_count,
    'return_count', v_return_count,
    'gross_sales', v_gross_sales,
    'total_returns', v_total_returns,
    'total_discount', v_total_discount,
    'net_sales', v_net_sales,
    'cash_sales', GREATEST(0, v_cash_sales),
    'credit_sales', v_credit_sales,
    'receipt_bonds_collected', v_receipt_bonds_collected,
    'total_collected', v_total_collected,
    'total_remaining_credit', v_total_remaining_credit,
    'avg_sale', v_avg_sale,
    'monthly_growth', v_monthly_growth
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_stats(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_summary jsonb;
BEGIN
  v_summary := public.get_sales_stats_summary(p_company_id, NULL, NULL, NULL);
  RETURN v_summary || jsonb_build_object(
    'total_sales', COALESCE((v_summary->>'net_sales')::numeric, 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_invoice_to_base_amount(text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchases_stats_summary(uuid, uuid, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_stats_summary(uuid, uuid, date, date) TO authenticated;

COMMIT;
