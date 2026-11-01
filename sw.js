/* île de païn service worker: makes the site and the Island Club installable and quick.
   Pages: network first (always fresh), fall back to the saved copy when offline.
   Assets: served from the cache, refreshed in the background.
   Database calls are never cached. */
const V = "idp-v1";
const SHELL = ["/", "/club/", "/club/app/", "/staff/", "/assets/site.css", "/assets/site.js", "/assets/club.css", "/assets/club.js",
  "/assets/club-config.js", "/assets/menu.js", "/assets/photos.js", "/assets/vendor/supabase.js", "/assets/vendor/qrcode.js",
  "/assets/vendor/html5-qrcode.min.js", "/assets/img/logo-orange.png", "/assets/icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match(u.pathname.startsWith("/club") ? "/club/app/" : "/"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => {
    const f = fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; }).catch(() => m);
    return m || f;
  }));
});
