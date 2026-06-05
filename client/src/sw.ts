/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, type PrecacheEntry } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};
declare const __BUILD_HASH__: string;

// CACHE_NAME is derived from the build hash injected by Vite at build time.
// It changes automatically on every deploy — no manual version bump needed.
const SHELL_CACHE = `quikpik-shell-${__BUILD_HASH__}`;
const API_CACHE = `quikpik-api-${__BUILD_HASH__}`;

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

// Workbox injects the content-hash precache manifest here at build time.
// Every changed asset gets a fresh revision, so stale assets are never served.
precacheAndRoute(self.__WB_MANIFEST);

// Remove precache entries from previous builds on activate.
cleanupOutdatedCaches();

// API calls — NetworkFirst so fresh data is preferred; falls back to cache.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 120, maxEntries: 50 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Static assets — CacheFirst for speed.
registerRoute(
  ({ url }) => url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: SHELL_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// App shell — cache on install, serve from cache with network fallback.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Delete every cache that does not belong to the current build on activate.
self.addEventListener('activate', (event) => {
  const currentCaches = new Set([SHELL_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !currentCaches.has(k) && (k.startsWith('quikpik-shell-') || k.startsWith('quikpik-api-')))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});
