const CACHE_NAME = 'route-assigner-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache opened');
                return cache.addAll(urlsToCache);
            })
            .catch((err) => {
                console.log('Cache failed:', err);
            })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests (POST, PUT, etc. cannot be cached)
    if (request.method !== 'GET') {
        return;
    }

    // Skip external APIs and third-party resources
    const skipUrls = [
        'maps.googleapis.com',
        'maps.google.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com',
        'basemaps.cartocdn.com',
        'api.maptiler.com',
        'socket.io',
        'easypanel.host/api',  // Skip API calls
        'n8n'
    ];

    if (skipUrls.some(skip => url.href.includes(skip))) {
        return;
    }

    // Only cache assets from our own origin
    if (url.origin !== location.origin) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                // Only cache successful responses for GET requests
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache for offline support
                return caches.match(request);
            })
    );
});

