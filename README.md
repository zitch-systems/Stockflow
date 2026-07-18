# StockFlow

Sales & inventory management for Nigerian distributors — multi-tenant SaaS on
Supabase.

- **Web PWA (repo root)** — hand-written static HTML/CSS/JS, no build step,
  deployed to Netlify/Cloudflare Pages. `npm test` runs the dependency-free
  static auditor.
- **Mobile app ([`mobile/`](mobile/))** — Next.js static export wrapped with
  Capacitor; Android APK built on Codemagic (`codemagic.yaml`). See
  [`mobile/README.md`](mobile/README.md).

Project conventions and architecture notes live in [`CLAUDE.md`](CLAUDE.md).
