-- ============================================================================
-- 20261103000005 — اشتراكات Web Push (تنبيهات التحصيل مع إغلاق المتصفح)
-- ============================================================================
-- لماذا: إشعارات سطح المكتب الحالية تعتمد على `new Notification()` من داخل
-- الصفحة، فتموت بمجرد إغلاق التبويب أو المتصفح. Web Push يعمل عبر Service
-- Worker + نقطة نهاية دفع، فيصل التنبيه حتى والتطبيق مغلق.
--
-- الجدول يخزّن اشتراك المتصفح لكل مستخدم/منشأة:
--   endpoint فريد عالمياً (يمنع تكرار الإرسال لنفس الجهاز)
--   p256dh + auth مفتاحا التشفير اللذان يولّدهما المتصفح
--   revoked_at لإبطال اشتراك منتهي بدل حذفه (نبقي أثر التدقيق)
--
-- الخصوصية: نقطة النهاية سرّ عملي (من يملكها يستطيع الإرسال للجهاز)، لذا لا
-- يقرأها إلا صاحبها؛ والإرسال يتم من Edge Function بمفتاح service_role.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.push_subscriptions;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_company_id_fkey') THEN
        ALTER TABLE public.push_subscriptions
            ADD CONSTRAINT push_subscriptions_company_id_fkey
            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_fkey') THEN
        ALTER TABLE public.push_subscriptions
            ADD CONSTRAINT push_subscriptions_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $do$;

-- إرسال الدفعة يستعلم بالمنشأة ويستبعد الملغى ⇒ فهرس جزئي مطابق للاستعلام.
CREATE INDEX IF NOT EXISTS ix_push_subscriptions_active
    ON public.push_subscriptions (company_id, user_id)
    WHERE revoked_at IS NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- المالك فقط يرى اشتراكاته (نقطة النهاية سرّ عملي).
DROP POLICY IF EXISTS push_select_own ON public.push_subscriptions;
CREATE POLICY push_select_own ON public.push_subscriptions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND company_id = public.get_user_company_id());

DROP POLICY IF EXISTS push_insert_own ON public.push_subscriptions;
CREATE POLICY push_insert_own ON public.push_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND company_id = public.get_user_company_id());

-- تحديث/إبطال اشتراك المستخدم نفسه (تغيير endpoint أو إلغاء الاشتراك).
DROP POLICY IF EXISTS push_update_own ON public.push_subscriptions;
CREATE POLICY push_update_own ON public.push_subscriptions
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND company_id = public.get_user_company_id())
    WITH CHECK (user_id = auth.uid() AND company_id = public.get_user_company_id());

DROP POLICY IF EXISTS push_delete_own ON public.push_subscriptions;
CREATE POLICY push_delete_own ON public.push_subscriptions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND company_id = public.get_user_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
-- anon لا يرى شيئاً إطلاقاً (لا اشتراك بلا جلسة).
REVOKE ALL ON public.push_subscriptions FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
