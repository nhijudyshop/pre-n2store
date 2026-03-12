/**
 * N2STORE SERVICE WORKER
 * File: service-worker.js
 * Purpose: Offline caching, performance optimization
 *
 * Cache Strategies:
 * 1. Stale-while-revalidate: Static assets (JS, CSS, HTML, images)
 * 2. Network-first with 5s timeout: API calls (Firebase, Cloudflare Worker proxy)
 * 3. Cache-first with 7-day expiry: CDN resources (Firebase SDK, Lucide, cdnjs)
 */

const CACHE_VERSION = 'n2store-v2.0.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_API = `${CACHE_VERSION}-api`;
const CACHE_CDN = `${CACHE_VERSION}-cdn`;

const NETWORK_TIMEOUT_MS = 5000;
const CDN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CDN_TIMESTAMP_HEADER = 'sw-cache-timestamp';

// Static assets to pre-cache on install — correct paths under /shared/
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/shared/js/common-utils.js',
    '/shared/js/logger.js',
    '/shared/js/firebase-config.js',
    '/shared/js/dom-utils.js',
    '/shared/js/event-manager.js',
    '/shared/js/shared-cache-manager.js',
    '/shared/js/shared-auth-manager.js',
    '/shared/js/core-loader.js',
    '/shared/js/optimization-helper.js',
    '/shared/js/navigation-modern.js',
    '/shared/js/permissions-helper.js',
    '/shared/js/date-utils.js',
    '/shared/browser/auth-manager.js',
    '/shared/browser/cache-manager.js',
    '/shared/browser/common-utils.js',
    '/shared/browser/firebase-config.js',
    '/shared/browser/logger.js',
    '/shared/browser/dom-utils.js',
    '/shared/browser/date-utils.js'
];

// Patterns for strategy matching
const STATIC_PATTERNS = ['/shared/js/', '/shared/browser/', '.css', '.html', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2'];
const API_PATTERNS = ['/api/', 'googleapis.com', 'cloudfunctions.net'];
const CDN_PATTERNS = ['gstatic.com', 'unpkg.com', 'cdnjs.cloudflare.com'];
const FIREBASE_EXCLUDED = ['firebasestorage', 'firebaseio', 'firestore'];

// --- Strategy Selection ---

/**
 * Determine which cache strategy to use for a given URL.
 * @param {URL} url
 * @returns {'stale-while-revalidate'|'network-first'|'cache-first'|null}
 */
function getCacheStrategy(url) {
    const href = url.href;
    const pathname = url.pathname;

    // CDN check first (external origins)
    if (CDN_PATTERNS.some(p => href.includes(p))) {
        return 'cache-first';
    }

    // API check
    if (API_PATTERNS.some(p => href.includes(p))) {
        return 'network-first';
    }

    // Static assets
    if (STATIC_PATTERNS.some(p => pathname.includes(p) || pathname.endsWith(p))) {
        return 'stale-while-revalidate';
    }

    // Same-origin HTML/JS/CSS files not matched above — treat as static
    if (url.origin === self.location.origin) {
        return 'stale-while-revalidate';
    }

    return null;
}

// --- Cache Helpers ---

/**
 * Try to open a cache, handling quota errors by evicting the oldest cache.
 * @param {string} cacheName
 * @returns {Promise<Cache>}
 */
async function openCacheSafe(cacheName) {
    try {
        return await caches.open(cacheName);
    } catch (err) {
        console.warn('[ServiceWorker] Cache open failed, evicting oldest cache:', err);
        await evictOldestCache();
        return await caches.open(cacheName);
    }
}

/**
 * Delete the oldest n2store cache to free space.
 */
async function evictOldestCache() {
    const keys = await caches.keys();
    const n2storeCaches = keys.filter(k => k.startsWith('n2store-'));
    if (n2storeCaches.length > 0) {
        const oldest = n2storeCaches[0];
        console.log('[ServiceWorker] Evicting oldest cache:', oldest);
        await caches.delete(oldest);
    }
}

/**
 * Put a response into cache, handling quota errors.
 * @param {string} cacheName
 * @param {Request} request
 * @param {Response} response
 */
async function cachePutSafe(cacheName, request, response) {
    try {
        const cache = await openCacheSafe(cacheName);
        await cache.put(request, response);
    } catch (err) {
        console.warn('[ServiceWorker] Failed to cache resource:', request.url, err);
        // Evict and retry once
        try {
            await evictOldestCache();
            const cache = await caches.open(cacheName);
            await cache.put(request, response);
        } catch (retryErr) {
            console.warn('[ServiceWorker] Cache put retry failed:', retryErr);
        }
    }
}

// --- Strategy Implementations ---

/**
 * Stale-while-revalidate: Serve from cache immediately, update cache in background.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);

    // Always kick off a network fetch to update cache
    const networkFetch = fetch(request).then(async (response) => {
        if (response && response.ok) {
            await cachePutSafe(CACHE_STATIC, request, response.clone());
        }
        return response;
    }).catch(() => {
        console.warn('[ServiceWorker] Background revalidate failed:', request.url);
        return null;
    });

    // Return cached version immediately if available, otherwise wait for network
    if (cached) {
        return cached;
    }

    const networkResponse = await networkFetch;
    if (networkResponse) {
        return networkResponse;
    }

    console.warn('[ServiceWorker] No cache or network for:', request.url);
    return new Response('Service Unavailable', { status: 503 });
}

/**
 * Network-first with timeout: Try network with 5s timeout, fallback to cache.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
    try {
        const response = await promiseWithTimeout(fetch(request), NETWORK_TIMEOUT_MS);
        if (response && response.ok) {
            await cachePutSafe(CACHE_API, request, response.clone());
        }
        return response;
    } catch (err) {
        // Timeout or network error — fallback to cache
        console.warn('[ServiceWorker] Network-first timeout/error, falling back to cache:', request.url);
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        return new Response(JSON.stringify({ error: 'Network unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Cache-first with 7-day expiry: Serve from cache, refresh if expired.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);

    if (cached) {
        // Check if cache entry is expired (7 days)
        const cachedTime = cached.headers.get(CDN_TIMESTAMP_HEADER);
        const isExpired = cachedTime && (Date.now() - parseInt(cachedTime, 10)) > CDN_MAX_AGE_MS;

        if (!isExpired) {
            return cached;
        }

        // Expired — try network, but return stale if network fails
        console.log('[ServiceWorker] CDN cache expired, refreshing:', request.url);
    }

    // Fetch from network
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            // Clone and add timestamp header for expiry tracking
            const headers = new Headers(response.headers);
            headers.set(CDN_TIMESTAMP_HEADER, String(Date.now()));
            const timestampedResponse = new Response(await response.clone().blob(), {
                status: response.status,
                statusText: response.statusText,
                headers
            });
            await cachePutSafe(CACHE_CDN, request, timestampedResponse);
            return response;
        }
        // Non-ok response — return stale cache if available
        if (cached) {
            return cached;
        }
        return response;
    } catch (err) {
        console.warn('[ServiceWorker] CDN fetch failed:', request.url);
        if (cached) {
            return cached;
        }
        return new Response('CDN Unavailable', { status: 503 });
    }
}

/**
 * Race a promise against a timeout.
 * @param {Promise} promise
 * @param {number} ms
 * @returns {Promise}
 */
function promiseWithTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Network timeout')), ms);
        promise.then((val) => {
            clearTimeout(timer);
            resolve(val);
        }).catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// --- Service Worker Lifecycle Events ---

// Install event — pre-cache static assets
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing v2...');

    event.waitUntil(
        caches.open(CACHE_STATIC).then((cache) => {
            console.log('[ServiceWorker] Pre-caching static assets');
            return Promise.allSettled(
                STATIC_ASSETS.map(url =>
                    cache.add(url).catch(err => {
                        console.warn(`[ServiceWorker] Failed to pre-cache: ${url}`, err);
                    })
                )
            );
        }).then(() => {
            console.log('[ServiceWorker] Install complete');
            return self.skipWaiting();
        })
    );
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating v2...');

    const currentCaches = [CACHE_STATIC, CACHE_API, CACHE_CDN];

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName.startsWith('n2store-') && !currentCaches.includes(cacheName)) {
                        console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[ServiceWorker] Activation complete');
            return self.clients.claim();
        })
    );
});

// Fetch event — route to appropriate cache strategy
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Firebase storage/realtime/firestore API calls (always fetch fresh)
    if (FIREBASE_EXCLUDED.some(pattern => url.hostname.includes(pattern))) {
        return;
    }

    const strategy = getCacheStrategy(url);

    if (!strategy) {
        return;
    }

    switch (strategy) {
    case 'stale-while-revalidate':
        event.respondWith(staleWhileRevalidate(request));
        break;
    case 'network-first':
        event.respondWith(networkFirst(request));
        break;
    case 'cache-first':
        event.respondWith(cacheFirst(request));
        break;
    }
});

// Message event — allow clearing cache and skip waiting from app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName.startsWith('n2store-')) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }).then(() => {
                console.log('[ServiceWorker] All caches cleared');
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage({ success: true });
                }
            })
        );
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[ServiceWorker] Script loaded (v2)');
