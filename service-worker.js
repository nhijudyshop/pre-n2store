/**
 * N2STORE SERVICE WORKER
 * File: service-worker.js
 * Purpose: Offline caching, performance optimization
 */

const CACHE_VERSION = 'n2store-v1.0.0';
const CACHE_NAME = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Files to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/js/common-utils.js',
    '/js/logger.js',
    '/js/firebase-config.js',
    '/js/dom-utils.js',
    '/js/event-manager.js',
    '/js/shared-cache-manager.js',
    '/js/shared-auth-manager.js',
    '/js/core-loader.js',
    '/js/optimization-helper.js',
    '/js/navigation-modern.js'
];

// CDN resources (cache separately)
const CDN_URLS = [
    'https://www.gstatic.com/firebasejs/',
    'https://unpkg.com/lucide@latest',
    'https://cdnjs.cloudflare.com/'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Caching static assets');
            // Don't fail if some assets don't exist
            return Promise.allSettled(
                STATIC_ASSETS.map(url =>
                    cache.add(url).catch(err => {
                        console.warn(`[ServiceWorker] Failed to cache: ${url}`, err);
                    })
                )
            );
        }).then(() => {
            console.log('[ServiceWorker] Install complete');
            return self.skipWaiting(); // Activate immediately
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName.startsWith('n2store-') && cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
                        console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[ServiceWorker] Activation complete');
            return self.clients.claim(); // Take control immediately
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Firebase API calls (always fetch fresh)
    if (url.hostname.includes('firebasestorage') ||
        url.hostname.includes('firebaseio') ||
        url.hostname.includes('firestore')) {
        return;
    }

    // Strategy: Cache First, falling back to Network
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                console.log('[ServiceWorker] Serving from cache:', url.pathname);

                // Update cache in background for CDN resources
                if (isCDNUrl(url)) {
                    updateCacheInBackground(request);
                }

                return cachedResponse;
            }

            // Not in cache, fetch from network
            return fetch(request).then((response) => {
                // Don't cache if not successful
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }

                // Clone response (can only be consumed once)
                const responseToCache = response.clone();

                // Decide which cache to use
                const cacheName = isCDNUrl(url) ? CACHE_NAME : DYNAMIC_CACHE;

                // Cache the response
                caches.open(cacheName).then((cache) => {
                    cache.put(request, responseToCache);
                    console.log('[ServiceWorker] Cached new resource:', url.pathname);
                });

                return response;
            }).catch((error) => {
                console.error('[ServiceWorker] Fetch failed:', url.pathname, error);

                // Return offline page for HTML requests
                if (request.headers.get('accept').includes('text/html')) {
                    return caches.match('/index.html');
                }

                throw error;
            });
        })
    );
});

// Helper: Check if URL is from CDN
function isCDNUrl(url) {
    return CDN_URLS.some(cdn => url.href.startsWith(cdn));
}

// Helper: Update cache in background (stale-while-revalidate)
function updateCacheInBackground(request) {
    fetch(request).then((response) => {
        if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
            });
        }
    }).catch(() => {
        // Silently fail - we already have cached version
    });
}

// Message event - allow clearing cache from app
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
                event.ports[0].postMessage({ success: true });
            })
        );
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[ServiceWorker] Script loaded');
