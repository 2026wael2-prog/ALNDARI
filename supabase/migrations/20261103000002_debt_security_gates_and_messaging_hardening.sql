-- ============================================================
-- Migration: 20261103000002_debt_security_gates_and_messaging_hardening.sql
-- Description:
--   1. record_debt_reminder: إضافة بوابة صلاحية (كانت تكتفي بفحص الانتساب
--      والملكية فقط، فيستطيع دور للقراءة فقط تسجيل "تذكير مُرسل" وهمي
--      وإضافة نشاط للعميل).
--   2. سياسة debt_insert_msg_log: حصر الإدراج في من يدير الديون أو يملك
--      debts:remind بدل أي منتسب للشركة.
-- ملاحظة: لا تغيير في التوقيع ولا في نوع الإرجاع.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) record_debt_reminder — بوابة صلاحية
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_debt_reminder(
    p_company_id uuid,
    p_party_id uuid,
    p_message_text text,
    p_channel character varying DEFAULT 'whatsapp'::character varying,
    p_template_id uuid DEFAULT NULL::uuid,
    p_recipient character varying DEFAULT NULL::character varying,
    p_related_entity_type character varying DEFAULT NULL::character varying,
    p_related_entity_id uuid DEFAULT NULL::uuid,
    p_idempotency_key text DEFAULT NULL
)
 RETURNS TABLE(message_log_id uuid, activity_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_msg_id  UUID;
    v_act_id  UUID;
    v_existing UUID;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    -- بوابة صلاحية: تسجيل التذكير = إجراء مطالبة، لا يكفي مجرد الانتساب للشركة.
    -- الاتحاد مع user_can_manage_debts يحفظ وصول accountant/owner (لا يملكون
    -- صفًا في role_permissions لـ debts:remind) ويمنع الأدوار للقراءة فقط.
    IF NOT public.user_can_manage_debts(p_company_id)
       AND NOT public.has_permission('debts:remind', p_company_id) THEN
        RAISE EXCEPTION 'access_denied';
    END IF;

    -- إعادة محاولة/نقر مزدوج: أعد الرسالة المسجلة بدل إنشاء سجل جديد
    IF p_idempotency_key IS NOT NULL THEN
        SELECT ml.id INTO v_existing
        FROM public.debt_message_log ml
        WHERE ml.company_id = p_company_id
          AND ml.idempotency_key = p_idempotency_key
        LIMIT 1;

        IF v_existing IS NOT NULL THEN
            RETURN QUERY SELECT v_existing, NULL::UUID;
            RETURN;
        END IF;
    END IF;

    -- حارس المستأجر: يجب أن ينتمي الطرف لنفس الشركة
    IF NOT EXISTS (
        SELECT 1 FROM public.parties p
        WHERE p.id = p_party_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'INVALID_PARTY';
    END IF;

    -- ملكية القالب: لا يجوز استخدام قالب شركة أخرى
    IF p_template_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.debt_message_templates t
        WHERE t.id = p_template_id AND t.company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'INVALID_TEMPLATE';
    END IF;

    INSERT INTO public.debt_message_log (
        company_id, party_id, channel, template_id, message_text,
        status, recipient, related_entity_type, related_entity_id,
        created_by, sent_at, idempotency_key
    ) VALUES (
        p_company_id, p_party_id, p_channel, p_template_id, p_message_text,
        'sent', p_recipient, p_related_entity_type, p_related_entity_id,
        auth.uid(), NOW(), p_idempotency_key
    )
    RETURNING id INTO v_msg_id;

    INSERT INTO public.customer_activities (
        company_id, customer_id, activity_type, subject, description,
        status, priority, scheduled_at, completed_at, created_by
    ) VALUES (
        p_company_id, p_party_id, 'follow_up', 'تذكير دين', p_message_text,
        'completed', 'medium', NOW(), NOW(), auth.uid()
    )
    RETURNING id INTO v_act_id;

    RETURN QUERY SELECT v_msg_id, v_act_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_debt_reminder(uuid, uuid, text, character varying, uuid, character varying, character varying, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_debt_reminder(uuid, uuid, text, character varying, uuid, character varying, character varying, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) debt_insert_msg_log — إدراج محكوم بالصلاحية
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "debt_insert_msg_log" ON public.debt_message_log;
CREATE POLICY "debt_insert_msg_log" ON public.debt_message_log
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.user_can_manage_debts(company_id)
      OR public.has_permission('debts:remind', company_id)
    )
  );

-- السياسة والدالة تغيّرتا ⇒ تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
