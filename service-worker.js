// ============================================================================
// StockFlow Service Worker — v2
// Strategy: Network-first for HTML/API, Cache-first for assets
// ============================================================================

const CACHE_VERSION = 'sf-v6';  // bumped: XSS-escaping + a11y/SEO fixes in supabase-client.js & auth pages
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_PAGES   = `${CACHE_VERSION}-pages`;

// Files to pre-cache on install (app shell). Assets are served cache-first
// (RULE 5), so bump CACHE_VERSION above whenever any of these change to force
// clients off the stale copy.
const PRECACHE_ASSETS = [
  '/supabase.min.js',
  // html2canvas (~198KB) is intentionally NOT precached — it is loaded on demand
  // (only when a receipt/report is exported) and runtime-cached by RULE 5 on first
  // fetch, so it stays out of the install-time download for users who never export.
  '/supabase-client.js',
  '/stockflow-device.js',
  '/stockflow-responsive.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// Never cache these domains — always go straight to network
const NEVER_CACHE = [
  'supabase.co',      // ALL Supabase API calls — auth, db, storage, realtime
  'supabase.in',      // Supabase alt domain
  'googleapis.com',   // Google Fonts API
  'gstatic.com',      // Google Fonts files
];

// Pages that must NEVER be served from cache (auth-state-sensitive)
// The SW will always fetch fresh from network for these.
const NO_CACHE_PAGES = [
  '/signup.html',
  '/login.html',
  '/forgot-password.html',
  '/reset-password.html',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('sf-') && k !== CACHE_STATIC && k !== CACHE_PAGES)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── RULE 1: Only handle GET — let all other methods pass through unmodified.
  // This is critical: POST to /auth/v1/signup MUST NOT be intercepted.
  // If we call event.respondWith() for a non-GET and the handler fails,
  // the browser reports "message channel closed before a response was received".
  if (request.method !== 'GET') return;

  // ── RULE 2: Never intercept cross-origin requests to sensitive domains.
  if (NEVER_CACHE.some(domain => url.hostname.includes(domain))) return;

  // ── RULE 3: Only handle http(s) — skip chrome-extension://, blob://, etc.
  if (!url.protocol.startsWith('http')) return;

  // ── RULE 4: Auth/signup pages — network only, no caching.
  // These pages check session state on every load; serving from cache would
  // show logged-out users a stale page or skip the email-token handler.
  if (NO_CACHE_PAGES.some(p => url.pathname === p || url.pathname.endsWith(p))) {
    event.respondWith(
      fetch(request).catch(() => new Response('Offline — check your internet connection.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      }))
    );
    return;
  }

  // ── RULE 5: Static assets (JS, CSS, images, fonts) — Cache-first.
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot)$/) ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok && response.status < 400) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ── RULE 6: Dashboard HTML pages — Network-first, fall back to cache.
  if (
    request.headers.get('accept')?.includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Only cache successful responses
          if (response.ok && response.status < 400) {
            const clone = response.clone();
            caches.open(CACHE_PAGES).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/login.html'))
        )
    );
    return;
  }

  // ── RULE 7: Everything else — network only (no caching).
  // This covers font files from gstatic that weren't caught above, etc.
});
