const CACHE_NAME = 'gps-navigator-v3.0.1';
const MAP_CACHE = 'gps-nav-map-tiles-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/GPS-NAVIGATOR-OFFLINE-1/',
  '/GPS-NAVIGATOR-OFFLINE-1/index.html',
  '/GPS-NAVIGATOR-OFFLINE-1/manifest.json',
  '/GPS-NAVIGATOR-OFFLINE-1/css/variables.css',
  '/GPS-NAVIGATOR-OFFLINE-1/css/animations.css',
  '/GPS-NAVIGATOR-OFFLINE-1/css/components.css',
  '/GPS-NAVIGATOR-OFFLINE-1/css/main.css',
  '/GPS-NAVIGATOR-OFFLINE-1/js/app.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/sw-register.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/pwa-install.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/config.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/database.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/neural-network.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/gps.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/map.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/ui.js',
  '/GPS-NAVIGATOR-OFFLINE-1/js/utils.js',
  '/GPS-NAVIGATOR-OFFLINE-1/offline.html',
  // PWA Icons
  '/GPS-NAVIGATOR-OFFLINE-1/icons/launchericon-48x48.png',
  '/GPS-NAVIGATOR-OFFLINE-1/icons/launchericon-72x72.png',
  '/GPS-NAVIGATOR-OFFLINE-1/icons/launchericon-96x96.png',
  '/GPS-NAVIGATOR-OFFLINE-1/icons/launchericon-144x144.png',
  '/GPS-NAVIGATOR-OFFLINE-1/icons/launchericon-192x192.png',
  '/GPS-NAVIGATOR-OFFLINE-1/icons/launchericon-512x512.png'
];

// External CDN resources
const CDN_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://html2canvas.hertzen.com/dist/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=VT323&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3.0.1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll([...STATIC_ASSETS, ...CDN_ASSETS])
        .catch((err) => {
          console.error('[SW] Cache error:', err);
          // Continue even if some assets fail
          return Promise.resolve();
        });
    }).then(() => {
      console.log('[SW] Installed successfully');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v3.0.1...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== MAP_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activated successfully');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch event - serve from cache, cache map tiles
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategy 1: Cache map tiles (OpenStreetMap, OpenTopoMap, Esri)
  if (
    url.hostname === 'tile.openstreetmap.org' ||
    url.hostname.endsWith('.tile.openstreetmap.org') ||
    url.hostname === 'tile.opentopomap.org' ||
    url.hostname.endsWith('.tile.opentopomap.org') ||
    url.hostname === 'arcgisonline.com' ||
    url.hostname.endsWith('.arcgisonline.com')
  ) {
    event.respondWith(
      caches.open(MAP_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving map tile from cache:', url.pathname);
            return cachedResponse;
          }
          // Fetch and cache new tiles
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
              console.log('[SW] Cached new map tile:', url.pathname);
            }
            return response;
          }).catch(() => {
            console.log('[SW] Map tile fetch failed (offline)');
            // Return transparent tile if offline
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect fill="#0a0a0a" width="256" height="256"/><text x="50%" y="50%" text-anchor="middle" fill="#00ff00" font-family="monospace">OFFLINE</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          });
        });
      })
    );
    return;
  }

  // Strategy 2: Cache-first for static assets
  if (STATIC_ASSETS.some(asset => url.pathname === asset || (asset.length > 1 && url.pathname.endsWith(asset)))) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', url.pathname);
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        }).catch(() => {
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/GPS-NAVIGATOR-OFFLINE-1/offline.html');
          }
        });
      })
    );
    return;
  }

  // Strategy 3: Network-first for CDN assets
  if (
    url.hostname === 'unpkg.com' || url.hostname.endsWith('.unpkg.com') ||
    url.hostname === 'googleapis.com' || url.hostname.endsWith('.googleapis.com') ||
    url.hostname === 'gstatic.com' || url.hostname.endsWith('.gstatic.com') ||
    url.hostname === 'hertzen.com' || url.hostname.endsWith('.hertzen.com')
  ) {
    event.respondWith(
      fetch(event.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Strategy 4: Network-first for API requests (Nominatim)
  if (url.hostname === 'nominatim.openstreetmap.org') {
    event.respondWith(
      fetch(event.request).then((response) => {
        // Don't cache API responses (they're dynamic)
        return response;
      }).catch(() => {
        console.log('[SW] Nominatim API offline - geocoding unavailable');
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Background sync for future features
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-gps-data') {
    console.log('[SW] Background sync triggered');
    // Future: sync GPS data to cloud
  }
});

// Push notifications for future features
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  // Future: show notifications for AI predictions, location alerts
});
