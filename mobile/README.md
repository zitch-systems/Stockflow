# StockFlow mobile app

Native mobile packaging of StockFlow: a **Next.js 16 static export** wrapped
with **Capacitor**, built into an Android APK on **Codemagic**. It signs into
the **same Supabase project** as the web app — accounts, tenants, roles and
data are shared, and the database's RLS policies remain the only trust
boundary (the anon key here is a public client credential, exactly like
`supabase-client.js` at the repo root — never put a service key anywhere in
this app).

Current scope (setup stage):

- Branded splash that routes on the persisted session.
- Sign-in mirroring the web `login.html` flow (`signInWithPassword` → profile
  `role`/`is_active` check), including resend-confirmation and friendly
  offline errors.
- Authenticated home screen: profile, role, hand-off into the role's full
  dashboard on <https://stockflow.com.ng>, sign out.
- Light/dark theme with the StockFlow design tokens (same `sf_theme` key).

Native sales/inventory screens are the next step; the full dashboards continue
to live in the web app until they are ported.

## Commands

```sh
npm ci               # install (Node >= 20.9)
npm run dev          # dev server on http://localhost:3000
npm run lint         # eslint (Next.js flat config)
npm run typecheck    # tsc --noEmit
npm test             # vitest unit tests
npm run build        # static export → out/
npx cap add android  # generate android/ (gitignored; CI does this per build)
npx cap sync android # copy out/ + plugins into android/
```

To open in Android Studio after the above: `npx cap open android`.

## Configuration

Defaults are baked in so a fresh clone builds with zero setup. Override via
env (`.env.local` locally, environment variables in CI):

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the shared StockFlow project | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the shared public anon key | Supabase anon key (public) |
| `NEXT_PUBLIC_WEB_APP_URL` | `https://stockflow.com.ng` | Where dashboard hand-off links point |

## Codemagic (CI/CD for the APK)

`codemagic.yaml` at the **repo root** defines one workflow:

| Workflow | What it does |
|---|---|
| `android-debug` | npm ci → `next build` → `cap add android` + `cap sync` → `gradlew assembleDebug`. Publishes the **debug APK** as a build artifact. |

Lint / unit tests / static export are handled for free by GitHub Actions
(`.github/workflows/mobile-ci.yml`) on every push and PR — Codemagic's job
here is the APK build itself.

One-time setup in the Codemagic dashboard (requires a Codemagic account —
this cannot be automated from the repo):

1. <https://codemagic.io> → **Add application** → connect GitHub → pick
   `zitch-systems/stockflow`.
2. Choose **codemagic.yaml** as the configuration source — both workflows are
   auto-detected from the file.
3. Start `android-debug`; download the APK from the build's **Artifacts** tab
   and install it on a device (enable "install from unknown sources").

### Moving to a signed release later

1. Generate an upload keystore (`keytool -genkey ...`) and add it under
   Codemagic → Team settings → **Code signing identities** (or an env group).
2. Add a `signingConfig` to the generated Android project — at that point,
   commit `android/` (remove it from `.gitignore`) so the config persists.
3. Switch the build step to `./gradlew bundleRelease` and add Google Play
   publishing to the workflow.

iOS: `npx cap add ios` works the same way, but building requires a macOS
instance (`mac_mini_m2`) plus an Apple Developer account and signing files —
add an `ios-*` workflow to `codemagic.yaml` when that's on the roadmap.

## Layout

```
mobile/
├── capacitor.config.ts     appId ng.com.stockflow.app, webDir out/
├── next.config.ts          output: 'export' (no server at runtime)
├── src/
│   ├── app/                layout (fonts, theme init, CSP meta), splash,
│   │   ├── login/          sign-in (mirrors web login.html)
│   │   └── home/           authenticated landing
│   ├── components/         ThemeToggle
│   └── lib/                supabase client, roles, formatting (+ unit tests)
├── public/                 icons (copied from the web app)
└── resources/icon.png      source icon for native icon generation
```

Notes for future work:

- `android/` and `ios/` are **generated** (`npx cap add ...`) and gitignored
  until native customization begins.
- Fonts are self-hosted at build time via `next/font` — no runtime Google
  Fonts request, so the app renders fully offline.
- Keep `src/lib/format.ts` in sync with `src/lib/format.ts` on the
  `nextjs-migration` branch.
- The root static auditor (`npm test` at the repo root) does not cover
  `mobile/` — this app has its own lint/tests via `.github/workflows/mobile-ci.yml`
  and Codemagic.
