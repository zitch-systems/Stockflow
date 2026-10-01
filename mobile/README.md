# StockFlow V2 mobile and shared workspace

Next.js 16.3.8 static export + Capacitor 7 over the **same Supabase backend** as the existing product. Dedicated phone screens replace the original login-only dashboard handoff for the core workflows. Capacitor renders local assets, with native camera/lifecycle plugins; this is a deliberate continuation of the existing stack, not a React Native implementation.

## Implemented scope

- Login, registration/business details, verification notice, resend and generic password recovery. Email verification/reset complete on the existing hosted flow; native deep links are not certified.
- Authoritative business/role loading; visible warehouse or rep-holdings context.
- Dashboard with completed sales, estimated gross profit, transactions, cases, period trend, top products, low-stock and pending-review attention.
- Product/SKU search, camera scanner, cart, quantities/prices, linked customer, recorded payment method, cash change, checkout, receipt/share/print.
- Inventory, owner product creation/edit/CSV import, reasoned owner/manager stock adjustment and last 20 journal entries.
- Sales/receipt/cancellation for known V2 stock sources; customers and ID-linked purchase history.
- In-app attention/account, offline/error/retry states, background/idle password lock and logout.

Owner/manager warehouse sales and rep allocated-stock credit sales use the existing debt model. Card/POS/transfer choices record payments; they do not charge cards or send refunds. Suppliers, staff, expenses, price/payment/return approvals and administration remain in the retained role dashboards through an explicit advanced-operations link.

No independent branch inventory, variants, gateway charging/refunds, offline finalised-sale sync, verified push delivery or biometrics are claimed. Native auth is memory-only; browser workspace auth uses tab-scoped session storage. Reauthentication rechecks the profile without discarding the native in-memory session. Closing the native process requires sign-in again.

## Commands

Use Node 22 (minimum 20.9):

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build                 # native static export -> out/
npx cap add android           # generated project, gitignored
npx cap sync android
npm run native:configure      # permissions/version/signing hooks/icons/splashes
```

Android requires JDK 21, Android SDK and access to Gradle/Maven downloads. For iOS on macOS with Xcode/CocoaPods, use `npx cap add ios` and `npx cap sync ios`, then `npm run native:configure`. The native configure script also works when only one platform exists.

`npm run build:web` from the repository root creates a separate `/workspace` export in `.next-web/` and publishes it in `dist/workspace`. **Never package `.next-web/` into Capacitor or copy `out/` into the prefixed website.** Build/cache directories are excluded from lint and Git.

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Actual StockFlow project URL (defaults to existing client project) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client credential; never a service-role key |
| `NEXT_PUBLIC_WEB_APP_URL` | Retained role dashboard/email-flow origin; default stockflow.com.ng |
| `STOCKFLOW_WEB_BASE_PATH` / `NEXT_PUBLIC_WEB_BASE_PATH` | Set by root web build only, `/workspace`; omit for native |

App ID `ng.com.stockflow.app`, display name StockFlow, version 2.0.0/build 20000. Camera permission and Android API 26 minimum are prepared for the pinned scanner plugin. Android backup is disabled. The V2 vector source is in `resources/v2-icon.svg`; asset generation uses pinned Sharp. The original `resources/icon.png` remains available.

Release signing variables are supplied by secure CI: `STOCKFLOW_KEYSTORE_PATH`, `STOCKFLOW_KEYSTORE_PASSWORD`, `STOCKFLOW_KEY_ALIAS`, `STOCKFLOW_KEY_PASSWORD`. Their presence is not a successful signed build. No keystore, account credentials or iOS signing material is committed.

## Validation and release status

Local typecheck, lint, 14 unit tests and native static export passed. Browser-to-fixture-Postgres workflows test checkout, retry after commit/reload, stock, reports, customers, phone layout, idle lock and logout. Camera/device lifecycle and real Supabase Auth remain release gates.

GitHub Actions contains mobile lint/unit/export, isolated browser/website QA, real PostgreSQL terminal concurrency and Android-debug/iOS-simulator build workflows. Codemagic retains its existing Android debug workflow and runs native configuration after syncing. Neither a debug APK nor simulator build establishes app-store readiness.

Local Android assembly failed at a blocked Gradle download; local iOS assembly is unavailable without Xcode/CocoaPods. Signed release artifacts, actual device scanning/background/process-death tests, production account/environment, deep links, legal/store metadata and bidirectional live web/mobile acceptance remain required. See `../docs/v2/launch-checklist.md` and the deployment runbook. **🔴 NOT READY for production or app-store release.**
