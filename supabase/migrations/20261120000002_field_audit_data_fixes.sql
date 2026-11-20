-- Field-audit data fixes applied to the live project (dagfjncoullstrhbjssr) on 2026-11-20.

-- 1) Fill zero weighted_avg_cost from the last posted purchase price, converted to base currency (SAR).
--    invoice_items.unit_price is in document currency; SAR = unit_price * exchange_rate.
with last_cost as (
  select distinct on (ii.product_id) ii.product_id,
         round(ii.unit_price * coalesce(nullif(inv.exchange_rate, 0), 1), 4) as sar_cost
  from invoice_items ii join invoices inv on inv.id = ii.invoice_id
  where inv.type = 'purchase' and inv.status in ('posted', 'paid') and inv.deleted_at is null
    and ii.unit_price > 0 and coalesce(ii.is_core_return, false) = false
  order by ii.product_id, inv.issue_date desc, inv.created_at desc)
update product_stock ps set weighted_avg_cost = lc.sar_cost
from last_cost lc
where lc.product_id = ps.product_id and ps.quantity > 0 and coalesce(ps.weighted_avg_cost, 0) = 0;

-- 2) fn_auto_post_invoice_journal: credit invoices with no funding account must keep the whole
--    amount on AR/AP, otherwise the paid portion is dropped and the entry is unbalanced.
--    Patch inserted before "-- Set session flag so journal entry posting trigger":
--      IF v_acc_funding IS NULL AND v_base_paid > 0 THEN
--        v_paid_foreign := 0; v_unpaid_foreign := v_net_receivable;
--        v_base_paid := 0; v_base_unpaid := v_base_net_receivable;
--      END IF;

-- 2b) Same function: total_amount is already in base currency, so the base amounts must not be converted again:
--      v_base_net_amount := round(v_net_amount, 4);
--      v_base_tax        := round(COALESCE(new.tax_amount, 0), 4);
--     Invoice W2-2026-66146 was corrected with a posted adjusting entry (type 'other'); no entry was deleted.

-- 3) Invoice W2-2026-66041 status paid -> partially_paid (paid 430 of 530), then journals were
--    generated for the 6 invoices that had none (W1-2026-22237/22238, W2-2026-66041/66042/66144/66146).
