-- ============================================================
-- Migration: 20261108250000_harden_two_security_definer_functions.sql
-- Description: إغلاق ثغرتين حقيقيتين في صلاحيات دوال SECURITY DEFINER.
--
-- 1) rl_commit_purchase_invoice: الهجرة 20260915000006:21 تحذف النسخة القديمة
--    (13 معاملًا) التي كانت قد سُحبت صلاحياتها، ثم تُنشئ نسخة جديدة بـ14 معاملًا
--    (20260915000006:382) **دون** REVOKE/GRANT. في PostgreSQL تُمنح كل دالة جديدة
--    EXECUTE لـ PUBLIC تلقائيًا، أي أن anon و authenticated من أي منشأة يمكنهم
--    استدعاؤها. نُعيد ضبط الصلاحيات هنا.
--
-- 2) fn_validate_invoice_business_rules: آخر تعريف (20260915000006:321) بلا
--    SET search_path رغم أنها SECURITY DEFINER تُنفَّذ بصلاحيات المالك.
--    ALTER FUNCTION يضبط search_path دون نسخ جسم الدالة (لا خطر نقل نصّي).
--
-- ملاحظة تشغيلية: CREATE OR REPLACE لاحق بلا SET search_path يُلغي إعداد ALTER،
-- فإذا أُعيد تعريف هاتين الدالتين مستقبلًا فيجب إعادة السطر المقابل.
-- ============================================================

-- (1) تصحيح صلاحيات rl_commit_purchase_invoice (14 معاملًا)
ALTER FUNCTION public.rl_commit_purchase_invoice(
  uuid, uuid, uuid, jsonb, numeric, text, date, text, uuid, text, text, uuid, date, numeric
) SET search_path TO 'public', 'pg_temp';

REVOKE ALL ON FUNCTION public.rl_commit_purchase_invoice(
  uuid, uuid, uuid, jsonb, numeric, text, date, text, uuid, text, text, uuid, date, numeric
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rl_commit_purchase_invoice(
  uuid, uuid, uuid, jsonb, numeric, text, date, text, uuid, text, text, uuid, date, numeric
) TO authenticated, service_role;

-- (2) تثبيت search_path لدالة التحقق من قواعد الفاتورة
ALTER FUNCTION public.fn_validate_invoice_business_rules()
  SET search_path TO 'public', 'pg_temp';
