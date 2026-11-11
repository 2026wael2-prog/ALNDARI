-- ============================================================
-- Debt priority queue tests (migration 20261103000004)
-- ============================================================
-- يتحقق من أن الترتيب يعكس الخطر المالي لا الترتيب الإداري:
--   T1  فاتورة قديمة كبيرة تسبق فاتورة حديثة صغيرة
--   T2  الوعد المكسور يرفع الدرجة ويظهر في الطابور
--   T3  الدرجة محصورة 0..100 و next_action غير فارغ
--   T4  p_bucket='overdue' لا يُرجع إلا المتأخر
--   T5  بِكِت غير معروف يُرفض بـ 22023 بدل التجاهل الصامت
--   T6  المقارنة بين العملات تتم بالعملة الأساسية (YER لا يطغى بسبب رقمه الكبير)
--   T7  التصنيف يطابق تاريخ الاستحقاق: overdue / due_today / upcoming
--
-- HOW TO RUN:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_debt_priority_queue.sql
-- The whole script runs inside ONE transaction that is ROLLED BACK.
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_uid     uuid;
  v_company uuid;
  v_branch  uuid;
  v_old     uuid;   -- طرف متأخر 60 يوماً بمبلغ كبير
  v_new     uuid;   -- طرف متأخر 3 أيام بمبلغ صغير
  v_yer     uuid;   -- طرف بعملة غير العملة الأساسية
  v_today   date := CURRENT_DATE;
  v_row     record;
  v_first_party uuid;
  v_score   numeric;
  v_action  text;
  v_cnt     integer;
  v_blocked boolean := false;
BEGIN
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'priority queue test requires at least one user in auth.users';
  END IF;

  INSERT INTO public.companies (name_ar) VALUES ('__priority_queue_test__') RETURNING id INTO v_company;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.branches (company_id, name, is_main)
  VALUES (v_company, '__pq_branch__', true) RETURNING id INTO v_branch;

  INSERT INTO user_company_roles(user_id, company_id, role, branch_id)
  VALUES (v_uid, v_company, 'accountant', v_branch);

  INSERT INTO fiscal_years(company_id, name, start_date, end_date, is_closed)
  VALUES (v_company, 'FY2026', DATE '2026-01-01', DATE '2026-12-31', false);

  INSERT INTO supported_currencies(code, name_ar, symbol, exchange_operator)
  VALUES ('YER', 'ريال يمني', 'ر.ي', 'divide')
  ON CONFLICT (code) DO UPDATE SET exchange_operator = 'divide';
  INSERT INTO supported_currencies(code, name_ar, symbol)
  VALUES ('SAR', 'ريال سعودي', 'ر.س')
  ON CONFLICT (code) DO NOTHING;

  -- مُشغّل الترحيل التلقائي يحتاج دليل حسابات كامل؛ لا علاقة له بالترتيب.
  -- التعطيل DDL تراجعي ⇒ يزول مع ROLLBACK.
  ALTER TABLE public.invoices DISABLE TRIGGER USER;

  INSERT INTO public.parties(company_id, name, type, branch_id)
  VALUES (v_company, '__pq_old_debtor__', 'customer', v_branch) RETURNING id INTO v_old;
  INSERT INTO public.parties(company_id, name, type, branch_id)
  VALUES (v_company, '__pq_new_debtor__', 'customer', v_branch) RETURNING id INTO v_new;

  -- طرف أ: 100,000 في فاتورة متأخرة 60 يوماً
  INSERT INTO public.invoices (
    company_id, invoice_number, type, status, party_id, branch_id,
    issue_date, due_date, total_amount, subtotal, payment_method,
    currency_code, exchange_rate, created_by
  ) VALUES (
    v_company, '__PQ-OLD__', 'sale', 'confirmed', v_old, v_branch,
    v_today - 70, v_today - 60, 100000, 100000, 'credit', 'SAR', 1, v_uid
  );

  -- طرف ب: 300 في فاتورة متأخرة 3 أيام
  INSERT INTO public.invoices (
    company_id, invoice_number, type, status, party_id, branch_id,
    issue_date, due_date, total_amount, subtotal, payment_method,
    currency_code, exchange_rate, created_by
  ) VALUES (
    v_company, '__PQ-NEW__', 'sale', 'confirmed', v_new, v_branch,
    v_today - 5, v_today - 3, 300, 300, 'credit', 'SAR', 1, v_uid
  );

  -- وعد مكسور للطرف ب (سيُحسب له +20).
  -- «مكسور» في الطابور = الحالة ما زالت pending وتاريخ الوعد مضى
  -- (انظر get_debt_task_queue: promise_date < CURRENT_DATE ⇒ broken_promise).
  INSERT INTO public.debt_payment_promises (
    company_id, party_id, amount, currency_code, promise_date, status, created_by
  ) VALUES (
    v_company, v_new, 300, 'SAR', v_today - 2, 'pending', v_uid
  );

  -- طرف ج: 200,000 ريال يمني متأخرة 30 يوماً (سعر 410) ≈ 488 ر.س
  -- الغرض: إثبات أن المقارنة بالعملة الأساسية، لا بالرقم الخام.
  INSERT INTO public.parties(company_id, name, type, branch_id)
  VALUES (v_company, '__pq_yer_debtor__', 'customer', v_branch) RETURNING id INTO v_yer;

  INSERT INTO public.invoices (
    company_id, invoice_number, type, status, party_id, branch_id,
    issue_date, due_date, total_amount, subtotal, payment_method,
    currency_code, exchange_rate, created_by
  ) VALUES (
    v_company, '__PQ-YER__', 'sale', 'confirmed', v_yer, v_branch,
    v_today - 40, v_today - 30, 200000, 200000, 'credit', 'YER', 410, v_uid
  );

  -- طرف ب/ج: فاتورة لم يحن أجلها بعد (بعد 3 أيام) — تصنيف 'upcoming'
  INSERT INTO public.invoices (
    company_id, invoice_number, type, status, party_id, branch_id,
    issue_date, due_date, total_amount, subtotal, payment_method,
    currency_code, exchange_rate, created_by
  ) VALUES (
    v_company, '__PQ-SOON__', 'sale', 'confirmed', v_new, v_branch,
    v_today - 1, v_today + 3, 150, 150, 'credit', 'SAR', 1, v_uid
  );

  -- ═══ T1: الأقدم والأكبر يتصدّر الطابور ═══
  SELECT q.party_id INTO v_first_party
    FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 20, NULL::text) q
   LIMIT 1;
  IF v_first_party IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'T1 FAILED: first party = % (expected the 60-day/100k debtor %)',
      v_first_party, v_old;
  END IF;

  -- ═══ T2: الوعد المكسور يظهر ويمنح نقاطاً ═══
  SELECT q.priority_score INTO v_score
    FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 50, 'promises') q
   WHERE q.task_type = 'broken_promise'
   LIMIT 1;
  IF v_score IS NULL THEN
    RAISE EXCEPTION 'T2 FAILED: broken promise is missing from the queue';
  END IF;
  IF v_score < 20 THEN
    RAISE EXCEPTION 'T2 FAILED: broken promise score = % (expected >= 20)', v_score;
  END IF;

  -- ═══ T3: الدرجة محصورة و next_action مملوء ═══
  SELECT COUNT(*) INTO v_cnt
    FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 50, NULL::text) q
   WHERE q.priority_score < 0
      OR q.priority_score > 100
      OR q.next_action IS NULL
      OR q.next_action = '';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T3 FAILED: % rows with out-of-range score or empty next_action', v_cnt;
  END IF;

  -- ═══ T4: بِكِت overdue لا يُرجع غير المتأخر ═══
  SELECT COUNT(*) INTO v_cnt
    FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 50, 'overdue') q
   WHERE q.is_overdue IS NOT TRUE;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T4 FAILED: % non-overdue rows leaked into the overdue bucket', v_cnt;
  END IF;

  -- ═══ T5: بِكِت غير معروف يُرفض (لا تجاهل صامت) ═══
  BEGIN
    PERFORM COUNT(*)
      FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 10, 'nonsense');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'T5 FAILED: an invalid bucket was silently accepted';
  END IF;

  -- ═══ T6: التحويل للعملة الأساسية (YER 200,000 لا تُقارن كرقم خام) ═══
  SELECT q.amount_base INTO v_score
    FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 50, NULL::text) q
   WHERE q.currency_code = 'YER'
   LIMIT 1;
  IF v_score IS NULL THEN
    RAISE EXCEPTION 'T6 FAILED: no YER row in the queue';
  END IF;
  IF v_score > 1000 THEN
    RAISE EXCEPTION 'T6 FAILED: YER amount_base = % (expected conversion to base currency)', v_score;
  END IF;

  -- ═══ T7: التصنيف يطابق تاريخ الاستحقاق فعلياً (لا «مستحق» لدين متأخر
  --        ولا «متأخر» لما لم يحن) — عيب ظهر على بيانات الإنتاج ═══
  SELECT COUNT(*) INTO v_cnt
    FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 50, NULL::text) q
   WHERE (q.task_type = 'overdue' AND q.days_late = 0)
      OR (q.task_type = 'due_today' AND (q.due_at)::date <> CURRENT_DATE)
      OR (q.task_type = 'upcoming' AND (q.due_at)::date <= CURRENT_DATE);
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T7 FAILED: % rows labelled against their own due date', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt
    FROM public.get_debt_priority_queue(v_company, NULL::uuid, NULL::uuid, 50, NULL::text) q
   WHERE q.task_type = 'upcoming';
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'T7 FAILED: invoice due in 3 days was not labelled upcoming';
  END IF;

  RAISE NOTICE 'ALL DEBT PRIORITY QUEUE TESTS PASSED (T1..T7)';
END;
$$;

ROLLBACK;
