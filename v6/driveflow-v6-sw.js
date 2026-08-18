const CACHE="driveflow-v6-dev8-20260819";
const CORE=["./","index.html","driveflow-v6-styles.css?v=6.0.0-dev1","driveflow-v6-light.css?v=6.0.0-dev1","driveflow-v6-core.js?v=6.0.0-dev1","driveflow-v6-migration.js?v=6.0.0-dev1","driveflow-v6-weather.js?v=6.0.0-dev1","driveflow-v6-intelligence.js?v=6.0.0-dev1","driveflow-v6-backtest.js?v=6.0.0-dev1","driveflow-v6-io.js?v=6.0.0-dev1","driveflow-v6-data.js?v=6.0.0-dev1","driveflow-v6-persistence.js?v=6.0.0-dev1","driveflow-v6-data-integrity.js?v=6.0.0-dev1","driveflow-v6-weather-validation.js?v=6.0.0-dev1","driveflow-v6-app.js?v=6.0.0-dev1","driveflow-v6-ui-guards.js?v=6.0.0-dev1","driveflow-v6-write-ui.js?v=6.0.0-dev1","driveflow-v6.webmanifest","../driveflow-icon-180.png","../driveflow-icon-192.png","../driveflow-icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  if(r.mode==="navigate"){
    e.respondWith(fetch(r).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put("./",res.clone()));return res;}).catch(()=>caches.match("./")));
    return;
  }
  e.respondWith(caches.match(r).then(cached=>{
    const update=fetch(r).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(r,res.clone()));return res;}).catch(()=>cached);
    return cached||update;
  }));
});