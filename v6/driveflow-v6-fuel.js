(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data, DF=globalThis.DriveFlowV6Core;
if(!DATA||!DF)return;
const FUEL={};
FUEL.FILE="fuel-history-montpellier.json";
FUEL.map=new Map();
FUEL.loaded=false;
FUEL.meta={status:"not_loaded"};

FUEL.priceForDate=date=>FUEL.map.get(String(date))||null;
FUEL.load=async()=>{
  try{
    const res=await fetch(FUEL.FILE,{cache:"no-store"});if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const json=await res.json(),days=Array.isArray(json.days)?json.days:[];FUEL.map.clear();
    for(const d of days)if(d?.date&&DF.n(d.pricePerL)>0)FUEL.map.set(d.date,{pricePerL:DF.n(d.pricePerL),stations:DF.n(d.stations),confidence:d.confidence||"unknown"});
    FUEL.loaded=true;FUEL.meta={status:FUEL.map.size?"ready":"pending",rows:FUEL.map.size,source:json.source||"",period:json.period||null,location:json.location||null};
    return FUEL.meta;
  }catch(e){FUEL.meta={status:"error",error:String(e.message||e)};return FUEL.meta;}
};

// Official local prices supersede the old V5 approximate 1.70 €/L snapshot when
// an exact date is available. If no official row exists, all previous V6
// fallback behavior (session snapshot / manual effective-dated price) remains.
const originalSessionFuel=DATA.sessionFuel.bind(DATA);
DATA.sessionFuel=(state,s,distance)=>{
  const local=FUEL.priceForDate(s?.date);
  if(!local)return originalSessionFuel(state,s,distance);
  const consumption=s?.historyImported&&DF.n(s.fuelConsumptionAtTime)>0?DF.n(s.fuelConsumptionAtTime):DF.resolveEffectiveValue(state.settings.consumptionHistory,s.date,"litresPer100km");
  if(!(consumption>0))return originalSessionFuel(state,s,distance);
  return Math.max(0,DF.n(distance))*consumption/100*local.pricePerL;
};
DATA.fuelPriceForDate=(state,date,session=null)=>{
  const local=FUEL.priceForDate(date);if(local)return{...local,source:"official_montpellier"};
  if(session?.historyImported&&DF.n(session.fuelPriceAtTime)>0)return{pricePerL:DF.n(session.fuelPriceAtTime),source:"session_snapshot",confidence:"estimated"};
  const p=DF.resolveEffectiveValue(state.settings.fuelPriceHistory,date,"pricePerL");return p?{pricePerL:p,source:"manual",confidence:"manual"}:null;
};

globalThis.DriveFlowV6Fuel=FUEL;
// Load asynchronously. The app remains usable immediately; once real derived
// data replaces the placeholder, a reload makes the official series active.
FUEL.load();
})();