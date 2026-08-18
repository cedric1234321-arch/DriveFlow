(() => {
"use strict";
const DATA=globalThis.DriveFlowV6Data, DF=globalThis.DriveFlowV6Core;
if(!DATA||!DF)return;

const hasFinite = v => v!==null && v!==undefined && v!=="" && Number.isFinite(Number(v));

DATA.sessionMinutes = s => {
  let a=null,b=null;
  if(hasFinite(s?.historyStartMinute))a=Number(s.historyStartMinute);
  else if(hasFinite(s?.autoStartMinute))a=Number(s.autoStartMinute);
  else a=DATA.businessMinute(s?.start);
  if(hasFinite(s?.historyEndMinute))b=Number(s.historyEndMinute);
  else if(hasFinite(s?.autoEndMinute))b=Number(s.autoEndMinute);
  else b=DATA.businessMinute(s?.end);
  if(a==null||b==null||b<=a)return 0;
  let pauses=0;
  if(s?.pauseMinutesTotal!==undefined&&s?.pauseMinutesTotal!==null&&s?.pauseMinutesTotal!=="")pauses=Math.max(0,DF.n(s.pauseMinutesTotal));
  else if(s?.pauseStart&&s?.pauseEnd){const ps=DATA.businessMinute(s.pauseStart),pe=DATA.businessMinute(s.pauseEnd);if(ps!=null&&pe!=null&&pe>ps)pauses=pe-ps;}
  return Math.max(0,b-a-pauses);
};

// Match V5's accounting rule at day level: official imports are authoritative
// for their platform/date whether or not every order is currently assigned to a
// session. Session assignment affects session detail/time analysis, never CA.
DATA.dayMetrics=(state,ctx,date)=>{
  const cached=ctx.dayCache.get(date);if(cached?._reconciledV6)return cached;
  const ss=(ctx.indexes.sessionsByDate.get(date)||[]).slice(),sm=ss.map(s=>DATA.sessionMetrics(state,ctx,s));
  const ubAll=ctx.indexes.uberByDate.get(date)||[],dlAll=ctx.indexes.deliverooByDate.get(date)||[],tips=ctx.indexes.cashTipsByDate.get(date)||[];
  const officialUber=DATA.uberOfficialDate(state,date),officialDeliveroo=dlAll.length>0;
  const manualUber=ss.reduce((a,s)=>a+Math.max(0,DF.n(s.manualUber)),0),manualDel=ss.reduce((a,s)=>a+Math.max(0,DF.n(s.manualDeliveroo)),0);
  const manualUberOrders=ss.reduce((a,s)=>a+Math.max(0,DF.n(s.manualUberOrders)),0),manualDelOrders=ss.reduce((a,s)=>a+Math.max(0,DF.n(s.manualDeliverooOrders)),0);
  let uber=officialUber?ubAll.reduce((a,x)=>a+DF.n(x.total),0):manualUber;
  let deliveroo=officialDeliveroo?dlAll.reduce((a,x)=>a+DF.n(x.earnings),0):manualDel;
  const uberOrders=officialUber?ubAll.reduce((a,x)=>a+Math.max(0,DF.n(x.orderCount)),0):manualUberOrders;
  const delOrders=officialDeliveroo?dlAll.reduce((a,x)=>a+Math.max(0,DF.n(x.orderCount)),0):manualDelOrders;
  let cashTips=0;for(const t of tips){const amount=Math.max(0,DF.n(t.amount));cashTips+=amount;if(t.platform==="uber")uber+=amount;else if(t.platform==="deliveroo")deliveroo+=amount;}
  const mins=sm.reduce((a,x)=>a+DF.n(x.mins),0),distance=sm.reduce((a,x)=>a+DF.n(x.distance),0),fuel=sm.reduce((a,x)=>a+DF.n(x.fuel),0),ca=uber+deliveroo;
  const ur=DF.resolveUrssaf(state.settings,date),urssaf=ur.enabled?ca*ur.rate/100:0,netAfterFuel=ca-fuel,netFinal=netAfterFuel-urssaf;
  const out={date,sessions:ss,ca,orders:uberOrders+delOrders,mins,distance,fuel,urssaf,netAfterFuel,netFinal,uber,deliveroo,cashTips,officialUber,officialDeliveroo,_reconciledV6:true};
  out.hours=mins/60;out.hourlyGross=out.hours?ca/out.hours:0;out.hourlyNet=out.hours?netFinal/out.hours:0;ctx.dayCache.set(date,out);return out;
};

DATA.auditState = state => {
  const issues=[];
  for(const key of ["sessions","uberBatches","deliverooOrders","cashTips","weeklyPlans"])if(!Array.isArray(state?.[key]))issues.push(`${key}:not_array`);
  const duplicateIds = arr => {const seen=new Set(),dupes=[];for(const x of arr||[]){if(!x?.id)continue;if(seen.has(x.id))dupes.push(x.id);seen.add(x.id);}return dupes;};
  const sessionDupes=duplicateIds(state?.sessions),uberDupes=duplicateIds(state?.uberBatches),delDupes=duplicateIds(state?.deliverooOrders),tipDupes=duplicateIds(state?.cashTips);
  if(sessionDupes.length)issues.push(`duplicate_sessions:${sessionDupes.length}`);
  if(uberDupes.length)issues.push(`duplicate_uber:${uberDupes.length}`);
  if(delDupes.length)issues.push(`duplicate_deliveroo:${delDupes.length}`);
  if(tipDupes.length)issues.push(`duplicate_tips:${tipDupes.length}`);
  const sessionIds=new Set((state?.sessions||[]).map(x=>x.id));
  const danglingTips=(state?.cashTips||[]).filter(t=>t.sessionId&&!sessionIds.has(t.sessionId));
  if(danglingTips.length)issues.push(`dangling_tips:${danglingTips.length}`);
  return {ok:issues.length===0,issues,counts:{sessions:state?.sessions?.length||0,uber:state?.uberBatches?.length||0,deliveroo:state?.deliverooOrders?.length||0,tips:state?.cashTips?.length||0,plans:state?.weeklyPlans?.length||0}};
};
})();