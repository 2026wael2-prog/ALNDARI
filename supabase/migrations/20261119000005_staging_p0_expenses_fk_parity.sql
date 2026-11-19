-- Phase 3.1 Batch 1 (Staging P0): Restore missing Production-parity FK fk_expenses_company_category
-- Target: Staging (adrgddwoksskzoryshgv)

ALTER TABLE public.expense_categories
  ADD CONSTRAINT uq_expense_categories_company_id UNIQUE (company_id, id);

ALTER TABLE public.expenses
  ADD CONSTRAINT fk_expenses_company_category
  FOREIGN KEY (company_id, category_id)
  REFERENCES public.expense_categories(company_id, id)
  ON DELETE RESTRICT;
