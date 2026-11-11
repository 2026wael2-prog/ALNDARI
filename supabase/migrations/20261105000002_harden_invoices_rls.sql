-- =====================================================================
-- 20261105000002_harden_invoices_rls.sql
-- ---------------------------------------------------------------------
-- P0-3 (أمني/محاسبي): سياسة invoices_insert كانت تتحقق فقط من company_id
--   و is_valid_branch — بلا أي فحص صلاحية أو حالة. ومع وجود trigger
--   trg_auto_post_invoice_journal على INSERT، كان أي مستخدم مصادَق (حتى
--   viewer) يستطيع إنشاء فاتورة بحالة posted/paid مباشرة عبر PostgREST،
--   فتُنشأ قيود يومية ومخزون وذمم متجاوزة كل فحص صلاحيات وحدود ائتمان
--   وأسعار بيع. المسار المشروع الوحيد للإنشاء/الترحيل هو الدوال
--   (commit_sales_invoice_v2 / process_sales_return / commit_purchase_invoice)
--   وهي SECURITY DEFINER ⇒ لا تتأثر بسياسات RLS إطلاقاً.
--
-- التحقق المسبق قبل هذا الترحيل (تم على الكود المصدري):
--   لا يوجد أي `insert` / `update` / `delete` مباشر على جدول invoices في src
--   ولا في supabase/functions — كل الكتابة تمر عبر RPC.
--
-- ⚠️ أمان التشغيل الحي:
--   * إن وُجدت أي سياسة INSERT أخرى (permissive) على invoices فإنها تُجمع بـ OR
--     فتُبطل التشديد. لذلك نفحص عدد سياسات INSERT بعد التعديل ونُلغي الترحيل
--     إن كان أكثر من واحدة.
--   * is_super_admin() مضافة صراحةً في INSERT للحفاظ على سلوك المشرف العام
--     كما كان في سياسة UPDATE (get_auth_companies لا تُرجع شركات المشرف العام).
--   * الترحيل لا يمسّ SELECT/DELETE، ولا يغيّر أي دالة أو عمود.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) تحقق: RLS مُفعّل على invoices (بدونه السياسات بلا معنى)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'invoices' AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS غير مُفعّل على public.invoices — أوقف الترحيل وأفعِله أولاً';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) INSERT: صلاحية sales:create + حالة draft فقط
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
CREATE POLICY "invoices_insert" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
    AND public.has_permission('sales:create', company_id)
    AND status = 'draft'
  )
);

-- ---------------------------------------------------------------------
-- 2) UPDATE: الخروج من draft (ترحيل/إلغاء/سداد) يتطلب sales:update
--    (التعديل داخل draft يبقى متاحاً لمن يملك عضوية الشركة/الفرع كما كان)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "invoices_update" ON public.invoices;
CREATE POLICY "invoices_update" ON public.invoices
FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (branch_id IS NULL OR branch_id IN (SELECT public.get_auth_branches(invoices.company_id)))
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (branch_id IS NULL OR branch_id IN (SELECT public.get_auth_branches(invoices.company_id)))
    AND (status = 'draft' OR public.has_permission('sales:update', invoices.company_id))
  )
);

COMMENT ON POLICY "invoices_insert" ON public.invoices IS
  'P0-3: لا إنشاء فاتورة posted/paid مباشرة — الإدراج draft فقط وبصلاحية sales:create. الترحيل عبر RPC فقط.';
COMMENT ON POLICY "invoices_update" ON public.invoices IS
  'P0-3: الخروج من حالة draft (ترحيل/إلغاء) يتطلب sales:update. التعديل داخل draft متاح لأعضاء المنشأة.';

-- ---------------------------------------------------------------------
-- 3) فحص بعدي: سياسة INSERT واحدة فقط (سياسة permissive إضافية تُبطل التشديد)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_insert_policies int;
  v_update_policies int;
BEGIN
  SELECT count(*) INTO v_insert_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'invoices' AND cmd = 'INSERT';

  SELECT count(*) INTO v_update_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'invoices' AND cmd = 'UPDATE';

  IF v_insert_policies <> 1 THEN
    RAISE EXCEPTION
      'P0-3 verification failed: عدد سياسات INSERT على invoices = % (المطلوب 1) — سياسة إضافية تُبطل التشديد',
      v_insert_policies;
  END IF;
  IF v_update_policies <> 1 THEN
    RAISE EXCEPTION
      'P0-3 verification failed: عدد سياسات UPDATE على invoices = % (المطلوب 1)',
      v_update_policies;
  END IF;

  RAISE NOTICE 'P0-3: سياسات invoices مُشدّدة (INSERT واحدة + UPDATE واحدة)';
END $$;

-- ---------------------------------------------------------------------
-- 4) تقرير مسبق: فواتير غير مسودة بلا created_by (مراجعة يدوية، لا تعديل تلقائي)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_posted_from_client int;
BEGIN
  SELECT COUNT(*) INTO v_posted_from_client
  FROM public.invoices
  WHERE status <> 'draft'
    AND deleted_at IS NULL
    AND created_by IS NULL;

  RAISE NOTICE 'P0-3 preflight: % فاتورة غير مسودة بدون created_by (راجعها يدوياً)', v_posted_from_client;
END $$;

COMMIT;
