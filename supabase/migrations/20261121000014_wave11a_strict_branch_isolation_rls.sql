-- ============================================================================
-- Wave 11A: Strict Branch Isolation — Helpers & RLS Policies
-- ----------------------------------------------------------------------------
-- Enforces strict branch isolation across ALL operational, financial,
-- accounting, party, debt, reconciliation, transfer, audit, and log tables,
-- EXCEPT shared product catalog & stock location visibility:
--   * products (+ catalog metadata, fitment, cross-refs) -> company-wide SELECT
--   * product_stock -> company-wide SELECT (every branch sees stock & locations),
--                      branch-scoped INSERT/UPDATE/DELETE
--   * warehouses & branches -> company-wide SELECT (to display locations),
--                              branch-scoped / admin-only writes
--
-- Role semantics:
--   * super_admin, owner, admin, or user_company_roles.branch_id IS NULL
--     => full multi-branch access (fn_has_all_branch_access = true)
--   * branch-scoped users (manager, accountant, cashier, sales, etc. with branch_id)
--     => STRICTLY isolated to their own branch_id; NULL branch_id rows are DENIED.
-- ============================================================================

-- 1. Canonical Branch Authorization Helpers
CREATE OR REPLACE FUNCTION public.fn_has_all_branch_access(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (
    public.is_super_admin()
    OR (
      current_setting('request.jwt.claims', true) IS NOT NULL
      AND btrim(current_setting('request.jwt.claims', true)) <> ''
      AND left(btrim(current_setting('request.jwt.claims', true)), 1) = '{'
      AND (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    )
    OR (
      (current_setting('request.jwt.claims', true) IS NULL OR btrim(current_setting('request.jwt.claims', true)) = '')
      AND session_user IN ('postgres', 'supabase_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_company_roles ucr
      WHERE ucr.user_id = (SELECT auth.uid())
        AND ucr.company_id = p_company_id
        AND (ucr.role IN ('owner', 'admin') OR ucr.branch_id IS NULL)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_branch_scoped_row_allowed(
  p_company_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (
    public.fn_has_all_branch_access(p_company_id)
    OR (
      p_branch_id IS NOT NULL
      AND p_branch_id IN (SELECT public.get_auth_branches(p_company_id))
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_resolve_authorized_branch(
  p_company_id uuid,
  p_requested_branch_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_branch_id uuid;
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF public.fn_has_all_branch_access(p_company_id) THEN
    IF p_requested_branch_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = p_requested_branch_id
          AND b.company_id = p_company_id
      ) THEN
        RAISE EXCEPTION 'الفرع المحدد لا ينتمي إلى هذه الشركة' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN p_requested_branch_id;
  END IF;

  -- Branch-scoped user: resolve their assigned branch
  SELECT b INTO v_user_branch_id
  FROM public.get_auth_branches(p_company_id) b
  LIMIT 1;

  IF v_user_branch_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد فرع مخصص لهذا المستخدم' USING ERRCODE = '42501';
  END IF;

  -- If caller omitted branch_id (NULL), clamp strictly to their own branch
  IF p_requested_branch_id IS NULL THEN
    RETURN v_user_branch_id;
  END IF;

  -- If caller explicitly requested another branch, hard-deny
  IF NOT EXISTS (
    SELECT 1 FROM public.get_auth_branches(p_company_id) b
    WHERE b = p_requested_branch_id
  ) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
  END IF;

  RETURN p_requested_branch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_assert_branch_access(
  p_company_id uuid,
  p_branch_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_assert_company_access(p_company_id);

  IF public.fn_has_all_branch_access(p_company_id) THEN
    RETURN;
  END IF;

  IF p_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.get_auth_branches(p_company_id) b
    WHERE b = p_branch_id
  ) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول إلى بيانات هذا الفرع' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Close NULL-branch bypasses in existing helpers
CREATE OR REPLACE FUNCTION public.is_valid_branch(p_company_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (
    (p_branch_id IS NULL AND public.fn_has_all_branch_access(p_company_id))
    OR (
      p_branch_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = p_branch_id
          AND b.company_id = p_company_id
          AND (
            public.fn_has_all_branch_access(p_company_id)
            OR p_branch_id IN (SELECT public.get_auth_branches(p_company_id))
          )
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_can_access_branch(p_company_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (
    public.fn_has_all_branch_access(p_company_id)
    OR (
      p_branch_id IS NOT NULL
      AND p_branch_id IN (SELECT public.get_auth_branches(p_company_id))
    )
  );
$function$;

-- ============================================================================
-- 2. Strict RLS Policies — Invoices & Invoice Items
-- ============================================================================
DROP POLICY IF EXISTS invoices_select ON public.invoices;
DROP POLICY IF EXISTS invoices_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_update ON public.invoices;
DROP POLICY IF EXISTS invoices_delete ON public.invoices;

CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS invoice_items_select ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_insert ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_update ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_delete ON public.invoice_items;

CREATE POLICY invoice_items_select ON public.invoice_items FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.id = invoice_items.invoice_id
          AND inv.company_id = invoice_items.company_id
          AND public.fn_is_branch_scoped_row_allowed(inv.company_id, inv.branch_id)
      )
    )
  )
);

CREATE POLICY invoice_items_insert ON public.invoice_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.company_id = invoice_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(inv.company_id, inv.branch_id)
    )
  )
);

CREATE POLICY invoice_items_update ON public.invoice_items FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.company_id = invoice_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(inv.company_id, inv.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.company_id = invoice_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(inv.company_id, inv.branch_id)
    )
  )
);

CREATE POLICY invoice_items_delete ON public.invoice_items FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.company_id = invoice_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(inv.company_id, inv.branch_id)
    )
  )
);

-- ============================================================================
-- 3. Strict RLS Policies — Payments & Payment Allocations
-- ============================================================================
DROP POLICY IF EXISTS payments_select ON public.payments;
DROP POLICY IF EXISTS payments_insert ON public.payments;
DROP POLICY IF EXISTS payments_update ON public.payments;
DROP POLICY IF EXISTS payments_delete ON public.payments;

CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY payments_delete ON public.payments FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS payment_allocations_select ON public.payment_allocations;
DROP POLICY IF EXISTS payment_allocations_insert ON public.payment_allocations;
DROP POLICY IF EXISTS payment_allocations_update ON public.payment_allocations;
DROP POLICY IF EXISTS payment_allocations_delete ON public.payment_allocations;

CREATE POLICY payment_allocations_select ON public.payment_allocations FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.id = payment_allocations.payment_id
          AND p.company_id = payment_allocations.company_id
          AND public.fn_is_branch_scoped_row_allowed(p.company_id, p.branch_id)
      )
    )
  )
);

CREATE POLICY payment_allocations_insert ON public.payment_allocations FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_allocations.payment_id
        AND p.company_id = payment_allocations.company_id
        AND public.fn_is_branch_scoped_row_allowed(p.company_id, p.branch_id)
    )
  )
);

CREATE POLICY payment_allocations_update ON public.payment_allocations FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_allocations.payment_id
        AND p.company_id = payment_allocations.company_id
        AND public.fn_is_branch_scoped_row_allowed(p.company_id, p.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_allocations.payment_id
        AND p.company_id = payment_allocations.company_id
        AND public.fn_is_branch_scoped_row_allowed(p.company_id, p.branch_id)
    )
  )
);

CREATE POLICY payment_allocations_delete ON public.payment_allocations FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_allocations.payment_id
        AND p.company_id = payment_allocations.company_id
        AND public.fn_is_branch_scoped_row_allowed(p.company_id, p.branch_id)
    )
  )
);

-- ============================================================================
-- 4. Strict RLS Policies — Journal Entries & Journal Entry Lines
-- ============================================================================
DROP POLICY IF EXISTS journal_entries_select ON public.journal_entries;
DROP POLICY IF EXISTS journal_entries_insert ON public.journal_entries;
DROP POLICY IF EXISTS journal_entries_update ON public.journal_entries;

CREATE POLICY journal_entries_select ON public.journal_entries FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY journal_entries_insert ON public.journal_entries FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY journal_entries_update ON public.journal_entries FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS jel_select ON public.journal_entry_lines;
DROP POLICY IF EXISTS jel_insert ON public.journal_entry_lines;

CREATE POLICY jel_select ON public.journal_entry_lines FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
      OR (
        branch_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.journal_entries je
          WHERE je.id = journal_entry_lines.journal_entry_id
            AND je.company_id = journal_entry_lines.company_id
            AND public.fn_is_branch_scoped_row_allowed(je.company_id, je.branch_id)
        )
      )
    )
  )
);

CREATE POLICY jel_insert ON public.journal_entry_lines FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR (
        branch_id IS NOT NULL
        AND public.is_valid_branch(company_id, branch_id)
      )
      OR (
        branch_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.journal_entries je
          WHERE je.id = journal_entry_lines.journal_entry_id
            AND je.company_id = journal_entry_lines.company_id
            AND public.fn_is_branch_scoped_row_allowed(je.company_id, je.branch_id)
        )
      )
    )
  )
);

-- ============================================================================
-- 5. Strict RLS Policies — Parties, Opening Balances, Cashboxes, Exchange, Expenses
-- ============================================================================
DROP POLICY IF EXISTS parties_select ON public.parties;
DROP POLICY IF EXISTS parties_insert ON public.parties;
DROP POLICY IF EXISTS parties_update ON public.parties;
DROP POLICY IF EXISTS parties_delete ON public.parties;

CREATE POLICY parties_select ON public.parties FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY parties_insert ON public.parties FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY parties_update ON public.parties FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY parties_delete ON public.parties FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

-- Drop duplicate loose debt_* policies on party_opening_balances
DROP POLICY IF EXISTS debt_delete_opening_balances ON public.party_opening_balances;
DROP POLICY IF EXISTS debt_insert_opening_balances ON public.party_opening_balances;
DROP POLICY IF EXISTS debt_update_opening_balances ON public.party_opening_balances;
DROP POLICY IF EXISTS party_opening_balances_select ON public.party_opening_balances;
DROP POLICY IF EXISTS party_opening_balances_insert ON public.party_opening_balances;
DROP POLICY IF EXISTS party_opening_balances_update ON public.party_opening_balances;
DROP POLICY IF EXISTS party_opening_balances_delete ON public.party_opening_balances;

CREATE POLICY party_opening_balances_select ON public.party_opening_balances FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY party_opening_balances_insert ON public.party_opening_balances FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY party_opening_balances_update ON public.party_opening_balances FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY party_opening_balances_delete ON public.party_opening_balances FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS cashboxes_select ON public.cashboxes;
DROP POLICY IF EXISTS cashboxes_insert ON public.cashboxes;
DROP POLICY IF EXISTS cashboxes_update ON public.cashboxes;

CREATE POLICY cashboxes_select ON public.cashboxes FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY cashboxes_insert ON public.cashboxes FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY cashboxes_update ON public.cashboxes FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.is_valid_branch(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS exchange_companies_select ON public.exchange_companies;
DROP POLICY IF EXISTS exchange_companies_insert ON public.exchange_companies;
DROP POLICY IF EXISTS exchange_companies_update ON public.exchange_companies;

CREATE POLICY exchange_companies_select ON public.exchange_companies FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY exchange_companies_insert ON public.exchange_companies FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY exchange_companies_update ON public.exchange_companies FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND public.is_valid_branch(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS expenses_select ON public.expenses;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_update ON public.expenses;
DROP POLICY IF EXISTS expenses_delete ON public.expenses;

CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant', 'cashier')
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin')
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

-- ============================================================================
-- 6. Strict RLS Policies — Quotations, Reconciliations, Fixed Assets
-- ============================================================================
DROP POLICY IF EXISTS quotations_select ON public.quotations;
DROP POLICY IF EXISTS quotations_insert ON public.quotations;
DROP POLICY IF EXISTS quotations_update ON public.quotations;
DROP POLICY IF EXISTS quotations_delete ON public.quotations;

CREATE POLICY quotations_select ON public.quotations FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY quotations_insert ON public.quotations FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY quotations_update ON public.quotations FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY quotations_delete ON public.quotations FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS quotation_items_select ON public.quotation_items;
DROP POLICY IF EXISTS quotation_items_insert ON public.quotation_items;
DROP POLICY IF EXISTS quotation_items_update ON public.quotation_items;
DROP POLICY IF EXISTS quotation_items_delete ON public.quotation_items;

CREATE POLICY quotation_items_select ON public.quotation_items FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = quotation_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(q.company_id, q.branch_id)
    )
  )
);

CREATE POLICY quotation_items_insert ON public.quotation_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = quotation_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(q.company_id, q.branch_id)
    )
  )
);

CREATE POLICY quotation_items_update ON public.quotation_items FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = quotation_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(q.company_id, q.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = quotation_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(q.company_id, q.branch_id)
    )
  )
);

CREATE POLICY quotation_items_delete ON public.quotation_items FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = quotation_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(q.company_id, q.branch_id)
    )
  )
);

DROP POLICY IF EXISTS "Nobody can delete reconciliations directly" ON public.daily_reconciliations;
DROP POLICY IF EXISTS "Users can insert reconciliations in their company" ON public.daily_reconciliations;
DROP POLICY IF EXISTS "Users can update reconciliations in their company" ON public.daily_reconciliations;
DROP POLICY IF EXISTS "Users can view reconciliations in their company" ON public.daily_reconciliations;
DROP POLICY IF EXISTS daily_reconciliations_select ON public.daily_reconciliations;
DROP POLICY IF EXISTS daily_reconciliations_insert ON public.daily_reconciliations;
DROP POLICY IF EXISTS daily_reconciliations_update ON public.daily_reconciliations;
DROP POLICY IF EXISTS daily_reconciliations_delete ON public.daily_reconciliations;

CREATE POLICY daily_reconciliations_select ON public.daily_reconciliations FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
);

CREATE POLICY daily_reconciliations_insert ON public.daily_reconciliations FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY daily_reconciliations_update ON public.daily_reconciliations FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY daily_reconciliations_delete ON public.daily_reconciliations FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS fixed_assets_tenant_modify ON public.fixed_assets;
CREATE POLICY fixed_assets_tenant_modify ON public.fixed_assets FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

-- ============================================================================
-- 7. Strict RLS Policies — Inventory Operations (Movements, Audits, Transfers)
--    NOTE: products, warehouses (SELECT), product_stock (SELECT), branches (SELECT)
--          REMAIN company-wide so every branch sees ALL products & their locations!
-- ============================================================================
DROP POLICY IF EXISTS product_stock_select ON public.product_stock;
DROP POLICY IF EXISTS product_stock_insert ON public.product_stock;
DROP POLICY IF EXISTS product_stock_update ON public.product_stock;
DROP POLICY IF EXISTS product_stock_delete ON public.product_stock;

-- EXEMPT: Every branch in the company can SEE products & stock locations everywhere
CREATE POLICY product_stock_select ON public.product_stock FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR company_id IN (SELECT public.get_auth_companies())
);

-- WRITES to product_stock remain strictly scoped to user's branch warehouses
CREATE POLICY product_stock_insert ON public.product_stock FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = product_stock.warehouse_id
        AND w.company_id = product_stock.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY product_stock_update ON public.product_stock FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = product_stock.warehouse_id
        AND w.company_id = product_stock.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = product_stock.warehouse_id
        AND w.company_id = product_stock.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY product_stock_delete ON public.product_stock FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = product_stock.warehouse_id
        AND w.company_id = product_stock.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

-- Warehouses: SELECT stays company-wide (locations!), writes strictly own branch
DROP POLICY IF EXISTS warehouses_select ON public.warehouses;
DROP POLICY IF EXISTS warehouses_insert ON public.warehouses;
DROP POLICY IF EXISTS warehouses_update ON public.warehouses;

CREATE POLICY warehouses_select ON public.warehouses FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR company_id IN (SELECT public.get_auth_companies())
);

CREATE POLICY warehouses_insert ON public.warehouses FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.is_valid_branch(company_id, branch_id)
  )
);

CREATE POLICY warehouses_update ON public.warehouses FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND public.is_valid_branch(company_id, branch_id)
  )
);

-- Inventory transactions (operational movement log): strictly branch-scoped
DROP POLICY IF EXISTS inv_tx_select ON public.inventory_transactions;
DROP POLICY IF EXISTS inv_tx_insert ON public.inventory_transactions;

CREATE POLICY inv_tx_select ON public.inventory_transactions FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = inventory_transactions.warehouse_id
        AND w.company_id = inventory_transactions.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY inv_tx_insert ON public.inventory_transactions FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = inventory_transactions.warehouse_id
        AND w.company_id = inventory_transactions.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

-- Audit sessions, audit items, session drafts: strictly warehouse's branch
DROP POLICY IF EXISTS audit_sessions_select ON public.audit_sessions;
DROP POLICY IF EXISTS audit_sessions_insert ON public.audit_sessions;
DROP POLICY IF EXISTS audit_sessions_update ON public.audit_sessions;
DROP POLICY IF EXISTS audit_sessions_delete ON public.audit_sessions;

CREATE POLICY audit_sessions_select ON public.audit_sessions FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = audit_sessions.warehouse_id
        AND w.company_id = audit_sessions.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY audit_sessions_insert ON public.audit_sessions FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = audit_sessions.warehouse_id
        AND w.company_id = audit_sessions.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY audit_sessions_update ON public.audit_sessions FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = audit_sessions.warehouse_id
        AND w.company_id = audit_sessions.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = audit_sessions.warehouse_id
        AND w.company_id = audit_sessions.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY audit_sessions_delete ON public.audit_sessions FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.warehouses w
      WHERE w.id = audit_sessions.warehouse_id
        AND w.company_id = audit_sessions.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

DROP POLICY IF EXISTS audit_items_select ON public.audit_items;
DROP POLICY IF EXISTS audit_items_insert ON public.audit_items;
DROP POLICY IF EXISTS audit_items_update ON public.audit_items;
DROP POLICY IF EXISTS audit_items_delete ON public.audit_items;

CREATE POLICY audit_items_select ON public.audit_items FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.id = audit_items.session_id
        AND s.company_id = audit_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY audit_items_insert ON public.audit_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.id = audit_items.session_id
        AND s.company_id = audit_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY audit_items_update ON public.audit_items FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.id = audit_items.session_id
        AND s.company_id = audit_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.id = audit_items.session_id
        AND s.company_id = audit_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

CREATE POLICY audit_items_delete ON public.audit_items FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.user_is_admin_or_manager(company_id)
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.id = audit_items.session_id
        AND s.company_id = audit_items.company_id
        AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
    )
  )
);

DROP POLICY IF EXISTS inventory_session_drafts_select ON public.inventory_session_drafts;
DROP POLICY IF EXISTS inventory_session_drafts_insert ON public.inventory_session_drafts;
DROP POLICY IF EXISTS inventory_session_drafts_update ON public.inventory_session_drafts;
DROP POLICY IF EXISTS inventory_session_drafts_delete ON public.inventory_session_drafts;

CREATE POLICY inventory_session_drafts_select ON public.inventory_session_drafts FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.id = inventory_session_drafts.session_id
      AND s.company_id IN (SELECT public.get_auth_companies())
      AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
  )
);

CREATE POLICY inventory_session_drafts_insert ON public.inventory_session_drafts FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.id = inventory_session_drafts.session_id
      AND s.company_id IN (SELECT public.get_auth_companies())
      AND public.user_is_admin_or_manager(s.company_id)
      AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
  )
);

CREATE POLICY inventory_session_drafts_update ON public.inventory_session_drafts FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.id = inventory_session_drafts.session_id
      AND s.company_id IN (SELECT public.get_auth_companies())
      AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.id = inventory_session_drafts.session_id
      AND s.company_id IN (SELECT public.get_auth_companies())
      AND public.user_is_admin_or_manager(s.company_id)
      AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
  )
);

CREATE POLICY inventory_session_drafts_delete ON public.inventory_session_drafts FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.audit_sessions s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.id = inventory_session_drafts.session_id
      AND s.company_id IN (SELECT public.get_auth_companies())
      AND public.user_is_admin_or_manager(s.company_id)
      AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
  )
);

-- Stock transfers & items: visible/editable ONLY to involved branches (from or to)
DROP POLICY IF EXISTS stock_transfers_select ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_insert ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_update ON public.stock_transfers;

CREATE POLICY stock_transfers_select ON public.stock_transfers FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id IN (stock_transfers.from_warehouse_id, stock_transfers.to_warehouse_id)
          AND w.company_id = stock_transfers.company_id
          AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
      )
    )
  )
);

CREATE POLICY stock_transfers_insert ON public.stock_transfers FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id IN (stock_transfers.from_warehouse_id, stock_transfers.to_warehouse_id)
          AND w.company_id = stock_transfers.company_id
          AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
      )
    )
  )
);

CREATE POLICY stock_transfers_update ON public.stock_transfers FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id IN (stock_transfers.from_warehouse_id, stock_transfers.to_warehouse_id)
          AND w.company_id = stock_transfers.company_id
          AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
      )
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.get_user_role(company_id) IN ('owner', 'admin', 'manager', 'accountant')
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id IN (stock_transfers.from_warehouse_id, stock_transfers.to_warehouse_id)
          AND w.company_id = stock_transfers.company_id
          AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
      )
    )
  )
);

DROP POLICY IF EXISTS sti_select ON public.stock_transfer_items;
DROP POLICY IF EXISTS sti_insert ON public.stock_transfer_items;
DROP POLICY IF EXISTS sti_update ON public.stock_transfer_items;
DROP POLICY IF EXISTS sti_delete ON public.stock_transfer_items;

CREATE POLICY sti_select ON public.stock_transfer_items FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.company_id = stock_transfer_items.company_id
        AND (
          public.fn_has_all_branch_access(st.company_id)
          OR EXISTS (
            SELECT 1 FROM public.warehouses w
            WHERE w.id IN (st.from_warehouse_id, st.to_warehouse_id)
              AND w.company_id = st.company_id
              AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
          )
        )
    )
  )
);

CREATE POLICY sti_insert ON public.stock_transfer_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.company_id = stock_transfer_items.company_id
        AND (
          public.fn_has_all_branch_access(st.company_id)
          OR EXISTS (
            SELECT 1 FROM public.warehouses w
            WHERE w.id IN (st.from_warehouse_id, st.to_warehouse_id)
              AND w.company_id = st.company_id
              AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
          )
        )
    )
  )
);

CREATE POLICY sti_update ON public.stock_transfer_items FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.company_id = stock_transfer_items.company_id
        AND (
          public.fn_has_all_branch_access(st.company_id)
          OR EXISTS (
            SELECT 1 FROM public.warehouses w
            WHERE w.id IN (st.from_warehouse_id, st.to_warehouse_id)
              AND w.company_id = st.company_id
              AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
          )
        )
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.company_id = stock_transfer_items.company_id
        AND (
          public.fn_has_all_branch_access(st.company_id)
          OR EXISTS (
            SELECT 1 FROM public.warehouses w
            WHERE w.id IN (st.from_warehouse_id, st.to_warehouse_id)
              AND w.company_id = st.company_id
              AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
          )
        )
    )
  )
);

CREATE POLICY sti_delete ON public.stock_transfer_items FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_has_all_branch_access(company_id)
  )
);

-- Stock transfer requests: replace user_is_admin_or_manager with fn_has_all_branch_access
DROP POLICY IF EXISTS str_select ON public.stock_transfer_requests;
DROP POLICY IF EXISTS str_insert ON public.stock_transfer_requests;
DROP POLICY IF EXISTS str_update ON public.stock_transfer_requests;

CREATE POLICY str_select ON public.stock_transfer_requests FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
      OR source_branch_id IN (SELECT public.get_auth_branches(company_id))
    )
  )
);

CREATE POLICY str_insert ON public.stock_transfer_requests FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
    )
  )
);

CREATE POLICY str_update ON public.stock_transfer_requests FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
      OR source_branch_id IN (SELECT public.get_auth_branches(company_id))
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR requester_branch_id IN (SELECT public.get_auth_branches(company_id))
      OR source_branch_id IN (SELECT public.get_auth_branches(company_id))
    )
  )
);

-- ============================================================================
-- 8. Strict RLS Policies — Debts, CRM, Procurement, Audit Logs, Chat
-- ============================================================================
DROP POLICY IF EXISTS debt_select_followup ON public.debt_followup_config;
DROP POLICY IF EXISTS debt_manage_followup ON public.debt_followup_config;

CREATE POLICY debt_select_followup ON public.debt_followup_config FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
);

CREATE POLICY debt_manage_followup ON public.debt_followup_config FOR ALL TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_is_admin_or_manager(company_id)
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
)
WITH CHECK (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_is_admin_or_manager(company_id)
  AND public.is_valid_branch(company_id, branch_id)
);

DROP POLICY IF EXISTS debt_select_msg_log ON public.debt_message_log;
DROP POLICY IF EXISTS debt_insert_msg_log ON public.debt_message_log;
DROP POLICY IF EXISTS debt_update_msg_log ON public.debt_message_log;
DROP POLICY IF EXISTS debt_delete_msg_log ON public.debt_message_log;

CREATE POLICY debt_select_msg_log ON public.debt_message_log FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
);

CREATE POLICY debt_insert_msg_log ON public.debt_message_log FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT public.get_auth_companies())
  AND public.is_valid_branch(company_id, branch_id)
);

CREATE POLICY debt_update_msg_log ON public.debt_message_log FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
)
WITH CHECK (
  company_id IN (SELECT public.get_auth_companies())
  AND public.is_valid_branch(company_id, branch_id)
);

CREATE POLICY debt_delete_msg_log ON public.debt_message_log FOR DELETE TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_is_admin_or_manager(company_id)
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
);

DROP POLICY IF EXISTS debt_select_promises ON public.debt_payment_promises;
DROP POLICY IF EXISTS debt_insert_promises ON public.debt_payment_promises;
DROP POLICY IF EXISTS debt_update_promises ON public.debt_payment_promises;
DROP POLICY IF EXISTS debt_delete_promises ON public.debt_payment_promises;

CREATE POLICY debt_select_promises ON public.debt_payment_promises FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
);

CREATE POLICY debt_insert_promises ON public.debt_payment_promises FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_can_manage_debts(company_id)
  AND public.is_valid_branch(company_id, branch_id)
);

CREATE POLICY debt_update_promises ON public.debt_payment_promises FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
)
WITH CHECK (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_can_manage_debts(company_id)
  AND public.is_valid_branch(company_id, branch_id)
);

CREATE POLICY debt_delete_promises ON public.debt_payment_promises FOR DELETE TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_is_admin_or_manager(company_id)
  AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
);

DROP POLICY IF EXISTS debt_select_assignments ON public.debt_collector_assignments;
DROP POLICY IF EXISTS debt_manage_assignments ON public.debt_collector_assignments;

CREATE POLICY debt_select_assignments ON public.debt_collector_assignments FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND (
    public.fn_has_all_branch_access(company_id)
    OR EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = debt_collector_assignments.party_id
        AND pt.company_id = debt_collector_assignments.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

CREATE POLICY debt_manage_assignments ON public.debt_collector_assignments FOR ALL TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_can_manage_debts(company_id)
  AND (
    public.fn_has_all_branch_access(company_id)
    OR EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = debt_collector_assignments.party_id
        AND pt.company_id = debt_collector_assignments.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
)
WITH CHECK (
  company_id IN (SELECT public.get_auth_companies())
  AND public.user_can_manage_debts(company_id)
  AND (
    public.fn_has_all_branch_access(company_id)
    OR EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = debt_collector_assignments.party_id
        AND pt.company_id = debt_collector_assignments.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

DROP POLICY IF EXISTS customer_activities_select ON public.customer_activities;
DROP POLICY IF EXISTS customer_activities_insert ON public.customer_activities;
DROP POLICY IF EXISTS customer_activities_update ON public.customer_activities;
DROP POLICY IF EXISTS customer_activities_delete ON public.customer_activities;

CREATE POLICY customer_activities_select ON public.customer_activities FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.parties pt
        WHERE pt.id = customer_activities.customer_id
          AND pt.company_id = customer_activities.company_id
          AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
      )
    )
  )
);

CREATE POLICY customer_activities_insert ON public.customer_activities FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_activities.customer_id
        AND pt.company_id = customer_activities.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

CREATE POLICY customer_activities_update ON public.customer_activities FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_activities.customer_id
        AND pt.company_id = customer_activities.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_activities.customer_id
        AND pt.company_id = customer_activities.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

CREATE POLICY customer_activities_delete ON public.customer_activities FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_activities.customer_id
        AND pt.company_id = customer_activities.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

DROP POLICY IF EXISTS customer_notes_select ON public.customer_notes;
DROP POLICY IF EXISTS customer_notes_insert ON public.customer_notes;
DROP POLICY IF EXISTS customer_notes_update ON public.customer_notes;
DROP POLICY IF EXISTS customer_notes_delete ON public.customer_notes;

CREATE POLICY customer_notes_select ON public.customer_notes FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.parties pt
        WHERE pt.id = customer_notes.customer_id
          AND pt.company_id = customer_notes.company_id
          AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
      )
    )
  )
);

CREATE POLICY customer_notes_insert ON public.customer_notes FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_notes.customer_id
        AND pt.company_id = customer_notes.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

CREATE POLICY customer_notes_update ON public.customer_notes FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_notes.customer_id
        AND pt.company_id = customer_notes.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_notes.customer_id
        AND pt.company_id = customer_notes.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

CREATE POLICY customer_notes_delete ON public.customer_notes FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND EXISTS (
      SELECT 1 FROM public.parties pt
      WHERE pt.id = customer_notes.customer_id
        AND pt.company_id = customer_notes.company_id
        AND public.fn_is_branch_scoped_row_allowed(pt.company_id, pt.branch_id)
    )
  )
);

-- Procurement requests & goods receipts: branch / warehouse scoped
DROP POLICY IF EXISTS prc_purchase_requests_isolation_policy ON public.prc_purchase_requests;
CREATE POLICY prc_purchase_requests_isolation_policy ON public.prc_purchase_requests FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND public.is_valid_branch(company_id, branch_id)
  )
);

DROP POLICY IF EXISTS prc_goods_receipts_isolation_policy ON public.prc_goods_receipts;
CREATE POLICY prc_goods_receipts_isolation_policy ON public.prc_goods_receipts FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id = prc_goods_receipts.warehouse_id
          AND w.company_id = prc_goods_receipts.company_id
          AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
      )
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id = prc_goods_receipts.warehouse_id
          AND w.company_id = prc_goods_receipts.company_id
          AND public.fn_is_branch_scoped_row_allowed(w.company_id, w.branch_id)
      )
    )
  )
);

-- Audit logs: branch-scoped users only see their own actions; owners/admins see all
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id IN (SELECT public.get_auth_companies())
    AND (
      public.fn_has_all_branch_access(company_id)
      OR user_id = (SELECT auth.uid())
    )
  )
);

-- Chat channels: if channel belongs to a branch, isolate strictly to that branch
DROP POLICY IF EXISTS chat_channels_select ON public.chat_channels;
CREATE POLICY chat_channels_select ON public.chat_channels FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.get_auth_companies())
  AND (
    branch_id IS NULL
    OR public.fn_is_branch_scoped_row_allowed(company_id, branch_id)
  )
  AND (
    created_by = (SELECT auth.uid())
    OR is_private = false
    OR public.fn_can_access_chat_channel(id, (SELECT auth.uid()))
  )
);
