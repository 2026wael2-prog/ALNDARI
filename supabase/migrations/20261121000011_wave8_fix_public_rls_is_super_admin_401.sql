-- ============================================================================
-- WAVE 8: Fix 401 ("permission denied for function is_super_admin") for anon
--         on system_platform_configs & harden 36 tenant RLS policies from
--         TO public -> TO authenticated.
-- Applied to live DB dagfjncoullstrhbjssr as wave8_fix_public_rls_is_super_admin_401
-- ============================================================================

ALTER POLICY system_configs_select_public
  ON public.system_platform_configs
  TO anon, authenticated
  USING (key = ANY (ARRAY['maintenance_mode'::text, 'feature_flags'::text]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_platform_configs'
      AND policyname = 'system_configs_select_super_admin'
  ) THEN
    CREATE POLICY system_configs_select_super_admin
      ON public.system_platform_configs
      FOR SELECT
      TO authenticated
      USING (public.is_super_admin());
  END IF;
END $$;

ALTER POLICY branches_delete               ON public.branches               TO authenticated;
ALTER POLICY cashboxes_insert              ON public.cashboxes              TO authenticated;
ALTER POLICY cashboxes_select              ON public.cashboxes              TO authenticated;
ALTER POLICY cashboxes_update              ON public.cashboxes              TO authenticated;
ALTER POLICY expenses_select               ON public.expenses               TO authenticated;
ALTER POLICY inv_tx_insert                 ON public.inventory_transactions TO authenticated;
ALTER POLICY inv_tx_select                 ON public.inventory_transactions TO authenticated;
ALTER POLICY invitations_select            ON public.invitations            TO authenticated;
ALTER POLICY invoices_delete               ON public.invoices               TO authenticated;
ALTER POLICY invoices_select               ON public.invoices               TO authenticated;
ALTER POLICY invoices_update               ON public.invoices               TO authenticated;
ALTER POLICY journal_entries_select        ON public.journal_entries        TO authenticated;
ALTER POLICY journal_entries_update        ON public.journal_entries        TO authenticated;
ALTER POLICY parties_delete                ON public.parties                TO authenticated;
ALTER POLICY parties_insert                ON public.parties                TO authenticated;
ALTER POLICY parties_select                ON public.parties                TO authenticated;
ALTER POLICY parties_update                ON public.parties                TO authenticated;
ALTER POLICY party_opening_balances_select ON public.party_opening_balances TO authenticated;
ALTER POLICY party_opening_balances_update ON public.party_opening_balances TO authenticated;
ALTER POLICY payments_delete               ON public.payments               TO authenticated;
ALTER POLICY payments_select               ON public.payments               TO authenticated;
ALTER POLICY payments_update               ON public.payments               TO authenticated;
ALTER POLICY product_stock_delete          ON public.product_stock          TO authenticated;
ALTER POLICY product_stock_insert          ON public.product_stock          TO authenticated;
ALTER POLICY product_stock_update          ON public.product_stock          TO authenticated;
ALTER POLICY quotations_select             ON public.quotations             TO authenticated;
ALTER POLICY quotations_update             ON public.quotations             TO authenticated;
ALTER POLICY str_insert                    ON public.stock_transfer_requests TO authenticated;
ALTER POLICY str_select                    ON public.stock_transfer_requests TO authenticated;
ALTER POLICY str_update                    ON public.stock_transfer_requests TO authenticated;
ALTER POLICY sync_outbox_admin_write       ON public.sync_outbox            TO authenticated;
ALTER POLICY sync_outbox_select            ON public.sync_outbox            TO authenticated;
ALTER POLICY user_company_roles_select     ON public.user_company_roles     TO authenticated;
ALTER POLICY warehouses_insert             ON public.warehouses             TO authenticated;
ALTER POLICY warehouses_select             ON public.warehouses             TO authenticated;
ALTER POLICY warehouses_update             ON public.warehouses             TO authenticated;
