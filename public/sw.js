// Cambiando questo nome, forziamo i vecchi telefoni a buttare la cache vecchia!
const CACHE_NAME = 'neon-chess-v2-network-first';

// I file base da salvare per quando si è offline
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/game.js',
    '/manifest.json'
];

self.addEventListener('install', event => {
    // skipWaiting forza l'installazione immediata del nuovo service worker
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    // clients.claim prende subito il controllo della pagina web
    event.waitUntil(self.clients.claim());
    // Pulisce le vecchie cache (es. la v1 che ti sta bloccando il bottone)
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// STRATEGIA: NETWORK FIRST (Prima il server, poi la cache)
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Se la rete funziona e scarica il file nuovo, lo salviamo anche in cache
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Se non c'è internet (o il server Render è giù), usiamo la versione in cache!
                return caches.match(event.request);
            })
    );
});