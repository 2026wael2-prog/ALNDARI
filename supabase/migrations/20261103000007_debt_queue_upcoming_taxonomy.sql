-- ============================================================================
-- 20261103000007 — تصنيف ثلاثي للطابور: متأخر / اليوم / لم يحن أجله
-- ============================================================================
-- تكملة لهجرة 06 بعد تطبيقها على الإنتاج (2026-11-03):
--   بعد إصلاح «المتأخر»، بقيت 9 مهام بنوع due_today، و7 منها استحقاقها بعد
--   1..4 أيام. الرسالة كانت «فاتورة تحلّ اليوم» مع days_late = 0 ⇒ تعليمات
--   خاطئة من الجهة المقابلة. الفرق بين «متأخر» و«اليوم» و«بعد 3 أيام» هو
--   الفرق بين مكالمة مطالبة ومكالمة تذكير مسبق.
-- ============================================================================
-- (هجرة 06 عالجت «المتأخر»؛ هذه الهجرة تُكمل الحدّ الثالث: ما لم يحن أجله.)
--
-- الإصلاح:
--   1) تصنيف: overdue (مضى) / due_today (اليوم) / upcoming (لم يحن بعد).
--   2) next_action يتدرّج بشدة التأخير: ≤7 ودّي، ≤30 مطالبة، ≤60 إشعار نهائي،
--      >60 تصعيد. لا يبقى «تذكير ودّي» على دين متأخر شهرين.
--
-- لا نلمس get_debt_task_queue: تُستخدم في شاشات أخرى ووسمها جزء من عقدها.
--
-- Rollback: إعادة تنفيذ 20261103000006_debt_queue_overdue_taxonomy.sql.
-- ============================================================================

BEGIN;

-- فشل صريح بدل إنشاء دالة يتيمة إن لم تُطبَّق الهجرة 04.
DO $guard$
BEGIN
    IF to_regprocedure('public.get_debt_priority_queue(uuid,uuid,uuid,integer,text)') IS NULL THEN
        RAISE EXCEPTION 'migration 20261103000004 must be applied first';
    END IF;
END;
$guard$;

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
               (CURRENT_DATE - (lc.last_at)::date) AS days_since_contact,
               -- تصنيف فعلي (لا نلمس get_debt_task_queue كي لا نكسر شاشاتها):
               -- الدالة الأصلية تُسمّي كل فاتورة حلّ أجلها 'due_today' حتى لو
               -- تأخرت 60 يوماً، فيظهر «فاتورة مستحقة» بدل «متأخر».
               CASE
                     WHEN t.task_type <> 'due_today' THEN t.task_type
                     WHEN (t.due_at)::date < CURRENT_DATE
                       THEN 'overdue'::character varying
                     WHEN (t.due_at)::date > CURRENT_DATE
                       THEN 'upcoming'::character varying
                     ELSE 'due_today'::character varying
                   END AS task_type_norm
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
               CASE
                   WHEN f.task_type_norm = 'broken_promise' THEN 'وعد مكسور: اتصل الآن وأعد جدولة الوعد'
                   WHEN f.task_type_norm = 'promise_due'    THEN 'وعد مستحق: أكّد التحصيل اليوم'
                   WHEN f.task_type_norm = 'critical_debt'  THEN 'دين حرج: ابدأ إجراء التصعيد'
                   -- شدة الإجراء تتبع عمر التأخير: «تذكير ودّي» على دين متأخر
                   -- 55 يوماً تعليمات خاطئة للمحصّل.
                   WHEN f.task_type_norm = 'overdue' THEN
                       CASE WHEN f.days_late <= 7  THEN 'تأخر بسيط: تذكير ودّي وتأكيد موعد السداد'
                            WHEN f.days_late <= 30 THEN 'تأخر متوسط: اتصال مباشر ومطالبة بسداد جزئي'
                            WHEN f.days_late <= 60 THEN 'تأخر مطوّل: إشعار نهائي مكتوب قبل التصعيد'
                            ELSE 'تأخر حرج: رفع للمرحلة التالية (زيارة/إجراء قانوني)'
                       END
                   WHEN f.task_type_norm = 'due_today'      THEN 'فاتورة تحلّ اليوم: تذكير ودّي ومطالبة'
                   -- لم يحن الأجل بعد: «اتصل الآن» تُفقد الأولوية معناها.
                   WHEN f.task_type_norm = 'upcoming' THEN
                       'تستحق ' || CASE ((f.due_at)::date - CURRENT_DATE)
                           WHEN 1 THEN 'غداً'
                           WHEN 2 THEN 'بعد يومين'
                           WHEN 3 THEN 'بعد 3 أيام'
                           WHEN 4 THEN 'بعد 4 أيام'
                           WHEN 5 THEN 'بعد 5 أيام'
                           WHEN 6 THEN 'بعد 6 أيام'
                           WHEN 7 THEN 'بعد أسبوع'
                           -- 8..10 «أيام» و11+ «يوماً»: صيغة العدد في العربية
                           -- ليست تجميلاً؛ «خلال 1 أيام» خطأ ظاهر للمستخدم.
                           WHEN 8 THEN 'بعد 8 أيام'
                           WHEN 9 THEN 'بعد 9 أيام'
                           WHEN 10 THEN 'بعد 10 أيام'
                           ELSE 'بعد ' || ((f.due_at)::date - CURRENT_DATE)::text || ' يوماً'
                       END || ': تذكير مسبق لتأمين السداد'
                   WHEN f.task_type_norm = 'follow_up'      THEN 'متابعة مجدولة: نفّذ الإجراء'
                   WHEN f.task_type_norm = 'failed_message' THEN 'رسالة فاشلة: أعِد الإرسال'
                   ELSE 'متابعة تحصيل'
               END AS next_action
          FROM final f
    )
    SELECT l.task_id, l.task_type_norm AS task_type,
           l.party_id, l.party_name, l.party_phone,
           l.currency_code, l.amount, l.reference_info, l.urgency, l.priority,
           l.due_at, l.is_overdue, l.assigned_to, l.assigned_name, l.escalation_stage,
           l.amount_base, l.days_late, l.days_since_contact, l.priority_score,
           l.next_action,
           ARRAY_REMOVE(ARRAY[
               CASE WHEN l.days_late > 0
                    THEN 'متأخر ' || l.days_late::text || ' يوماً' END,
               CASE WHEN l.task_type_norm = 'broken_promise' THEN 'وعد مكسور' END,
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
            AND l.task_type_norm IN ('promise_due', 'broken_promise'))
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

