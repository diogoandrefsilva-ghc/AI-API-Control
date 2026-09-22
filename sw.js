/* SOBE ISTO sempre que mexeres em app.js, style.css ou index.html.
   Os três são network-first de propósito: sem isso, um deploy dá ao
   browser o index.html novo com o app.js VELHO da cache — botões novos a
   chamar funções que ainda não existem, sem erro visível. Já aconteceu no
   Goals, e está escrito no CLAUDE.md de todas as apps irmãs. */
const CACHE_NAME = 'aic-cache-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname !== self.location.hostname) return;
  const p = url.pathname;
  if (p.endsWith('.html') || p === '/' || p.endsWith('/')
      || p.endsWith('/app.js') || p.endsWith('/style.css')) {
    e.respondWith(
      fetch(e.request.url, { cache: 'no-store' })
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first para o resto (ícones, manifest)
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      })
    )
  );
});
