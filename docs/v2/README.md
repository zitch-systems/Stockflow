# StockFlow V2 review package

Status: **🔴 NOT READY**. This branch contains an implemented, locally and CI-tested V2 foundation. Hosting integrations created branch previews; it has not been deployed to production, migrated, or certified against the production database. Existing production data has not been changed.

## What is implemented

A shared business workspace for desktop and phones: business overview, POS, inventory, stock detail/history, product creation/editing/import, sales/receipts/cancellation, customers/history, attention and account. The existing role dashboards remain for supplier orders, staff, expenses, approvals and administration. Native Capacitor projects use the same interface and Supabase transaction functions, with camera scanning and background/session locking.

The database migration provides atomic/idempotent checkout, quantity validation and stable product locks, stock adjustments, product/customer writes, transactional CSV import, stock conservation on dispatch, retry-safe invoice receiving, immutable client audit/movement tables, and status-aware period aggregation. Public signup creates a new tenant with an owner; it cannot accept an existing tenant/staff role from editable metadata. A trusted owner invitation function replaces temporary-password sharing. Its live Auth/provider and older-provisioner compatibility are unverified. Retained checkout, dispatch, receiving, payment confirmation and stock adjustment paths were hardened; identified financial writers still awaiting ports are launch blockers.

The marketing website contains five actual V2 interface screenshots with explicitly fictional data, responsive device framing, original distributor-focused copy, the existing 14-day trial, honest feature boundaries and SEO metadata. No testimonials, customer logos or paid pricing were invented.

## Read in this order

1. [System map](system-map.md): actual product, source of truth and unsupported modules.
2. [Architecture and permissions](architecture.md): implementation choices and operational boundaries.
3. [Issue register](issue-register.md): P0/P1 evidence, staged fixes and remaining blockers.
4. [Change register](change-register.md) and [design system](design-system.md).
5. [Verification](verification.md): passing tests, measured performance and coverage limits.
6. [Deployment and recovery](deployment-runbook.md): backup, restored staging copy, rollout and rollback gates.
7. [Launch checklist](launch-checklist.md): acceptance criteria and the remaining project-access requirements.

Executable evidence: `database-results.json` (33 checks), `staff-invite-results.json` (7 handler checks), `browser-results.json` (16 flows), `legacy-guard-results.json` (32 checks), `concurrency-results.json` (8 independent PostgreSQL connection checks), `website-results.json`, `performance-results.json` and `ci-results.json`. CI passed the reviewed source, including Android debug APK and unsigned iOS simulator builds. Build artifacts are available in the linked native run. Signed store releases and physical-device camera testing remain separate gates.

## Reproduce locally

Node 22 is the CI baseline. From the repository root:

```sh
npm ci
npm --prefix mobile ci
npm test
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run build
npx playwright install chromium
npm run test:e2e
npm run build:web
npm run test:website
npm run benchmark:v2
```

`mobile/out/` is the native export. `mobile/.next-web/` is the prefixed website export, published as `dist/workspace/`. Do not substitute one output for the other. The website build publishes public assets only and does **not** run database migrations. Local QA blocks every external browser request and uses a disposable fixture database.

Production completion requires the actual Supabase project `fjmkenowgfxepwpyjcss` and StockFlow hosting account, a verified backup/restore, remaining financial-writer ports and mutation revocation, real Auth/staff tests, private Storage verification, native builds/device tests and operator-approved policies. See the checklist for exact evidence.
