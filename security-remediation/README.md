# Security remediation — StockFlow

These SQL templates address the two server-side findings from the critical
audit (see PR #1). They are **review-and-adapt templates**, not drop-in
migrations: this repo is a static frontend, so the live schema and RLS
policies could not be inspected directly. Read each file, align the column
names with your actual schema, and **apply in a Supabase branch / staging
project first**, then run the app's own test harness (`stockflow-test-v3.html`,
which already contains RLS tests) before promoting to production.

## Why these are needed

StockFlow's frontend talks to Supabase directly with the public anon key. That
is fine *by design* — but it means **the database (RLS + functions) is the only
real security boundary.** The browser, including `window.sb`, is fully
controllable by any authenticated user via the dev console. Two patterns in the
current frontend are only safe if the database enforces them; if the RLS
policies are the "common" permissive kind, both are exploitable.

| ID | Finding | Frontend evidence | Fixed by |
|----|---------|-------------------|----------|
| C1 | Reps compute and write financial/inventory state (`sales.total_value`, `rep_holdings.quantity`, line prices) directly. RLS can gate *which* rows, not the *values*, so a rep can fabricate stock/debt/sales from the console. | `rep-dashboard.html:1607-1626` | `02-server-side-sale-rpc.sql` |
| C2 | Privilege escalation: `requireAuth()` recovery trusts user-writable `user_metadata.role`/`tenant_id`; reps update their own `profiles` row. If the `profiles` write policy only checks `auth.uid() = id`, a user can self-assign `role='owner'` / a victim `tenant_id`. | `supabase-client.js:71-98`, `rep-dashboard.html:2303` | `01-profiles-rls-hardening.sql` |

## How to verify exploitability (before/after)

In the browser console of a logged-in **rep** on the production site:

```js
// C2 probe — should FAIL after applying 01-...sql
await sb.from('profiles').update({ role: 'owner' }).eq('id', (await sb.auth.getUser()).data.user.id)

// C1 probe — should FAIL after applying 02-...sql (direct write revoked)
await sb.from('rep_holdings').update({ quantity: 99999 }).eq('rep_id', (await sb.auth.getUser()).data.user.id)
```

If either succeeds today, the finding is confirmed-critical.

## Apply order

1. `01-profiles-rls-hardening.sql` — stops privilege escalation (low risk; the
   app UI only ever changes `full_name`/`phone`, so legitimate flows are
   unaffected).
2. `02-server-side-sale-rpc.sql` — moves sale recording server-side. This one
   **requires a matching frontend change**: replace the multi-statement
   `doSell()` writes in `rep-dashboard.html` with a single
   `sb.rpc('record_sale', {...})` call. Do them together. Repeat the same
   pattern for payments, stock requests, returns, and the edit-sale path.

## Note on the `requireAuth()` recovery path

Once `01-...sql` revokes client INSERT on `profiles`, the metadata-driven
"recovery" upsert in `supabase-client.js` will (correctly) fail. Profiles
should only ever be created by the `handle_new_user()` trigger or an
admin/`SECURITY DEFINER` provisioning function — never from the client. Plan to
delete that recovery block rather than rely on it.
