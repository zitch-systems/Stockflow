# StockFlow V2 deployment, migration and recovery

This is a gated rollout plan, not a record of a successful production deployment. Do not merge/deploy the application switch before compatible database functions and the launch gates are verified. No production SQL was applied during this work.

## 1. Establish the actual environment

Confirm the StockFlow Supabase project is `fjmkenowgfxepwpyjcss`, not another project in the connected account. Confirm the Vercel project that serves `stockflow.com.ng`, its team, production branch, domains, build settings and environment. The connected Supabase account denied this project; the connected Vercel team did not contain it.

Record deployed Git SHA, database migration history, schema/function signatures, extension versions, RLS policies/grants, Realtime publication, Auth redirect/email/rate-limit settings, Storage buckets/policies, service key locations and provider retention configuration. Use `supabase/preflight.sql` through an authorised read-only connection. Store output privately: it can include real business identifiers. Never put service keys, user JWTs, business exports or backups in this repository.

## 2. Back up and prove recovery before migration

Obtain an encrypted provider backup/PITR recovery point plus a validated logical export covering business records, functions, policies, role grants and the required Auth/Storage metadata. Back up uploaded objects separately; database metadata does not recover files. Record timestamp, sizes/checksums, project identity, retention and encryption/access owners.

Restore to an isolated project with isolated mail/webhook destinations. Verify tenant/profile counts, product and holding quantities/debt, sales headers/lines, receipt totals/files and permission behavior against the backup manifest. Measure restore duration and supported recovery-point window. Existing backup frequency, retention, RPO and RTO are **unknown**. Suggested operating targets are RPO <=15 minutes for transactions and RTO <=4 hours, subject to provider plan and a successful measured restore; these are not configured guarantees.

A backup download without a successful restore is insufficient evidence. Do not run destructive acceptance tests in production.

## 3. Reconcile the real baseline

The isolated fixture in `tests/fixtures/v2-schema.sql` is an inferred execution contract, not the live schema. Compare all touched columns, types, defaults, checks, existing indexes, approval-history constraints, function return types and grants with the restored copy.

Reconcile duplicate normalized SKUs and invoice numbers without deleting sales/history or silently merging product IDs. Identify orphan or cross-tenant relations, negative/invalid quantities, missing cost snapshots and mismatched sale totals. Establish the exact return reservation protocol and the real purchase-order foreign key. Historical `sales.stock_source` stays null until evidence supports a backfill; do not infer it from a role that may have changed.

Inspect every actual `auth.users` trigger and the profile-protection trigger. The June source trusts public signup metadata for an existing tenant/staff role; V2 prevents that and adds a trusted owner invitation. Review older `provision-user` and any other identity provisioners before changing the trigger: that endpoint's source is absent here and may depend on the old signup contract. Recover/port it and test real staff/application onboarding rather than silently breaking it. See `supabase/functions/provision-stockflow-staff/README.md` for the invitation trust/retry/deployment gates.

Receipt/attachment validation supports retained relative object paths and canonical StockFlow public URLs under the actor's tenant prefix. For a distinct staging project URL, review the allowed URL prefix in the migration; do not broaden it to arbitrary URLs. Confirm private buckets and signed-path readers before release. Namespace validation alone does not make public files private.

## 4. Test the migration on the restore

Review `supabase/migrations/20261001092411_stockflow_v2_integrity.sql` and run a dry run using the authorised project tooling. Establish migration history/baseline before applying a newly introduced CLI migration directory. Do not blindly rerun historical remediation templates.

The migration is transaction-wrapped and preserves historical rows. It adds operation keys, audit/movement tables, known stock sources on new sales, receipt payloads, dispatch replay payloads and indexes; replaces the existing dispatch/receive signatures and documented signup triggers; seeds labelled V2 opening balances under a write lock. Auth behavior changes are subject to the provisioner compatibility gate above. Unique-index failures roll back safely and require explicit data reconciliation.

Measure write-lock/index-building duration on realistic data. A regular unique/GIN index build can block writes; schedule a maintenance window or design a separate online-index migration after inspecting production size. Do not turn off constraints to make the migration pass. Verify `pg_trgm` availability and its existing schema; this migration does not relocate an existing extension.

Run the DB, real PostgreSQL concurrency, UI and restored live-API acceptance suites. Test rollback of invalid carts/imports/deliveries; retries after commit; two-terminal last-unit and dispatch races; stale adjustments; history/quantity conservation; owner/manager/rep/foreign-business access; Auth session expiry; email signup/recovery and staff revocation.

## 5. Finish financial mutation lockdown

Port and verify all remaining purchase-order, return, payment-edit, price-approval and direct product/staff workflows. Retained manager product forms need an explicit permission-preserving port; the new product API currently allows owners only. Never widen a role merely to get a client request to pass.

After every permitted writer is proven through a trusted function, revoke direct INSERT/UPDATE/DELETE grants on financial/stock tables for `anon` and `authenticated`, and revoke unwanted/old function execution. Re-run API tampering and retained UI regression. Keep SELECT under verified RLS. The current migration deliberately does not revoke all legacy table mutations because doing so now would break retained workflows; that omission is a **release blocker**.

## 6. Build reviewable deployment and native artifacts

Use locked installs and Node 22. Run checks in `docs/v2/README.md`. `npm run build:web` publishes `dist` with the marketing homepage, retained public pages and `/workspace`; it excludes SQL/tests/docs/secrets and does not execute migrations. The separate native build is `npm --prefix mobile run build` -> `mobile/out`.

For native projects:

```sh
cd mobile
npm ci
npm run build
npx cap add android
npx cap sync android
npm run native:configure
```

Configuration generates V2 icons/splashes, Android API 26 minimum, camera permission, backup-disabled manifest, version 2.0.0/build 20000 and signing hooks. iOS uses `npx cap add ios`/`sync ios` on a macOS builder with CocoaPods/Xcode. Android needs JDK 21, Android SDK and Gradle access. Debug APK/simulator CI is not store signing.

Release signing is supplied by secure CI variables `STOCKFLOW_KEYSTORE_PATH`, `STOCKFLOW_KEYSTORE_PASSWORD`, `STOCKFLOW_KEY_ALIAS`, `STOCKFLOW_KEY_PASSWORD`. Never commit keystores/passwords. Supply actual iOS team, profiles and signing identity through the release system. Produce and verify the signed Android bundle and iOS archive, install on physical devices and test camera denial/scan/add-to-cart, background/unlock, process death, device loss, recovery links and web-to-phone refresh.

Review privacy/terms drafts, real paid terms, legal entity, retention, support, screenshots, app descriptions and permission disclosures before store/public release. Do not publish draft legal documents as final policies.

## 7. Pilot and release

Deploy a preview using an isolated backend; check security headers, camera policy, cache behavior, route/asset paths, service-worker upgrade and fresh/returning users. Root marketing CTAs retain the existing signup/login workflow until V2 onboarding/backend gates are closed. Choose the final default login/onboarding destination deliberately after shared-session and email-link tests.

Pilot with a small authorised business and real roles. Record full register -> product -> customer -> sale -> inventory -> receipt -> report workflow, plus staff invitation/login, distribution/return/debt and supplier receiving. Check financial totals and journal balances before/after; test failures only with controlled fixture business data.

Monitor server RPC errors/timeouts, duplicate-key conflicts, stock-change rejections, successful sales, reconciliation discrepancies, Auth failures and provider health. Alerts must avoid customer/token/file contents. No live telemetry/SLO configuration was changed here.

## 8. Rollback and incident recovery

Keep the last known-good application artifact and provider deployment ID. On bad UI/availability deploy, roll back application assets; keep additive tables/journal and preserve accepted transactions. Maintain compatible RPC signatures during rollout so retained clients do not resort to unsafe paths.

For suspected corruption: stop the affected writes, preserve logs/operation IDs, establish the last reconciled checkpoint, inspect ledger/header evidence and reconcile through audited correcting transactions. Do not erase the new journal or blindly restore over newer valid sales. For database failure, use the tested provider restore procedure, restore objects/configuration, validate tenant/security/financial totals, then reconnect apps. A destructive data restore requires explicit recovery-point and accepted-data-loss decision.

Append-only fixes are preferred to reversing an applied migration. Any down migration/drop of V2 tables after real writes would destroy audit evidence and needs its own backup/restore plan. Record post-incident reconciliation and measured RPO/RTO before reopening normal operation.
