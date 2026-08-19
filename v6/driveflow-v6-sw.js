const CACHE_PREFIX="driveflow-v6-";
const CACHE="driveflow-v6-dev19-20260819";
const CORE=["./","index.html","driveflow-v6-styles.css?v=6.0.0-dev2","driveflow-v6-light.css?v=6.0.0-dev2","driveflow-v6-core.js?v=6.0.0-dev2","driveflow-v6-migration.js?v=6.0.0-dev2","driveflow-v6-weather.js?v=6.0.0-dev2","driveflow-v6-intelligence.js?v=6.0.0-dev2","driveflow-v6-planner.js?v=6.0.0-dev2","driveflow-v6-intelligence-policy.js?v=6.0.0-dev2","driveflow-v6-backtest.js?v=6.0.0-dev2","driveflow-v6-io.js?v=6.0.0-dev2","driveflow-v6-backup-compat.js?v=6.0.0-dev2","driveflow-v6-data.js?v=6.0.0-dev2","driveflow-v6-persistence.js?v=6.0.0-dev2","driveflow-v6-fuel.js?v=6.0.0-dev2","fuel-history-montpellier.json","driveflow-v6-data-integrity.js?v=6.0.0-dev2","driveflow-v6-savings-compat.js?v=6.0.0-dev2","driveflow-v6-weather-validation.js?v=6.0.0-dev2","driveflow-v6-app.js?v=6.0.0-dev2","driveflow-v6-ui-guards.js?v=6.0.0-dev2","driveflow-v6-write-ui.js?v=6.0.0-dev2","driveflow-v6-ios-file-picker.js?v=6.0.0-dev2","driveflow-v6-planner-ui.js?v=6.0.0-dev2","driveflow-v6-weather-forecast-ui.js?v=6.0.0-dev3","driveflow-v6-classifier-ui.js?v=6.0.0-dev2","driveflow-v6-analytics-ui.js?v=6.0.0-dev2","driveflow-v6-fuel-ui.js?v=6.0.0-dev2","driveflow-v6-ux-polish.js?v=6.0.0-dev4","driveflow-v6.webmanifest","../driveflow-icon-180.png","../driveflow-icon-192.png","../driveflow-icon-512.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response.ok)caches.open(CACHE).then(cache=>cache.put("./",response.clone()));
          return response;
        })
        .catch(()=>caches.match("./"))
    );
    return;
  }

  event.respondWith(caches.match(request).then(cached=>{
    const update=fetch(request)
      .then(response=>{
        if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
        return response;
      })
      .catch(()=>cached);
    return cached||update;
  }));
});
