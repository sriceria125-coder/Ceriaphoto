// Service Worker untuk Photobooth PWA
// Cache-first strategy untuk aset statis

const CACHE_NAME = 'photobooth-v1.0.0';
const RUNTIME_CACHE = 'photobooth-runtime-v1';

// File yang di-cache saat install (app shell)
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// ===== INSTALL =====
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching app shell');
                return cache.addAll(PRECACHE_URLS.map(url => {
                    // Buat request dengan mode no-cors untuk icon jika cross-origin
                    return new Request(url, { cache: 'reload' });
                })).catch(err => {
                    console.warn('[SW] Some assets failed to cache:', err);
                    // Tetap lanjutkan meski sebagian gagal
                    return Promise.resolve();
                });
            })
            .then(() => self.skipWaiting())
    );
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ===== FETCH =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip cross-origin requests (kecuali yang diizinkan)
    if (url.origin !== self.location.origin) return;

    // Skip chrome-extension, dll
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Skip request ke kamera / media stream
    if (request.destination === 'video' || request.destination === 'audio') return;

    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Update cache di background (stale-while-revalidate)
                    fetch(request)
                        .then((networkResponse) => {
                            if (networkResponse && networkResponse.status === 200) {
                                caches.open(RUNTIME_CACHE)
                                    .then(cache => cache.put(request, networkResponse.clone()));
                            }
                        })
                        .catch(() => {});
                    return cachedResponse;
                }

                // Tidak ada di cache - fetch dari network
                return fetch(request)
                    .then((networkResponse) => {
                        // Cache response baru
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(RUNTIME_CACHE)
                                .then(cache => cache.put(request, responseClone));
                        }
                        return networkResponse;
                    })
                    .catch((error) => {
                        console.warn('[SW] Fetch failed:', request.url, error);
                        // Fallback: jika HTML, return index.html cached
                        if (request.mode === 'navigate' || request.destination === 'document') {
                            return caches.match('./index.html');
                        }
                        // Return error response
                        return new Response('Offline - resource tidak tersedia', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({ 'Content-Type': 'text/plain' })
                        });
                    });
            })
    );
});

// ===== MESSAGE =====
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
        );
    }
});