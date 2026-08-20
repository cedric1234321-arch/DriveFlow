const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const code=fs.readFileSync(__dirname+'/driveflow-v6-sw.js','utf8');
const listeners={};
const deleted=[];
const putCalls=[];
const cache={addAll:async()=>{},put:async(...args)=>{putCalls.push(args);}};
const cachesMock={
  open:async()=>cache,
  keys:async()=>['driveflow-v5-0-0-20260813','driveflow-v6-dev-old','driveflow-v6-dev16-20260819','driveflow-v6-dev17-20260819','driveflow-v6-dev18-20260819','driveflow-v6-dev19-20260819','driveflow-v6-dev20-20260819','driveflow-v6-dev21-20260820','unrelated-cache'],
  delete:async key=>{deleted.push(key);return true;},
  match:async()=>null
};
const selfMock={
  location:{origin:'https://example.test'},
  clients:{claim:async()=>{}},
  skipWaiting:()=>{},
  addEventListener:(name,fn)=>{listeners[name]=fn;}
};
let networkCalls=0;
const fetchMock=async request=>{networkCalls++;return{ok:true,clone(){return this;}};};
const context={self:selfMock,caches:cachesMock,fetch:fetchMock,URL,Promise,console};
vm.createContext(context);vm.runInContext(code,context,{filename:'driveflow-v6-sw.js'});
assert(listeners.install&&listeners.activate&&listeners.fetch);

(async()=>{
  let activation;
  listeners.activate({waitUntil:p=>{activation=p;}});await activation;
  assert(deleted.includes('driveflow-v6-dev-old'));
  assert(deleted.includes('driveflow-v6-dev16-20260819'));
  assert(deleted.includes('driveflow-v6-dev17-20260819'));
  assert(deleted.includes('driveflow-v6-dev18-20260819'));
  assert(deleted.includes('driveflow-v6-dev19-20260819'));
  assert(deleted.includes('driveflow-v6-dev20-20260819'));
  assert(!deleted.includes('driveflow-v5-0-0-20260813'),'V6 preview must never delete production V5 cache');
  assert(!deleted.includes('unrelated-cache'));
  assert(!deleted.includes('driveflow-v6-dev21-20260820'),'current V6 preview cache must be preserved');

  let externalResponded=false;
  listeners.fetch({request:{method:'GET',url:'https://api.open-meteo.com/v1/forecast?x=1',mode:'cors'},respondWith:()=>{externalResponded=true;}});
  assert.equal(externalResponded,false,'third-party forecast requests must bypass the app-shell cache');
  assert.equal(networkCalls,0,'service worker must not take ownership of cross-origin API requests');

  let sameOriginPromise=null;
  listeners.fetch({request:{method:'GET',url:'https://example.test/v6/driveflow-v6-app.js',mode:'cors'},respondWith:p=>{sameOriginPromise=p;}});
  assert(sameOriginPromise,'same-origin static request should be handled');await sameOriginPromise;
  assert.equal(networkCalls,1);

  console.log('DriveFlow V6 service-worker isolation tests passed');
})().catch(e=>{console.error(e);process.exit(1);});
