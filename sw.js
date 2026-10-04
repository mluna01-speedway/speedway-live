const CACHE_NAME = 'speedway-live-dynamic-v8';

// File fondamentali salvati SUBITO in memoria appena il Service Worker si installa
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html'
];

// 1. INSTALLAZIONE: Salva subito i file principali nella memoria del telefono
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        CORE_ASSETS.map(url => fetch(url, { cache: 'no-store' }).then(res => {
          if (res && res.ok) return cache.put(url, res);
        }))
      );
    })
  );
});

// 2. ATTIVAZIONE: Prende il controllo e pulisce solo le cache vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Helper: Rende il fetch immune alla "rete bloccata da stadio" (max 3.5 secondi di attesa)
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Network timeout')), timeoutMs);
    fetch(request, { cache: 'no-store' }).then(res => {
      clearTimeout(timer);
      resolve(res);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// 3. FETCH: Prova la rete (max 3.5s), salva in cache, e se sei offline apre SEMPRE index.html
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  event.respondWith(
    fetchWithTimeout(event.request, 3500)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
            // Se ha scaricato la pagina principale, aggiorna sia './' che './index.html'
            if (isNavigation) {
              cache.put('./', networkResponse.clone());
              cache.put('./index.html', networkResponse.clone());
            }
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // TELEFONO OFFLINE O SENZA CAMPO:
        // 1. Cerca corrispondenza esatta (anche ignorando parametri ?...)
        const cachedExact = await caches.match(event.request, { ignoreSearch: true });
        if (cachedExact) return cachedExact;

        // 2. Se stai aprendo l'app, restituisci SEMPRE la copia salvata di index.html!
        if (isNavigation) {
          const cachedIndex = await caches.match('./index.html') || await caches.match('./');
          if (cachedIndex) return cachedIndex;
        }

        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
