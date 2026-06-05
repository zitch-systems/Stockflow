# DB hardening — applied 2026-06-05

These migrations were applied to the **live StockFlow Supabase project**
(`fjmkenowgfxepwpyjcss`) via the Supabase MCP on 2026-06-05 and are tracked in
that project's migration history. They are committed here for version control
and review.

Unlike the `../01..04-*.sql` templates (review-and-adapt, written before the live
DB could be inspected), **these reflect the actual live schema** and were verified
with the Supabase security & performance advisors after applying.

> At review time all 29 tables were empty (pre-launch). The base-table RLS was
> already well-built (consistent `tenant_id = get_my_tenant_id()` + role gating);
> the real problems were in `SECURITY DEFINER` objects and signup logic that
> trusted client input and bypassed RLS.

## Critical findings fixed

| ID | Finding | Fix | File |
|----|---------|-----|------|
| C1 | Public `signUp({data:{role:'super_admin'}})` self-promoted to platform super-admin — both signup triggers trusted client `raw_user_meta_data.role`. | Clamp staff role to `manager`/`rep`; force `owner` only for self-serve; drop the duplicate handler. | `03` |
| C2 | `repair_staff_profile(email,tenant,role)` was anon-callable and set arbitrary role/tenant → tenant takeover. | Dropped (unused by the front-end). | `02` |
| C3 | 5 `SECURITY DEFINER` views granted to `anon`, no tenant filter → unauthenticated cross-tenant read (every tenant's revenue, customers' PII, payments). | `security_invoker=on` + revoke `anon`. | `02` |
| C4 | Atomic RPCs (`approve_stock_request/return`, `confirm/reject_payment`) had no caller authz, trusted the client `p_*_id` actor, accepted client prices, and were anon-callable → reps self-approve free stock / wipe debt; any manager could act cross-tenant. | Require `is_manager_or_above()` + tenant match; actor from `auth.uid()`; server-derived prices; revoke anon/PUBLIC EXECUTE. | `04`, `06` |

## High / medium

- **H2** mutable `search_path` on the authz helpers + 12 functions → pinned to `public`. (`01`)
- **H3** `add_table_to_realtime` was anon-callable definer DDL → locked to service role. (`02`, `06`)
- **M1** `customers` blanket `ALL` policy let reps delete/update customers and nullified the subscription gate → removed; reps restricted, `tenant_is_active` insert gate now effective. (`05`)
- **M2** legacy `auth.jwt()->>'tenant_id'` policies on `supplier_order_items` → removed. (`05`)
- **M3** `admin_notes` / `platform_config` had RLS on but no policy → super-admin policies added. (`05`)
- Duplicate triggers + dual signup handler removed; reps can no longer mark their own `stock_requests` `approved` via direct update. (`03`, `05`)

## Performance

- `07` — covering indexes for 23 unindexed foreign keys.
- `08` — dropped ~44 duplicate indexes (kept one per identical group; preserved the `rep_holdings` unique constraint index).
- **Not changed:** 131 `unused_index` (false positives on an empty DB — no traffic yet), `multiple_permissive_policies` (37) and `auth_rls_initplan` (15). The latter two are policy rewrites with zero benefit pre-launch and a real risk of an RLS regression — recommended as a deliberate, separately-reviewed follow-up.

## Verification

After applying, the **security advisor reports 0 ERROR** (was 5). Remaining WARNs are
expected: the RLS helper functions (`get_my_role`, `get_my_tenant_id`, `is_*`,
`tenant_is_active`) must stay executable by `anon`/`authenticated` for policies to
evaluate, and they only ever read the caller's own row via `auth.uid()`.

RPC signatures are unchanged, so **no front-end change is required** — the hardened
functions still accept the client's actor-id argument but ignore it in favour of
`auth.uid()`.

## Manual follow-up (not SQL)

- Enable **Leaked Password Protection** (HaveIBeenPwned) in Dashboard → Authentication.
- Confirm the new `customers` insert gate (`tenant_is_active`) matches intended
  subscription behaviour; if writes should not be blocked on expiry, restore a
  plain tenant-scoped insert policy.
