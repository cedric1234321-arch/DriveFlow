const CACHE="livraisons-v2";
const ASSETS=[
  "./",
  "index.html",
  "livraison-styles.css",
  "livraison-app.js",
  "livraison.webmanifest",
  "livraison-icon-180.png",
  "livraison-icon-192.png",
  "livraison-icon-512.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const request=event.request;

  if(request.mode==="navigate"){
    event.respondWith(
      fetch(request)
        .then(response=>{
          const clone=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,clone));
          return response;
        })
        .catch(()=>caches.match(request).then(r=>r||caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>{
      const network=fetch(request).then(response=>{
        if(response && response.status===200){
          const clone=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,clone));
        }
        return response;
      }).catch(()=>cached);
      return cached||network;
    })
  );
});
