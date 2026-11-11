# ADR-024: Bond journal posting order, account-counterparty bonds, and Edge CORS

## Status

Accepted (2026-11-03)

## Context

Two production-blocking symptoms were captured in the browser console while
using `/#/debts`:

1. `POST /rest/v1/rpc/create_financial_bond` → `400`, message
   `23514 Cannot add lines to a posted journal entry (Entry: …). Use reversal.`
   Every receipt/payment bond created from the debt follow-up screen («تحصيل
   الآن») and the bonds page rolled back on the server.
2. `POST /functions/v1/ai-proxy` → preflight rejected:
   `The 'Access-Control-Allow-Origin' header has a value
   'https://zzthamxjxnxzzpswllid.supabase.co' that is not equal to the supplied
   origin` (`http://localhost:8081`). AI reminder phrasing silently fell back to
   the template generator on every local/LAN dev origin.

Root causes:

- **`create_financial_bond` still had the "posted-first" bug** in its
  account-counterparty / transfer branch: it inserted `journal_entries` with
  `status = 'posted'` **before** inserting `journal_entry_lines`, which the live
  guard `trg_journal_entry_lines_immutability`
  (`prevent_posted_journal_line_modification`) rejects with SQLSTATE `23514`.
  Same defect class already fixed for `commit_payment`,
  `fn_auto_post_payment_journal`, `post_manual_journal` and the return
  procedures (ADR-005/006/007) — the bond RPC was the last hold-out.
- That branch also **credited the cash account for receipts** (Dr counterparty /
  Cr cash instead of Dr cash / Cr counterparty) — a sign inversion in the GL.
- `create_financial_bond` never stored `payments.counterparty_account_id`
  (added in `20260819000012` for `commit_payment` only), so even the corrected
  `fn_auto_post_payment_journal` returned early for those bonds and the broken
  manual branch was the only path left.
- `p_bond_type = 'payment'` (used by `purchases/api.ts:257`) violates
  `payments_type_check`, which only accepts
  `receipt | disbursement | transfer`.
- Every Edge Function hard-coded its own `ALLOWED_ORIGINS` **and fell back to
  `ALLOWED_ORIGINS[0]`** for unlisted origins. That first entry is the *old*
  Supabase project URL, so any dev origin (`http://localhost:8081`) received an
  origin the browser refuses.

## Decision

### 1. Migration `20261103000008_fix_bond_journal_posting_order.sql`

- Re-creates `fn_auto_post_payment_journal()` with the deterministic
  `draft → lines → posted` sequence (draft JE → both lines → `UPDATE status`),
  for party bonds *and* transfer/general-account bonds.
- `create_financial_bond(...)` keeps its 15-argument signature and now:
  1. stores `counterparty_account_id` when the counterparty is an account or a
     transfer target, so the trigger posts the entry itself (single source of
     truth, no duplicate JEs);
  2. normalises the stored `payments.type` to the constrained vocabulary
     (`payment` → `disbursement`);
  3. keeps a **defensive fallback**: if no journal entry was produced (stale
     trigger version), it creates the entry `draft → lines → posted` with the
     correct accounting direction —
     `receipt → Dr cash / Cr counterparty`,
     `payment|disbursement → Dr counterparty / Cr cash`,
     `transfer → Dr target / Cr cash`.
- Privileges are re-asserted (`authenticated` only, `anon`/`PUBLIC` revoked).

### 2. Ledger rule (unchanged, restated)

Every bond line stores **base currency** in `debit_amount`/`credit_amount` and
the original amount in `foreign_amount` + `exchange_rate`. No UI or reporting
layer may sum `payments.amount` across currencies without
`fn_to_base_amount`.

### 3. Edge CORS — `supabase/functions/_shared/cors.ts`

New shared resolver wired into `ai-proxy`:

- explicit production allow-list (app domains, both Supabase project origins,
  optional `SITE_URL`);
- **loopback origins are always allowed** (`http(s)://localhost|127.0.0.1|[::1]:<port>`)
  because a public site cannot forge `Origin: http://localhost:*`;
- unknown origins receive `SITE_URL` (never `*`, never a foreign project URL).

## Consequences

- Bonds post exactly one balanced entry; the `23514` rollback disappears.
- Receipt bonds against a general account now debit cash (previously inverted).
- Supplier payments routed through `p_bond_type='payment'` no longer violate
  `payments_type_check`.
- AI features work on any local dev port without weakening the origin policy.
- `/rest/v1/rpc/create_financial_bond` remains `authenticated`-only; the
  function still derives the actor from `auth.uid()` and never trusts
  `p_user_id`.

## Verification

```bash
# SQL (single transaction, rolled back)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
     -f supabase/tests/test_bond_journal_posting_order.sql

# Which trigger version is deployed? (draft → fixed, posted → stale)
SELECT prosrc ILIKE '%''draft''%' AS has_draft_first
FROM pg_proc WHERE proname = 'fn_auto_post_payment_journal';

# Functions
supabase functions deploy ai-proxy
```

The UI gates stay as before: `npm run type-check`, `npx vitest run
src/features/debts`, `npm run check:lint-total`.

## Follow-up 1 — CORS rollout to the remaining Edge Functions

The same `ALLOWED_ORIGINS[0]` fallback (a foreign project URL) existed in eight
more functions. All of them now import `_shared/cors.ts` and delegate, keeping
their own method/header sets where they differ:

| Function | `verify_jwt` (unchanged) | deploy flag |
|---|---|---|
| `ai-part-lookup` | false | `--no-verify-jwt` |
| `ai-product-image` | false | `--no-verify-jwt` |
| `part-search` | false | `--no-verify-jwt` |
| `vin-decode` | false | `--no-verify-jwt` |
| `vin-parts` | false | `--no-verify-jwt` |
| `fetch-exchange-rates-aden` | true | (default) |
| `get-products` | true | (default) |
| `zatca-integration` | true | (default) |

`verify_jwt` was read from the Management API **before** deploying and the
matching CLI flag was used, so the rollout could not silently turn a public
helper into an authenticated one (or the reverse). Per-function differences are
preserved: `get-products` also allows `GET` (and its narrower header list),
`ai-part-lookup` / `ai-product-image` also allow `x-supabase-api-version`.

Live check (unauthenticated preflight against a `verify_jwt=false` function):

```text
Origin: http://localhost:8081        → Access-Control-Allow-Origin: http://localhost:8081
Origin: https://evil.example.com     → Access-Control-Allow-Origin: https://orxlyiokccaodypindye.supabase.co
```

Note: for the three `verify_jwt=true` functions the gateway answers the
preflight itself, so `curl -X OPTIONS` returns 401 there — unchanged behaviour,
not a regression.

## Follow-up 2 — production migration ledger reconciliation

`schema_migrations` had stopped at `20260928000009` while later effects were
already live, so `scripts/apply-migrations.mjs` would have replayed an unknown
amount of history. The 15 unrecorded files were audited first (no table drops,
no truncates, no `DELETE` outside function bodies; every object created with
`CREATE OR REPLACE` / `IF NOT EXISTS`), then applied in version order:

- **14 applied and recorded** — including `20260929000001_sales_requisitions_server_entity`,
  which was genuinely missing: `get_next_requisition_number`,
  `commit_sales_requisition` and `set_sales_requisition_status` did not exist in
  production, so the sales-requisition server flow was dead. They are now
  present, `SECURITY DEFINER`, and executable by `authenticated`.
- `20260928000013_fix_stock_reference_type_mismatch` **aborted by design**: its
  guard raises `P0001` when neither `reference_type='audit'` nor `='transfer'`
  is found in `get_item_movements_with_balance`. The live function already
  branches on `stock_audit` / `stock_transfer`, i.e. the migration's
  post-condition was already satisfied by a newer definition. Post-condition was
  verified in the database and the version was then recorded, so future runs are
  reproducible instead of failing on a no-op forever.
- `20261103000008` was already recorded and was **not** replayed.

Because the replay ran in version order and nothing after `20261103000008`
touches bonds, the draft-first posting order survived; it was re-verified
afterwards together with a full re-run of
`supabase/tests/test_bond_journal_posting_order.sql` against production
(B1–B5 pass, zero residue).

