/* SoCo Kitchen — offline cache */
const V = "soco-v5";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/app.css",
  "./core/rules.js", "./tenants/soco/config.js", "./core/tenant.js",
  "./js/infographics.js", "./js/game.js", "./js/toast-sync.js", "./js/app.js",
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
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(new URL(e.request.url).pathname);
  if (isImage){
    // images never change — cache-first
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(V).then(c => c.put(e.request, copy));
        return res;
      }))
    );
  } else {
    // html/css/js — network-first, always revalidated, so app updates land immediately;
    // cache is the offline fallback
    e.respondWith(
      fetch(e.request.url, { cache: "no-cache" }).then(res => {
        const copy = res.clone();
        caches.open(V).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
  }
});
