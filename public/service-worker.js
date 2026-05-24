// ============================================================================
// StockFlow Service Worker — Next.js port
// Strategy: Network-first for HTML, Cache-first for hashed static assets.
// ============================================================================

const CACHE_VERSION = 'sf-next-v1';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_PAGES = `${CACHE_VERSION}-pages`;

const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

// Never intercept — go straight to network (no SW caching).
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'supabase.in',
  'googleapis.com',
  'gstatic.com',
];

// Auth-state-sensitive routes — never serve from cache.
const NO_CACHE_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith('sf-') && k !== CACHE_STATIC && k !== CACHE_PAGES,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.includes(h))) return;

  // Never cache server actions, API routes, Next.js internals (Turbopack HMR, RSC).
  if (
    url.pathname.startsWith('/_next/static/chunks/') === false &&
    (url.pathname.startsWith('/_next/') ||
      url.pathname.startsWith('/api/') ||
      url.searchParams.has('_rsc'))
  ) {
    return;
  }

  // Auth/landing pages — network only, with a friendly offline message.
  if (NO_CACHE_PATHS.includes(url.pathname)) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response('Offline — check your internet connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          }),
      ),
    );
    return;
  }

  // Hashed static chunks + images + fonts — cache-first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    url.pathname.match(
      /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot)$/,
    ) ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok && response.status < 400) {
              const clone = response.clone();
              caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
            }
            return response;
          })
          .catch(() => cached || new Response('', { status: 503 }));
      }),
    );
    return;
  }

  // Everything else (dashboard pages) — network-first, cache fallback.
  if (
    request.headers.get('accept')?.includes('text/html') ||
    url.pathname.startsWith('/dashboard')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.status < 400) {
            const clone = response.clone();
            caches.open(CACHE_PAGES).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/login')),
        ),
    );
  }
});
