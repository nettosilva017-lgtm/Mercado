// Service Worker - Ouxe Mini Mercado
// Cuida do cache básico para o site funcionar offline e poder ser instalado.

const CACHE_NAME = 'ouxe-mercado-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './produtos.json',
  './icon-192.png',
  './icon-512.png'
];

// Instala e guarda os arquivos principais no cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Ativa e remove caches antigos de versões anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME)
             .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Estratégia: network-first para produtos.json (preço/estoque sempre atualizado quando online)
// e para o restante, cache-first com atualização em segundo plano
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // não intercepta CDNs externos (fontes, ícones, libs)

  if (url.pathname.endsWith('produtos.json')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
