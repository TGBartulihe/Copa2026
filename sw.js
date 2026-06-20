// Copa 2026 Tracker — Service Worker
// Autor: Thiago Bartulihe
// v3: index.html e manifest.json agora são "network-first" — nunca mais ficam
// presos em cache antigo. Apenas ícones usam cache-first (raramente mudam).
const CACHE = "copa2026-v3";
const SHELL_ASSETS = ["./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = e.request.url;

  // Dados — nunca cachear, sempre rede (resultados precisam estar sempre frescos)
  if (url.includes("espn.com") || url.includes("thesportsdb.com") || url.includes("results.json")) {
    e.respondWith(fetch(e.request).catch(() => new Response("{}", {headers:{"Content-Type":"application/json"}})));
    return;
  }

  // Página principal e manifesto — network-first: tenta sempre buscar versão nova,
  // só usa cache se estiver offline. Isto resolve o problema de "código antigo presente".
  if (e.request.mode === "navigate" || url.endsWith("index.html") || url.endsWith("manifest.json") || url.endsWith("/")) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Ícones e demais assets estáticos — cache first (raramente mudam)
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => r))
  );
});
