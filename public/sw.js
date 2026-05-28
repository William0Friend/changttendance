/**
 * Service worker — Changttendance
 *
 * Caching strategy:
 * - face-api model files (~12MB total): cache-first, versioned by cache name
 * - App shell (HTML, JS, CSS): network-first with cache fallback
 * - CDN fonts + QRCode.js: cache-first
 * - Everything else: network-first
 *
 * Increment CACHE_VERSION only when model files actually change.
 * New versions trigger re-download of all cached models.
 */

const CACHE_VERSION = 'changttendance-v1';

const MODEL_URLS = [
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/ssd_mobilenetv1_model-weights_manifest.json',
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/ssd_mobilenetv1_model-shard1',
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_landmark_68_model-weights_manifest.json',
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_landmark_68_model-shard1',
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_recognition_model-weights_manifest.json',
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_recognition_model-shard1',
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_recognition_model-shard2',
];

const CDN_CACHE_URLS = [
  // Avoid caching the face-api ESM bundle — tests and preview may skip or stub it.
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
];

// Install: pre-cache model files and CDN assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // Cache models — these are large but essential for offline use
      await cache.addAll([...MODEL_URLS, ...CDN_CACHE_URLS]).catch((e) => {
        console.warn('[SW] Pre-cache failed (may be first install with no network):', e);
      });
      return self.skipWaiting();
    }),
  );
});

// Activate: delete old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      return self.clients.claim();
    }),
  );
});

// Fetch: route each request to the appropriate strategy
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Model files and CDN assets: cache-first
  if (MODEL_URLS.some((m) => url.includes(m)) || CDN_CACHE_URLS.some((c) => url.includes(c))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Google Fonts: cache-first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Supabase API calls: network-only (never cache user data)
  const supabaseHost = self.location.hostname; // placeholder — won't match in practice
  if (url.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: network-first with cache fallback
  event.respondWith(networkFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/') ?? new Response('Offline', { status: 503 });
    }
    return new Response('Offline', { status: 503 });
  }
}
