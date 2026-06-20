// Copa 2026 Tracker — Service Worker
// Autor: Thiago Bartulihe
// v5: adiciona suporte a notificações push (funciona com a app fechada).
const CACHE = "copa2026-v5";
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

// ── NOTIFICAÇÕES PUSH ────────────────────────────────────────────────────────
// Recebido mesmo com a app completamente fechada — é o próprio sistema
// operativo que entrega isto ao Service Worker.
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data.json(); } catch(err) { data = { title: "Copa 2026", body: e.data ? e.data.text() : "" }; }
  const title = data.title || "Copa 2026";
  const options = {
    body: data.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: data.tag || "copa2026",
    data: { url: "./" },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
