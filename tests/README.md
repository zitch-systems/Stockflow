# StockFlow static audit

`audit.mjs` is a **dependency-free** static analyzer for the StockFlow
front-end. It needs only Node (≥18) — no `npm install`, no browser — so it runs
anywhere and in CI.

```sh
npm test                      # audit every page; exit 1 on any ERROR
npm run test:warn             # also print non-fatal WARNINGS
node tests/audit.mjs file.html  # audit a single page
```

## Why this exists

StockFlow is hand-written static HTML/JS with **no build step**, so whole
classes of bug ship silently: a button whose `onclick` calls a renamed
function, a stray syntax error that kills an entire `<script>` block, a
duplicated `id`, or a function that's invoked via `window.fn()` but was never
put on `window`. This auditor turns those into hard CI failures.

## Checks

| Check | Level | Catches |
|-------|-------|---------|
| **JS syntax** | error | Any inline `<script>` (and the shared `.js` modules) that fails to parse, via Node's `vm`. |
| **Dead handlers** | error | `on*="name(...)"` where `name` resolves to no defined global (incl. functions from local `<script src>` includes) and isn't a browser builtin. |
| **Duplicate IDs** | error | The same `id="…"` twice in *static* markup (ids inside JS template strings are ignored). |
| **Dead window calls** | error | `window.fn(...)` where `fn` is a function nested in an IIFE and never assigned to `window` (top-level `function`/`var` are auto-global and exempt). |
| **Dangling refs** | warn | `getElementById('x')` with no matching static `id="x"` (often created dynamically — informational). |

## Design notes / avoiding false positives

- **Cross-file globals:** the auditor follows each page's local `<script src>`
  includes (e.g. `supabase-client.js`, `stockflow-device.js`) so shared globals
  like `window.logout` resolve. Vendored `*.min.js` bundles are skipped.
- **Template-string ids** (`id="${...}"`, `id="'+x+'"`) are excluded from
  duplicate detection — only real static markup is checked.
- **Top-level vs nested functions:** a `function foo()` at column 0 creates a
  global; one indented inside an IIFE does not. The dead-window-call check
  understands this distinction, which is exactly the bug pattern that left
  several owner-dashboard nav renderers (`renderSlInvGrid`, …) dead.

When adding a page, add it to `DEFAULT_PAGES` in `audit.mjs`.
