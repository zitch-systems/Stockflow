# StockFlow V2 launch checklist

**🔴 NOT READY**. Boxes below are production acceptance gates; isolated/local passes are supporting evidence and do not tick live acceptance automatically.

## Core

- [ ] Registration, email verification, resend, reset and complete new-business provisioning verified with actual Supabase Auth.
- [ ] Login, expiry, suspension, inactivity, logout and missing-profile behavior verified with real roles.
- [ ] New owner completes first product -> stock -> customer -> sale -> receipt -> reconciled dashboard without training.
- [ ] Product creation/edit/archive/import, historical references and stock corrections regress across both existing business modes.
- [ ] Warehouse and rep sales preserve the actual dispatch-debt model.
- [ ] Purchase-order creation/receiving and supplier balances are atomic and reconciled.
- [ ] Returns have one reconciled reservation/approval/reject lifecycle; full/partial monetary refund support is not claimed.
- [ ] Owner creates/invites staff, assigns verified role, staff logs in/sells, owner sees sale; revoked staff loses access.
- [ ] Retained expenses, approvals, settings and reports regress; totals reconcile across legacy and new views.

## Security

- [ ] Anonymous, wrong role and business A -> B access tests pass through real API, not UI filtering.
- [ ] Financial table writes and unused privileged functions are revoked after all writers are ported.
- [ ] Authorisation ignores editable Auth metadata; all definer functions have safe search paths and explicit grants.
- [ ] Public signup cannot choose an existing tenant/staff role; trusted invitation and older `provision-user` are verified against real Auth/profile triggers without regressions.
- [ ] API body/amount/product/customer/staff-ID manipulation, direct SQL injection inputs and XSS payloads are exercised on staging.
- [ ] Actual Auth anti-enumeration, rate limits/brute force, verification, refresh revocation and reset redirect configuration are checked.
- [ ] Storage buckets are private where necessary; forged paths, downloads, signed URL expiry, MIME/size and cross-tenant upload/read are tested.
- [ ] CSP/security/camera headers and source/dependency scans pass on deployed artifacts; secrets are absent from public builds/logs.
- [ ] CSRF/SSRF exposure is assessed against actual endpoints/providers; no unsupported “fully secure” claim is published.

## Data and recovery

- [ ] Correct project/schema/migration history established; `supabase/preflight.sql` results reviewed privately.
- [ ] Encrypted backup and object backup created; isolated restore proven and retention/RPO/RTO recorded.
- [ ] Duplicate SKUs/invoices and orphan/cross-tenant/mismatched financial data reconciled without destructive merging.
- [ ] Migration succeeds on restored real schema/data; lock/index timings measured.
- [ ] Warehouse/rep opening journal plus deltas equals balances, including receipts/dispatch/sale/cancel/return/adjust.
- [ ] Independent concurrent last-unit sale/retry/cart-order/adjust/cancel/dispatch/receive tests pass on PostgreSQL and staging API.
- [ ] Application rollback and database incident recovery rehearsed without losing accepted transactions.

## UX and performance

- [ ] Desktop/tablet/phone acceptance covers new workspace and retained operations, including keyboard/screen reader.
- [ ] Loading/empty/error/retry/offline/timeout states tested for every migrated major action.
- [ ] First-time business owner usability session demonstrates first value and comprehensible stock/payment context.
- [ ] Actual API/query/render metrics at agreed product/transaction/tenant volumes and concurrent users meet recorded budgets.
- [ ] Slow queries, deep pagination, broad search, aggregate temp spills and realtime behavior reviewed from production-like measurements.

## Website

- [ ] Operator accepts final positioning, real trial/paid terms, support contacts, privacy and terms (current files are marked drafts).
- [ ] Actual product screenshots match the deployed V2 build and remain clearly labelled when showing example data.
- [ ] Signup/login/default workspace and email links complete the real onboarding journey.
- [ ] Deployed 375/768/1440/1920 layouts, CTA/menu/SEO/canonical/robots/sitemap/OG and asset caching pass.
- [ ] Deployed accessibility and Core Web Vitals measured; no invented customers, testimonials, compliance or uptime claims.

## Mobile

- [x] Android API 36 debug APK, unsigned AAB and iOS simulator build/package checks passed on source commit `003fd63`; artifacts/hashes recorded in `../android/android-build-results.json`.
- [x] Android 16 encrypted-store/bridge instrumentation (11 tests) and three synthetic process-restart scenarios passed; this does not tick live-business or physical-device acceptance below.
- [ ] Signed production Android bundle and iOS archive succeed with actual accounts; bundle IDs/version/build numbers verified.
- [ ] Physical-device login/dashboard/POS/inventory/sales/customers/attention/logout verified with production-like backend.
- [ ] Barcode scan -> correct product -> quantity/customer/payment -> receipt verified; camera denial/unknown SKU handled.
- [ ] Background/idle unlock, expiry, revoked session, process death and device loss exercise least privilege.
- [ ] Web sale refreshes mobile and mobile sale refreshes web; retry/offline finalisation behavior is accurate.
- [ ] Store icon/splash/screenshots/descriptions/privacy disclosures/signing/permissions reviewed and submitted through actual store accounts.

## Explicit exclusions

Branch inventory/transfers, variants, split/gateway payments/refunds, offline finalised-sale sync and push delivery are not present release capabilities. Do not tick their scenarios or advertise them. A profile branch label is not a branch architecture. Biometrics and secure persistent native sessions are not implemented.

## Evidence required to continue

Connect Supabase project **`fjmkenowgfxepwpyjcss`** and the Vercel team/project serving **`stockflow.com.ng`**. Provide access through the connectors/build system, not pasted passwords/service keys. Establish an isolated restored project and authorised owner/manager/rep/second-business test accounts. Native release also needs owner-controlled signing/store identities and approved production configuration. These missing inputs prevent safe production certification, not local development.
