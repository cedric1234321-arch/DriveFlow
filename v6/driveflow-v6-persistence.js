(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data;
if(!DATA)return;

const originalLoad=DATA.load.bind(DATA), legacyUnifiedKey=DATA.KEY;
const K=Object.freeze({
  meta:"driveflow.v6.meta",
  sessions:"driveflow.v6.sessions",
  uber:"driveflow.v6.uber",
  deliveroo:"driveflow.v6.deliveroo",
  tips:"driveflow.v6.cashTips",
  plans:"driveflow.v6.weeklyPlans",
  weather:"driveflow.v6.weather",
  settings:"driveflow.v6.settings",
  legacyBackup:"driveflow.v6.legacyUnifiedBackup"
});
DATA.PERSISTENCE_KEYS=K;
DATA.KEY=K.meta;

let lastSerialized={};
const parse=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v==null?fallback:v;}catch{return fallback;}};
const stringify=v=>JSON.stringify(v);
const setChanged=(key,value,slot)=>{const raw=stringify(value);if(lastSerialized[slot]!==raw){localStorage.setItem(key,raw);lastSerialized[slot]=raw;return true;}return false;};
const blocksFromState=state=>({
  sessions:state.sessions||[],uber:state.uberBatches||[],deliveroo:state.deliverooOrders||[],tips:state.cashTips||[],plans:state.weeklyPlans||[],
  weather:{bySessionId:state.weatherBySessionId||{},meta:state.weatherMeta||{status:"idle",modelEnabled:false}},settings:state.settings||{}
});
const remember=state=>{const b=blocksFromState(state);for(const [slot,v] of Object.entries(b))lastSerialized[slot]=stringify(v);};

DATA.persistSplit = state => {
  const b=blocksFromState(state);let writes=0;
  writes+=setChanged(K.sessions,b.sessions,"sessions")?1:0;
  writes+=setChanged(K.uber,b.uber,"uber")?1:0;
  writes+=setChanged(K.deliveroo,b.deliveroo,"deliveroo")?1:0;
  writes+=setChanged(K.tips,b.tips,"tips")?1:0;
  writes+=setChanged(K.plans,b.plans,"plans")?1:0;
  writes+=setChanged(K.weather,b.weather,"weather")?1:0;
  writes+=setChanged(K.settings,b.settings,"settings")?1:0;
  const meta={version:6,schemaVersion:6,updatedAt:new Date().toISOString()};
  localStorage.setItem(K.meta,JSON.stringify(meta));
  return {writes};
};
DATA.clearSplitStorage = () => Object.values(K).filter(k=>k!==K.legacyBackup).forEach(k=>localStorage.removeItem(k));
DATA.replaceState = state => {lastSerialized={};DATA.clearSplitStorage();return DATA.persistSplit(state);};

DATA.load = () => {
  const meta=parse(K.meta,null);
  if(meta?.schemaVersion===6){
    const weather=parse(K.weather,{bySessionId:{},meta:{status:"idle",modelEnabled:false}});
    const state={
      version:6,schemaVersion:6,
      sessions:parse(K.sessions,[]),uberBatches:parse(K.uber,[]),deliverooOrders:parse(K.deliveroo,[]),cashTips:parse(K.tips,[]),weeklyPlans:parse(K.plans,[]),
      weatherBySessionId:weather.bySessionId||{},weatherMeta:weather.meta||{status:"idle",modelEnabled:false},settings:parse(K.settings,{})
    };
    state.settings.weeklySavingsOverrides ||= {};remember(state);return state;
  }

  const staleSplit=[K.sessions,K.uber,K.deliveroo,K.tips,K.plans,K.weather,K.settings].some(k=>localStorage.getItem(k)!==null);
  if(staleSplit)DATA.clearSplitStorage();

  DATA.KEY=legacyUnifiedKey;
  const unifiedRaw=localStorage.getItem(legacyUnifiedKey);
  const state=originalLoad();
  DATA.KEY=K.meta;
  if(unifiedRaw && localStorage.getItem(K.legacyBackup)==null)localStorage.setItem(K.legacyBackup,unifiedRaw);
  DATA.persistSplit(state);remember(state);
  localStorage.removeItem(legacyUnifiedKey);
  return state;
};

DATA.save = state => DATA.persistSplit(state);
DATA.persistenceAudit = () => ({
  mode:"split-localStorage",
  keys:Object.fromEntries(Object.entries(K).filter(([k])=>k!=="legacyBackup").map(([name,key])=>[name,{exists:localStorage.getItem(key)!==null,bytes:(localStorage.getItem(key)||"").length}])),
  legacyBackupExists:localStorage.getItem(K.legacyBackup)!==null
});
})();