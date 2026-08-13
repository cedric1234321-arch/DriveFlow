const CACHE="driveflow-v4-20260813-hotfix1";
const ASSETS=["./","index.html","driveflow-styles.css?v=4.0.1","driveflow-app.js?v=4.0.1","driveflow.webmanifest","driveflow-icon-180.png","driveflow-icon-192.png","driveflow-icon-512.png","driveflow-brand.jpg","driveflow-deliveroo-template.csv","README_DRIVEFLOW_V4.txt"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(res=>{
      const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone));return res;
    }).catch(()=>caches.match("./")));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>{
    const network=fetch(req).then(res=>{
      if(res&&res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone))}
      return res;
    }).catch(()=>cached);
    return cached||network;
  }));
});