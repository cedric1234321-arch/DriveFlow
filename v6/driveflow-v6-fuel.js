(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data, DF=globalThis.DriveFlowV6Core;
if(!DATA||!DF)return;
const FUEL={};
FUEL.FILE="fuel-history-montpellier.json";
FUEL.CACHE_KEY="driveflow.v6.officialFuelHistory";
FUEL.map=new Map();
FUEL.loaded=false;
FUEL.meta={status:"not_loaded"};
FUEL.notify=()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("driveflow:fuel-history",{detail:FUEL.meta}));};
FUEL.signature=days=>`${days.length}|${days[0]?.date||""}|${days.at(-1)?.date||""}|${days.at(-1)?.pricePerL||""}`;
FUEL.applyDays=(days,meta={})=>{FUEL.map.clear();for(const d of days||[])if(d?.date&&DF.n(d.pricePerL)>0)FUEL.map.set(d.date,{pricePerL:DF.n(d.pricePerL),stations:DF.n(d.stations),confidence:d.confidence||"unknown"});FUEL.loaded=true;FUEL.meta={status:FUEL.map.size?"ready":"pending",rows:FUEL.map.size,signature:FUEL.signature(days||[]),...meta};FUEL.notify();return FUEL.meta;};
FUEL.readCache=()=>{try{const x=JSON.parse(localStorage.getItem(FUEL.CACHE_KEY)||"null");if(x?.schemaVersion===1&&Array.isArray(x.days)&&x.days.length)FUEL.applyDays(x.days,{source:x.source||"cached official series",period:x.period||null,location:x.location||null,cached:true});}catch{}};
FUEL.priceForDate=date=>FUEL.map.get(String(date))||null;
FUEL.isMontpellierSession=s=>!String(s?.city||"").trim()||/montpellier/i.test(String(s.city));
FUEL.load=async()=>{
  const before=FUEL.meta.signature||"";
  try{
    const res=await fetch(FUEL.FILE,{cache:"no-store"});if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const json=await res.json(),days=Array.isArray(json.days)?json.days:[],sig=FUEL.signature(days);
    if(days.some(d=>DF.n(d?.pricePerL)>0)){
      localStorage.setItem(FUEL.CACHE_KEY,JSON.stringify({schemaVersion:1,source:json.source||"",period:json.period||null,location:json.location||null,days}));
      FUEL.applyDays(days,{source:json.source||"",period:json.period||null,location:json.location||null,cached:false});
      if(before!==sig&&typeof window!=="undefined"){
        const key=`driveflow.fuel.reloaded.${sig}`;
        if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,"1");location.reload();}
      }
    }else if(!FUEL.map.size){FUEL.meta={status:"pending",rows:0,signature:sig,source:json.source||""};FUEL.notify();}
    return FUEL.meta;
  }catch(e){if(FUEL.map.size){FUEL.meta={...FUEL.meta,status:"ready_cached",error:String(e.message||e)};FUEL.notify();return FUEL.meta;}FUEL.meta={status:"error",error:String(e.message||e)};FUEL.notify();return FUEL.meta;}
};

FUEL.readCache();

const originalSessionFuel=DATA.sessionFuel.bind(DATA);
DATA.sessionFuel=(state,s,distance)=>{const local=FUEL.isMontpellierSession(s)?FUEL.priceForDate(s?.date):null;if(!local)return originalSessionFuel(state,s,distance);const consumption=s?.historyImported&&DF.n(s.fuelConsumptionAtTime)>0?DF.n(s.fuelConsumptionAtTime):DF.resolveEffectiveValue(state.settings.consumptionHistory,s.date,"litresPer100km");if(!(consumption>0))return originalSessionFuel(state,s,distance);return Math.max(0,DF.n(distance))*consumption/100*local.pricePerL;};
DATA.fuelPriceForDate=(state,date,session=null)=>{const local=(!session||FUEL.isMontpellierSession(session))?FUEL.priceForDate(date):null;if(local)return{...local,source:"official_montpellier"};if(session?.historyImported&&DF.n(session.fuelPriceAtTime)>0)return{pricePerL:DF.n(session.fuelPriceAtTime),source:"session_snapshot",confidence:"estimated"};const p=DF.resolveEffectiveValue(state.settings.fuelPriceHistory,date,"pricePerL");return p?{pricePerL:p,source:"manual",confidence:"manual"}:null;};

globalThis.DriveFlowV6Fuel=FUEL;
FUEL.load();
})();