const CACHE_NAME = 'speedway-live-offline-v14';

const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html'
];

// Pulisce eventuali risposte redirect che Chrome Android blocca in modalità offline
function cleanResponse(response) {
  if (!response || !response.redirected) return Promise.resolve(response);
  return response.blob().then(bodyBlob => new Response(bodyBlob, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  }));
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then( async cache => {
      for (const url of URLS_TO_CACHE) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (res && res.ok) {
            const clean = await cleanResponse(res);
            await cache.put(url, clean);
          }
        } catch (e) {}
      }
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const isNav = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  // Per l'apertura dell'app (navigate): se sei in Modalità Aereo (!navigator.onLine) risponde in 0ms dalla cache!
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      if (navigator.onLine) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          const netRes = await fetch(event.request, { cache: 'no-store', signal: controller.signal });
          clearTimeout(timer);

          if (netRes && netRes.status === 200) {
            const clean = await cleanResponse(netRes.clone());
            cache.put(event.request, clean.clone());
            if (isNav) {
              cache.put('./', clean.clone());
              cache.put('./index.html', clean.clone());
            }
            return netRes;
          }
        } catch (err) {
          // Rete assente o timeout: passa subito alla cache qui sotto
        }
      }

      // MODALITÀ AEREO / OFFLINE:
      const exactMatch = await cache.match(event.request, { ignoreSearch: true });
      if (exactMatch) return exactMatch;

      if (isNav) {
        const homeMatch = await cache.match('./index.html', { ignoreSearch: true }) ||
                          await cache.match('./', { ignoreSearch: true });
        if (homeMatch) return homeMatch;
      }

      const anyMatch = await caches.match(event.request, { ignoreSearch: true });
      return anyMatch || new Response('Offline', { status: 503 });
    })()
  );
});
