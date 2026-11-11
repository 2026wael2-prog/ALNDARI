-- إصلاح 404 (PGRST202) لـ get_top_selling_products:
-- الواجهة (dashboard/api) ترسل p_branch_id بينما الدالة في القاعدة لا تقبله،
-- فيفشل الاستدعاء ويعمل التطبيق بالمسار الاحتياطي الأبطأ.
-- نستبدل الدالة بنسخة تقبل p_branch_id (اختياري). الاستدعاءات القديمة بثلاثة
-- معاملات تبقى تعمل لأن المعامل الجديد له قيمة افتراضية NULL.
-- (نحذف النسخة القديمة أولاً كي لا يحدث تحميل زائد غامض في PostgREST.)

DROP FUNCTION IF EXISTS public.get_top_selling_products(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_top_selling_products(
  p_company_id uuid,
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT 30,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, name_ar text, sku text, category_id uuid,
  total_sold numeric, total_revenue numeric, total_cost numeric, gross_profit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);
  RETURN QUERY
  WITH recent_invoices AS (
    SELECT inv.id
    FROM public.invoices inv
    WHERE inv.company_id = p_company_id
      AND inv.type = 'sale'
      AND inv.status IN ('posted', 'paid', 'partially_paid')
      AND inv.deleted_at IS NULL
      AND inv.issue_date >= CURRENT_DATE - p_days
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
  ),
  top_items AS (
    SELECT
      ii.product_id,
      SUM(ii.quantity)::numeric AS total_sold,
      SUM(ii.total)::numeric AS total_revenue,
      SUM(ii.quantity * COALESCE(ii.cost_price, 0))::numeric AS total_cost,
      (SUM(ii.total) - SUM(ii.quantity * COALESCE(ii.cost_price, 0)))::numeric AS gross_profit
    FROM recent_invoices ri
    JOIN public.invoice_items ii ON ii.invoice_id = ri.id
    WHERE ii.company_id = p_company_id
    GROUP BY ii.product_id
    ORDER BY total_sold DESC
    LIMIT p_limit
  )
  SELECT
    ti.product_id AS id,
    p.name_ar,
    p.sku,
    p.category_id,
    ti.total_sold,
    ti.total_revenue,
    ti.total_cost,
    ti.gross_profit
  FROM top_items ti
  JOIN public.products p ON p.id = ti.product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_top_selling_products(uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_top_selling_products(uuid, integer, integer, uuid) TO authenticated, service_role;

