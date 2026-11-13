param(
  [string]$ProjectRef = $(if ($env:SUPABASE_PROJECT_REF) { $env:SUPABASE_PROJECT_REF } else { "dagfjncoullstrhbjssr" }),
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$OutDir = "audit-evidence"
)

if (-not $AccessToken) {
  Write-Error "Missing SUPABASE_ACCESS_TOKEN. Pass -AccessToken or set `$env:SUPABASE_ACCESS_TOKEN."
  exit 1
}

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Headers = @{
  "Authorization" = "Bearer $AccessToken"
  "Content-Type"  = "application/json"
}

function Invoke-SupaSql {
  param([string]$Sql, [int]$Timeout = 120)
  $body = @{ query = 'SET statement_timeout = 120000; ' + $Sql } | ConvertTo-Json -Compress
  $uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
  $res = Invoke-RestMethod -Uri $uri -Method POST -Headers $Headers -Body $body -TimeoutSec $Timeout
  return $res
}

function Invoke-SupaSqlExpectError {
  param([string]$Sql, [int]$Timeout = 120)
  $body = @{ query = 'SET statement_timeout = 120000; ' + $Sql } | ConvertTo-Json -Compress
  $uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
  try {
    $null = Invoke-RestMethod -Uri $uri -Method POST -Headers $Headers -Body $body -TimeoutSec $Timeout
    return "NO_ERROR"
  } catch {
    return $_.ErrorDetails.Message
  }
}

Write-Host "Running Al-Zahra ERP Production Gate Audit against $ProjectRef..." -ForegroundColor Cyan

# M1: Document inventory per year vs journal_entries
$m1Invoices = Invoke-SupaSql @'
SELECT EXTRACT(YEAR FROM issue_date)::int AS yr, type, status, COUNT(*)::int AS doc_count
FROM public.invoices WHERE deleted_at IS NULL
GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3;
'@
$m1Payments = Invoke-SupaSql @'
WITH je_refs AS (
  SELECT DISTINCT reference_id FROM public.journal_entries WHERE deleted_at IS NULL AND reference_id IS NOT NULL
)
SELECT EXTRACT(YEAR FROM p.payment_date)::int AS yr, p.type, p.status,
       COUNT(*)::int AS doc_count,
       COUNT(je.reference_id)::int AS with_je,
       (COUNT(*) - COUNT(je.reference_id))::int AS without_je
FROM public.payments p
LEFT JOIN je_refs je ON je.reference_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3;
'@
$m1JournalEntries = Invoke-SupaSql @'
SELECT EXTRACT(YEAR FROM entry_date)::int AS yr, COALESCE(reference_type, 'manual') AS ref_type, status, COUNT(*)::int AS je_count
FROM public.journal_entries WHERE deleted_at IS NULL
GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3;
'@

# M2: Unbalanced journal entries
$m2Unbalanced = Invoke-SupaSql @'
SELECT je.id, je.entry_number, je.entry_date, je.status, je.reference_type,
       COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
       COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
       ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) AS diff
FROM public.journal_entries je
LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id AND jel.deleted_at IS NULL
WHERE je.deleted_at IS NULL
GROUP BY je.id, je.entry_number, je.entry_date, je.status, je.reference_type
HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01;
'@

# M3: Posted invoices without journal entry
$m3MissingJe = Invoke-SupaSql @'
WITH je_refs AS (
  SELECT DISTINCT reference_id FROM public.journal_entries WHERE deleted_at IS NULL AND reference_id IS NOT NULL
)
SELECT i.id, i.invoice_number, i.issue_date, i.type, i.status, i.total_amount
FROM public.invoices i
LEFT JOIN je_refs je ON je.reference_id = i.id
WHERE i.deleted_at IS NULL
  AND i.status IN ('posted', 'confirmed', 'paid', 'partially_paid')
  AND je.reference_id IS NULL
ORDER BY i.issue_date DESC;
'@

# M4: Party-by-party reconciliation
$m4PartyMismatches = Invoke-SupaSql @'
WITH gl AS (
  SELECT jel.party_id, SUM(jel.debit_amount - jel.credit_amount) AS gl_net
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.deleted_at IS NULL AND je.deleted_at IS NULL AND je.status = 'posted' AND jel.party_id IS NOT NULL
  GROUP BY jel.party_id
),
ob AS (
  SELECT party_id, SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) AS ob_net
  FROM public.party_opening_balances GROUP BY party_id
),
inv_pay AS (
  SELECT party_id,
         SUM(CASE
           WHEN type = 'sale' AND payment_method <> 'cash' THEN public.fn_to_base_amount(currency_code, total_amount, COALESCE(exchange_rate, 1))
           WHEN type = 'sale_return' AND payment_method <> 'cash' THEN -public.fn_to_base_amount(currency_code, total_amount, COALESCE(exchange_rate, 1))
           WHEN type = 'purchase' AND payment_method <> 'cash' THEN -public.fn_to_base_amount(currency_code, total_amount, COALESCE(exchange_rate, 1))
           WHEN type = 'purchase_return' AND payment_method <> 'cash' THEN public.fn_to_base_amount(currency_code, total_amount, COALESCE(exchange_rate, 1))
           ELSE 0
         END) AS inv_net
  FROM public.invoices
  WHERE deleted_at IS NULL AND status NOT IN ('void', 'draft', 'cancelled') AND party_id IS NOT NULL
  GROUP BY party_id
),
pmt AS (
  SELECT party_id,
         SUM(CASE
           WHEN type = 'receipt' THEN -public.fn_to_base_amount(currency_code, amount, COALESCE(exchange_rate, 1))
           WHEN type IN ('disbursement', 'payment') THEN public.fn_to_base_amount(currency_code, amount, COALESCE(exchange_rate, 1))
           ELSE 0
         END) AS pmt_net
  FROM public.payments
  WHERE deleted_at IS NULL AND status NOT IN ('void', 'draft', 'cancelled') AND party_id IS NOT NULL
  GROUP BY party_id
)
SELECT p.id, p.name, p.type,
       ROUND(COALESCE(gl.gl_net, 0)::numeric, 2) AS gl_net,
       ROUND(COALESCE(ob.ob_net, 0)::numeric, 2) AS ob_net,
       ROUND(COALESCE(ip.inv_net, 0)::numeric, 2) AS inv_net,
       ROUND(COALESCE(pmt.pmt_net, 0)::numeric, 2) AS pmt_net,
       ROUND((COALESCE(gl.gl_net, 0) - (COALESCE(ob.ob_net, 0) + COALESCE(ip.inv_net, 0) + COALESCE(pmt.pmt_net, 0)))::numeric, 2) AS diff
FROM public.parties p
LEFT JOIN gl ON gl.party_id = p.id
LEFT JOIN ob ON ob.party_id = p.id
LEFT JOIN inv_pay ip ON ip.party_id = p.id
LEFT JOIN pmt ON pmt.party_id = p.id
WHERE p.deleted_at IS NULL
  AND ABS(COALESCE(gl.gl_net, 0) - (COALESCE(ob.ob_net, 0) + COALESCE(ip.inv_net, 0) + COALESCE(pmt.pmt_net, 0))) > 1.0
ORDER BY ABS(COALESCE(gl.gl_net, 0) - (COALESCE(ob.ob_net, 0) + COALESCE(ip.inv_net, 0) + COALESCE(pmt.pmt_net, 0))) DESC;
'@

# M5: Inverted exchange rate test
$m5RateTest = Invoke-SupaSqlExpectError @'
DO $$
DECLARE v_cid uuid; v_err text;
BEGIN
  SELECT id INTO v_cid FROM public.companies LIMIT 1;
  BEGIN
    INSERT INTO public.invoices (company_id, invoice_number, type, status, issue_date, currency_code, exchange_rate, total_amount)
    VALUES (v_cid, '__AUDIT_INV_RATE_410__', 'sale', 'draft', CURRENT_DATE, 'YER', 410, 1000);
    RAISE EXCEPTION 'RATE_410_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE EXCEPTION 'M5_RESULT|%', v_err;
  END;
END $$;
'@

# S1: Disabled triggers
$s1DisabledTriggers = Invoke-SupaSql @'
SELECT c.relname AS table_name, t.tgname AS trigger_name, t.tgenabled, p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled <> 'O'
ORDER BY c.relname, t.tgname;
'@

# S2: SECURITY DEFINER + mojibake
$s2SecDefSummary = Invoke-SupaSql @'
SELECT
  COUNT(*)::int AS total_secdef,
  (SELECT COUNT(*)::int FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace WHERE n2.nspname = 'public' AND (p2.prosrc ~ 'Ø' OR p2.prosrc ~ 'Ù' OR p2.prosrc ~ 'ï¿½')) AS mojibake_count,
  COUNT(*) FILTER (
    WHERE (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))
      AND NOT (p.prosrc ~* '(auth\.uid|fn_assert_company_access|verify_company_access|is_super_admin|user_can_access_branch|has_role)' OR p.proname LIKE '%supplier_portal%')
      AND p.proname NOT LIKE 'trg_%'
      AND p.prorettype <> 'trigger'::regtype
  )::int AS exposed_no_auth_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true;
'@

$s2MojibakeList = Invoke-SupaSql @'
SELECT p.proname, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ~ 'Ø|Ù|ï¿½'
ORDER BY p.proname;
'@

# S3: Two-account RLS isolation test
$s3RlsTest = Invoke-SupaSqlExpectError @'
DO $$
DECLARE
  v_uid uuid;
  a_inv int; a_pty int; a_acc int; a_pmt int;
  b_inv int; b_pty int; b_acc int; b_pmt int;
BEGIN
  SELECT user_id INTO v_uid FROM public.user_company_roles LIMIT 1;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO a_inv FROM public.invoices;
  SELECT COUNT(*) INTO a_pty FROM public.parties;
  SELECT COUNT(*) INTO a_acc FROM public.accounts;
  SELECT COUNT(*) INTO a_pmt FROM public.payments;

  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}', true);
  SELECT COUNT(*) INTO b_inv FROM public.invoices;
  SELECT COUNT(*) INTO b_pty FROM public.parties;
  SELECT COUNT(*) INTO b_acc FROM public.accounts;
  SELECT COUNT(*) INTO b_pmt FROM public.payments;

  RAISE EXCEPTION 'RLS_RESULT|A=(%,%,%,%)|B=(%,%,%,%)', a_inv, a_pty, a_acc, a_pmt, b_inv, b_pty, b_acc, b_pmt;
END $$;
'@

# R1 & R2 & P1
$backups = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/backups" -Method GET -Headers $Headers -TimeoutSec 20
$localMigrations = (Get-ChildItem "supabase\migrations\*.sql").Count
$r2AndConn = Invoke-SupaSql @'
SELECT
  (SELECT COUNT(*)::int FROM supabase_migrations.schema_migrations) AS applied_migrations,
  current_setting('max_connections')::int AS max_connections,
  (SELECT COUNT(*)::int FROM pg_stat_activity) AS current_connections;
'@

$p1Drift = Invoke-SupaSql @'
SELECT c.relname, c.reltuples::bigint AS pg_class_est, s.n_live_tup,
       CASE WHEN s.n_live_tup > 0 THEN ROUND((ABS(c.reltuples - s.n_live_tup) * 100.0 / s.n_live_tup)::numeric, 2) ELSE 0 END AS est_drift_pct
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('invoices', 'invoice_items', 'journal_entries', 'journal_entry_lines', 'parties', 'payments', 'expenses', 'products')
ORDER BY s.n_live_tup DESC;
'@

$p1Slow5 = Invoke-SupaSql @'
SELECT LEFT(query, 140) AS query_sample, calls,
       ROUND(mean_exec_time::numeric, 2) AS mean_ms,
       ROUND(total_exec_time::numeric, 2) AS total_ms
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 5;
'@

# Save detailed CSVs (handle empty arrays safely)
@($m4PartyMismatches) | Export-Csv -NoTypeInformation -Encoding UTF8 -Path (Join-Path $OutDir "m4_party_mismatches.csv")
@($m3MissingJe) | Export-Csv -NoTypeInformation -Encoding UTF8 -Path (Join-Path $OutDir "m3_invoices_without_je.csv")
@($s1DisabledTriggers) | Export-Csv -NoTypeInformation -Encoding UTF8 -Path (Join-Path $OutDir "s1_disabled_triggers.csv")

$report = @{
  timestamp = (Get-Date).ToString("o")
  project_ref = $ProjectRef
  gate = @{
    unbalanced_journal_entries = @($m2Unbalanced).Count
    posted_invoices_without_je = @($m3MissingJe).Count
    disabled_triggers = @($s1DisabledTriggers).Count
    exposed_secdef_without_auth = $s2SecDefSummary[0].exposed_no_auth_count
    party_balance_mismatches = @($m4PartyMismatches).Count
    corrupted_encoding_functions = @($s2MojibakeList).Count
    local_migrations = $localMigrations
    applied_migrations = $r2AndConn[0].applied_migrations
    walg_enabled = $backups.walg_enabled
    pitr_enabled = $backups.pitr_enabled
  }
  m1_invoices_by_year = @($m1Invoices)
  m1_payments_vs_je = @($m1Payments)
  m1_journal_entries_by_year = @($m1JournalEntries)
  m5_rate_test = $m5RateTest
  s2_mojibake_functions = @($s2MojibakeList)
  s3_rls_test = $s3RlsTest
  p1_connections = $r2AndConn[0]
  p1_reltuples_drift = @($p1Drift)
  p1_top5_slow_queries = @($p1Slow5)
}

$report | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 (Join-Path $OutDir "audit-gate-report.json")
Write-Host "Audit complete. Evidence written to $OutDir/" -ForegroundColor Green
$report.gate | Format-Table







