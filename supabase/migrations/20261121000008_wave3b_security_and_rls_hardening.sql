-- ============================================================================
-- Migration: 20261121000008_wave3b_security_and_rls_hardening.sql
-- Wave 3B (P1): Fix Supabase Security Advisors & Harden RBAC RLS Policies
-- ============================================================================

-- 1. Enable RLS on sync_log & sync_party_map (fixes 2 ERROR Security Advisors)
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_party_map ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_log' AND policyname = 'sync_log_admin_policy'
  ) THEN
    CREATE POLICY sync_log_admin_policy ON public.sync_log
      FOR ALL TO authenticated
      USING (
        public.is_super_admin() OR EXISTS (
          SELECT 1 FROM public.user_company_roles ucr
          WHERE ucr.user_id = (SELECT auth.uid())
            AND ucr.role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        public.is_super_admin() OR EXISTS (
          SELECT 1 FROM public.user_company_roles ucr
          WHERE ucr.user_id = (SELECT auth.uid())
            AND ucr.role IN ('owner', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_party_map' AND policyname = 'sync_party_map_admin_policy'
  ) THEN
    CREATE POLICY sync_party_map_admin_policy ON public.sync_party_map
      FOR ALL TO authenticated
      USING (
        public.is_super_admin() OR EXISTS (
          SELECT 1 FROM public.user_company_roles ucr
          WHERE ucr.user_id = (SELECT auth.uid())
            AND ucr.role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        public.is_super_admin() OR EXISTS (
          SELECT 1 FROM public.user_company_roles ucr
          WHERE ucr.user_id = (SELECT auth.uid())
            AND ucr.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

-- 2. Revoke anon/PUBLIC execute on enqueue_sync_event (fixes anon_security_definer_function_executable Advisor)
REVOKE EXECUTE ON FUNCTION public.enqueue_sync_event() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.enqueue_sync_event() TO authenticated, service_role;

-- 3. Lock down user_permissions write policies to owner/admin ONLY (blocks manager self-escalation)
ALTER POLICY user_permissions_insert ON public.user_permissions
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = user_permissions.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  );

ALTER POLICY user_permissions_update ON public.user_permissions
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = user_permissions.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = user_permissions.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  );

ALTER POLICY user_permissions_delete ON public.user_permissions
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = user_permissions.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  );

-- 4. Harden accounts write/delete policies against viewer/cashier direct mutations
ALTER POLICY accounts_insert ON public.accounts
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = accounts.company_id
        AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
    )
  );

ALTER POLICY accounts_update ON public.accounts
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = accounts.company_id
        AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = accounts.company_id
        AND ucr.role IN ('owner', 'admin', 'accountant', 'manager')
    )
  );

ALTER POLICY accounts_delete ON public.accounts
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = accounts.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  );

-- 5. Harden products write/delete policies against viewer direct mutations
ALTER POLICY products_insert ON public.products
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = products.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

ALTER POLICY products_update ON public.products
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = products.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = products.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

ALTER POLICY products_delete ON public.products
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = products.company_id
        AND ucr.role IN ('owner', 'admin', 'manager')
    )
  );

-- 6. Harden warehouses delete policy
ALTER POLICY warehouses_delete ON public.warehouses
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = warehouses.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  );

-- 7. Harden expenses write/delete policies against viewer direct mutations
ALTER POLICY expenses_insert ON public.expenses
  WITH CHECK (
    (public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = expenses.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant', 'cashier')
    )) AND public.is_valid_branch(company_id, branch_id)
  );

ALTER POLICY expenses_update ON public.expenses
  TO authenticated
  USING (
    public.is_super_admin() OR (
      EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid())
          AND ucr.company_id = expenses.company_id
          AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
      ) AND (branch_id IS NULL OR branch_id IN (SELECT public.get_auth_branches(expenses.company_id)))
    )
  )
  WITH CHECK (
    public.is_super_admin() OR (
      EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        WHERE ucr.user_id = (SELECT auth.uid())
          AND ucr.company_id = expenses.company_id
          AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
      ) AND (branch_id IS NULL OR branch_id IN (SELECT public.get_auth_branches(expenses.company_id)))
    )
  );

ALTER POLICY expenses_delete ON public.expenses
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = expenses.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  );

-- 8. Harden stock_transfers write/delete policies
ALTER POLICY stock_transfers_insert ON public.stock_transfers
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = stock_transfers.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

ALTER POLICY stock_transfers_update ON public.stock_transfers
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = stock_transfers.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = stock_transfers.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

ALTER POLICY stock_transfers_delete ON public.stock_transfers
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = stock_transfers.company_id
        AND ucr.role IN ('owner', 'admin')
    )
  );

-- 9. Harden payment_allocations write/delete policies
ALTER POLICY payment_allocations_insert ON public.payment_allocations
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = payment_allocations.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant', 'cashier')
    )
  );

ALTER POLICY payment_allocations_update ON public.payment_allocations
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = payment_allocations.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = payment_allocations.company_id
        AND ucr.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

ALTER POLICY payment_allocations_delete ON public.payment_allocations
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = payment_allocations.company_id
        AND ucr.role IN ('owner', 'admin', 'accountant')
    )
  );
