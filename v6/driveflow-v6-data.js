(() => {
"use strict";

/* DriveFlow V6 data layer
   - Safe copy-once migration from V5 localStorage
   - Indexed session/day calculations
   - Analytics rows for DriveFlow Intelligence
   - Optional Open-Meteo enrichment (historical + forecast)
*/

const DF = globalThis.DriveFlowV6Core;
const MIG = globalThis.DriveFlowV6Migration;
const WX = globalThis.DriveFlowV6Weather;
const DATA = {};

DATA.KEY = "driveflow.state.v6";
DATA.V5 = Object.freeze({
  sessions: "driveflow.sessions.v4",
  uber: "driveflow.uber.v4",
  deliveroo: "driveflow.deliveroo.v4",
  settings: "driveflow.settings.v4"
});

DATA.pad = x => String(x).padStart(2,"0");
DATA.iso = d => `${d.getFullYear()}-${DATA.pad(d.getMonth()+1)}-${DATA.pad(d.getDate())}`;
DATA.parseDate = s => { const [y,m,d]=String(s).split("-").map(Number); return new Date(y,m-1,d,12); };
DATA.addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
DATA.startOfWeek = date => { const d=DATA.parseDate(date); const n=(d.getDay()+6)%7; d.setDate(d.getDate()-n); return d; };
DATA.businessToday = () => { const d=new Date(); if(d.getHours()<4)d.setDate(d.getDate()-1); return DATA.iso(d); };
DATA.dateDays = date => Math.floor(DATA.parseDate(date).getTime()/86400000);
DATA.weekday = date => (DATA.parseDate(date).getDay()+6)%7;
DATA.businessMinute = t => {
  if(!t || !/^\d{1,2}:\d{2}$/.test(String(t))) return null;
  let [h,m]=String(t).split(":").map(Number); let v=h*60+m; if(v<240)v+=1440; return v-240;
};
DATA.clockHour = t => {
  if(!t)return 0; const [h,m]=String(t).split(":").map(Number); return h+(m||0)/60;
};
DATA.sessionMinutes = s => {
  let a=null,b=null;
  if(Number.isFinite(Number(s?.historyStartMinute))) a=Number(s.historyStartMinute);
  else if(Number.isFinite(Number(s?.autoStartMinute))) a=Number(s.autoStartMinute);
  else a=DATA.businessMinute(s?.start);
  if(Number.isFinite(Number(s?.historyEndMinute))) b=Number(s.historyEndMinute);
  else if(Number.isFinite(Number(s?.autoEndMinute))) b=Number(s.autoEndMinute);
  else b=DATA.businessMinute(s?.end);
  if(a==null||b==null||b<=a)return 0;
  const pauses=Math.max(0,DF.n(s?.pauseMinutesTotal));
  return Math.max(0,b-a-pauses);
};
DATA.sessionDistance = s => {
  if(s?.distanceKm!==undefined && s?.distanceKm!==null && s?.distanceKm!=="") return Math.max(0,DF.n(s.distanceKm));
  if(s?.odoStart===null||s?.odoEnd===null||s?.odoStart===""||s?.odoEnd==="") return 0;
  return Math.max(0,DF.n(s.odoEnd)-DF.n(s.odoStart));
};
DATA.timeQuality = s => {
  if(!s?.historyImported && !s?.autoHistorical) return "exact";
  const src=String(s?.timeSource||"").toLowerCase();
  if(src==="exact") return "exact";
  if(src.includes("début exact")||src.includes("partiel")) return "partial";
  return "estimated";
};
DATA.distanceQuality = s => String(s?.distanceSource||"").toUpperCase()==="EXACT" ? "exact" : "estimated";

DATA.safeJson = (raw,fallback) => { try { return JSON.parse(raw); } catch { return fallback; } };
DATA.emptyState = () => ({
  version:6,schemaVersion:6,sessions:[],uberBatches:[],deliverooOrders:[],cashTips:[],weeklyPlans:[],
  weatherBySessionId:{},weatherMeta:{status:"idle",modelEnabled:false},
  settings:{...DF.migrateSettingsV5ToV6({}),weeklySavingsOverrides:{}}
});
DATA.v5BackupFromStorage = () => ({
  version:5,
  sessions:DATA.safeJson(localStorage.getItem(DATA.V5.sessions)||"[]",[]),
  uberBatches:DATA.safeJson(localStorage.getItem(DATA.V5.uber)||"[]",[]),
  deliverooOrders:DATA.safeJson(localStorage.getItem(DATA.V5.deliveroo)||"[]",[]),
  settings:DATA.safeJson(localStorage.getItem(DATA.V5.settings)||"{}",{})
});
DATA.save = state => localStorage.setItem(DATA.KEY,JSON.stringify(state));
DATA.load = () => {
  const existing=DATA.safeJson(localStorage.getItem(DATA.KEY)||"null",null);
  if(existing?.schemaVersion===6){
    existing.cashTips ||= []; existing.weeklyPlans ||= []; existing.weatherBySessionId ||= {};
    existing.weatherMeta ||= {status:"idle",modelEnabled:false}; existing.settings ||= {};
    existing.settings.weeklySavingsOverrides ||= {};
    return existing;
  }
  const v5=DATA.v5BackupFromStorage();
  if(v5.sessions.length || v5.uberBatches.length || v5.deliverooOrders.length){
    const migrated=MIG.migrateBackupV5ToV6(v5,DATA.businessToday());
    migrated.migratedAt=new Date().toISOString(); migrated.weatherBySessionId={};
    migrated.weatherMeta={status:"idle",modelEnabled:false};
    DATA.save(migrated); return migrated;
  }
  const empty=DATA.emptyState(); DATA.save(empty); return empty;
};

DATA.buildContext = state => ({ indexes:DF.buildIndexes(state), dayCache:new Map(), analyticCache:null });
DATA.cashTipsForSession = (ctx,id) => ctx.indexes.cashTipsBySession.get(id)||[];
DATA.sessionRevenue = (state,ctx,s) => {
  let base=0,orders=0,uber=0,deliveroo=0;
  if(s.historyImported && Number.isFinite(Number(s.historyExpectedEarnings))){
    base=Math.max(0,DF.n(s.historyExpectedEarnings)); orders=Math.max(0,DF.n(s.historyExpectedOrders));
  } else {
    uber=Math.max(0,DF.n(s.manualUber)); deliveroo=Math.max(0,DF.n(s.manualDeliveroo));
    base=uber+deliveroo; orders=Math.max(0,DF.n(s.manualUberOrders))+Math.max(0,DF.n(s.manualDeliverooOrders));
  }
  const tips=DATA.cashTipsForSession(ctx,s.id);
  const cash=tips.reduce((a,x)=>a+Math.max(0,DF.n(x.amount)),0);
  tips.forEach(t=>{ if(t.platform==="uber")uber+=DF.n(t.amount); if(t.platform==="deliveroo")deliveroo+=DF.n(t.amount); });
  return {ca:base+cash,orders,uber,deliveroo,cashTips:cash};
};
DATA.sessionFuel = (state,s,distance) => DF.sessionFuel({
  distanceKm:distance,date:s.date,
  fuelPriceHistory:state.settings.fuelPriceHistory,
  consumptionHistory:state.settings.consumptionHistory,
  priceOverride:s.historyImported&&DF.n(s.fuelPriceAtTime)>0?DF.n(s.fuelPriceAtTime):undefined,
  consumptionOverride:s.historyImported&&DF.n(s.fuelConsumptionAtTime)>0?DF.n(s.fuelConsumptionAtTime):undefined
});
DATA.sessionMetrics = (state,ctx,s) => {
  const r=DATA.sessionRevenue(state,ctx,s),mins=DATA.sessionMinutes(s),distance=DATA.sessionDistance(s);
  const fuel=DATA.sessionFuel(state,s,distance),ur=DF.resolveUrssaf(state.settings,s.date);
  const fin=DF.financialMetrics({ca:r.ca,fuel,urssafEnabled:ur.enabled,urssafRatePct:ur.rate});
  return {...r,mins,hours:mins/60,distance,fuel,...fin};
};

DATA.dayMetrics = (state,ctx,date) => {
  if(ctx.dayCache.has(date))return ctx.dayCache.get(date);
  const ss=(ctx.indexes.sessionsByDate.get(date)||[]).slice();
  const sm=ss.map(s=>DATA.sessionMetrics(state,ctx,s));
  const out={date,sessions:ss,ca:0,orders:0,mins:0,distance:0,fuel:0,urssaf:0,netAfterFuel:0,netFinal:0,uber:0,deliveroo:0,cashTips:0};
  sm.forEach(x=>{for(const k of ["ca","orders","mins","distance","fuel","urssaf","netAfterFuel","netFinal","uber","deliveroo","cashTips"])out[k]+=DF.n(x[k]);});
  out.hours=out.mins/60; out.hourlyGross=out.hours?out.ca/out.hours:0; out.hourlyNet=out.hours?out.netFinal/out.hours:0;
  ctx.dayCache.set(date,out); return out;
};
DATA.datesBetween = (a,b) => { const out=[]; for(let d=DATA.parseDate(a),e=DATA.parseDate(b);d<=e;d=DATA.addDays(d,1))out.push(DATA.iso(d)); return out; };
DATA.aggregateDates = (state,ctx,dates) => {
  const days=(dates||[]).map(d=>DATA.dayMetrics(state,ctx,d)).filter(d=>d.sessions.length||d.ca);
  const out={days,ca:0,orders:0,mins:0,distance:0,fuel:0,urssaf:0,netAfterFuel:0,netFinal:0,workedDays:days.length};
  days.forEach(d=>{for(const k of ["ca","orders","mins","distance","fuel","urssaf","netAfterFuel","netFinal"])out[k]+=DF.n(d[k]);});
  out.hours=out.mins/60; out.hourlyGross=out.hours?out.ca/out.hours:0; out.hourlyNet=out.hours?out.netFinal/out.hours:0;
  const ruleDate=dates?.[0]||DATA.businessToday();
  out.savingsRule=DF.resolveSavingsRule({defaultRule:state.settings.defaultSavingsRule,weeklyOverrides:state.settings.weeklySavingsOverrides},ruleDate);
  out.savings=DF.savingsForPeriod({netAvailable:out.netFinal,rule:out.savingsRule,workedDays:out.workedDays});
  return out;
};

DATA.sessionBounds = s => {
  if(s.historyStartTimestamp&&s.historyEndTimestamp) return {start:String(s.historyStartTimestamp).replace(" ","T").slice(0,16),end:String(s.historyEndTimestamp).replace(" ","T").slice(0,16)};
  if(!s.date||!s.start||!s.end)return null;
  const d=DATA.parseDate(s.date),sm=DATA.businessMinute(s.start),em=DATA.businessMinute(s.end); if(sm==null||em==null)return null;
  const base=DATA.addDays(d,sm>=1200?1:0); // business minutes >=20h after 04:00 means next civil day only for 00-04 clocks
  const make=(businessMin)=>{
    const absolute=(businessMin+240)%1440,offset=businessMin+240>=1440?1:0,dd=DATA.addDays(d,offset);
    return `${DATA.iso(dd)}T${DATA.pad(Math.floor(absolute/60))}:${DATA.pad(absolute%60)}`;
  };
  return {start:make(sm),end:make(em)};
};
DATA.inferSessionCity = (state,ctx,s) => {
  const rows=ctx.indexes.uberByDate.get(s.date)||[]; if(!rows.length)return "Montpellier";
  const b=DATA.sessionBounds(s); let matched=rows;
  if(b)matched=rows.filter(r=>{const t=String(r.timestamp||"").replace(" ","T").slice(0,16);return t>=b.start&&t<=b.end;});
  if(!matched.length)matched=rows;
  const counts=new Map(); matched.forEach(r=>{const c=String(r.city||"Montpellier");counts.set(c,(counts.get(c)||0)+Math.max(1,DF.n(r.orderCount)));});
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"Montpellier";
};
DATA.analyticsSessions = (state,ctx) => {
  if(ctx.analyticCache)return ctx.analyticCache;
  const rows=[];
  for(const s of state.sessions||[]){
    const m=DATA.sessionMetrics(state,ctx,s); if(!(m.hours>0)||!(m.ca>=0))continue;
    const city=DATA.inferSessionCity(state,ctx,s); if(city && !/montpellier/i.test(city))continue;
    rows.push({
      id:s.id,date:s.date,dateDays:DATA.dateDays(s.date),weekday:DATA.weekday(s.date),startHour:DATA.clockHour(s.start),hours:m.hours,
      ca:m.ca,caHourly:m.hours?m.ca/m.hours:0,km:m.distance,kmHourly:m.hours?m.distance/m.hours:0,
      netFinal:m.netFinal,netHourly:m.hours?m.netFinal/m.hours:0,timeQuality:DATA.timeQuality(s),distanceQuality:DATA.distanceQuality(s),
      weather:state.weatherBySessionId?.[s.id]||null
    });
  }
  ctx.analyticCache=rows.sort((a,b)=>a.date.localeCompare(b.date)); return ctx.analyticCache;
};

DATA.rangeDates = (ref,mode) => {
  const end=DATA.parseDate(ref),map={week:7,m1:30,m3:91,m6:183,m12:365},days=map[mode]||91;
  return DATA.datesBetween(DATA.iso(DATA.addDays(end,-days+1)),DATA.iso(end));
};
DATA.weekDates = ref => {const s=DATA.startOfWeek(ref);return Array.from({length:7},(_,i)=>DATA.iso(DATA.addDays(s,i)));};
DATA.nextWeekDates = ref => {const s=DATA.addDays(DATA.startOfWeek(ref),7);return Array.from({length:7},(_,i)=>DATA.iso(DATA.addDays(s,i)));};
DATA.targetFrom = (date,startHour,hours,id) => ({id,date,dateDays:DATA.dateDays(date),weekday:DATA.weekday(date),startHour,hours});
DATA.defaultCandidates = dates => {
  const out=[];
  for(const date of dates){
    for(const h of [11.5,12,12.5])out.push(DATA.targetFrom(date,h,2,`${date}-m-${h}`));
    for(const h of [17.5,18,18.5,19,19.5,20])out.push(DATA.targetFrom(date,h,3,`${date}-s-${h}`));
  }
  return out;
};
DATA.availabilityCandidates = (dates,opt={}) => {
  const out=[]; const midday=opt.midday!==false,evening=opt.evening!==false;
  for(const date of dates){
    if(midday){const start=DF.n(opt.middayStart||12),end=DF.n(opt.middayEnd||14.5);for(let h=start;h+1.5<=end+0.01;h+=0.5)out.push(DATA.targetFrom(date,h,Math.min(2.5,end-h),`${date}-m-${h}`));}
    if(evening){const start=DF.n(opt.eveningStart||17.5),end=DF.n(opt.eveningEnd||23.5);for(let h=start;h+2<=end+0.01;h+=0.5)out.push(DATA.targetFrom(date,h,Math.min(3.5,end-h),`${date}-s-${h}`));}
  }
  return out;
};
DATA.distinctTop = (scored,n=4) => {
  const out=[],usedDays=new Set();
  for(const c of scored){if(usedDays.has(c.date))continue;out.push(c);usedDays.add(c.date);if(out.length>=n)break;} return out;
};

DATA.attachForecastWeather = async candidates => {
  if(!WX||!candidates?.length)return candidates;
  const start=candidates.map(x=>x.date).sort()[0],end=candidates.map(x=>x.date).sort().at(-1);
  try{
    const rows=await WX.fetchForecast({startDate:start,endDate:end});
    return candidates.map(c=>{
      const sh=Math.floor(c.startHour),sm=Math.round((c.startHour-sh)*60),startIso=`${c.date}T${DATA.pad(sh)}:${DATA.pad(sm)}`;
      const endDateObj=new Date(`${c.date}T${DATA.pad(sh)}:${DATA.pad(sm)}:00`);endDateObj.setMinutes(endDateObj.getMinutes()+Math.round(c.hours*60));
      const endIso=`${DATA.iso(endDateObj)}T${DATA.pad(endDateObj.getHours())}:${DATA.pad(endDateObj.getMinutes())}`;
      return {...c,weather:WX.aggregateInterval(rows,startIso,endIso)};
    });
  }catch{return candidates;}
};
DATA.enrichHistoricalWeather = async (state,onProgress=()=>{}) => {
  if(!WX||!navigator.onLine)return {status:"offline",count:0};
  const sessions=(state.sessions||[]).filter(s=>DATA.inferSessionCity(state,DATA.buildContext(state),s).toLowerCase().includes("montpellier"));
  const pending=sessions.filter(s=>!state.weatherBySessionId?.[s.id]&&DATA.sessionBounds(s)); if(!pending.length)return {status:"complete",count:0};
  const years=[...new Set(pending.map(s=>s.date.slice(0,4)))].sort(); let done=0;
  state.weatherBySessionId ||= {}; state.weatherMeta={...(state.weatherMeta||{}),status:"loading"}; DATA.save(state);
  for(const year of years){
    const ys=pending.filter(s=>s.date.startsWith(year)); if(!ys.length)continue;
    const start=ys.map(s=>s.date).sort()[0],end=ys.map(s=>s.date).sort().at(-1);
    try{
      const rows=await WX.fetchArchive({startDate:start,endDate:end});
      ys.forEach(s=>{const b=DATA.sessionBounds(s);if(b){const w=WX.aggregateInterval(rows,b.start,b.end);if(w){state.weatherBySessionId[s.id]=w;done++;}}});
      onProgress({year,done,total:pending.length}); DATA.save(state);
    }catch(e){state.weatherMeta={...(state.weatherMeta||{}),status:"error",error:String(e.message||e)};DATA.save(state);return {status:"error",count:done,error:e};}
  }
  state.weatherMeta={...(state.weatherMeta||{}),status:"complete",updatedAt:new Date().toISOString(),sessions:done}; DATA.save(state);
  return {status:"complete",count:done};
};

if(typeof module!=="undefined"&&module.exports)module.exports=DATA;else globalThis.DriveFlowV6Data=DATA;
})();