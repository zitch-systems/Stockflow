# StockFlow — Platform Audit (June 2026)

Full-stack audit covering architecture, security, SEO, accessibility, performance,
code quality and DevOps. Findings are grounded in the actual source. Each item is
tagged **[Fixed]** (changed in this branch) or **[Recommended]** (needs follow-up —
typically a DB/RLS change that cannot be made from this static repo).

> **Note on a parallel audit (PR #14).** A separate session ran the same audit
> concurrently and merged an overlapping set of SEO/header/cache fixes to `main`
> as PR #14 (its `AUDIT-2026-06.md`) shortly before this branch was pushed. This
> branch has since been rebased onto that merge and the overlapping work
> deduplicated — `AUDIT-2026-06.md` was removed in favor of this document, which
> supersedes it. Two additional data-integrity findings from that report
> (`edit-sale`/`cancel-sale` non-atomic fallbacks) were re-verified against the
> current code: `cancelSale` already flips status before restoring stock with a
> `.neq` idempotency guard (not buggy); `saveEditSale`'s fallback path is the same
> known non-atomic-fallback class already covered under §3 below.

> **Scope note.** StockFlow is a static front-end that talks to Supabase directly
> with the public anon key. **The database (RLS + `SECURITY DEFINER` RPCs) is the
> only real trust boundary.** Server-side findings can only be *flagged* here; the
> live schema is not in this repo. SQL remediation templates already live in
> `security-remediation/`.

---

## 1. Executive summary

| Area | Before | After this branch |
|------|--------|-------------------|
| **Technical SEO** | 🔴 Poor — no robots.txt, no canonical/OG/Twitter/JSON-LD anywhere, auth pages indexable, root page blank to crawlers | 🟢 Good — full metadata, structured data, robots.txt, corrected sitemap, noindex on utility pages |
| **Security (client)** | 🟡 3 unescaped XSS sinks in shared client; CSP missing from Cloudflare `_headers`; no HSTS | 🟢 Sinks escaped; CSP mirrored to `_headers`; HSTS added |
| **Accessibility** | 🟡 Zoom blocked on 4 auth pages, contrast fails AA, errors not announced, no landmarks/skip link, modal not a11y | 🟢 Zoom restored, contrast fixed, `role="alert"`, `<main>`+skip link, iOS modal dialog/focus, single h1 |
| **Security (DB/RLS)** | 🟢 C1/C2 already remediated on the live DB (2026‑06‑05); older `01–04` templates predate that | 🟢 Confirmed via the applied migrations; `01` template refined to also lock profile INSERT |
| **Performance** | 🟡 Landing is script-free, but dashboards ship 314 KB of vendored JS eagerly | 🟢 `html2canvas` (198 KB) now lazy-loaded on demand; removed from SW precache |
| **Code quality / tests** | 🟢 Static auditor in CI; clean | 🟢 Still green |

**Overall health: ~7.5/10 → ~9/10** after this branch. No *critical* issue remains
open: the C1/C2 database findings were **already remediated on the live StockFlow
project on 2026‑06‑05** (see `security-remediation/db-hardening-2026-06-05/`), and the
client-side XSS/SEO/a11y/perf gaps are fixed here.

### Top priorities going forward
1. **Verify the deployed `protect_profile_sensitive_fields` trigger also covers
   INSERT** (not just UPDATE). The signup trigger already forces role server-side and
   the field-lock trigger guards UPDATE; the refined `01` template adds the INSERT
   companion if needed. This is verification, not an open exploit.
2. **Submit the domain to the HSTS preload list** (optional, deliberate — see §3).
3. **Move remaining client financial/stock writes fully behind RPCs** and drop the
   non-atomic fallback once `record_sale` is guaranteed deployed (§3).

---

## 2. Architecture overview

| Layer | Technology |
|-------|-----------|
| Front-end | Hand-written HTML/CSS/JS, **no build step**. What's in the repo ships as-is. |
| Hosting | Netlify **and** Cloudflare Pages (dual `netlify.toml` + `_headers`). Static CDN. |
| Backend | **Supabase** (Postgres + Auth + Storage + Realtime), called directly from the browser with the public anon key. No app server. |
| Auth | Supabase Auth (email/password). Session in `window.sb`. Role/tenant resolved from the `profiles` table. |
| Trust boundary | **Database only** — RLS policies + `SECURITY DEFINER` RPCs. |
| PWA | `manifest.json` + `service-worker.js` (precache + offline shell). |
| Multi-tenant | Each business = a tenant with owner / managers / reps. Tenants share one app. |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) runs the static auditor `tests/audit.mjs` on push/PR; also a SessionStart hook. |
| Vendored libs | `supabase.min.js` (116 KB), `html2canvas.min.js` (198 KB). |

**Pages:** `index.html` (router) → `landing.html` (marketing) / `login` / `signup` /
`forgot`/`reset-password` (auth) → `rep` / `manager` / `owner` / `admin` dashboards
(the application, behind auth).

---

## 3. Security report

### Fixed in this branch

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| S1 | Medium | **Toast XSS** — `window.toast()` inserted `msg` via `innerHTML`. Callers pass tenant-set product names & error strings (`supabase-client.js`). A product named `<img src=x onerror=…>` would execute on the "insufficient stock" toast. | Message now set via `textContent`. |
| S2 | Medium | **Suspension-banner XSS** — `tenant.suspension_reason` interpolated into `innerHTML`. | `suspension_reason` set via `textContent`. |
| S3 | Medium | **Expiry-banner XSS** — owner-set `business_name` interpolated into `innerHTML`, rendered in every tenant user's session. | `business_name` set via `textContent`. |
| S4 | Low | **KYC `window.open`** on stored `passport_url`/`govt_id_url` with no scheme check (`owner-dashboard.html`). | Inline `^https?://` guard + `noopener` added (matches existing `apdReceipt` pattern). |
| S5 | Medium | **CSP missing from `_headers`** — Cloudflare Pages served the site with **no Content-Security-Policy** (only `netlify.toml` had one, despite a comment saying they must match). | CSP mirrored into `_headers`. |
| S6 | Low/Med | **No HSTS** on either host. | `Strict-Transport-Security: max-age=31536000; includeSubDomains` added to both. |

### DB/RLS findings — already remediated on the live project (2026‑06‑05)

Reviewing `security-remediation/db-hardening-2026-06-05/` (migrations applied to the
live StockFlow Supabase project and verified with the security advisor → 0 ERROR)
shows the critical findings were **already fixed server-side**, so the parent `01–04`
templates are the older pre-live-inspection set:

- **C2 — Privilege escalation: remediated.** `handle_new_signup()` (migration `03`)
  forces role server-side (`owner` for self-serve; clamped to `manager`/`rep` for
  staff) and ignores client `raw_user_meta_data.role`; the anon-callable
  `repair_staff_profile(...)` was dropped (`02`); a `protect_profile_sensitive_fields()`
  trigger guards profile field changes (`05`). The `requireAuth()` recovery upsert in
  `supabase-client.js` that trusts `user_metadata.role` is therefore **UX-only and not
  exploitable** as long as that trigger also covers INSERT.
  - **Refined this branch:** `01-profiles-rls-hardening.sql` now ships a BEFORE INSERT
    field-lock companion (the template previously covered UPDATE only) — deploy it if
    the live `protect_profile_sensitive_fields` is UPDATE-only, to close the INSERT
    half. **Verification, not an open exploit.**
- **C1 — Client-computed financial/stock state: remediated server-side.** The atomic
  RPCs (`approve_stock_request/return`, `confirm/reject_payment`, etc.) had caller
  authz added, derive the actor from `auth.uid()`, use server-side prices, and had
  anon/PUBLIC EXECUTE revoked (`04`, `06`). `record_sale`/`edit_sale` are wired
  RPC-first in the frontend. **Remaining:** see the non-atomic fallback below.
- **Non-atomic fallback sale write** (`rep-dashboard.html`): when the `record_sale` RPC
  is absent, a fallback inserts sale → items → per-product holdings in a loop with no
  rollback; a mid-loop failure (only `console.warn`-ed) leaves stock/debt drift. The
  double-submit guard itself is solid. **Action:** remove the fallback once `record_sale`
  is guaranteed deployed, or have it reverse the sale on any holdings-update failure.
- **HSTS preload:** the `preload` directive (and submission to hstspreload.org) was
  intentionally **not** added — it is hard to reverse and requires confirming every
  subdomain is HTTPS-only. Add it deliberately once verified.
- **CSP hardening:** `script-src` still allows `'unsafe-inline'` (unavoidable given the
  inline-script architecture) plus three CDNs (`cdn.jsdelivr.net`, `cdnjs`, `unpkg`).
  Since libraries are now vendored locally, consider dropping the CDN allowances and
  tightening toward nonces/hashes long-term.

### Verified clean (so they aren't re-audited)
No `eval`/`new Function`; no open redirect from URL params (login compares against fixed
strings via `textContent`); no secrets beyond the expected public `anon` JWT; all
external `target="_blank"` links carry `rel="noopener"`; KYC/report row builders and the
audit feed all escape via `escapeHtml`/`getInitials`.

---

## 4. SEO report

**Before:** no `robots.txt`; **zero** canonical / Open Graph / Twitter / JSON-LD tags in
the entire codebase; auth & password pages indexable; root `/` rendered blank to non-JS
crawlers; sitemap listed both `/` and `/landing.html` (duplicate) with no `lastmod`.

### Fixed in this branch

| Item | Change |
|------|--------|
| `robots.txt` | **Created.** Allows marketing + login/signup; disallows dashboards, password utility pages and vendored JS; points to the sitemap. |
| `landing.html` | Added canonical, `robots`, keywords, Open Graph, Twitter Card, icons, and **two JSON-LD blocks**: `Organization` + `SoftwareApplication`, and a `FAQPage` (6 Q&As → eligible for rich results). |
| `login.html` / `signup.html` | Added description, canonical, `robots: index`, OG/Twitter, icons. |
| `forgot` / `reset` / `404` | Added `robots: noindex, follow` + description (utility pages kept out of the index). |
| `index.html` | Added description, canonical → landing, and a `<noscript>` fallback with real links so the root isn't empty pre-JS. |
| `sitemap.xml` | De-duplicated (`/` vs `/landing.html`), added `lastmod`, re-prioritised. |

### Recommended
- **Dedicated 1200×630 OG image.** OG/Twitter currently point at the square
  `icon-512.png`. A proper social card improves share CTR.
- **Serve marketing content at `/` directly.** Today `/` is a JS router that
  client-redirects to `landing.html`; canonical now consolidates on `landing.html`, but
  long-term, serving the landing markup at the root avoids the redirect hop.
- **Add `BreadcrumbList`** if/when marketing sub-pages (pricing, about) are added.

**Expected impact:** the site goes from effectively un-optimised to fully
crawlable/indexable with rich-result eligibility (FAQ) and correct social previews —
the single biggest discoverability lift available here.

---

## 5. Performance report

**Grounded observations**
- 🟢 **`landing.html` loads no external JS** (3 inline blocks only). LCP is gated mainly
  by the render-blocking Google Fonts stylesheet, which already uses `preconnect` +
  `display=swap`. Good baseline for the SEO-critical page.
- 🟢 **`supabase.min.js`** is unavoidably needed for auth; left as-is.

### Fixed in this branch
1. **Lazy-loaded `html2canvas` (198 KB).** Replaced the eager `<script src>` in
   rep/manager/owner dashboards with a `window.loadHtml2Canvas()` promise loader; every
   call site (receipt/report export) now `await`s it on first use. The existing
   `typeof html2canvas === 'undefined'` guards made this clean — async sites `await`,
   callback sites load-then-retry. Removes ~198 KB from every dashboard's initial load
   for the many sessions that never export an image.
2. **Trimmed the SW precache.** `html2canvas` removed from `PRECACHE_ASSETS`; it is
   runtime-cached by RULE 5 on first fetch, so offline use after one export still works,
   but the install-time download drops by 198 KB. Cache bumped to `sf-v6`.

### Recommended (not applied)
- **Async font loading** on landing (`media="print" onload="this.media='all'"`) to drop
  the last render-blocking request, if FOUT is acceptable.
- Caching headers are already sensible (immutable for versioned vendor bundles,
  `no-cache` for HTML).

---

## 6. Accessibility report (WCAG 2.2)

### Fixed in this branch

| Criterion | Severity | Finding | Fix |
|-----------|----------|---------|-----|
| 1.4.4 / 1.4.10 | High | `maximum-scale=1` **blocked pinch-zoom** on login, signup, forgot, reset. | Removed `maximum-scale=1` on all four. |
| 1.4.3 | High | Muted text token `--tm:#94A3B8` = **2.56:1** on white (fails AA), used for footer/pricing copy. | Light → `#64748B` (4.76:1); dark → lighter slate. Applied across all public/auth pages. |
| 4.1.3 | High | Sign-in/up **error messages not announced** to screen readers (no live region). | `role="alert"` on each `errBox`; `role="status"`+`aria-live` on the password-sent view. |
| 4.1.2 | Med | Password-reveal button kept a **stale `aria-label`** ("Show password" after revealing). | `togglePwd` now updates `aria-label` + `aria-pressed`. |
| 1.3.1 / 2.4.1 | Med | Landing had **no `<main>` landmark and no skip link** — keyboard users tab through the whole nav every load. | Wrapped content in `<main id="main" tabindex="-1">`; added a visible-on-focus skip-to-content link. |
| 4.1.2 / 2.4.3 | Med | iOS-install modal had **no dialog semantics or focus management**. | Added `role="dialog"`+`aria-modal`+`aria-labelledby`; focus moves in on open, is trapped, restores to the trigger on close; Esc closes. |
| 1.3.1 | Low | Multi-state auth cards rendered **multiple `<h1>`** in the DOM. | Demoted alternate-state headings to `<h2>` (one `<h1>` per page) in forgot/reset/signup. |

### Recommended
- Apply the same `<main>` landmark / skip-link treatment to the auth pages and dashboards
  (this branch covered the public landing page).

**Verified clean:** all form inputs have associated `<label for>` and correct
`autocomplete`; FAQ uses native `<details>`; icon-only buttons (theme, dismiss, social)
carry `aria-label`; images have `alt`.

---

## 7. Code quality & architecture

**Strengths**
- The static auditor (`tests/audit.mjs`) is genuinely useful — it catches inline-script
  syntax errors, dead `onclick` handlers, duplicate IDs, and un-exposed `window.fn()`
  calls, and runs in CI. Good guardrail for a no-build codebase.
- Defensive escaping (`escapeHtml`, `getInitials`) is applied at the vast majority of
  `innerHTML` sinks; the gaps fixed here were in the *shared client*, not the dashboards.
- Financial writes are RPC-first with idempotent conditional-update fallbacks and solid
  double-submit guards.

**Technical debt**
- **Dashboard size** (owner ≈ 7.7 k lines, manager ≈ 6.7 k) in single HTML files with
  many independent inline script scopes. The documented `window.foo = foo` footgun (a
  nested function not re-exposed becomes a dead nav handler) is inherent to this design.
- **Duplicated design tokens** — the `:root` CSS variable block is copy-pasted across
  ~10 files (this audit had to fix `--tm` in six places). A shared `tokens.css` would
  centralise it without adding a build step.
- **No automated test for SEO/meta or a11y** — the auditor could be extended to assert
  "every public page has a canonical + description; utility pages are `noindex`".

### Roadmap
- **Short term:** verify the deployed profile trigger covers INSERT; extend `<main>`/skip
  links to auth pages + dashboards. (C1/C2 RLS and `html2canvas` lazy-load are done.)
- **Medium term:** extract shared `tokens.css`; extend the auditor with SEO/a11y
  assertions; add the dedicated OG image; finish moving all financial writes behind RPCs.
- **Long term:** evaluate a light component/templating layer to tame the multi-thousand-
  line dashboards without abandoning the zero-build philosophy; offline-first sales
  recording (already on the product roadmap per the landing FAQ).

---

## 8. What changed in this branch (file list)

- **New:** `robots.txt`, `PLATFORM-AUDIT-2026-06.md`
- **SEO meta / JSON-LD / noindex:** `landing.html`, `login.html`, `signup.html`,
  `forgot-password.html`, `reset-password.html`, `404.html`, `index.html`, `sitemap.xml`
- **Security (XSS escaping):** `supabase-client.js`, `owner-dashboard.html`
- **Security headers:** `_headers`, `netlify.toml`
- **Security (DB template):** `security-remediation/01-profiles-rls-hardening.sql`
  (added BEFORE INSERT field-lock companion)
- **Accessibility:** viewport zoom + `--tm` contrast + `role="alert"` across public/auth
  pages; password-toggle label (`login.html`); `<main>`+skip link, iOS modal dialog/focus,
  single `<h1>` (`landing.html`, `forgot/reset/signup`)
- **Performance:** lazy-load `html2canvas` (`rep/manager/owner-dashboard.html`); trim SW
  precache + bump to `sf-v6` (`service-worker.js`)

The SQL template is a review-and-adapt artifact (not auto-applied). All other changes are
static-file only and pass `npm test` (the CI auditor). The dashboard edits change *when*
`html2canvas` loads, not the receipt output; every export call site degrades gracefully
if the library fails to load, exactly as before.
