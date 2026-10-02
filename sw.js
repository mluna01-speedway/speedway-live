const CACHE_NAME = 'speedway-live-dynamic-v1';

// Installazione immediata senza attese
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Prende subito il controllo della pagina e pulisce eventuali vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Strategia NETWORK-FIRST:
// 1. Prova sempre a scaricare l'ultima versione aggiornata da GitHub/Rete
// 2. La salva in cache per il futuro
// 3. Se il telefono è offline (stadio senza campo), usa la copia in cache!
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
