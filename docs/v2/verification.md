# StockFlow V2 verification and outstanding acceptance

**🔴 NOT READY.** Verified locally on 1 October 2026 against the reviewed source and an isolated inferred database contract. No production database writes or production deployment, real invitation emails or payment charges were made. Fixture Auth/PostgREST is an adapter for executing actual transaction SQL and rendering the application; it does not certify the live Supabase services.

## Passing evidence

| Check | Evidence | Coverage and limit |
| --- | --- | --- |
| Retained static application | `npm test`, `tests/audit.mjs` | 13 HTML pages, shared scripts and handler wiring parse; not full retained UI regression |
| Database integrity/security | `database-results.json` | 33 executable PostgreSQL checks: atomic checkout/rollback, exact retry, tenant product/customer IDs, receipt namespaces, rep stock/debt, adjustments, cancellation, journal, reporting, transactional import, role/suspension, dispatch, receiving, RLS and signup/staff authority |
| Legacy failure behavior | `legacy-guard-results.json` | 38 checks execute actual extracted retained actions with rejected/network/unconfirmed RPCs, fail-closed profiles and hostile CSV cells; assert no secondary fallback writes |
| Trusted staff handler | `staff-invite-results.json` | 7 injected-client checks of the actual Edge handler: JWT/origin/role/body authority and response-loss recovery; no mail sent |
| Edge runtime | Deno 2.9.6 `check`, pinned Supabase SDK | Local check and fresh CI npm dependency resolution/type check passed; actual deployed function/gateway/provider integration unverified |
| Mobile domain | `npm --prefix mobile test` | 17 unit checks across money/quantity/search/import/timezone/role/network behavior |
| Mobile source/export | `typecheck`, `lint`, `build` | Type/lint checks and native static export pass; not an Android/iOS binary |
| Shared workspace | `browser-results.json`, `tests/e2e-v2.mjs` | Browser-to-database product/customer/sale/receipt/report flows, duplicate clicks, lost commit response and refresh retry, offline recovery, cancellation, stock detail, linked customer history, SKU search, phone layout, hostile text, idle unlock/logout and role-specific phone sales |
| Marketing package | `website-results.json` | 375/768/1440/1920px layouts, five actual screenshot images, CTA, keyboard menu, SEO/canonical and `/workspace` registration/asset routing; no page errors or failed local requests |
| Dependencies | `dependency-results.json` | Locked root/mobile npm audit reports zero advisories at test time; this is not a penetration test |
| Independent terminals | `concurrency-results.json`, PostgreSQL 17 CI | Eight actual independent-connection races passed: last unit, duplicate key, opposite cart order, cancellation, expected-stock adjustment, dispatch, receiving and journal conservation; inferred fixture, not live Supabase |
| Native compilation | `ci-results.json`, native build run | Android debug APK and unsigned iOS simulator build/package succeeded; actual store signing/hardware acceptance remains open |

The five `assets/v2` images were captured from the actual workspace during browser QA, before adversarial inputs. They contain clearly identified fictional demo data. They are not simulated interface artwork. Website screenshots in this directory show the built marketing package.

## Performance snapshot

`performance-results.json` seeds 100,000 products and 100,000 sales in PGlite, includes opening-journal trigger overhead during setup, and records three timings plus `EXPLAIN (ANALYZE, BUFFERS)` for each query. This is synthetic query evidence, not Supabase/API latency, a multi-tenant load test or a claim about millions of transactions.

| Query | Three local timings, ms |
| --- | --- |
| Browse first 20 products | 0.71 / 0.81 / 1.09 |
| Product name/SKU substring search | 4.62 / 3.70 / 3.51 |
| Latest 20 sales | 0.70 / 0.48 / 0.48 |
| 30-day dashboard | 637.93 / 665.95 / 657.78 |

The report now selects only required header columns and shares per-product cost/sales aggregation. Against the earlier snapshot in `performance-baseline.json`, dashboard temporary reads decreased from 8,569 to 4,419 blocks and writes from 4,665 to 3,657. Timings did not establish an improvement. Remaining full-period scans/temp spills, broad/deep search and offset pagination need production-like profiling before scale claims; consider verified daily summaries/keyset pagination after real query plans and volumes are known.

## Security coverage

| Category | Verified here | Required before launch |
| --- | --- | --- |
| Authentication/session | Missing profile fails closed; authoritative role; browser idle unlock/logout; public signup metadata cannot select tenant/role in fixture | Real registration/verification/reset/refresh/revocation, brute-force limits and anti-enumeration configuration |
| IDOR/tenant/role escalation | New transaction related-record checks, active-business/role checks, movement/audit RLS and service-only invitation grants in fixture | Actual table/function/RLS/storage policies, all retained reads/writes/exports/search and wrong-tenant API attempts |
| XSS/SQL input | Workspace hostile customer text remains text; SQL data parameters; CSV formula neutralisation | Full retained screen/content/upload rendering and deployed CSP review |
| CSRF/SSRF | New invitation uses verified bearer JWT; no new server URL fetch path | Actual deployed endpoints, redirect/provider functions and legacy same-origin/session configuration |
| Files | Receipt/invoice namespace, foreign actor/tenant and traversal rejection | Private bucket ACLs, signed reads/expiry, MIME/size rules and cross-tenant uploads/downloads |
| Financial tampering | New quantity/price/cost/body/retry constraints; no client journal/audit mutations | Port/revoke remaining direct writers, returns/order receiving/payment edits/price approval and real reconciliation |
| Payments | Recorded methods and retained confirmation failure paths checked | Live atomic allocation/edit behavior; no card charging, webhook, monetary refund or subscription gateway exists to certify |

## Real-world scenarios

| User scenario | Current evidence | Remaining gate |
| --- | --- | --- |
| New business -> first value | Signup/new-tenant SQL; fixture-login -> product -> stock -> customer -> sale -> receipt -> matching dashboard | Actual Auth/email/onboarding with a newly registered business, no preseeded identity |
| Owner -> staff -> sale | Trusted invitation SQL/handler checks; rep phone sale and manager visibility in isolated workspace | Real owner invitation/password setup/revocation, retained staff/application integration |
| Multi-branch transfer | No verified branch architecture exists; excluded from advertised release | Deliberate branch data/permission/transfer design before implementation |
| Mobile -> scan -> sale -> web | Dedicated phone workflow, SKU search and shared transaction functions | Successful binaries, physical camera/denial tests, real mobile-to-web realtime and actual Auth/backend |

## Native and CI evidence

Android/iOS projects were generated and synchronized, with V2 icons/splashes, bundle ID `ng.com.stockflow.app`, version 2.0.0/build 20000, camera permission and release signing hooks. Local Android build was blocked by unavailable SDK/Gradle access, and local Xcode/CocoaPods were unavailable. CI then built an Android debug APK and an unsigned iOS simulator app successfully. Their artifacts are recorded in `ci-results.json`. No signed AAB/IPA/archive or store release is claimed.

GitHub Actions passed isolated checks, eight independent PostgreSQL connection races, browser/website QA, Android debug and iOS simulator builds on code commit `15a74804829ad9923b0291c63581b8b581ee5824`. The initial concurrency harness compared a PostgreSQL count string with a number; it was corrected and the real races then passed. The initial Android distribution download timed out; the same Gradle version now uses a smaller official binary distribution, a verified SHA-256 and longer download timeout. Workflow source alone is never success evidence. Debug/simulator artifacts do not satisfy signed release/store requirements. Physical camera, device-loss, background lifecycle, notification/provider and release signing checks remain open.

## Answers to the launch questions

| Question | Evidence-based answer |
| --- | --- |
| Does V2 solve core stock/sales problems better? | New atomic/idempotent flows, reconciliation and dedicated workspace improve verified paths. Unported returns/order/financial paths prevent a complete-platform claim. |
| Can a first-time owner use it without training? | Progressive product/customer/POS flows and empty states are implemented. Real owner usability/onboarding acceptance is still required. |
| Can a sale produce wrong inventory? | New SQL rejects tested invalid/race-prone inputs and rolls back coherent transactions. Existing direct mutation paths and real concurrency/live schema remain gates, so no absolute guarantee. |
| Can businesses access one another? | New fixture checks deny foreign identifiers and restrict reads. Actual policies/files/all legacy endpoints are inaccessible and cannot be certified. |
| Can staff manipulate sensitive records? | New role/audit rules reject tested unauthorised actions. Existing direct grants/provisioners must be inspected and closed after ports. |
| What about 100,000 products/millions of transactions? | 100,000 products/sales were query-profiled; indexing and paging are implemented. Millions of records, tenant distribution and concurrent traffic are not load-certified. |
| Can an owner operate from a phone? | Dedicated POS/inventory/sales/customers/overview flows pass browser QA. Native hardware/store acceptance is incomplete. |
| Is the website commercially credible? | Original responsive presentation and five actual product views are implemented; deployed metrics/operator-approved legal/commercial details remain. |
| Does the website explain how to start? | Clear distributor value, preserved trial terms, Get Started and product demonstration CTAs pass local routing checks. Full live signup conversion is unverified. |
| What happens during failure? | New operations retain retry identities; offline finalisation is blocked; failures stop unsafe fallback writes. Recovery/rollout runbook exists, but actual backup/restore/provider/deployment recovery is unproven. |

Outstanding production acceptance boxes remain in `launch-checklist.md`. Use the issue register and recovery runbook to close them with recorded evidence, not visual polish or a local pass count.
