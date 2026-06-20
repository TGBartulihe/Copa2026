// Copa 2026 Tracker — Service Worker
// Autor: Thiago Bartulihe
// v4: corrige bug em que respostas com falha (ex: 404 antes de subires o
// logo.png) ficavam presas em cache para sempre. Agora só guarda em cache
// respostas bem-sucedidas (res.ok), e logo.png/background.jpg são
// "network-first" como o index.html — nunca mais ficam desatualizados.
const CACHE = "copa2026-v4";
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

  // Dados — nunca cachear, sempre rede
  if (url.includes("espn.com") || url.includes("thesportsdb.com") || url.includes("results.json")) {
    e.respondWith(fetch(e.request).catch(() => new Response("{}", {headers:{"Content-Type":"application/json"}})));
    return;
  }

  // index.html, manifest, e os teus assets personalizáveis (logo/fundo) —
  // sempre tenta a rede primeiro. Nunca ficam presos numa versão antiga
  // ou num 404 cacheado de antes de existirem.
  const isCustomAsset = url.endsWith("logo.png") || url.endsWith("background.jpg");
  if (e.request.mode === "navigate" || url.endsWith("index.html") || url.endsWith("manifest.json") || url.endsWith("/") || isCustomAsset) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Ícones fixos da app — cache first (raramente mudam), mas só guarda
  // se a resposta foi mesmo bem-sucedida
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => r))
  );
});
