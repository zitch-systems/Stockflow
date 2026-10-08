# Shared Next.js and Android business workflows

The main V2 business app is the Next.js App Router project under `mobile/`; Capacitor packages the same static output for Android. This change retains the existing mobile theme, typography, responsive cards, dark mode, bottom navigation, review screens and encrypted recovery.

| Existing business process | Shared workspace implementation | Remaining verified-backend requirement |
| --- | --- | --- |
| Overview and reporting | Existing period metrics, sales chart and attention cards | Historical cost/total reconciliation and actual reporting acceptance |
| Record sale / invoice | Existing product selection → customer → method → review → receipt/share | Actual V2 atomic checkout, private attachments and hardware sharing |
| Inventory | Existing stock cards, search, product edit and audited adjustment | Backend deployment and live role acceptance |
| Supplier delivery | Business operations → Supplier orders → detail/immutable lines → review → receive | Actual reviewed receiving function; order create/edit/cancel and approval remain unported |
| Returns | Own/all permitted records → details → verified original credit/restock/rejection → review | Reservation provenance; rep submission/photo capture and pending edits remain unported |
| Rep payment | Own/all permitted records → bank verification → review confirmation/reversal | Exact allocation ledger; payment submission and revisioned amount-edit UI remain unported |
| Stock receipts | Invoice history and delivery lines within the same theme | New receiving form and private invoice upload remain unported |
| Team | Business-scoped, minimal staff roster | Trusted invitation/application/admin workflows remain external |
| Expenses | Business expense history/details | Audited expense creation/modification remain unported |

Owners/managers can review protected transitions; representatives see only Returns and Rep payments in Business operations, with their own-row filters and no managerial buttons. Read queries are tenant-scoped, paginated and cancellable. Database authorization remains mandatory even when buttons are hidden.

New mutation paths reuse the captured-actor, tenant-bound original request identity and encrypted Android pending store. A lost response exposes Retry original request after reopening. There is no direct-write fallback. Action availability still depends on the actual backend; preview mode pauses writes. A two-stage review requires the immutable delivery snapshot and a reason before submission. Historical transactions without recorded effects are refused by the server.

`npm run build:web` makes root login/signup and owner/manager/rep dashboard aliases open the shared `/workspace` Next.js pages. The old dashboards are retained as explicit `*-dashboard-legacy.html` routes for unported administration. Super-admin remains retained. This route switch must be staged and accepted before a production web deployment; it changes the default experience and pauses writes while the backend is absent.

Verification: mobile domain/recovery units, typecheck/lint and build; captured-schema profile/tenant authorization checks; `tests/business-flows-v2.mjs` covers browser-to-database transitions, response-loss recovery, role navigation, dark phone layout and missing-backend mutation denial. CI result status must be recorded separately before advertising a new installable APK.

No claim of full retained-workflow parity or production readiness is made. The unported rows above and the backup/restore, database authorization, private Storage and physical-device requirements remain release gates.

## Verified hosted cutover and Android download

PR #27 was merged outside this agent’s actions. The public root owner entry now redirects to `/workspace/home/`; the home/login and explicit legacy page returned HTTP 200. All nine Next.js script requests succeeded, and the bundle contains the business operations/payment/order flows and the expected Supabase project. This is public bundle verification, not a production-login or transaction test. Platform deployment inspection was unavailable through the connected Vercel API (404); no promotion or environment change was performed.

[Updated direct APK download](../android/business-preview-download.md) is published. Evidence and remaining requirements are in `docs/android/business-preview-results.json`. The APK’s mobile tree exactly matches merged main; subsequent review-only SQL and evidence changes do not alter the native client.

## Former workflow sequence, current theme

The follow-up keeps the shared forest/jade theme, fonts, dark mode and existing
responsive styles unchanged. The former web dashboard's process ordering is now
used for sale setup: customer/payment → items → review/complete → receipt. On a
phone, Back to products returns to customer setup without clearing the cart or
chosen payment. Existing customer links and protected retry snapshots remain.

Orders, returns, rep payments, receipts, team and expenses have direct sidebar
and More links. Owners/managers also have Approvals: orders awaiting approval or
receiving, pending returns, and pending/edit-pending payments. Completed records
leave the default queue but remain available through All statuses/history. Reps
cannot enter the review queue. Navigation cannot unmount a submitting operation.

This restores these entry points and sequences, not complete legacy feature
parity. Invoice creation, order creation/approval/edit/cancel, return submission
and attachment/edit screens, payment submission/edit decisions, stock requests,
finance/aging reports, audited expenses and trusted staff administration still
need their protected implementations. The existing dashboard link remains for
retained administration; paused writers stay paused. No legacy direct financial
write is restored and no production schema or records are changed. Live V2 and
security installation still require the documented backup/restore gates.

Validation for this follow-up: 50 mobile unit tests, TypeScript and ESLint pass.
Browser regressions cover queue/history separation, role boundaries, direct
workflow entry, and customer/payment preservation across phone sale review.
The previously published 2.0.1-preview APK does not contain this follow-up until
an updated artifact is built and published.
