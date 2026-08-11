const CACHE="livraisons-v1";
const ASSETS=["./","index.html","livraison-styles.css","livraison-app.js","livraison.webmanifest","livraison-icon-180.png","livraison-icon-192.png","livraison-icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
