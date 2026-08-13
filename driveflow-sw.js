const CACHE="driveflow-v5-0-0-20260813";
const ASSETS=[
  "./",
  "index.html",
  "driveflow-styles.css?v=5.0.0",
  "driveflow-app.js?v=5.0.0",
  "driveflow.webmanifest",
  "driveflow-icon-180.png",
  "driveflow-icon-192.png",
  "driveflow-icon-512.png",
  "driveflow-brand.jpg",
  "driveflow-deliveroo-template.csv",
  "driveflow-history-template.csv",
  "README_DRIVEFLOW_V5.txt"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const req=event.request;if(req.method!=="GET")return;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(res=>{
      if(res&&res.ok){const clone=res.clone();caches.open(CACHE).then(cache=>cache.put("./",clone))}
      return res;
    }).catch(()=>caches.match("./")));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{
    if(res&&res.ok){const clone=res.clone();caches.open(CACHE).then(cache=>cache.put(req,clone))}
    return res;
  })));
});
