# StockFlow — project guide

Sales & inventory management **PWA for Nigerian distributors**. Multi-tenant SaaS:
each tenant (business) has an owner, optional managers, and sales reps who sell
stock on credit and record payments.

## Architecture

- **Static front-end, no build step.** Plain hand-written HTML/CSS/JS served as
  files (Netlify / Cloudflare Pages). There is no bundler, framework, or
  transpile — what's in the repo is what ships. Open the `.html` files directly.
- **Supabase is the backend**, talked to **directly from the browser** with the
  public **anon key** (`supabase-client.js`). There is no app server.
- **The database (RLS policies + SECURITY DEFINER functions) is the ONLY trust
  boundary.** `window.sb` and every value the client sends are fully attacker-
  controllable from the dev console. Never assume client-side checks protect
  anything — they are UX only.

### Key files

| File | Role |
|------|------|
| `supabase-client.js` | Shared auth (`requireAuth`), toasts, uploads, realtime, helpers. Loaded by every page. |
| `login/signup/forgot/reset-password.html` | Auth flows. |
| `rep-dashboard.html` | Sales rep app (sell, stock requests, ledger, receipts). |
| `manager-dashboard.html` | Manager app (approvals, reps, inventory). |
| `owner-dashboard.html` | Owner app — biggest file; supports `solo` and `owner_rep` business modes. |
| `admin-dashboard.html` | Super-admin (tenants, billing). Desktop-style layout (no bottom nav). |
| `stockflow-responsive.css` | Tablet/foldable/desktop layer (see below). |
| `stockflow-device.js` | Device auto-detection → `data-device` on `<html>`. |
| `tests/audit.mjs` | Dependency-free static auditor (the test suite). |
| `security-remediation/` | SQL templates for the C1/C2 findings (review-and-adapt; the live DB is not in this repo). |

## Conventions & gotchas

- **Dashboards are huge** (owner ≈ 7k lines). Use `grep`/targeted reads; don't
  read whole files. Each has its own inline `<style>` and multiple `<script>`
  blocks. **Each classic `<script>` is its own top-level scope.**
- **`function foo()` at column 0 is a global** (`window.foo` works). A function
  **indented inside an IIFE** is NOT global — to call it from another block /
  the nav handler you must assign `window.foo = foo` *inside that IIFE*. Several
  nav renderers were dead because this was forgotten (now fixed + linted).
- **Escape all user/DB data rendered via `innerHTML`** with `escapeHtml(...)`.
  `window.escapeHtml` must be assigned (owner-dashboard relied on it but hadn't,
  silently disabling escaping — fixed). Tenants share an app; a rep's
  `full_name`/notes render in the owner's higher-privilege session.
- **Financial/stock writes have no DB transaction today** (client does multi-
  step writes). Guard against double-submits and restore-order bugs; prefer
  flipping authoritative status *before* adjusting stock. The real fix is
  server-side RPCs — see `security-remediation/README.md`.
- **Design system (rep/manager/owner):** `.topbar` (sticky header), `.page` /
  `.page.active` (tab pages), `.bnav` + `.ni` (fixed bottom nav, items `flex:1`),
  `.overlay` + `.sheet` (bottom-sheet modals). CSS vars in `:root` (`--brand`,
  `--surface`, `--nav`, …). admin-dashboard uses a different layout.

## Responsive (tablet / foldable / desktop)

`stockflow-responsive.css` only activates at **≥768px** — the phone layout is
untouched. It centers `.page.active` into a readable column and aligns the
header/nav to it; bottom sheets become centered dialogs. `stockflow-device.js`
sets `data-device` (`phone`/`tablet`/`foldable`/`desktop`) and `data-orientation`
on `<html>`, exposes `window.sfDevice`, and fires `sf:devicechange`. The PWA
`manifest.json` orientation is `any` so large screens can rotate.

## Testing

```sh
npm test          # node tests/audit.mjs  — fails (exit 1) on any ERROR
npm run test:warn # also show non-fatal warnings
```

The auditor catches, across every page: JS **syntax errors** in inline scripts,
**dead inline handlers** (`onclick="fn()"` where `fn` is defined nowhere),
**duplicate static IDs**, **dead `window.fn()` calls** (nested fn never exposed),
and (warn) **dangling `getElementById`** refs. It runs in CI (`.github/workflows/ci.yml`)
on every push/PR and as a SessionStart hook. **Run it after editing any page.**

> Note: the Supabase MCP server connected in some sessions points at a *different*
> org, not StockFlow's project (`fjmkenowgfxepwpyjcss`). You cannot inspect or
> migrate the live StockFlow DB from here — don't point the front-end at RPCs
> that haven't actually been deployed.
