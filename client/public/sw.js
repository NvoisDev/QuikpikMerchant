const CACHE_NAME = 'quikpik-shell-v2';
const API_CACHE_NAME = 'quikpik-api-v1';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

/**
 * Only cache these public, non-authenticated API endpoints.
 * Authenticated/user-scoped endpoints (orders, customers, profile, etc.)
 * are intentionally excluded to prevent cross-user data leakage.
 */
const CACHEABLE_API_PATTERNS = [
  /^\/api\/marketplace\/featured/,
  /^\/api\/marketplace\/products/,
  /^\/api\/marketplace\/wholesalers/,
  /^\/api\/marketplace\/wholesaler\//,
  /^\/api\/wholesalers\/all/,
  /^\/api\/wholesaler\/[^/]+$/,
  /^\/api\/customer-products\//,
  /^\/api\/public\//,
  /^\/api\/products\/[^/]+\/stock-status/,
];

function isCacheableApiRequest(pathname) {
  return CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(pathname));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/**
 * Listen for a 'CLEAR_API_CACHE' message sent from the app on logout.
 * This ensures no cached API responses persist across auth sessions.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE_NAME);
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    if (!isCacheableApiRequest(url.pathname)) {
      return;
    }

    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => {
            if (cached) return cached;
            return new Response(JSON.stringify({ error: 'Offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });

          return cached || networkFetch;
        });
      })
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match('/') || new Response('Offline', { status: 503 }))
  );
});
