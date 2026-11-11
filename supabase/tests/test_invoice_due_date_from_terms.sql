-- ============================================================
-- Invoice due-date from party payment terms tests
-- (remediation 2026-11-03 / migration 20261103000003)
-- ============================================================
-- يتحقق على PostgreSQL حقيقي من أن مُشغّل
-- trg_invoice_due_date_from_payment_terms يُصلح العيب §18:
--   T1  بيع آجل بلا تاريخ استحقاق  ⇒ الإصدار + مدة سماح الطرف
--   T2  بيع آجل استحقاقه = الإصدار ⇒ يُصحَّح إلى الإصدار + المدة
--   T3  تاريخ صريح مختلف           ⇒ يُحترم كما هو
--   T4  بيع نقدي بلا استحقاق       ⇒ يبقى NULL (لا أجل)
--   T5  مدة السماح NULL            ⇒ الاستحقاق = الإصدار
--   T6  مدة السماح 0               ⇒ الاستحقاق = الإصدار
--   T7  فاتورة شراء آجلة           ⇒ تُطبَّق نفس القاعدة
--   T8  مرتجع بيع                  ⇒ لا يُمَس (ليس استحقاقاً)
--   T9  طرف من منشأة أخرى          ⇒ لا تسرّب للمدة (عزل المستأجرين)
--
-- HOW TO RUN:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/tests/test_invoice_due_date_from_terms.sql
-- The whole script runs inside ONE transaction that is ROLLED BACK.
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_company    uuid;
  v_company_b  uuid;
  v_party      uuid;
  v_party_90   uuid;
  v_party_0    uuid;
  v_party_null uuid;
  v_tg         text;
  v_issue      date := DATE '2026-03-01';
  v_due        date;
BEGIN
  -- دليل العملات FK: invoices.currency_code → supported_currencies(code)
  INSERT INTO public.supported_currencies(code, name_ar, symbol)
  VALUES ('SAR', 'ريال سعودي', 'ر.س')
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO public.companies (name_ar) VALUES ('__due_date_test_a__') RETURNING id INTO v_company;
  INSERT INTO public.companies (name_ar) VALUES ('__due_date_test_b__') RETURNING id INTO v_company_b;

  -- تعطيل كل مُشغّلات invoices عدا مُشغّل الاستحقاق تحت الاختبار:
  -- مُشغّل الترحيل المحاسبي التلقائي يتطلب دليل حسابات كامل غير متاح هنا،
  -- وهو لا علاقة له بالاستحقاق. التعطيل DDL تراجعي ⇒ يزول مع ROLLBACK.
  FOR v_tg IN
    SELECT t.tgname
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.invoices'::regclass
       AND NOT t.tgisinternal
       AND t.tgname <> 'trg_invoice_due_date_from_payment_terms'
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DISABLE TRIGGER %I', v_tg);
  END LOOP;

  INSERT INTO public.parties(company_id, name, type, payment_terms_days)
  VALUES (v_company, '__terms_30__', 'customer', 30) RETURNING id INTO v_party;
  INSERT INTO public.parties(company_id, name, type, payment_terms_days)
  VALUES (v_company, '__terms_0__', 'customer', 0) RETURNING id INTO v_party_0;
  INSERT INTO public.parties(company_id, name, type, payment_terms_days)
  VALUES (v_company, '__terms_null__', 'customer', NULL) RETURNING id INTO v_party_null;
  -- طرف من منشأة أخرى بمدة 90 — يجب ألا تؤثر على فواتير المنشأة الأولى.
  INSERT INTO public.parties(company_id, name, type, payment_terms_days)
  VALUES (v_company_b, '__cross_tenant_90__', 'customer', 90) RETURNING id INTO v_party_90;

  -- ═══ T1: آجل بلا استحقاق ⇒ 2026-03-01 + 30 = 2026-03-31 ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T1__', 'sale', 'confirmed', v_party,
          v_issue, NULL, 100, 'credit', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS DISTINCT FROM v_issue + 30 THEN
    RAISE EXCEPTION 'T1 FAILED: due_date = % (expected %)', v_due, v_issue + 30;
  END IF;

  -- ═══ T2: الاستحقاق المنهار (= الإصدار) ⇒ يُصحَّح ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T2__', 'sale', 'confirmed', v_party,
          v_issue, v_issue, 100, 'credit', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS DISTINCT FROM v_issue + 30 THEN
    RAISE EXCEPTION 'T2 FAILED: collapsed due_date not repaired: % (expected %)',
      v_due, v_issue + 30;
  END IF;

  -- ═══ T3: تاريخ صريح مختلف ⇒ يُحترم ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T3__', 'sale', 'confirmed', v_party,
          v_issue, DATE '2026-04-15', 100, 'credit', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS DISTINCT FROM DATE '2026-04-15' THEN
    RAISE EXCEPTION 'T3 FAILED: explicit due_date overridden: % (expected 2026-04-15)', v_due;
  END IF;

  -- ═══ T4: نقدي بلا استحقاق ⇒ NULL ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T4__', 'sale', 'confirmed', v_party,
          v_issue, NULL, 100, 'cash', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS NOT NULL THEN
    RAISE EXCEPTION 'T4 FAILED: cash invoice got a due_date (%)', v_due;
  END IF;

  -- ═══ T5: مدة السماح NULL ⇒ الاستحقاق = الإصدار ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T5__', 'sale', 'confirmed', v_party_null,
          v_issue, NULL, 100, 'credit', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS DISTINCT FROM v_issue THEN
    RAISE EXCEPTION 'T5 FAILED: NULL terms gave due_date = % (expected %)', v_due, v_issue;
  END IF;

  -- ═══ T6: مدة صفر ⇒ الاستحقاق = الإصدار ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T6__', 'sale', 'confirmed', v_party_0,
          v_issue, NULL, 100, 'credit', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS DISTINCT FROM v_issue THEN
    RAISE EXCEPTION 'T6 FAILED: zero terms gave due_date = % (expected %)', v_due, v_issue;
  END IF;

  -- ═══ T7: فاتورة شراء آجلة ⇒ نفس القاعدة ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T7__', 'purchase', 'confirmed', v_party,
          v_issue, NULL, 100, 'credit', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS DISTINCT FROM v_issue + 30 THEN
    RAISE EXCEPTION 'T7 FAILED: purchase due_date = % (expected %)', v_due, v_issue + 30;
  END IF;

  -- ═══ T8: مرتجع بيع ⇒ لا يُمَس ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method,
                               currency_code, return_reason)
  VALUES (v_company, '__DD-T8__', 'sale_return', 'confirmed', v_party,
          v_issue, NULL, 50, 'credit', 'SAR', '__test_return__')
  RETURNING due_date INTO v_due;
  IF v_due IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FAILED: sale_return got a due_date (%)', v_due;
  END IF;

  -- ═══ T9: طرف من منشأة أخرى ⇒ مدة 90 لا تتسرّب ⇒ الاستحقاق = الإصدار ═══
  INSERT INTO public.invoices (company_id, invoice_number, type, status, party_id,
                               issue_date, due_date, total_amount, payment_method, currency_code)
  VALUES (v_company, '__DD-T9__', 'sale', 'confirmed', v_party_90,
          v_issue, NULL, 100, 'credit', 'SAR')
  RETURNING due_date INTO v_due;
  IF v_due IS DISTINCT FROM v_issue THEN
    RAISE EXCEPTION 'T9 FAILED: cross-tenant terms leaked, due_date = % (expected %)',
      v_due, v_issue;
  END IF;

  RAISE NOTICE 'ALL INVOICE DUE-DATE TESTS PASSED (T1..T9)';
END;
$$;

ROLLBACK;


