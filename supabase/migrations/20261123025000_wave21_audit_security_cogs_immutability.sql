-- ============================================================================
-- Wave 21: Critical Security, COGS Currency, Fiscal Year & Posted Item Immutability
-- ============================================================================
-- Addresses Priorities 2, 5, 7 + Fiscal Year propagation from Ghamdan audit:
-- 1. Revoke PUBLIC/anon EXECUTE on fn_merge_duplicate_products and enforce
--    fn_assert_company_access / fn_assert_branch_access + admin/manager checks
--    across all 6 SECURITY DEFINER RPCs.
-- 2. Fix fn_auto_post_invoice_journal to convert COGS using invoice currency rate
--    (prevents YER COGS from posting as SAR) and populate fiscal_year_id.
-- 3. Harden fn_guard_posted_invoice_items_immutability to block financial edits
--    (INSERT/DELETE/qty/price/cost/discount/tax/total) on posted/confirmed/paid
--    invoices unless app.reposting_doc = 'true'.
-- ============================================================================

REVOKE ALL ON FUNCTION public.fn_merge_duplicate_products(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_merge_duplicate_products(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_merge_duplicate_product(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_post_inventory_movement(uuid, uuid, uuid, numeric, text, text, uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recalculate_product_stock(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recalculate_product_stock_for_warehouse(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_release_payment_allocations(uuid, uuid) FROM PUBLIC, anon;
