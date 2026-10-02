# StockFlow Android V2 — design and acceptance

Status: **preview implementation; production release blocked**. This continuation preserves the existing Supabase business contract and shared V2 workspace. It does not apply the production migration or change production data.

## Designed journey

| Step | Android experience |
| --- | --- |
| Open the app | Local bundled splash, recoverable session loading, visible sign-in path |
| Sign in / create account | Large labelled fields, password visibility, offline recovery, two-step owner/business setup |
| Verify / recover | Clear email-pending screen, deadline-based resend cooldown, safe retry, hosted confirmation/reset then return to app |
| Overview | Business/warehouse or holdings context, sales/profit/transactions, stock attention and recent sales |
| Find products | Debounced product/SKU search, camera entry, availability on product tiles, useful no-match state |
| Review sale | Separate phone review screen, persistent total/complete button, editable quantities, price validation, existing-customer picker by name/phone |
| Record payment | Cash/transfer/POS recorded according to role; cash received, shortfall/change; no payment gateway charge is implied |
| Complete sale | Controls freeze while the original operation is in flight; receipt follows the authoritative sale |
| Receipt | Native Android share sheet, cancel-safe sharing, visible retry feedback, next sale |
| Stock | Phone inventory cards, product editing/opening stock, reasoned adjustments and actual movement history |
| Customers / history | Search by name/phone, linked purchases, create a sale for that customer |
| More / account | Five primary navigation items; customers, stock attention and account in More; theme, lock and sign-out |
| Return after interruption | Same actor/tenant/role can recover an in-memory draft with refreshed stock; changed authority clears it |

This retains the working Capacitor architecture. It bundles the shared application locally and uses native camera, sharing and lifecycle plugins; it does not load the public website as the app. Branch selection, push delivery, split payments, completed offline sales and biometrics are not represented as implemented modules. Existing supplier/team/expense/approval operations remain in the advanced web dashboard.

## Design system

Jade primary actions, dark forest business metrics, warm white surfaces, Sora headings and DM Sans body copy. Phone inputs and principal controls use at least 48px targets. Inventory becomes cards at phone widths; dialogs become bottom sheets; checkout is a dedicated step with a persistent thumb-accessible action. Keyboard focus, reduced motion and dark appearance are supported. All screenshots in this directory are captures of the actual application with **fictional test data**.

## Evidence

- `tests/e2e-v2.mjs` drives the rendered application through an isolated Auth/PostgREST adapter executing actual V2 SQL.
- `tests/android-flows.mjs` adds twelve phone regressions covering navigation, narrow inventory/history, empty search, cart review, customer lookup, cash validation, in-flight freeze/reconciliation, More/history/account, secure draft resumption, response-loss recovery for customer creation, historical receipt navigation, and bundled typography/dark appearance.
- `tests/android-auth.mjs` adds three isolated auth UI regressions; no emails are sent.
- `mobile/scripts/native-policy.test.mjs` checks generated policy; `verify-native.mjs` checks the actual synchronized assets/plugins; `verify-apk.mjs` checks compiled APK/AAB metadata, permissions, debug signing and 16 KB alignment.
- [Browser results](../v2/browser-results.json), [final build results](android-build-results.json), [compiled package checks](android-package-verification.json) and [Android persistence results](android-persistence-results.json) record the executed result. On commit `003fd63e8569d047a1cbb1a3b62b711dc6b1d537`, all four CI workflows passed: 43 mobile unit tests, 31 isolated browser workflows, 8 native policy checks, API 36 APK/unsigned AAB builds, 11 emulator instrumentation tests and three restart scenarios. The latter use eight separate one-test invocations, including seed/corrupt/restore phases. An authored check is not a pass until executed.

## What still blocks a commercial release

The connected account still cannot access StockFlow Supabase project `fjmkenowgfxepwpyjcss` (rechecked 2026-10-02). The prior V2 database/financial-workflow release gates therefore remain open. Real registration/email verification/reset, live tenant isolation, deployed V2 RPCs, mobile-to-web realtime, backup/restore and production reconciliation must be established before staff use this build for business.

No physical Android device is available in this workspace. The CI workflow now runs encrypted-storage instrumentation on an Android 16 emulator; its actual result is recorded separately from browser checks. Native camera permission/denial/scanning, share return, hardware/predictive Back, keyboard/insets, lifecycle and 16 KB runtime acceptance still require hardware/emulator testing. A generated debug APK or unsigned AAB is not a signed Play release.

Unsubmitted drafts are held in memory. Android pending writes now persist in an app-owned AES-256/GCM store using Android Keystore, before any RPC; the UI copy stays in memory. Saved requests bind to actor, business and operation. Successful sales keep their original key until the cashier selects **Next sale** on the matching receipt. A restart before acknowledgement therefore recovers the original sale instead of creating a replacement request. Storage failure blocks submission; an account/business mismatch blocks replay. Web and iOS retain their prior session-scoped behavior. Native Auth tokens are not persisted. The acknowledgement protection applies to sales; non-sale forms clear their pending key after a successful server reply, so a process exit before their success screen can still require checking the saved record. This is recovery for online operations, not completed offline sales. Live server reconciliation and full device checkout/restart acceptance remain release gates.

Review `../v2/android-native.md`, `../v2/issue-register.md` and `../v2/launch-checklist.md` for the complete operational acceptance criteria.

## Review artifacts

The portable 12-screen gallery is generated by `scripts/android-gallery.mjs`. The four-screen overview is `StockFlow-Android-Preview.png`. The verified `StockFlow-Preview.apk` is a debug preview (34,646,968 bytes), SHA-256 `1a4dc86376c8eab6e82210f0f114c8ed55a79573ab11ab5239c6addd9781bb36`. It uses the configured StockFlow backend and is not an isolated demo database or a signed Play release.
