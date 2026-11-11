-- ============================================================================
-- جدولة إرسال Web Push للتحصيل (pg_cron + pg_net)
-- ============================================================================
-- ⚠️ لا يُشغَّل تلقائياً: يحتاج عنوان المشروع والسر الفعلي.
--    استبدل <PROJECT_REF> و <DEBT_PUSH_CRON_SECRET> ثم شغّله في SQL Editor.
--
-- المتطلبات المسبقة:
--   1) نشر الدالة:   supabase functions deploy debt-push-dispatch --no-verify-jwt
--   2) ضبط الأسرار:  supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
--                    VAPID_SUBJECT=mailto:you@example.com
--                    DEBT_PUSH_CRON_SECRET=<سر طويل عشوائي>
--   3) تطبيق الهجرة 20261103000005_push_subscriptions.sql
--
-- التوقيت: 05:00 UTC = 08:00 صباحاً في الخليج (GMT+3) — قبل بداية يوم العمل.
-- لإلغاء الجدولة: SELECT cron.unschedule('debt-push-daily');
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $do$
DECLARE
  v_url    text := 'https://<PROJECT_REF>.supabase.co/functions/v1/debt-push-dispatch';
  v_secret text := '<DEBT_PUSH_CRON_SECRET>';
BEGIN
  IF v_url LIKE '%<PROJECT_REF>%' THEN
    RAISE EXCEPTION 'عدّل <PROJECT_REF> في عنوان الدالة قبل تشغيل السكربت';
  END IF;
  IF v_secret LIKE '%<DEBT_PUSH_CRON_SECRET>%' THEN
    RAISE EXCEPTION 'ضع قيمة DEBT_PUSH_CRON_SECRET الحقيقية قبل التشغيل';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'debt-push-daily') THEN
    PERFORM cron.unschedule('debt-push-daily');
  END IF;

  PERFORM cron.schedule(
    'debt-push-daily',
    '0 5 * * *',
    format(
      $job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
      $job$,
      v_url,
      v_secret
    )
  );

  RAISE NOTICE 'تمت جدولة debt-push-daily يومياً 05:00 UTC';
END $do$;

-- تحقّق سريع من آخر التنفيذات:
-- SELECT jobid, status, return_message, start_time
--   FROM cron.job_run_details
--  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'debt-push-daily')
--  ORDER BY start_time DESC LIMIT 5;
