-- تحسين مشغّل مزامنة إحصاءات الطرف (sync_party_stats_on_invoice_change)
--
-- المشكلة: "الزبون العام" لديه ~19.6 ألف فاتورة، وكل فاتورة بيع جديدة كانت:
--   1) تُشغّل 6 استعلامات تجميع منفصلة على آلاف الصفوف (fn_to_base_amount داخل SUM).
--   2) تقفل صف الطرف نفسه بـ UPDATE، فتتسلسل كل عمليات البيع عليه وتتجاوز
--      الاستعلامات الأخرى مهلة 8 ثوانٍ (57014 statement timeout) → أخطاء 500.
--
-- الحل (نفس النتائج الحسابية بدون تغيير دلالي):
--   * دمج الاستعلامات الستة في مسح واحد باستخدام FILTER.
--   * تجاوز التحديث عبر FOR UPDATE SKIP LOCKED إذا كان صف الطرف مقفلاً من عملية
--     أخرى؛ الإحصاءات تُصحَّح تلقائياً عند أول تغيير تالٍ (هي إحصاءات عرض فقط،
--     والأرصدة المحاسبية تأتي من دفتر الأستاذ لا من هذه الأعمدة).

CREATE OR REPLACE FUNCTION public.sync_party_stats_on_invoice_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_party_id uuid;

  v_sales_paid numeric := 0;
  v_sales_returns numeric := 0;
  v_purchases_total numeric := 0;
  v_purchases_returns numeric := 0;

  v_inv_count integer;
  v_ord_count integer;
  v_last_inv timestamptz;
  v_last_pur timestamptz;
  v_paid numeric(15,2);
  v_purch numeric(15,2);
BEGIN
  v_party_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.party_id ELSE NEW.party_id END;
  IF v_party_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- لا ننتظر قفل صف الطرف: إن كانت عملية أخرى تحدّثه الآن نتجاوز المزامنة.
  PERFORM 1 FROM public.parties WHERE id = v_party_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  -- مسح واحد لكل الإحصاءات (بدل 6 مسوح منفصلة)
  SELECT
    COALESCE(SUM(public.fn_to_base_amount(currency_code, paid_amount, exchange_rate))
             FILTER (WHERE type = 'sale'), 0),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, total_amount, exchange_rate))
             FILTER (WHERE type IN ('sale_return', 'return_sale')), 0),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, total_amount, exchange_rate))
             FILTER (WHERE type = 'purchase'), 0),
    COALESCE(SUM(public.fn_to_base_amount(currency_code, total_amount, exchange_rate))
             FILTER (WHERE type IN ('purchase_return', 'return_purchase')), 0),
    COUNT(*) FILTER (WHERE type = 'sale'),
    (MAX(issue_date) FILTER (WHERE type = 'sale'))::timestamptz,
    COUNT(*) FILTER (WHERE type = 'purchase'),
    (MAX(issue_date) FILTER (WHERE type = 'purchase'))::timestamptz
  INTO v_sales_paid, v_sales_returns, v_purchases_total, v_purchases_returns,
       v_inv_count, v_last_inv, v_ord_count, v_last_pur
  FROM public.invoices
  WHERE party_id = v_party_id
    AND type IN ('sale', 'sale_return', 'return_sale',
                 'purchase', 'purchase_return', 'return_purchase')
    AND status NOT IN ('cancelled', 'void')
    AND deleted_at IS NULL;

  -- القيم المخزّنة فعلياً (نفس تقريب العمود numeric(15,2))
  v_paid  := ROUND(GREATEST(0, ROUND(v_sales_paid  - v_sales_returns,  4)), 2);
  v_purch := ROUND(GREATEST(0, ROUND(v_purchases_total - v_purchases_returns, 4)), 2);

  -- حارس عدم التغيير: لا نُعيد كتابة صف الطرف إلّا إذا تغيّرت إحصائية فعلاً.
  UPDATE public.parties SET
    total_invoices_count   = v_inv_count,
    total_paid_amount      = v_paid,
    last_invoice_date      = v_last_inv,
    total_orders_count     = v_ord_count,
    total_purchases_amount = v_purch,
    last_purchase_date     = v_last_pur,
    updated_at             = now()
  WHERE id = v_party_id
    AND (total_invoices_count, total_paid_amount, last_invoice_date,
         total_orders_count, total_purchases_amount, last_purchase_date)
        IS DISTINCT FROM
        (v_inv_count, v_paid, v_last_inv, v_ord_count, v_purch, v_last_pur);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

