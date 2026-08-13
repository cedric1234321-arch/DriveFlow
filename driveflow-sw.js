const CACHE="driveflow-v4-0-6-20260813-stable";
const ASSETS=[
  "./",
  "index.html",
  "driveflow-styles.css?v=4.0.6",
  "driveflow-app.js?v=4.0.6",
  "driveflow.webmanifest",
  "driveflow-icon-180.png",
  "driveflow-icon-192.png",
  "driveflow-icon-512.png",
  "driveflow-brand.jpg",
  "driveflow-deliveroo-template.csv",
  "README_DRIVEFLOW_V4.txt"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;

  // HTML is network-first so a GitHub Pages deployment is picked up immediately.
  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req).then(res=>{
        if(res&&res.ok){
          const clone=res.clone();
          caches.open(CACHE).then(cache=>cache.put("./",clone));
        }
        return res;
      }).catch(()=>caches.match("./"))
    );
    return;
  }

  // Versioned app assets are safe to serve cache-first; a version change creates a new URL.
  event.respondWith(
    caches.match(req).then(cached=>cached||fetch(req).then(res=>{
      if(res&&res.ok){
        const clone=res.clone();
        caches.open(CACHE).then(cache=>cache.put(req,clone));
      }
      return res;
    }))
  );
});
