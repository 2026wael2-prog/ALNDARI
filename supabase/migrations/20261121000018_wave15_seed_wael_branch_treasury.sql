-- Wave 15: Seed Wael Branch (فرع وائل النظاري) Cashboxes & Exchange Companies
-- Root cause: Wael branch had 0 rows in public.cashboxes and 0 rows in public.exchange_companies,
-- causing usePaymentAccounts() to fall back to Ghamdan's 101*/103* accounts.
-- All 9 accounts below are proven by journal_entries.branch_id to belong exclusively to فرع وائل النظاري.

DO $$
DECLARE
  v_company_id CONSTANT uuid := '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47';
  v_wael_branch_id CONSTANT uuid := 'd8771318-20f8-4260-9ac6-e40c3378a5e1';
BEGIN
  -- Only run when target company & branch exist (safe across environments)
  IF NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = v_wael_branch_id AND company_id = v_company_id
  ) THEN
    RETURN;
  END IF;

  -- 1) Seed Wael branch cashboxes (MZ-135 SAR, MZ-132 YER, MZ-140 OMR, MZ-134 SAR)
  INSERT INTO public.cashboxes (company_id, branch_id, name, account_id, currency_code, is_active, opening_balance)
  SELECT v_company_id, v_wael_branch_id, src.name, a.id, src.currency_code, true, 0
  FROM (
    VALUES
      ('MZ-135', 'صندوق سعودي', 'SAR'),
      ('MZ-132', 'صندوق ريال يمني', 'YER'),
      ('MZ-140', 'صندوق عماني', 'OMR'),
      ('MZ-134', 'صندوق المستودع الرئيسي', 'SAR')
  ) AS src(code, name, currency_code)
  JOIN public.accounts a
    ON a.company_id = v_company_id
   AND a.code = src.code
   AND a.deleted_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.cashboxes c
    WHERE c.company_id = v_company_id
      AND c.account_id = a.id
  );

  -- 2) Seed Wael branch exchange companies (MZ-141 SAR, MZ-139 YER, MZ-143 SAR, MZ-144 YER, MZ-145 OMR)
  INSERT INTO public.exchange_companies (company_id, branch_id, name, account_id, currency_code, is_active, opening_balance)
  SELECT v_company_id, v_wael_branch_id, src.name, a.id, src.currency_code, true, 0
  FROM (
    VALUES
      ('MZ-141', 'بن علي للصرافة سعودي', 'SAR'),
      ('MZ-139', 'صرافه بن علي يمني', 'YER'),
      ('MZ-143', 'صرافة البسيري سعودي', 'SAR'),
      ('MZ-144', 'صرافة البسيري يمني', 'YER'),
      ('MZ-145', 'صرافة البسيري عماني', 'OMR')
  ) AS src(code, name, currency_code)
  JOIN public.accounts a
    ON a.company_id = v_company_id
   AND a.code = src.code
   AND a.deleted_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.exchange_companies ec
    WHERE ec.company_id = v_company_id
      AND ec.account_id = a.id
  );
END $$;
