# StockFlow V2 — verified system map

Baseline: `b592891508ee47f31e42bd30668673a951492707`, inspected 1 October 2026.

StockFlow manages Nigerian distributor operations. A tenant is a business. Owners can operate alone or with managers and sales reps. This is the scope to preserve.

| Module | Current implementation | V2 direction |
| --- | --- | --- |
| Website | Static landing, signup, login, password recovery; stockflow.com.ng responds on Vercel | Clear distributor positioning, real screenshots, honest pricing and scope |
| Authentication | Supabase email/password, profile roles, recovery, email verification | New-tenant-only public signup; trusted owner invitation; fail closed on missing profiles; expiry and device lock |
| Organisation | tenants, profiles; owner/manager/rep/super_admin; solo and owner_rep modes | Preserve roles and modes; least privilege on operations |
| Inventory | products.warehouse_stock; rep_holdings.quantity and debt_amount; inventory receipts | Atomic stock changes, movement journal, reasons and reconciliation |
| Products | Name, buy/sell price, SKU code, emoji, weight, active state | Simple creation; opening stock separate from metadata; transactional import |
| Sales | Warehouse sales (owner/manager); pending rep sales; edit, approval, cancellation, receipts | One transaction, stable retry key, accurate status-aware reporting |
| Stock distribution | Requests, manager approval, warehouse dispatch into rep holdings | Preserve distribution/debt semantics; reject insufficient stock |
| Returns | product_returns and manager approval | Preserve rep return process; audited authorisation; monetary refunds remain outside current scope |
| Payments | Rep collections, receipt attachments, confirmation/rejection, debt allocation | Atomic confirmation; payments are recorded evidence, not a card charging integration |
| Purchases | Suppliers, supplier_orders/items, receipts, supplier_transactions | Atomic receiving; no duplicate receipts on retry |
| Customers | Tenant customer records; purchase association; credit limit metadata | Fast search, history; no unsupported claims of an authoritative credit ledger |
| Expenses | expenses and expense_categories | Preserve; reconcile period totals |
| Reports | Sales, profit with cost snapshots, warehouse value, reps, suppliers | Server aggregation, explicit status/timezone definitions, no silent row caps |
| Notifications | Toasts, approval queues, low stock and realtime refresh | In-app attention centre; native push needs an actual provider/configuration |
| Subscription/admin | Manual tenant plan, expiry, suspension; super-admin dashboard | Do not invent a payment gateway or claim webhook verification |
| Mobile | Next.js static-export + Capacitor login/home with web handoff | Dedicated mobile workflows using the same database and transaction APIs |
| Offline | Service worker caches a shell; no verified write sync engine | Keep browsing/drafts; final stock/payment writes require a server response |

## Inventory semantics found in source

Warehouse stock and rep stock are separately stored balances, not computed from an immutable ledger. Receiving adds warehouse stock. Dispatch subtracts warehouse stock and adds rep holdings/debt. Warehouse sales subtract warehouse stock. Rep sales subtract rep holdings; debt originates at dispatch, not at sale. Cancelling a rep sale restores holdings without reversing dispatch debt. Returns are intended to reverse holdings/debt and optionally add warehouse stock, but submission and approval disagree about when holdings are deducted; that path cannot be certified from source alone. Manual corrections exist and need reasons. The established debt model must survive V2.

## Trust and access

The frontend calls Supabase directly using a public anon key. Database permissions, RLS, functions and storage policies are the trust boundary. Browser filtering and UI role checks cannot enforce tenant isolation.

The documented June signup trigger accepts `tenant_id` and manager/rep role from public user metadata. That is a tenant-attachment vulnerability in the source; the live trigger could not be inspected. V2 replaces that protocol with new-business-only signup and a verified owner/service invitation. The unrelated existing `provision-user` endpoint has no source here and needs a compatibility review before rollout.

The connected Supabase account denied access to `fjmkenowgfxepwpyjcss`. The repository states that earlier SQL was deployed in September; this is historical evidence, not a fresh verification. Production schema, policies, data reconciliation, backups, restore and authentication settings remain unverified.

## Deliberately excluded until designed and verified

The `profiles.branch` text field is not branch inventory architecture. No verified branches table, branch stock ledger, or transfer lifecycle exists. Variants, category hierarchy, split payments, payment-gateway refunds, offline finalised sales and push delivery are not current features. They must not appear as available in marketing or navigation. Adding them requires an explicit data model and migration.

The alternate `nextjs-migration` branch was inspected as existing work. It is not the deployed baseline and will not silently replace current dashboards.
