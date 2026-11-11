-- ============================================================================
-- 20261103000004 — طابور تحصيل مرتّب بالأهمية (Debt Priority Queue)
-- ============================================================================
-- لماذا: `get_debt_task_queue` يجمع المهام لكنه يرتّبها بـ (نوع المهمة، الإلحاح،
-- التاريخ، الاسم). هذا ترتيب إداري لا مالي: عميل متأخر 3 أيام بمبلغ صغير يسبق
-- عميلاً متأخر 60 يوماً بمبلغ كبير، ولا يوجد أي أثر لـ«وعد مكسور» أو «لا تواصل
-- منذ أسبوعين» أو لثقل المبلغ. النتيجة: قائمة لا تُخبر المحصّل بماذا يبدأ.
--
-- هذه الدالة لا تُكرّر منطق الطابور: تبني فوقه طبقة تقييم شفافة:
--   priority_score (0..100) = تخلّف زمني (40) + ثقل مالي نسبي (25)
--                            + وعد مكسور (20) + انقطاع التواصل (10)
--                            + تصعيد زيارة/قانوني (5)
-- ومعها `next_action` (الأمر التنفيذي بالعربية) و`score_drivers` (سبب النقاط)
-- كي يشرح النظام ترتيبه ولا يبدو صندوقاً أسود.
--
-- الثقل المالي يُحسب بالعملة الأساسية للمنشأة عبر fn_to_base_amount (4 وسائط):
-- مقارنة مبالغ بعملات مختلفة بلا تحويل كانت ستجعل الترتيب هراءً (410× لليمن).
--
-- p_bucket: all | overdue | today | week | promises | critical | nocontact
--           (NULL = all). القيم الأخرى تُرفض بـ 22023 بدل التجاهل الصامت.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.get_debt_priority_queue(uuid, uuid, uuid, integer, text);
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_debt_priority_queue(
    p_company_id uuid,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_collector_id uuid DEFAULT NULL::uuid,
    p_limit integer DEFAULT 100,
    p_bucket text DEFAULT NULL::text
)
RETURNS TABLE(
    task_id text,
    task_type character varying,
    party_id uuid,
    party_name text,
    party_phone text,
    currency_code text,
    amount numeric,
    reference_info text,
    urgency character varying,
    priority character varying,
    due_at timestamp with time zone,
    is_overdue boolean,
    assigned_to uuid,
    assigned_name text,
    escalation_stage character varying,
    amount_base numeric,
    days_late integer,
    days_since_contact integer,
    priority_score numeric,
    next_action text,
    score_drivers text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_base           text;
    v_critical_days  integer;
BEGIN
    PERFORM public.fn_assert_company_access(p_company_id);

    IF p_bucket IS NOT NULL
       AND p_bucket <> ''
       AND p_bucket NOT IN ('all', 'overdue', 'today', 'week', 'promises', 'critical', 'nocontact') THEN
        RAISE EXCEPTION 'INVALID_BUCKET: %', p_bucket USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(c.base_currency, 'SAR')
      INTO v_base
      FROM public.companies c
     WHERE c.id = p_company_id;

    v_base := COALESCE(NULLIF(TRIM(v_base), ''), 'SAR');

    SELECT COALESCE(cfg.critical_days, 30)
      INTO v_critical_days
      FROM public.debt_followup_config cfg
     WHERE cfg.company_id = p_company_id
     LIMIT 1;
    v_critical_days := COALESCE(v_critical_days, 30);

    RETURN QUERY
    WITH q AS (
        -- نطلب ثلاثة أضعاف الحد ثم نعيد الترتيب ونقتطع: الطابور الأصلي
        -- يُرتَّب بمعيار مختلف، فالاقتطاع المبكر كان سيُخفي صفوفاً عالية الأهمية.
        SELECT t.*
          FROM public.get_debt_task_queue(
                   p_company_id, p_branch_id, p_collector_id, 7,
                   GREATEST(COALESCE(p_limit, 100), 1) * 3) t
    ),
    party_currency_base AS (
        -- الرصيد المفتوح المتأخر لكل (طرف، عملة) محوَّلاً إلى العملة الأساسية.
        SELECT i.party_id,
               i.currency_code,
               SUM(public.fn_to_base_amount(
                       i.currency_code,
                       i.total_amount - COALESCE(i.paid_amount, 0),
                       i.exchange_rate,
                       v_base)) AS base_open
          FROM public.invoices i
         WHERE i.company_id = p_company_id
           AND i.type = 'sale'
           AND i.status IN ('posted', 'confirmed', 'partially_paid')
           AND i.deleted_at IS NULL
           AND i.due_date < CURRENT_DATE
           AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0
         GROUP BY 1, 2
    ),
    last_contact AS (
        -- آخر تواصل فعلي: رسالة أُرسلت بنجاح أو متابعة أُنجزت.
        SELECT x.party_id, MAX(x.last_at) AS last_at
          FROM (
                SELECT dm.party_id,
                       MAX(COALESCE(dm.sent_at, dm.created_at)) AS last_at
                  FROM public.debt_message_log dm
                 WHERE dm.company_id = p_company_id
                   AND dm.status = 'sent'
                 GROUP BY 1
                UNION ALL
                SELECT ca.customer_id,
                       MAX(COALESCE(ca.completed_at, ca.updated_at))
                  FROM public.customer_activities ca
                 WHERE ca.company_id = p_company_id
                   AND ca.status = 'completed'
                 GROUP BY 1
               ) x
         GROUP BY 1
    ),
    scored AS (
        SELECT t.task_id, t.task_type, t.party_id, t.party_name, t.party_phone,
               t.currency_code, t.amount, t.reference_info, t.urgency, t.priority,
               t.due_at, t.is_overdue, t.assigned_to, t.assigned_name, t.escalation_stage,
               COALESCE(pcb.base_open,
                        public.fn_to_base_amount(t.currency_code, t.amount, 1, v_base),
                        0) AS amount_base,
               GREATEST(CURRENT_DATE - (t.due_at)::date, 0) AS days_late,
               (CURRENT_DATE - (lc.last_at)::date) AS days_since_contact
          FROM q t
          LEFT JOIN party_currency_base pcb
                 ON pcb.party_id = t.party_id
                AND pcb.currency_code = t.currency_code
          LEFT JOIN last_contact lc
                 ON lc.party_id = t.party_id
    ),
    totals AS (
        SELECT SUM(s.amount_base) AS total_base FROM scored s
    ),
    final AS (
        SELECT s.*,
               ROUND(LEAST(100::numeric,
                     40 * LEAST(s.days_late / 90.0, 1)
                   + 25 * LEAST(s.amount_base / NULLIF(t.total_base, 0), 1)
                   + CASE WHEN s.task_type = 'broken_promise' THEN 20 ELSE 0 END
                   + CASE WHEN s.days_since_contact IS NULL
                           OR s.days_since_contact >= 7 THEN 10 ELSE 0 END
                   + CASE WHEN s.escalation_stage IN ('visit', 'legal') THEN 5 ELSE 0 END
               ), 2) AS priority_score
          FROM scored s
          CROSS JOIN totals t
    ),
    labelled AS (
        SELECT f.*,
               CASE f.task_type
                   WHEN 'broken_promise' THEN 'وعد مكسور: اتصل الآن وأعد جدولة الوعد'
                   WHEN 'promise_due'    THEN 'وعد مستحق: أكّد التحصيل اليوم'
                   WHEN 'critical_debt'  THEN 'دين حرج: ابدأ إجراء التصعيد'
                   WHEN 'due_today'      THEN 'فاتورة مستحقة: تذكير ودّي ومطالبة'
                   WHEN 'follow_up'      THEN 'متابعة مجدولة: نفّذ الإجراء'
                   WHEN 'failed_message' THEN 'رسالة فاشلة: أعِد الإرسال'
                   ELSE 'متابعة تحصيل'
               END AS next_action
          FROM final f
    )
    SELECT l.task_id, l.task_type, l.party_id, l.party_name, l.party_phone,
           l.currency_code, l.amount, l.reference_info, l.urgency, l.priority,
           l.due_at, l.is_overdue, l.assigned_to, l.assigned_name, l.escalation_stage,
           l.amount_base, l.days_late, l.days_since_contact, l.priority_score,
           l.next_action,
           ARRAY_REMOVE(ARRAY[
               CASE WHEN l.days_late > 0
                    THEN 'متأخر ' || l.days_late::text || ' يوماً' END,
               CASE WHEN l.task_type = 'broken_promise' THEN 'وعد مكسور' END,
               CASE WHEN l.days_since_contact IS NULL THEN 'لا يوجد سجل تواصل'
                    WHEN l.days_since_contact >= 7
                    THEN 'لا تواصل منذ ' || l.days_since_contact::text || ' أيام' END,
               CASE WHEN l.escalation_stage IN ('visit', 'legal')
                    THEN 'مرحلة تصعيد: ' || l.escalation_stage::text END
           ], NULL) AS score_drivers
      FROM labelled l
     WHERE p_bucket IS NULL
        OR p_bucket = ''
        OR p_bucket = 'all'
        OR (p_bucket = 'overdue' AND l.is_overdue)
        OR (p_bucket = 'today' AND (l.due_at)::date = CURRENT_DATE)
        OR (p_bucket = 'week' AND (l.due_at)::date <= CURRENT_DATE + 7)
        OR (p_bucket = 'promises'
            AND l.task_type IN ('promise_due', 'broken_promise'))
        OR (p_bucket = 'critical'
            AND (l.days_late >= v_critical_days
                 OR l.escalation_stage IN ('visit', 'legal')))
        OR (p_bucket = 'nocontact'
            AND (l.days_since_contact IS NULL OR l.days_since_contact >= 7))
     ORDER BY l.priority_score DESC,
              l.days_late DESC,
              l.amount_base DESC,
              l.party_name
     LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$function$;

COMMENT ON FUNCTION public.get_debt_priority_queue(uuid, uuid, uuid, integer, text) IS
'طابور تحصيل مرتّب بالأهمية فوق get_debt_task_queue: درجة 0..100 (تخلّف زمني + ثقل مالي بالعملة الأساسية + وعد مكسور + انقطاع التواصل + تصعيد) مع next_action وscore_drivers وبِكِت جاهز للتصفية.';

REVOKE EXECUTE ON FUNCTION public.get_debt_priority_queue(uuid, uuid, uuid, integer, text)
    FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_debt_priority_queue(uuid, uuid, uuid, integer, text)
    TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

