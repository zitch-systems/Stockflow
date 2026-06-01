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

## Full scope — C1 is systemic, not just `doSell()`

`record_sale` in `02-...sql` is the **exemplar**. The same "browser mutates
financial/inventory state directly" pattern runs through every dashboard, so
the same treatment (atomic `SECURITY DEFINER` RPC + revoked direct writes) is
needed for each of these. Audited write paths:

| Action | Current client code | Needed RPC |
|--------|--------------------|------------|
| Record sale | `rep-dashboard.html:1607-1626` | `record_sale` (provided) |
| **Edit sale** | `rep-dashboard.html:1754-1773` | `edit_sale` |
| **Cancel sale** | `rep-dashboard.html:1787-1792` | `cancel_sale` |
| Record / confirm / reject payment | `rep-dashboard.html:2007,2066`; `manager-dashboard.html:3145-3197`; `owner-dashboard.html:5576-5590` | `record_payment` / `set_payment_status` |
| Assign / adjust rep holdings & debt | `manager-dashboard.html:2996,3187,3366`; `owner-dashboard.html:5590` | `adjust_holdings` |
| Receive inventory | `manager-dashboard.html:3871-3886`; `owner-dashboard.html:6308-6321` | `receive_inventory` |
| Product returns | `rep-dashboard.html:2107`; `manager/owner ...product_returns` | `record_return` |
| Stock requests fulfil | `rep-dashboard.html:1921-1978`; `manager-dashboard.html:3023-3039` | `fulfil_stock_request` |

Until these move server-side, any of `total_value`, `quantity`, `debt_amount`,
`warehouse_stock`, and payment `status` can be set to arbitrary values from the
console by a user who is merely authenticated to that tenant.

## Data-integrity bugs that the RPCs also fix (no transaction today)

These are real corruption bugs, independent of the security angle — they
happen on ordinary network blips, not just attacks:

- **Edit-sale leaves orphaned/empty sales** — `rep-dashboard.html:1765-1768`:
  `sale_items.delete` then `.insert` with no transaction; if the insert fails,
  the sale keeps stale totals with **zero line items**. The preceding holdings
  updates (`1756`, `1762`) have **no error check** at all.
- **Cancel-sale double-restores stock** — `rep-dashboard.html:1787-1792`:
  holdings are restored *before* the status flips to `cancelled`, with no
  idempotency guard, so a double-click / replay inflates `rep_holdings`.
- **Record-sale stock drift** — `rep-dashboard.html:1619-1626`: holdings
  decrement runs after the sale commits and a failure is only `console.warn`-ed.

Each disappears once the whole operation is one server-side transaction.

## Note on the `requireAuth()` recovery path

Once `01-...sql` revokes client INSERT on `profiles`, the metadata-driven
"recovery" upsert in `supabase-client.js` will (correctly) fail. Profiles
should only ever be created by the `handle_new_user()` trigger or an
admin/`SECURITY DEFINER` provisioning function — never from the client. Plan to
delete that recovery block rather than rely on it.
