# Security remediation — StockFlow

> **Deployment status (2026-09-28).** `01`–`05` are all **applied to the live
> database** (`fjmkenowgfxepwpyjcss`). These files account for seven functions;
> all seven are `SECURITY DEFINER` with `search_path` pinned and executable by
> `authenticated` (verified 2026-09-28), as are the three atomic functions that
> predate them (`confirm_payment_atomic`, `approve_stock_request_atomic`,
> `approve_return_atomic`):
>
> | File | Functions | Applied |
> |------|-----------|---------|
> | `01` | profiles RLS hardening | 2026-09-27 |
> | `02` | `record_sale` | 2026-09-27 |
> | `03` | `edit_sale`, `cancel_sale` | 2026-09-27 |
> | `04` | `record_payment` | 2026-09-27 |
> | `05` | `adjust_holdings`, `receive_inventory`, `set_payment_status` | 2026-09-28 |
>
> `05` also **widened `approval_history.record_type`** (adding `rep_holdings`,
> `inventory_receipt`, `stock_adjustment`) — a prerequisite, not a nicety: two of
> its three functions fail outright on their audit insert without it.
>
> Everything was executed against real data inside rolled-back transactions
> before and after applying, and production was confirmed untouched each time.
> For `01`–`04`: holdings decrement and restore correctly, prices and totals are
> server-derived, overdraws are rejected, the payment attachment array
> round-trips. For `05`, smoke-tested against the deployed functions: holdings
> adjust 4→7 with its audit row, over-decrement rejected, a receipt aggregating
> two lines of the same product to +10 with `total_value` computed server-side,
> and `set_payment_status` restoring 10 000 of debt when un-confirming a payment.
>
> The `REVOKE` blocks in `02`/`04` remain **deliberately un-run** — owner and
> manager sale/holdings/stock paths are still direct client writes and would
> break. The surface is larger than the table below originally implied:
> `products.warehouse_stock` alone is written directly from ~11 sites across the
> two dashboards. They stay commented until those paths have RPCs.
>
> **`products_warehouse_stock_nonneg` was applied 2026-09-28** — the last place
> stock could be driven negative from the browser console. `products` now matches
> `rep_holdings`, whose `quantity` and `debt_amount` both already had `>= 0`
> CHECKs. Applied against 38 products with 0 rows below zero, so no existing row
> was touched, and verified afterwards in a rolled-back transaction: a `+5` write
> is accepted, setting `-1` is rejected, an over-decrement past zero is rejected.
>
> No legitimate path is affected — every writer already clamps at zero
> (`approve_stock_request_atomic` uses `GREATEST(0, …)`, `receive_inventory` only
> adds, the dashboards use `Math.max(0, …)`). It is a backstop against console
> manipulation and against any future path that forgets to clamp.
>
> **Everything in this directory is now applied.** The only statements
> deliberately left un-run are the `REVOKE` blocks in `02`/`04`, below.
>
> Files `02`–`05` were each corrected before deploying; as originally written
> they could not run. See the notes inside each file.

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

### The three RPCs — deployed 2026-09-28

`05-holdings-inventory-payment-rpcs.sql` contains all three, and they are live.

Before deploying, they were executed against live data inside rolled-back
transactions with production confirmed untouched afterwards (no receipts, no
audit rows, no functions, the constraint unchanged, and the test
holding/payment/stock all at their original values). After deploying, the same
cases were re-run **against the deployed functions** — also rolled back, also
confirmed clean (0 smoke receipts, 0 smoke audit rows, totals steady at 30
receipts and 213 audit rows).

The dry run earned its keep: **`adjust_holdings` and `receive_inventory` both
failed outright on their audit insert** because `approval_history.record_type` is
CHECK-constrained to a fixed list with no room for them. That would have been a
deploy-time failure of exactly the kind that hit `02`–`04`. The file now widens
that constraint first, as a prerequisite. A second run also showed a duplicate
invoice number creating a second receipt — so `receive_inventory` gained a
double-submit guard (case- and whitespace-insensitive per tenant).

Verified behaviour, all against live data:

| Case | Result |
|---|---|
| `adjust_holdings` on an existing row | qty 4→9, debt 153 600→174 600, audit row written |
| `adjust_holdings` creating a row (none before) | qty 4, debt 16 800 |
| Over-decrement (`-500` against 4) | rejected: "Rep holds 4, cannot remove 500" |
| Negative delta, no row | rejected |
| Decrement exactly to zero | allowed |
| Debt delta below zero | clamped to 0 |
| No-op (0, 0) | rejected |
| Cross-tenant rep / product | rejected |
| `receive_inventory`, product listed twice | stock +15 (aggregated), not +10 or +5 |
| `receive_inventory` totals | `total_value` 59 000 computed server-side, 3 item rows |
| Blank invoice / zero quantity / cross-tenant product | each rejected |
| Duplicate invoice, incl. `"  dup-test-xyz  "` vs `DUP-TEST-XYZ` | blocked |
| An invoice number already in the live table | blocked |
| `set_payment_status` confirmed→rejected | debt restored +10 000 |
| `set_payment_status` to `confirmed` | refused (confirm belongs to `confirm_payment_atomic`) |
| Repeat of the same status | idempotent, no double effect |
| pending→rejected | no debt change |

**Frontend wiring (shipped, safe either way):** `receive_inventory` in both the
manager and owner receive paths, `set_payment_status` in `quickRejectPayment`,
and `adjust_holdings` in the manager stock-request fulfil path — each RPC-first
with the legacy client writes kept as a `PGRST202`-only fallback. Nothing breaks
whether or not the SQL is deployed.

### Convention these follow

Follow the convention the
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

**`tests/audit.mjs` check 5 now enforces this for EVERY table.** Any
`await sb.from(...)…insert/update/upsert/delete(…)` whose result is discarded is
an ERROR. It began as an allowlist of the money and stock tables; every discarded
write in the app has since been fixed, so the rule was broadened — a silent
failure on `profiles` (new staff cannot sign in) or `stock_request_items` (a
request the manager sees with no line items) is just as invisible as one on
`payments`. A genuinely fire-and-forget write is marked
`audit-ignore-unchecked` in a comment, so the intent is stated rather than
inferred from a missing check.

**Non-financial paths fixed in the same sweep.** Rep request-resend (items
insert, with a header rollback so no empty request reaches the manager); manager
reject-request, approve/reject-edit and supplier-order rollback; owner rep
provisioning, supplier-order items (with rollback), staff profile create/update,
and receipt items; admin impersonation note; and the `requireAuth()` recovery
upsert in `supabase-client.js`.

Two of those were failing silently in a way that mattered: **owner staff creation**
left an auth user with no profile — the new staff member could sign in and land
nowhere — and **`logApprovalHistory`** used `.catch()`, which only fires on a
*thrown* error, so every rejected audit insert vanished despite the function's own
comment promising failures were logged. Its `record_type: recordType || 'unknown'`
fallback was also guaranteed to be rejected by the CHECK constraint.

**Reject-after-confirm lost money.** `quickRejectPayment` updated
`payments.status` to `rejected` with no state guard. Confirming is what reduces
the rep's debt, so rejecting an already-confirmed payment left the reduction
applied while the payment read as rejected — the debt quietly lost that amount.
It now guards on `.eq('status','pending')` and reports a zero-row result.

**Inventory receipt bumped stock with no audit record.** The manager path logged
a warning, commented "Continue anyway", and still raised warehouse stock when the
receipt insert failed — increasing inventory with no provenance and no word to
the user. Stock still moves (receiving is the critical part) but the missing
record is now surfaced.

> **Correction.** An earlier version of this section, and the description of the
> PR that shipped the fix, said a *blank invoice number* reached that branch
> because `inventory_receipts.invoice_number` is `NOT NULL`. That was wrong: the
> manager path returns early on `if (!invNum)` and the owner path auto-generates
> `RCV-<date>-<rand>`, so a blank one never gets that far. The branch is reachable
> by an RLS denial, a bad `supplier_id`, or any other insert failure — the fix and
> the reason for it stand, only the named trigger was incorrect.

**Owner stock-adjustment audit had never once worked.** The `approval_history`
insert in the owner warehouse-adjust path omitted both `record_type` and
`new_status`, which are `NOT NULL`, and discarded the result with
`.catch(function(){})`. Every warehouse adjustment an owner ever made went
unrecorded. The live table confirms it: `action_type` is `NULL` in every existing
row, and the only `record_type` values present are `payment`, `stock_request` and
`product_return`. Now supplies both columns and reports a failure.

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
