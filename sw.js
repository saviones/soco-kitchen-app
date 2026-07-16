/* SoCo Kitchen — offline cache */
const V = "soco-v1";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/app.css",
  "./js/data.js", "./js/infographics.js", "./js/game.js", "./js/toast-sync.js", "./js/app.js",
  "./assets/brand/logo.png", "./assets/brand/hero.jpg", "./assets/brand/icon-192.png", "./assets/brand/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(V).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => hit))
  );
});
