# Security remediation — StockFlow

> **Deployment status (2026-09-27).** `01`–`04` are all **applied to the live
> database** (`fjmkenowgfxepwpyjcss`). `record_sale`, `edit_sale`, `cancel_sale`
> and `record_payment` now exist, are `SECURITY DEFINER`, and are executable by
> `authenticated`. They were verified against the real schema and executed
> against real data inside a rolled-back transaction before and after applying:
> holdings decrement and restore correctly, prices and totals are server-derived,
> overdraws are rejected, and the payment attachment array round-trips.
>
> The `REVOKE` blocks in `02`/`04` remain **deliberately un-run** — owner and
> manager sale/holdings/stock paths are still direct client writes and would
> break. The surface is larger than the table below originally implied:
> `products.warehouse_stock` alone is written directly from ~11 sites across the
> two dashboards. They stay commented until those paths have RPCs.
>
> Files `02`–`04` were corrected before deploying; as originally written they
> could not run. See the notes inside each file.

These SQL templates address the two server-side findings from the critical
audit (see PR #1). They began as **review-and-adapt templates** rather than
drop-in migrations: this repo is a static frontend, so the live schema and RLS
policies could not be inspected when they were written. They have since been
reconciled against the real schema.

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
| Record sale | `rep-dashboard.html` `doSell` | `record_sale` — provided (02), **frontend wired** |
| Edit sale | `rep-dashboard.html` `saveEditSale` | `edit_sale` — provided (03), **frontend wired** |
| Cancel sale | `rep-dashboard.html` `cancelSale` | `cancel_sale` — provided (03), **frontend wired** |
| Record payment (rep) | `rep-dashboard.html` `submitPay` | `record_payment` — provided (04), **frontend wired** |
| Confirm / reject payment | `manager` / `owner` dashboards | `confirm_payment_atomic` (**wired**) / `set_payment_status` (todo) |
| Assign / adjust rep holdings & debt | `manager-dashboard.html`; `owner-dashboard.html` | `adjust_holdings` |
| Receive inventory | `manager-dashboard.html`; `owner-dashboard.html` | `receive_inventory` |
| Product returns | `rep-dashboard.html`; `manager`/`owner` | `record_return` / `approve_return_atomic` (**wired**) |
| Stock requests fulfil | `rep-dashboard.html`; `manager-dashboard.html` | `fulfil_stock_request` / `approve_stock_request_atomic` (**wired**) |

> **Frontend wiring status:** the rows marked *frontend wired* call the RPC
> first and fall back to the legacy client writes **only** when the function is
> absent (PostgREST `PGRST202` / "does not exist"); a real rejection is surfaced,
> never bypassed. So the SQL in `02`–`04` can be deployed (or its signatures
> adjusted) without any further frontend change, and nothing breaks if it isn't
> deployed yet. Their signatures were originally guesses inferred from the
> frontend; they have since been **verified against the live schema and
> deployed** (see the status block at the top).

### The three RPCs still missing, and what they must do

Written against the live schema, verified 2026-09-27. Follow the convention the
already-deployed `confirm_payment_atomic` / `approve_stock_request_atomic` /
`approve_return_atomic` established, which is sound:

- take the actor from `auth.uid()`, **never** from a parameter (those functions
  accept a `p_confirmer_id`/`p_reviewer_id` and correctly ignore it — the
  parameter is vestigial, keep ignoring it);
- authorize with `is_manager_or_above() AND (tenant_id = get_my_tenant_id() OR is_super_admin())`;
- use **relative** updates (`warehouse_stock = warehouse_stock + n`), never an
  absolute value computed from a prior read;
- return `jsonb_build_object('ok', …)` and log to `approval_history`.

| RPC | Must cover | Schema notes |
|-----|-----------|--------------|
| `adjust_holdings` | Manager/owner assigning or correcting a rep's `quantity`/`debt_amount`; the debt adjustments on payment confirm, payment edit and returns | `rep_holdings` is `UNIQUE (rep_id, product_id)` — that is the upsert key, and it does **not** include `tenant_id`. Both `quantity >= 0` and `debt_amount >= 0` are enforced by CHECK, so an over-decrement raises `23514` rather than going negative |
| `receive_inventory` | The receipt header, its line items and the stock increase, atomically | `inventory_receipts.invoice_number` is `NOT NULL`; `inventory_receipt_items.unit_price` is `NOT NULL`. Doing all three in one transaction removes the "stock rose with no receipt" case entirely |
| `set_payment_status` | Every transition other than confirm — reject, un-confirm, edit approval — **reversing the debt effect** when moving out of `confirmed` | `payments.status` is enum `payment_status` (`pending`, `confirmed`, `rejected`, `edit_pending`). `rejected_by`/`rejected_at` and `confirmed_by`/`confirmed_at` are separate columns |

Regenerate the list of paths still writing these tables directly (line numbers
in this file have gone stale twice; prefer the command):

```sh
grep -n "from('\(products\|rep_holdings\|sales\|sale_items\|payments\)')" \
  rep-dashboard.html manager-dashboard.html owner-dashboard.html
```

Until these move server-side, any of `total_value`, `quantity`, `debt_amount`,
`warehouse_stock`, and payment `status` can be set to arbitrary values from the
console by a user who is merely authenticated to that tenant.

## Data-integrity bugs (no transaction today)

These are real corruption bugs independent of the security angle — they happen
on ordinary network blips, not just attacks. Each disappears once the operation
is one server-side transaction; until then the client at least has to *notice*.

### Fixed in the client (silent failure → reported failure)

The recurring shape: a write's result was discarded or only `console.warn`-ed,
so stock/debt failed to move while the UI reported success.

**Reps writing `rep_holdings`.** A rep is not permitted to UPDATE
`rep_holdings` (the policy requires manager/owner/super_admin). Under RLS a row
excluded by `USING` is *invisible* to UPDATE, so the statement matches **zero
rows and returns no error**. All four rep paths now pass `{ count: 'exact' }`
and treat a zero count as failure: `doSell`, `saveEditSale` (restore +
decrement), `cancelSale`, and the return-submit decrement.

**Owner/manager writes to `products.warehouse_stock` and `rep_holdings`.** Eight
sites discarded their result entirely — manager sale deduction, manager
sale-rollback, manager return restock, manager payment-edit debt adjustment,
manager inventory-receipt stock bump, owner confirm-payment debt reduction,
owner return restock, plus the rep return above. All now check the error, leave
the local cache alone on failure, and tell the user.

**`tests/audit.mjs` check 5 now enforces this.** Any `await sb.from(<money
table>)…insert/update/upsert/delete(…)` whose result is discarded is an ERROR
(`sales`, `sale_items`, `rep_holdings`, `products`, `payments`).

**Reject-after-confirm lost money.** `quickRejectPayment` updated
`payments.status` to `rejected` with no state guard. Confirming is what reduces
the rep's debt, so rejecting an already-confirmed payment left the reduction
applied while the payment read as rejected — the debt quietly lost that amount.
It now guards on `.eq('status','pending')` and reports a zero-row result.

**Inventory receipt bumped stock with no audit record.** `inventory_receipts`
`.invoice_number` is `NOT NULL`, so a blank invoice number fails the insert. The
manager path logged a warning, commented "Continue anyway", and still raised
warehouse stock — increasing inventory with no provenance and no word to the
user. Stock still moves (receiving is the critical part) but the missing record
is now surfaced.

### Still open — need the server side

- **Read-modify-write on shared counters is not atomic.** Both dashboards read
  `warehouse_stock`, compute a new absolute value, and write it back. The
  in-code comments claim this "avoids the race condition"; it does not — it only
  narrows the window. Two concurrent sales can read the same figure and both
  write it back, losing a deduction. Only a relative update
  (`warehouse_stock = warehouse_stock - n`, as the deployed
  `approve_stock_request_atomic` already does) is correct, and PostgREST cannot
  express one — so this needs an RPC.
- **`products.warehouse_stock` has no non-negative CHECK** in the live schema
  (verified 2026-09-27), unlike `rep_holdings.quantity` and `.debt_amount`,
  which both have `>= 0` constraints. Warehouse stock can go negative in the DB;
  the `Math.max(0, …)` guards are client-side only and an attacker skips them.
- **Edit-sale can still leave an empty sale** — `sale_items.delete` then
  `.insert` with no transaction. Both errors are now reported, but a failed
  insert still leaves the header with stale totals and zero line items. Only
  `edit_sale` (deployed, preferred) is safe.

## Note on the `requireAuth()` recovery path

Once `01-...sql` revokes client INSERT on `profiles`, the metadata-driven
"recovery" upsert in `supabase-client.js` will (correctly) fail. Profiles
should only ever be created by the `handle_new_user()` trigger or an
admin/`SECURITY DEFINER` provisioning function — never from the client. Plan to
delete that recovery block rather than rely on it.
