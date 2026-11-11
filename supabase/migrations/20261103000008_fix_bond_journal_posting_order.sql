-- ============================================================
-- إصلاح ترتيب ترحيل قيود السندات + دعم الحساب المقابل في create_financial_bond
-- 2026-11-03
-- ============================================================
-- العرض (23514 Cannot add lines to a posted journal entry):
--   إنشاء سند قبض/صرف من شاشة المديونيات (أو صفحة السندات) يفشل بـ HTTP 400
--   من create_financial_bond، وتظهر للمستخدم رسالة قيد تقني غير مفهوم.
--
-- السبب الجذري (نفس نمط ADR-005/006/007 — "posted-first"):
--   1) create_financial_bond كان يُدرج رأس journal_entries بحالة 'posted'
--      **قبل** إدراج بنود journal_entry_lines في فرع الحساب المقابل/التحويل،
--      فيمنعه trigger الحي trg_journal_entry_lines_immutability
--      (prevent_posted_journal_line_modification) بالكود 23514 → ترتد المعاملة.
--   2) create_financial_bond لم يكن يحفظ payments.counterparty_account_id
--      (العمود أُضيف في 20260819000012 لصالح commit_payment فقط)، لذلك حتى
--      النسخة الصحيحة من fn_auto_post_payment_journal كانت تعود مبكراً بلا قيد
--      وتُترك المهمة للفرع اليدوي المعطوب في (1).
--   3) في الفرع اليدوي كان سند القبض يُقيَّد بالمقلوب (Dr الحساب المقابل /
--      Cr النقدية) بدل (Dr النقدية / Cr الحساب المقابل) — انعكاس محاسبي.
--   4) إذا كانت الدالة المطبّقة على القاعدة أقدم من 20260911000001 فسندات
--      الطرف (عميل/مورد) تفشل أيضاً بنفس الكود لأن trigger السندات كان
--      يُدرج القيد 'posted' قبل بنوده.
--
-- الإصلاح:
--   A) إعادة إنشاء fn_auto_post_payment_journal بالنسخة الآمنة
--      (draft → بنود → posted) — تعريف حتمي لا يعتمد على ترتيب الهجرات.
--   B) create_financial_bond:
--      • يحفظ counterparty_account_id للسندات ذات الحساب المقابل/التحويل.
--      • يعتمد على trigger السندات كمصدر وحيد للقيد (لا قيد مزدوج).
--      • احتياط دفاعي: إن لم يتولّد قيد (trigger قديم) ينشئ القيد
--        draft → بنود → posted وبالاتجاه المحاسبي الصحيح:
--           receipt       → Dr النقدية / Cr الحساب المقابل
--           payment       → Dr الحساب المقابل / Cr النقدية
--           disbursement  → Dr الحساب المقابل / Cr النقدية
--           transfer      → Dr حساب الهدف / Cr حساب المصدر
--   التوقيعات والصلاحيات لم تتغيّر (نفس توقيع 15 معاملاً + منح authenticated فقط).
-- ============================================================

BEGIN;

-- ── 1) عمود الحساب المقابل (idempotent — أُضيف سابقاً في 20260819000012) ──
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS counterparty_account_id uuid REFERENCES public.accounts(id);

-- ── 2) trigger السندات: draft → بنود → posted (تعريف حتمي) ──────────────
CREATE OR REPLACE FUNCTION public.fn_auto_post_payment_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_je_id uuid; v_acc_ar uuid; v_acc_ap uuid; v_already_posted boolean; v_party_type text;
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
      return new; -- legacy transfer without a destination: nothing to post
    end if;

    -- tenant guard: the counterparty account must belong to the same company
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
      -- Dr الهدف / Cr المصدر
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'تحويل إلى - ' || coalesce(new.payment_number,''));
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'تحويل من - ' || coalesce(new.payment_number,''));
    elsif new.type = 'receipt' then
      -- Dr المصدر (نقدي) / Cr الحساب المقابل
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'قبض - ' || coalesce(new.payment_number,''));
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'إيراد/مقابل - ' || coalesce(new.payment_number,''));
    else -- disbursement
      -- Dr الحساب المقابل / Cr المصدر (نقدي)
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.counterparty_account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'مقابل/صرف - ' || coalesce(new.payment_number,''));
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'صرف - ' || coalesce(new.payment_number,''));
    end if;

    update journal_entries set status = 'posted' where id = v_je_id;
    return new;
  end if;

  -- ── Party bonds (customer / supplier / both) ────────────────────────────
  select type into v_party_type from public.parties where id = new.party_id;
  if v_party_type is null then
    raise exception 'auto_post_failed: لا يوجد طرف (عميل/مورد) للسند % - party_id % غير موجود', new.payment_number, new.party_id;
  end if;

  v_acc_ar := fn_get_account_id(new.company_id, '1100');
  v_acc_ap := fn_get_account_id(new.company_id, '2100');

  -- 'both': سند قبض يخفض الذمم المدينة (سلوك عميل)، وسند صرف يخفض الذمم الدائنة (سلوك مورد)
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
      values (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'قبض - ' || coalesce(new.payment_number,''), new.party_id);
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, v_acc_ar, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'تخفيض مدينون - ' || coalesce(new.payment_number,''), new.party_id);
    else
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, v_acc_ar, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'زيادة مدينون (سند صرف) - ' || coalesce(new.payment_number,''), new.party_id);
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'صرف من خزينة - ' || coalesce(new.payment_number,''), new.party_id);
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
      values (v_je_id, new.account_id, new.company_id, new.branch_id, 0, v_base_amount, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'صرف - ' || coalesce(new.payment_number,''), new.party_id);
    else
      insert into journal_entry_lines (journal_entry_id, account_id, company_id, branch_id, debit_amount, credit_amount, foreign_amount, currency_code, exchange_rate, description, party_id)
      values (v_je_id, new.account_id, new.company_id, new.branch_id, v_base_amount, 0, new.amount, new.currency_code, coalesce(new.exchange_rate,1), 'قبض من مورد - ' || coalesce(new.payment_number,''), new.party_id);
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

-- ── 3) create_financial_bond: حفظ الحساب المقابل + قيد واحد بالترتيب الصحيح ──
CREATE OR REPLACE FUNCTION public.create_financial_bond(p_company_id uuid, p_bond_type text, p_amount numeric, p_currency_code text DEFAULT 'SAR'::text, p_exchange_rate numeric DEFAULT 1.0, p_foreign_amount numeric DEFAULT NULL::numeric, p_date date DEFAULT CURRENT_DATE, p_cash_account_id uuid DEFAULT NULL::uuid, p_counterparty_id uuid DEFAULT NULL::uuid, p_counterparty_type text DEFAULT 'party'::text, p_description text DEFAULT ''::text, p_invoice_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_journal_id uuid; v_payment_id uuid; v_counterparty_account_id uuid;
  v_party_type text; v_ref_type text; v_control_account_code text;
  v_party_id uuid := NULL; v_base_amount numeric; v_foreign_amount numeric;
  v_effective_rate numeric;
  v_uid uuid := auth.uid();  -- [أمني حرج] لا ثقة بـ p_user_id عندما لا يوجد auth.uid()
BEGIN
  PERFORM public.verify_company_access(p_company_id);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied: يتطلب تسجيل الدخول';
  END IF;

  IF NOT is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM user_company_roles ucr WHERE ucr.user_id = v_uid AND ucr.company_id = p_company_id
  ) THEN RAISE EXCEPTION 'access_denied'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fiscal_years
    WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date AND is_closed = false
  ) THEN RAISE EXCEPTION 'التاريخ يقع خارج سنة مالية مفتوحة'; END IF;

  IF p_cash_account_id IS NULL THEN RAISE EXCEPTION 'حساب الصندوق / البنك إلزامي'; END IF;
  PERFORM assert_account_belongs_to_company(p_cash_account_id, p_company_id, 'p_cash_account_id');

  v_effective_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0);
  v_foreign_amount := COALESCE(NULLIF(p_foreign_amount, 0), p_amount);
  v_base_amount    := ROUND(v_foreign_amount * v_effective_rate, 4);
  IF p_currency_code = (SELECT base_currency FROM companies WHERE id = p_company_id LIMIT 1) THEN
    v_base_amount := v_foreign_amount; v_effective_rate := 1.0;
  END IF;

  v_ref_type := CASE p_bond_type
    WHEN 'receipt' THEN 'receipt_bond' WHEN 'payment' THEN 'payment_bond'
    WHEN 'disbursement' THEN 'payment_bond' WHEN 'transfer' THEN 'internal_transfer'
    ELSE NULL END;
  IF v_ref_type IS NULL THEN RAISE EXCEPTION 'نوع السند غير صحيح: %', p_bond_type; END IF;

  IF p_bond_type = 'transfer' THEN
    PERFORM assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (transfer target account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSIF p_counterparty_type = 'account' THEN
    PERFORM assert_account_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (account)');
    v_counterparty_account_id := p_counterparty_id;
  ELSE
    PERFORM assert_party_belongs_to_company(p_counterparty_id, p_company_id, 'p_counterparty_id (party)');
    v_party_id := p_counterparty_id;
    SELECT type INTO v_party_type FROM parties WHERE id = p_counterparty_id;
    IF v_party_type IS NULL THEN RAISE EXCEPTION 'الطرف التجاري غير موجود: %', p_counterparty_id; END IF;
  END IF;

  -- 1) السند نفسه: نُثبّت الحساب المقابل كي يولّد الـ trigger القيد بنفسه
  INSERT INTO payments(
    company_id, branch_id, party_id, counterparty_account_id, type, amount, currency_code, exchange_rate,
    payment_date, payment_method, account_id, reference_type, notes, status, created_by
  ) VALUES (
    p_company_id, p_branch_id, v_party_id,
    CASE WHEN v_party_id IS NULL THEN v_counterparty_account_id ELSE NULL END,
    -- payments_type_check يقبل (receipt | disbursement | transfer) فقط؛
    -- 'payment' مرادف 'disbursement' في الواجهة، فنُطبّعه بدل إسقاط السند.
    CASE WHEN p_bond_type = 'receipt' THEN 'receipt'
         WHEN p_bond_type = 'transfer' THEN 'transfer'
         ELSE 'disbursement' END,
    v_foreign_amount, p_currency_code, v_effective_rate,
    p_date, p_payment_method, p_cash_account_id, v_ref_type, p_description, 'posted', v_uid
  ) RETURNING id INTO v_payment_id;

  -- 2) القيد المحاسبي: trigger السندات هو المصدر الوحيد (draft → بنود → posted)
  SELECT id INTO v_journal_id FROM journal_entries
   WHERE reference_id = v_payment_id AND deleted_at IS NULL
   ORDER BY created_at LIMIT 1;

  -- احتياط دفاعي: نسخة قديمة من الـ trigger لا تولّد قيداً للحساب المقابل
  IF v_journal_id IS NULL THEN
    IF v_party_id IS NOT NULL THEN
      RAISE EXCEPTION 'auto_post_failed: لم يتم ترحيل السند تلقائياً كما هو متوقع';
    END IF;

    INSERT INTO journal_entries(company_id, branch_id, entry_date, description, reference_type, reference_id, status, created_by)
    VALUES (p_company_id, p_branch_id, p_date, p_description,
            -- نفس تسمية trigger السندات (void_bond يعكس transfer_bond/payment_bond)
            CASE WHEN p_bond_type = 'transfer' THEN 'transfer_bond' ELSE 'payment_bond' END,
            v_payment_id, 'draft', v_uid)
    RETURNING id INTO v_journal_id;

    IF p_bond_type = 'receipt' THEN
      -- Dr النقدية / Cr الحساب المقابل
      INSERT INTO journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
      VALUES
        (v_journal_id, p_cash_account_id, NULL, v_base_amount, 0, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
        (v_journal_id, v_counterparty_account_id, NULL, 0, v_base_amount, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);
    ELSE
      -- Dr الحساب المقابل (أو حساب الهدف في التحويل) / Cr النقدية
      INSERT INTO journal_entry_lines(journal_entry_id, account_id, party_id, debit_amount, credit_amount, description, currency_code, exchange_rate, foreign_amount, company_id, branch_id)
      VALUES
        (v_journal_id, v_counterparty_account_id, NULL, v_base_amount, 0, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id),
        (v_journal_id, p_cash_account_id, NULL, 0, v_base_amount, p_description, p_currency_code, v_effective_rate, v_foreign_amount, p_company_id, p_branch_id);
    END IF;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  -- 3) تخصيص المبلغ على الفاتورة (ذرّي — داخل نفس المعاملة)
  IF p_invoice_id IS NOT NULL THEN
    INSERT INTO payment_allocations(payment_id, invoice_id, amount, company_id)
    VALUES (v_payment_id, p_invoice_id, v_foreign_amount, p_company_id) ON CONFLICT DO NOTHING;
    UPDATE invoices SET paid_amount = GREATEST(0, COALESCE(paid_amount,0) + v_foreign_amount), updated_at = now()
    WHERE id = p_invoice_id AND company_id = p_company_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id, 'payment_number', (SELECT payment_number FROM payments WHERE id = v_payment_id),
    'journal_id', v_journal_id, 'base_amount', v_base_amount, 'foreign_amount', v_foreign_amount,
    'exchange_rate', v_effective_rate, 'status', 'success'
  );
END;
$function$;

-- ── 4) تحصين الصلاحيات (defensive — نفس المنح المعتمد) ──
REVOKE EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_financial_bond(uuid, text, numeric, text, numeric, numeric, date, uuid, uuid, text, text, uuid, uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_auto_post_payment_journal() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_auto_post_payment_journal() TO authenticated;
COMMIT;
