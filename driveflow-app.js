(() => {
"use strict";

const K = {
  sessions:"driveflow.sessions.v4",
  uber:"driveflow.uber.v4",
  deliveroo:"driveflow.deliveroo.v4",
  settings:"driveflow.settings.v4",
  oldV3:"driveflow.entries.v3",
  oldV1:"livraisons.entries.v1"
};
const DEFAULTS = {
  defaultGoal:25,
  theme:"system",
  hideMoney:false,
  fuelConsumption:5.5,
  fuelPrice:2.2,
  goalOverrides:{},
  uberImport:{minDate:null,maxDate:null,importedAt:null,rows:0}
};
const MIN_GAP=30;

let settings, sessions, uberBatches, deliverooOrders;
let selectedDate, weekRef, statsRef, historyRef, compareRef;
let historyMode="month", compareMode="week";
let editingSessionId=null;

const $=id=>document.getElementById(id);
const n=v=>{const x=Number(String(v??"").replace(",", "."));return Number.isFinite(x)?x:0};
const euro=v=>`${n(v).toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:2})} €`;
const pad=x=>String(x).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function parseDate(s){const [y,m,d]=String(s).split("-").map(Number);return new Date(y,m-1,d)}
function addDays(d,k){const x=new Date(d);x.setDate(x.getDate()+k);return x}
function businessToday(){const x=new Date();if(x.getHours()<4)x.setDate(x.getDate()-1);return iso(x)}
function businessDateFromTimestamp(ts){
  const m=String(ts).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if(!m)return "";
  const d=new Date(+m[1],+m[2]-1,+m[3]);
  if(+m[4]<4)d.setDate(d.getDate()-1);
  return iso(d);
}
function timeFromTimestamp(ts){const m=String(ts).match(/[ T](\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:""}
function businessMinute(t){
  if(!t)return null;
  const [h,m]=t.split(":").map(Number);let mins=h*60+m;
  if(mins<240)mins+=1440;
  return mins-240;
}
function startOfWeek(date){const d=new Date(date),day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d}
function endOfWeek(date){return addDays(startOfWeek(date),6)}
function fmtDay(d){return new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(d)}
function fmtShort(d){return new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"}).format(d)}
function fmtMonth(d){return new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(d)}
function fmtRange(a,b){const f=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short"});return `${f.format(a)} – ${f.format(b)}`}
function fmtMinutes(m){m=Math.round(n(m));if(!m)return"—";const h=Math.floor(m/60),r=m%60;return r?`${h}h ${pad(r)}`:`${h}h`}
function fmtKm(k){return n(k)>0?`${n(k).toLocaleString("fr-FR",{maximumFractionDigits:1})} km`:"—"}
function uid(prefix="s"){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`}
function loadArray(key){try{const x=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function loadSettings(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(K.settings)||"{}")}}catch{return {...DEFAULTS}}}
function saveAll(){
  localStorage.setItem(K.sessions,JSON.stringify(sessions));
  localStorage.setItem(K.uber,JSON.stringify(uberBatches));
  localStorage.setItem(K.deliveroo,JSON.stringify(deliverooOrders));
  localStorage.setItem(K.settings,JSON.stringify(settings));
}
function loadSessions(){
  const cur=loadArray(K.sessions); if(cur.length)return cur;
  let old=[];
  try{old=JSON.parse(localStorage.getItem(K.oldV3)||"[]")}catch{}
  if(!Array.isArray(old)||!old.length){try{old=JSON.parse(localStorage.getItem(K.oldV1)||"[]")}catch{}}
  if(!Array.isArray(old))old=[];
  const migrated=old.map(e=>({
    id:uid("migrated"),date:e.date,type:"Autre",start:e.startTime||"",end:e.endTime||"",
    pauseStart:"",pauseEnd:"",odoStart:e.odoStart??null,odoEnd:e.odoEnd??null,
    manualUber:n(e.uber),manualUberOrders:0,manualDeliveroo:n(e.deliveroo),manualDeliverooOrders:0,
    note:e.note||"Importé depuis une version précédente"
  }));
  localStorage.setItem(K.sessions,JSON.stringify(migrated));
  return migrated;
}

// Initialize persisted state only after all helper functions used by migration are defined.
// This prevents a startup crash when upgrading from DriveFlow V3/V1.
settings=loadSettings();
sessions=loadSessions();
uberBatches=loadArray(K.uber);
deliverooOrders=loadArray(K.deliveroo);
selectedDate=businessToday();
weekRef=selectedDate; statsRef=selectedDate; historyRef=selectedDate; compareRef=selectedDate;
function goalForDate(date){
  const v=settings.goalOverrides?.[date];
  return v===0||v?Math.max(0,n(v)):Math.max(0,n(settings.defaultGoal));
}
function fuelCost(km){return n(km)*n(settings.fuelConsumption)/100*n(settings.fuelPrice)}
function pauseMinutes(s){
  if(!s.pauseStart||!s.pauseEnd)return 0;
  const a=businessMinute(s.pauseStart),b=businessMinute(s.pauseEnd);return a!=null&&b!=null&&b>a?b-a:0;
}
function sessionMinutes(s){
  const a=businessMinute(s.start),b=businessMinute(s.end);
  if(a==null||b==null||b<=a)return 0;
  return Math.max(0,b-a-pauseMinutes(s));
}
function sessionDistance(s){
  if(s.odoStart===null||s.odoEnd===null||s.odoStart===""||s.odoEnd==="")return 0;
  return Math.max(0,n(s.odoEnd)-n(s.odoStart));
}
function sessionsForDate(date){return sessions.filter(s=>s.date===date).sort((a,b)=>(businessMinute(a.start)??9999)-(businessMinute(b.start)??9999))}
function inSession(record,s){
  if(record.businessDate!==s.date)return false;
  const t=businessMinute(timeFromTimestamp(record.timestamp)),a=businessMinute(s.start),b=businessMinute(s.end);
  return t!=null&&a!=null&&b!=null&&t>=a&&t<=b;
}
function assignedSessionId(record){
  if(record.manualSessionId && sessions.some(s=>s.id===record.manualSessionId))return record.manualSessionId;
  const matches=sessionsForDate(record.businessDate).filter(s=>inSession(record,s));
  return matches.length===1?matches[0].id:null;
}
function uberOfficialDate(date){
  const x=settings.uberImport||{};
  return !!(x.minDate&&x.maxDate&&date>=x.minDate&&date<=x.maxDate);
}
function deliverooImportedDate(date){return deliverooOrders.some(o=>o.businessDate===date)}
function uberForDate(date){return uberBatches.filter(x=>x.businessDate===date)}
function deliverooForDate(date){return deliverooOrders.filter(x=>x.businessDate===date)}
function sessionData(s){
  const officialUber=uberOfficialDate(s.date), officialDel=deliverooImportedDate(s.date);
  const ub=officialUber?uberForDate(s.date).filter(x=>assignedSessionId(x)===s.id):[];
  const dl=officialDel?deliverooForDate(s.date).filter(x=>assignedSessionId(x)===s.id):[];
  const uber=officialUber?ub.reduce((a,x)=>a+x.total,0):n(s.manualUber);
  const deliveroo=officialDel?dl.reduce((a,x)=>a+x.earnings,0):n(s.manualDeliveroo);
  const uberOrders=officialUber?ub.reduce((a,x)=>a+x.orderCount,0):Math.max(0,n(s.manualUberOrders));
  const delOrders=officialDel?dl.reduce((a,x)=>a+x.orderCount,0):Math.max(0,n(s.manualDeliverooOrders));
  const mins=sessionMinutes(s),distance=sessionDistance(s);
  return {uber,deliveroo,total:uber+deliveroo,uberOrders,delOrders,orders:uberOrders+delOrders,mins,distance,fuel:fuelCost(distance)};
}
function dayData(date){
  const ss=sessionsForDate(date), officialUber=uberOfficialDate(date), officialDel=deliverooImportedDate(date);
  const ubAll=uberForDate(date), dlAll=deliverooForDate(date);
  const uber=officialUber?ubAll.reduce((a,x)=>a+x.total,0):ss.reduce((a,s)=>a+n(s.manualUber),0);
  const deliveroo=officialDel?dlAll.reduce((a,x)=>a+x.earnings,0):ss.reduce((a,s)=>a+n(s.manualDeliveroo),0);
  const uberOrders=officialUber?ubAll.reduce((a,x)=>a+x.orderCount,0):ss.reduce((a,s)=>a+n(s.manualUberOrders),0);
  const delOrders=officialDel?dlAll.reduce((a,x)=>a+x.orderCount,0):ss.reduce((a,s)=>a+n(s.manualDeliverooOrders),0);
  const uberOrderRevenue=officialUber?ubAll.filter(x=>x.orderCount>0).reduce((a,x)=>a+x.total,0):ss.filter(s=>n(s.manualUberOrders)>0).reduce((a,s)=>a+n(s.manualUber),0);
  const delOrderRevenue=officialDel?dlAll.filter(x=>x.orderCount>0).reduce((a,x)=>a+x.earnings,0):ss.filter(s=>n(s.manualDeliverooOrders)>0).reduce((a,s)=>a+n(s.manualDeliveroo),0);
  const mins=ss.reduce((a,s)=>a+sessionMinutes(s),0),distance=ss.reduce((a,s)=>a+sessionDistance(s),0);
  const total=uber+deliveroo,orders=uberOrders+delOrders,goal=goalForDate(date),saved=Math.min(total,goal),bonus=Math.max(0,total-goal);
  const unassignedUber=officialUber?ubAll.filter(x=>x.orderCount>0&&!assignedSessionId(x)):[];
  const unassignedDel=officialDel?dlAll.filter(x=>x.orderCount>0&&!assignedSessionId(x)):[];
  return {
    date,sessions:ss,uber,deliveroo,total,uberOrders,delOrders,orders,mins,distance,fuel:fuelCost(distance),
    hourly:mins?total/(mins/60):0,orderRevenue:uberOrderRevenue+delOrderRevenue,avgOrder:orders?(uberOrderRevenue+delOrderRevenue)/orders:0,goal,saved,bonus,success:goal===0?null:total>=goal,
    officialUber,officialDel,unassignedUber,unassignedDel,unassigned:[...unassignedUber,...unassignedDel]
  };
}
function allBusinessDates(){
  const set=new Set(sessions.map(s=>s.date));
  uberBatches.forEach(x=>set.add(x.businessDate));deliverooOrders.forEach(x=>set.add(x.businessDate));
  return [...set].filter(Boolean).sort();
}
function datesInRange(mode,ref){
  const r=parseDate(ref);
  if(mode==="day")return [ref];
  if(mode==="week"){const s=startOfWeek(r);return Array.from({length:7},(_,i)=>iso(addDays(s,i)))}
  if(mode==="month"){
    const y=r.getFullYear(),m=r.getMonth(),last=new Date(y,m+1,0).getDate();
    return Array.from({length:last},(_,i)=>iso(new Date(y,m,i+1)));
  }
  return allBusinessDates();
}
function aggregate(mode,ref){
  const dates=datesInRange(mode,ref),days=dates.map(dayData);
  const used=days.filter(d=>d.sessions.length||d.total||d.orders);
  const out={dates,days,used,total:0,saved:0,bonus:0,mins:0,distance:0,fuel:0,orders:0,orderRevenue:0,uber:0,deliveroo:0,best:0};
  used.forEach(d=>{out.total+=d.total;out.saved+=d.saved;out.bonus+=d.bonus;out.mins+=d.mins;out.distance+=d.distance;out.fuel+=d.fuel;out.orders+=d.orders;out.orderRevenue+=d.orderRevenue;out.uber+=d.uber;out.deliveroo+=d.deliveroo;out.best=Math.max(out.best,d.total)});
  out.net=out.total-out.fuel;out.hourly=out.mins?out.total/(out.mins/60):0;out.avgOrder=out.orders?out.orderRevenue/out.orders:0;
  return out;
}
function periodLabel(mode,ref){
  const d=parseDate(ref);
  if(mode==="day")return fmtDay(d);
  if(mode==="week")return fmtRange(startOfWeek(d),endOfWeek(d));
  if(mode==="month")return fmtMonth(d);
  return "Depuis le début";
}
function stepRef(ref,mode,dir){
  const d=parseDate(ref);
  if(mode==="day")return iso(addDays(d,dir));
  if(mode==="week")return iso(addDays(d,7*dir));
  if(mode==="month"){d.setMonth(d.getMonth()+dir);return iso(d)}
  return ref;
}
function dateContext(date){
  if(date===businessToday())return"Aujourd’hui";
  if(date===iso(addDays(parseDate(businessToday()),-1)))return"Hier";
  if(date===iso(addDays(parseDate(businessToday()),1)))return"Demain";
  return"Journée";
}

/* Theme / privacy */
function applyTheme(){
  document.documentElement.classList.remove("light");
  const systemDark=matchMedia("(prefers-color-scheme: dark)").matches;
  if(settings.theme==="light"||(settings.theme==="system"&&!systemDark))document.documentElement.classList.add("light");
  $("themeSelect").value=settings.theme;
}
function applyPrivacy(){document.querySelectorAll(".money").forEach(x=>x.classList.toggle("hidden-money",settings.hideMoney))}
applyTheme();
setTimeout(()=>$("splash").classList.add("hide"),550);

/* Today */
function renderToday(){
  const d=dayData(selectedDate);
  $("dateContext").textContent=dateContext(selectedDate);$("dateLabel").textContent=fmtDay(parseDate(selectedDate));
  $("todayTotal").textContent=euro(d.total);$("todayUber").textContent=euro(d.uber);$("todayDeliveroo").textContent=euro(d.deliveroo);
  $("todayUberSource").textContent=d.officialUber?"Import Uber":"Saisie manuelle";
  $("todayDelSource").textContent=d.officialDel?"Import Deliveroo":"Saisie manuelle";
  $("goalText").textContent=d.goal===0?"Repos":euro(d.goal);
  const b=$("goalBadge");b.className="badge ";
  if(d.goal===0){b.classList.add("neutral");b.textContent="Jour de repos"}
  else if(!d.sessions.length&&!d.total){b.classList.add("neutral");b.textContent="À saisir"}
  else if(d.success){b.classList.add("success");b.textContent="Objectif atteint ✓"}
  else{b.classList.add("warning");b.textContent=`${euro(Math.max(0,d.goal-d.total))} à faire`}
  const denom=Math.max(d.goal,d.total,1);
  $("goalDoneBar").style.width=`${d.goal?Math.min(d.total,d.goal)/denom*100:0}%`;
  $("goalBonusBar").style.width=`${d.goal?d.bonus/denom*100:(d.total?100:0)}%`;
  $("goalObjectiveLabel").textContent=d.goal===0?"Repos":`Objectif ${euro(Math.min(d.total,d.goal))} / ${euro(d.goal)}`;
  $("goalBonusLabel").textContent=`Bonus +${euro(d.goal===0?d.total:d.bonus)}`;
  $("workTime").textContent=fmtMinutes(d.mins);$("distanceText").textContent=fmtKm(d.distance);
  $("hourlyText").textContent=d.hourly?`${euro(d.hourly)}/h`:"—";$("avgOrderText").textContent=d.avgOrder?euro(d.avgOrder):"—";
  const ua=d.unassigned;
  $("unassignedCard").hidden=!ua.length;
  if(ua.length){const amt=ua.reduce((a,x)=>a+(x.total??x.earnings??0),0),orders=ua.reduce((a,x)=>a+n(x.orderCount),0);$("unassignedTitle").textContent=`${orders} commande${orders>1?"s":""} à classer`;$("unassignedText").textContent=`${euro(amt)} · hors de tes sessions actuelles`}
  renderSessions(d);applyPrivacy();
}
function renderSessions(d){
  const box=$("sessionList");box.innerHTML="";
  if(!d.sessions.length){box.innerHTML='<div class="history-empty card">Aucune session pour cette journée. Ajoute ton créneau même si tu n’as réalisé aucune commande.</div>';return}
  d.sessions.forEach(s=>{
    const x=sessionData(s),el=document.createElement("article");el.className="session-card";
    const pause=pauseMinutes(s);
    el.innerHTML=`<div class="session-card-top"><div><h3>${esc(s.type||"Session")}</h3><div class="times">${esc(s.start||"—")}–${esc(s.end||"—")}${pause?` · pause ${fmtMinutes(pause)}`:""}</div></div><div class="amount money">${euro(x.total)}</div></div>
      <div class="platforms">Uber ${euro(x.uber)} <span class="source-chip">${d.officialUber?"import":"manuel"}</span> · Deliveroo ${euro(x.deliveroo)} <span class="source-chip">${d.officialDel?"import":"manuel"}</span></div>
      <div class="session-meta"><span>${fmtMinutes(x.mins)} consacrées</span><span>${fmtKm(x.distance)}</span><span>${x.orders||0} commande${x.orders>1?"s":""}</span>${x.total&&x.mins?`<span>${euro(x.total/(x.mins/60))}/h</span>`:""}</div>`;
    el.onclick=()=>openSessionSheet(s.id);box.appendChild(el)
  });
}

/* Week */
function renderWeek(){
  const dates=datesInRange("week",weekRef),days=dates.map(dayData),goal=dates.reduce((a,d)=>a+goalForDate(d),0);
  const saved=days.reduce((a,d)=>a+d.saved,0),earned=days.reduce((a,d)=>a+d.total,0),bonus=days.reduce((a,d)=>a+d.bonus,0),mins=days.reduce((a,d)=>a+d.mins,0),dist=days.reduce((a,d)=>a+d.distance,0);
  const planned=days.filter(d=>d.goal>0),success=planned.filter(d=>d.total>=d.goal).length;
  $("weekRange").textContent=periodLabel("week",weekRef);$("weekSaved").textContent=euro(saved);$("weekGoalText").textContent=`/ ${euro(goal)}`;
  $("weekProgress").style.width=`${goal?Math.min(100,saved/goal*100):100}%`;$("weekSuccess").textContent=planned.length?`${success} / ${planned.length} objectifs atteints`:"Aucun objectif prévu";
  $("weekRemaining").textContent=goal?`${euro(Math.max(0,goal-saved))} restants`:"Repos";
  $("weekEarned").textContent=euro(earned);$("weekBonus").textContent=euro(bonus);$("weekHours").textContent=fmtMinutes(mins);$("weekDistance").textContent=fmtKm(dist);
  const wb=$("weekGoalBadge");wb.className="badge "+(goal&&saved>=goal?"success":"neutral");wb.textContent=goal&&saved>=goal?"Atteint ✓":goal?`${Math.round(saved/goal*100)} %`:"Repos";
  const box=$("weekBars");box.innerHTML="";const max=Math.max(...days.map(d=>Math.max(d.total,d.goal)),1);
  days.forEach(d=>{const el=document.createElement("div");el.className="week-col";const gp=Math.min(d.total,d.goal),bp=Math.max(0,d.total-d.goal);el.innerHTML=`<div class="day-total money">${d.total?euro(d.total):"—"}</div><div class="week-bar-track"><div class="week-goal-part" style="height:${gp/max*100}%"></div><div class="week-bonus-part" style="height:${bp/max*100}%"></div></div><small>${new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(parseDate(d.date)).slice(0,3)}</small>`;el.onclick=()=>{selectedDate=d.date;switchView("today")};box.appendChild(el)});
  applyPrivacy();
}

/* Stats */
function renderStats(){
  const mode=$("statsRange").value,ag=aggregate(mode,statsRef);
  $("statsPeriodNav").hidden=mode==="all";$("statsPeriodLabel").querySelector("strong").textContent=periodLabel(mode,statsRef);
  $("statsEarned").textContent=euro(ag.total);$("statsSaved").textContent=euro(ag.saved);$("statsFuel").textContent=euro(ag.fuel);$("statsNet").textContent=euro(ag.net);
  $("statsWork").textContent=fmtMinutes(ag.mins);$("statsKm").textContent=fmtKm(ag.distance);$("avgHour").textContent=ag.hourly?`${euro(ag.hourly)}/h`:"—";$("avgOrder").textContent=ag.avgOrder?euro(ag.avgOrder):"—";$("statsOrders").textContent=Math.round(ag.orders);$("bestDay").textContent=ag.best?euro(ag.best):"—";
  const total=ag.uber+ag.deliveroo,u=total?ag.uber/total*100:0,dl=total?100-u:0;$("shareUber").textContent=`${Math.round(u)} %`;$("shareDeliveroo").textContent=`${Math.round(dl)} %`;$("shareUberBar").style.width=`${u}%`;$("shareDelBar").style.width=`${dl}%`;
  applyPrivacy();
}

/* History */
function renderHistory(){
  $("historyPeriodNav").hidden=historyMode==="all";$("historyPeriodLabel").querySelector("strong").textContent=periodLabel(historyMode,historyRef);
  const dates=datesInRange(historyMode,historyRef).filter(date=>{const d=dayData(date);return d.sessions.length||d.total||d.orders}).sort().reverse();
  const platform=$("historyPlatform").value,box=$("historyList");box.innerHTML="";
  dates.forEach(date=>{
    const d=dayData(date),value=platform==="uber"?d.uber:platform==="deliveroo"?d.deliveroo:d.total;
    if(platform!=="all"&&!value)return;
    const orders=platform==="uber"?d.uberOrders:platform==="deliveroo"?d.delOrders:d.orders;
    const el=document.createElement("article");el.className="history-item";
    el.innerHTML=`<div><div class="date">${fmtShort(parseDate(date))}</div><div class="sub">${d.sessions.length} session${d.sessions.length>1?"s":""} · ${fmtMinutes(d.mins)} · ${fmtKm(d.distance)}<br>Uber ${euro(d.uber)} · Deliveroo ${euro(d.deliveroo)}</div></div><div class="right"><strong class="money">${euro(value)}</strong><small>${orders} commande${orders>1?"s":""}</small></div>`;
    el.onclick=()=>{selectedDate=date;switchView("today")};box.appendChild(el)
  });
  if(!box.children.length)box.innerHTML='<div class="history-empty card">Aucune donnée sur cette période.</div>';
  applyPrivacy();
}

/* Platform comparison */
function platformRecords(mode,ref,platform){
  const dates=new Set(datesInRange(mode,ref));
  const records=[];
  if(platform==="uber"){
    uberBatches.filter(x=>dates.has(x.businessDate)).forEach(x=>records.push({revenue:x.total,orders:x.orderCount,values:uberPerOrderValues(x),sessionId:assignedSessionId(x),date:x.businessDate}));
    // Manual Uber only outside official import coverage
    sessions.filter(s=>dates.has(s.date)&&!uberOfficialDate(s.date)&&n(s.manualUber)>0).forEach(s=>{const c=Math.max(0,n(s.manualUberOrders));records.push({revenue:n(s.manualUber),orders:c,values:c?Array(c).fill(n(s.manualUber)/c):[],sessionId:s.id,date:s.date})})
  } else {
    deliverooOrders.filter(x=>dates.has(x.businessDate)).forEach(x=>records.push({revenue:x.earnings,orders:x.orderCount,values:Array(Math.max(1,x.orderCount)).fill(x.earnings/Math.max(1,x.orderCount)),sessionId:assignedSessionId(x),date:x.businessDate}));
    sessions.filter(s=>dates.has(s.date)&&!deliverooImportedDate(s.date)&&n(s.manualDeliveroo)>0).forEach(s=>{const c=Math.max(0,n(s.manualDeliverooOrders));records.push({revenue:n(s.manualDeliveroo),orders:c,values:c?Array(c).fill(n(s.manualDeliveroo)/c):[],sessionId:s.id,date:s.date})})
  }
  return records;
}
function uberPerOrderValues(x){
  const count=Math.max(0,n(x.orderCount)),base=Array.isArray(x.orderValues)?x.orderValues.map(n):[];
  if(!count)return [];
  if(base.length===count){const extra=x.total-base.reduce((a,v)=>a+v,0),share=extra/count;return base.map(v=>v+share)}
  return Array(count).fill(x.total/count);
}
function median(a){const x=a.filter(Number.isFinite).sort((p,q)=>p-q);if(!x.length)return 0;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function platformMetrics(mode,ref,p){
  const rec=platformRecords(mode,ref,p),revenue=rec.reduce((a,x)=>a+x.revenue,0),orders=rec.reduce((a,x)=>a+x.orders,0),orderRevenue=rec.filter(x=>x.orders>0).reduce((a,x)=>a+x.revenue,0),vals=rec.flatMap(x=>x.values||[]);
  let midi=0,soir=0,autre=0;
  rec.forEach(x=>{const s=sessions.find(z=>z.id===x.sessionId);if(!s)return;if(s.type==="Midi")midi+=x.revenue;else if(s.type==="Soir")soir+=x.revenue;else autre+=x.revenue});
  return {revenue,orders,avg:orders?orderRevenue/orders:0,median:median(vals),best:vals.length?Math.max(...vals):0,midi,soir,autre};
}
function renderCompare(){
  $("comparePeriodNav").hidden=compareMode==="all";$("comparePeriodLabel").querySelector("strong").textContent=periodLabel(compareMode,compareRef);
  const u=platformMetrics(compareMode,compareRef,"uber"),d=platformMetrics(compareMode,compareRef,"deliveroo");
  const card=(name,x)=>`<article class="compare-card"><h3>${name}</h3><div class="big money">${euro(x.revenue)}</div><div class="compare-kpis"><div><span>Commandes réalisées</span><strong>${x.orders}</strong></div><div><span>Moyenne / commande</span><strong class="money">${x.avg?euro(x.avg):"—"}</strong></div><div><span>Médiane / commande</span><strong class="money">${x.median?euro(x.median):"—"}</strong></div><div><span>Meilleure commande</span><strong class="money">${x.best?euro(x.best):"—"}</strong></div><div><span>Midi</span><strong class="money">${euro(x.midi)}</strong></div><div><span>Soir</span><strong class="money">${euro(x.soir)}</strong></div></div></article>`;
  let verdict="Les données disponibles décrivent uniquement les commandes que tu as effectivement réalisées.";
  if(u.avg&&d.avg){const diff=Math.abs(u.avg-d.avg),winner=u.avg>d.avg?"Uber":"Deliveroo";verdict+=` Sur cette période, le revenu moyen observé par commande est supérieur de ${euro(diff)} chez ${winner}. Cela ne mesure pas la qualité des offres refusées ni la performance intrinsèque de la plateforme.`}
  $("compareContent").innerHTML=`<div class="compare-grid">${card("Uber Eats",u)}${card("Deliveroo",d)}</div><section class="compare-verdict"><h3>Lecture de la période</h3><p>${verdict}</p></section>`;
  applyPrivacy();
}

/* Session sheet */
function openSessionSheet(id=null){
  editingSessionId=id;const s=id?sessions.find(x=>x.id===id):null;
  $("sessionTitle").textContent=s?"Modifier la session":"Ajouter une session";$("sessionId").value=s?.id||"";$("sessionDate").value=s?.date||selectedDate;
  setSessionType(s?.type||"Midi");$("sessionStart").value=s?.start||"";$("sessionEnd").value=s?.end||"";$("pauseStart").value=s?.pauseStart||"";$("pauseEnd").value=s?.pauseEnd||"";
  $("odoStart").value=s?.odoStart??"";$("odoEnd").value=s?.odoEnd??"";$("manualUber").value=s?.manualUber??"";$("manualUberOrders").value=s?.manualUberOrders??"";$("manualDeliveroo").value=s?.manualDeliveroo??"";$("manualDeliverooOrders").value=s?.manualDeliverooOrders??"";$("sessionNote").value=s?.note||"";
  $("deleteSession").hidden=!s;$("sessionError").hidden=true;openSheet($("sessionSheet"))
}
function setSessionType(type){document.querySelectorAll("[data-session-type]").forEach(b=>b.classList.toggle("active",b.dataset.sessionType===type))}
function chosenSessionType(){return document.querySelector("[data-session-type].active")?.dataset.sessionType||"Autre"}
function validateSession(s){
  if(!s.date||!s.start||!s.end)return"Renseigne la date, l’heure de début et l’heure de fin.";
  const a=businessMinute(s.start),b=businessMinute(s.end);
  if(a==null||b==null||b<=a)return"La fin de session doit être postérieure au début dans la journée DriveFlow (04:00 → 04:00).";
  if((s.pauseStart&&!s.pauseEnd)||(!s.pauseStart&&s.pauseEnd))return"Renseigne le début et la fin de la pause, ou laisse les deux champs vides.";
  if(s.pauseStart&&s.pauseEnd){const ps=businessMinute(s.pauseStart),pe=businessMinute(s.pauseEnd);if(pe<=ps||ps<a||pe>b)return"La pause doit se trouver entièrement à l’intérieur de la session."}
  const hasOdoStart=s.odoStart!==null&&s.odoStart!=="",hasOdoEnd=s.odoEnd!==null&&s.odoEnd!=="";
  if(hasOdoStart!==hasOdoEnd)return"Renseigne les deux kilométrages, départ et arrivée.";
  if(hasOdoStart&&n(s.odoEnd)<n(s.odoStart))return"Le kilométrage d’arrivée ne peut pas être inférieur au kilométrage de départ.";
  const others=sessions.filter(x=>x.date===s.date&&x.id!==s.id);
  for(const o of others){const oa=businessMinute(o.start),ob=businessMinute(o.end);if(oa==null||ob==null)continue;const enoughBefore=b+MIN_GAP<=oa,enoughAfter=a>=ob+MIN_GAP;if(!enoughBefore&&!enoughAfter)return`Cette session est trop proche de « ${o.type||"Session"} » (${o.start}–${o.end}). Garde au moins ${MIN_GAP} minutes entre deux sessions.`}
  return"";
}
function readSessionForm(){
  return {id:$("sessionId").value||uid("session"),date:$("sessionDate").value,type:chosenSessionType(),start:$("sessionStart").value,end:$("sessionEnd").value,pauseStart:$("pauseStart").value,pauseEnd:$("pauseEnd").value,odoStart:$("odoStart").value===""?null:n($("odoStart").value),odoEnd:$("odoEnd").value===""?null:n($("odoEnd").value),manualUber:n($("manualUber").value),manualUberOrders:Math.max(0,Math.round(n($("manualUberOrders").value))),manualDeliveroo:n($("manualDeliveroo").value),manualDeliverooOrders:Math.max(0,Math.round(n($("manualDeliverooOrders").value))),note:$("sessionNote").value.trim()}
}
function saveSession(){
  const s=readSessionForm(),err=validateSession(s);
  if(err){$("sessionError").textContent=err;$("sessionError").hidden=false;return}
  const i=sessions.findIndex(x=>x.id===s.id);if(i>=0)sessions[i]=s;else sessions.push(s);saveAll();selectedDate=s.date;closeAllSheets();renderAll()
}
function removeSession(){
  if(!editingSessionId)return;if(!confirm("Supprimer cette session ? Les commandes importées ne seront pas supprimées et passeront éventuellement dans « À classer »."))return;
  sessions=sessions.filter(x=>x.id!==editingSessionId);uberBatches.forEach(x=>{if(x.manualSessionId===editingSessionId)x.manualSessionId=null});deliverooOrders.forEach(x=>{if(x.manualSessionId===editingSessionId)x.manualSessionId=null});saveAll();closeAllSheets();renderAll()
}

/* Classifier */
function renderClassifier(){
  const d=dayData(selectedDate),items=[...d.unassignedUber.map(x=>({...x,_p:"uber",_amount:x.total})),...d.unassignedDel.map(x=>({...x,_p:"deliveroo",_amount:x.earnings}))],box=$("classifierList");box.innerHTML="";
  const ss=sessionsForDate(selectedDate);
  if(!items.length){box.innerHTML='<div class="history-empty">Tout est classé.</div>';return}
  items.forEach(r=>{const el=document.createElement("div");el.className="classify-row";const t=timeFromTimestamp(r.timestamp);el.innerHTML=`<div class="classify-row-top"><div><strong>${r._p==="uber"?"Uber Eats":"Deliveroo"} · ${t}</strong><br><small>${r.orderCount} commande${r.orderCount>1?"s":""}${r.merchant?` · ${esc(r.merchant)}`:""}</small></div><strong class="money">${euro(r._amount)}</strong></div><select><option value="">Choisir une session…</option>${ss.map(s=>`<option value="${s.id}">${esc(s.type)} · ${s.start}–${s.end}</option>`).join("")}</select>`;
    el.querySelector("select").onchange=e=>{if(!e.target.value)return;r.manualSessionId=e.target.value;if(r._p==="uber"){const x=uberBatches.find(z=>z.id===r.id);if(x)x.manualSessionId=e.target.value}else{const x=deliverooOrders.find(z=>z.id===r.id);if(x)x.manualSessionId=e.target.value}saveAll();renderClassifier();renderAll()};box.appendChild(el)});
  applyPrivacy();
}

/* CSV */
function parseCsvLine(line,sep){const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===sep&&!q){out.push(cur);cur=""}else cur+=ch}out.push(cur);return out}
function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,"").replace(/\r/g,"").split("\n").filter(x=>x.trim());if(!lines.length)return[];
  const commas=parseCsvLine(lines[0],",").length,semis=parseCsvLine(lines[0],";").length,sep=semis>commas?";":",";
  const headers=parseCsvLine(lines[0],sep).map(h=>h.trim());
  return lines.slice(1).map(line=>{const vals=parseCsvLine(line,sep),o={};headers.forEach((h,i)=>o[h]=(vals[i]??"").trim());return o})
}
function normalizeDate(v){v=String(v||"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${pad(m[2])}-${pad(m[1])}`:""}
function importUber(rows){
  const required=["Trip UUID","Local Amount","Classification","Category","Local Timestamp"],headers=rows[0]?Object.keys(rows[0]):[];
  const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Colonnes Uber manquantes : ${missing.join(", ")}`);
  const old=new Map(uberBatches.map(x=>[x.id,x])),groups=new Map();
  rows.forEach((r,idx)=>{const raw=String(r["Trip UUID"]||"").trim();const id=raw||`standalone:${r["Local Timestamp"]||""}:${r["Classification"]||""}:${idx}`;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r)});
  const fresh=[];
  groups.forEach((rs,uuid)=>{
    const base=rs.filter(r=>r["Classification"]==="delivery.fare.upfront_base"),allAmounts=rs.map(r=>n(r["Local Amount"]));
    const total=allAmounts.reduce((a,v)=>a+v,0),fare=base.reduce((a,r)=>a+n(r["Local Amount"]),0),tips=rs.filter(r=>r["Category"]==="tip"||r["Classification"]==="transport.misc.tip").reduce((a,r)=>a+n(r["Local Amount"]),0);
    const timestamp=(base[0]||rs[0])["Local Timestamp"],orderCount=base.length,id=`uber:${uuid}`,prev=old.get(id);
    fresh.push({id,tripUUID:uuid,platform:"uber",timestamp,businessDate:businessDateFromTimestamp(timestamp),city:(base[0]||rs[0])["City Name"]||"",total,fare,tips,other:total-fare-tips,orderCount,orderValues:base.map(r=>n(r["Local Amount"])),paymentRows:rs.length,manualSessionId:prev?.manualSessionId||null});
  });
  fresh.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  let added=0,updated=0; fresh_loop: for(const x of fresh){const p=old.get(x.id);if(!p){added++;continue fresh_loop}if(Math.abs(p.total-x.total)>.001||p.orderCount!==x.orderCount||Math.abs((p.tips||0)-x.tips)>.001)updated++}
  const dates=fresh.map(x=>x.businessDate).filter(Boolean).sort(),minDate=dates[0]||null,maxDate=dates.at(-1)||null;
  uberBatches=fresh;settings.uberImport={minDate,maxDate,importedAt:new Date().toISOString(),rows:rows.length};
  saveAll();
  const multi=fresh.filter(x=>x.orderCount>1).length,tips=fresh.filter(x=>x.tips>0).length,orders=fresh.reduce((a,x)=>a+x.orderCount,0),unassigned=fresh.filter(x=>!assignedSessionId(x)).length;
  return {type:"Uber",lines:[["Lignes de paiement",rows.length],["Paiements / groupes Uber",fresh.length],["Commandes détectées",orders],["Commandes groupées",multi],["Courses avec pourboire",tips],["Nouveaux groupes",added],["Groupes mis à jour",updated],["À classer actuellement",unassigned],["Période",minDate&&maxDate?`${minDate} → ${maxDate}`:"—"]]};
}
function importDeliveroo(rows){
  const required=["date","time","earnings","order_count","merchant"],headers=rows[0]?Object.keys(rows[0]).map(x=>x.toLowerCase()):[];
  const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Colonnes Deliveroo manquantes : ${missing.join(", ")}`);
  const old=new Map(deliverooOrders.map(x=>[x.id,x]));let added=0,updated=0,skipped=0;
  rows.forEach(raw=>{
    const r={};Object.keys(raw).forEach(k=>r[k.toLowerCase()]=raw[k]);
    const date=normalizeDate(r.date),time=String(r.time||"").trim().slice(0,5),earn=n(r.earnings),count=Math.max(1,Math.round(n(r.order_count))),merchant=String(r.merchant||"").trim();
    if(!date||!/^\d{2}:\d{2}$/.test(time)||!merchant){skipped++;return}
    const key=(r.external_id||`${date}|${time}|${merchant}|${count}`).toLowerCase().replace(/\s+/g," ").trim(),id=`deliveroo:${key}`,prev=old.get(id);
    const timestamp=`${date} ${time}:00`,obj={id,platform:"deliveroo",timestamp,businessDate:businessDateFromTimestamp(timestamp),earnings:earn,orderCount:count,merchant,notes:r.notes||"",manualSessionId:prev?.manualSessionId||null};
    if(prev){if(Math.abs(prev.earnings-earn)>.001||prev.orderCount!==count){updated++}Object.assign(prev,obj)}
    else{deliverooOrders.push(obj);old.set(id,obj);added++}
  });
  deliverooOrders.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));saveAll();
  const unassigned=deliverooOrders.filter(x=>!assignedSessionId(x)).length;
  return {type:"Deliveroo",lines:[["Nouvelles lignes",added],["Lignes mises à jour",updated],["Lignes ignorées",skipped],["Commandes dans la base",deliverooOrders.reduce((a,x)=>a+x.orderCount,0)],["À classer actuellement",unassigned]]};
}

/* Import report */
function openReport(report){$("reportTitle").textContent=`Import ${report.type} terminé`;$("reportContent").innerHTML=report.lines.map(([a,b])=>`<div class="report-line"><span>${esc(a)}</span><strong>${esc(String(b))}</strong></div>`).join("");openSheet($("reportSheet"))}

/* Settings */
function renderSettings(){
  $("dailyGoalInput").value=settings.defaultGoal;$("themeSelect").value=settings.theme;$("fuelConsumption").value=settings.fuelConsumption;$("fuelPrice").value=settings.fuelPrice;
  const box=$("overrideList");box.innerHTML="";Object.entries(settings.goalOverrides||{}).sort(([a],[b])=>b.localeCompare(a)).forEach(([date,goal])=>{const el=document.createElement("div");el.className="override-row";el.innerHTML=`<span>${fmtShort(parseDate(date))} · ${n(goal)===0?"Repos":euro(goal)}</span><button>Supprimer</button>`;el.querySelector("button").onclick=()=>{delete settings.goalOverrides[date];saveAll();renderSettings();renderAll()};box.appendChild(el)})
}

/* Backup / export */
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportSummaryCsv(){
  const rows=[["date","uber","deliveroo","total","orders","work_minutes","distance_km","fuel_cost","goal","saved","bonus"]];
  allBusinessDates().forEach(date=>{const d=dayData(date);rows.push([date,d.uber,d.deliveroo,d.total,d.orders,d.mins,d.distance,d.fuel,d.goal,d.saved,d.bonus])});
  const escCsv=v=>`"${String(v??"").replaceAll('"','""')}"`;download(`driveflow-v4-${businessToday()}.csv`,"\uFEFF"+rows.map(r=>r.map(escCsv).join(";")).join("\n"),"text/csv;charset=utf-8")
}

/* Sheet helpers */
function openSheet(el){$("sheetBackdrop").hidden=false;requestAnimationFrame(()=>el.classList.add("open"));el.setAttribute("aria-hidden","false");document.body.style.overflow="hidden"}
function closeAllSheets(){document.querySelectorAll(".sheet.open").forEach(x=>{x.classList.remove("open");x.setAttribute("aria-hidden","true")});setTimeout(()=>$("sheetBackdrop").hidden=true,220);document.body.style.overflow=""}
function esc(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

/* Navigation */
function switchView(v){
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));$(`${v}View`).classList.add("active");document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  $("openSession").style.display=v==="today"?"block":"none";
  if(v==="today")renderToday();if(v==="week")renderWeek();if(v==="stats")renderStats();if(v==="history")renderHistory();if(v==="settings")renderSettings();
  window.scrollTo({top:0,behavior:"instant"})
}
function renderAll(){renderToday();renderWeek();renderStats();renderHistory();renderSettings();renderCompare();applyPrivacy()}

/* Events */
$("brandHome").onclick=()=>switchView("today");
$("prevDay").onclick=()=>{selectedDate=iso(addDays(parseDate(selectedDate),-1));renderToday()};
$("nextDay").onclick=()=>{selectedDate=iso(addDays(parseDate(selectedDate),1));renderToday()};
$("openDatePicker").onclick=()=>{const p=$("datePicker");p.value=selectedDate;p.showPicker?p.showPicker():p.click()};
$("datePicker").onchange=e=>{if(e.target.value){selectedDate=e.target.value;renderToday()}};
$("openSession").onclick=()=>openSessionSheet();$("addSessionTop").onclick=()=>openSessionSheet();$("closeSession").onclick=closeAllSheets;$("saveSession").onclick=saveSession;$("deleteSession").onclick=removeSession;
document.querySelectorAll("[data-session-type]").forEach(b=>b.onclick=()=>setSessionType(b.dataset.sessionType));
$("sheetBackdrop").onclick=e=>{if(e.target===$("sheetBackdrop"))closeAllSheets()};

$("openClassifier").onclick=()=>{renderClassifier();openSheet($("classifierSheet"))};$("closeClassifier").onclick=closeAllSheets;
$("closeReport").onclick=closeAllSheets;$("reportDone").onclick=closeAllSheets;

$("prevWeek").onclick=()=>{weekRef=stepRef(weekRef,"week",-1);renderWeek()};$("nextWeek").onclick=()=>{weekRef=stepRef(weekRef,"week",1);renderWeek()};
$("thisWeekBtn").onclick=()=>{weekRef=businessToday();renderWeek()};
$("openWeekPicker").onclick=()=>{const p=$("weekPicker");p.value=weekRef;p.showPicker?p.showPicker():p.click()};$("weekPicker").onchange=e=>{if(e.target.value){weekRef=e.target.value;renderWeek()}};

$("statsRange").onchange=renderStats;$("statsPrev").onclick=()=>{statsRef=stepRef(statsRef,$("statsRange").value,-1);renderStats()};$("statsNext").onclick=()=>{statsRef=stepRef(statsRef,$("statsRange").value,1);renderStats()};
document.querySelectorAll("[data-history-mode]").forEach(b=>b.onclick=()=>{historyMode=b.dataset.historyMode;document.querySelectorAll("[data-history-mode]").forEach(x=>x.classList.toggle("active",x===b));renderHistory()});
$("historyPlatform").onchange=renderHistory;$("historyPrev").onclick=()=>{historyRef=stepRef(historyRef,historyMode,-1);renderHistory()};$("historyNext").onclick=()=>{historyRef=stepRef(historyRef,historyMode,1);renderHistory()};

$("openCompare").onclick=()=>{$("comparePage").classList.add("open");$("comparePage").setAttribute("aria-hidden","false");renderCompare()};$("closeCompare").onclick=()=>{$("comparePage").classList.remove("open");$("comparePage").setAttribute("aria-hidden","true")};
document.querySelectorAll("[data-compare-mode]").forEach(b=>b.onclick=()=>{compareMode=b.dataset.compareMode;document.querySelectorAll("[data-compare-mode]").forEach(x=>x.classList.toggle("active",x===b));renderCompare()});
$("comparePrev").onclick=()=>{compareRef=stepRef(compareRef,compareMode,-1);renderCompare()};$("compareNext").onclick=()=>{compareRef=stepRef(compareRef,compareMode,1);renderCompare()};

document.querySelectorAll(".bottom-nav button").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$("privacyBtn").onclick=()=>{settings.hideMoney=!settings.hideMoney;saveAll();applyPrivacy()};
$("dailyGoalInput").onchange=e=>{settings.defaultGoal=Math.max(0,n(e.target.value));saveAll();renderAll()};
$("themeSelect").onchange=e=>{settings.theme=e.target.value;saveAll();applyTheme()};
$("fuelConsumption").onchange=e=>{settings.fuelConsumption=Math.max(0,n(e.target.value));saveAll();renderAll()};
$("fuelPrice").onchange=e=>{settings.fuelPrice=Math.max(0,n(e.target.value));saveAll();renderAll()};
$("saveOverride").onclick=()=>{const d=$("overrideDate").value;if(!d)return alert("Choisis une date.");settings.goalOverrides[d]=Math.max(0,n($("overrideGoal").value));saveAll();$("overrideGoal").value="";renderAll()};

$("chooseUberCsv").onclick=()=>$("uberCsvInput").click();$("uberCsvInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=parseCSV(await f.text());const r=importUber(rows);$("uberImportStatus").textContent=`Dernier import : ${r.lines[1][1]} groupes Uber.`;renderAll();openReport(r)}catch(err){$("uberImportStatus").textContent=err.message||"Import Uber impossible."}e.target.value=""};
$("chooseDeliverooCsv").onclick=()=>$("deliverooCsvInput").click();$("deliverooCsvInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=parseCSV(await f.text());const r=importDeliveroo(rows);$("deliverooImportStatus").textContent="Import Deliveroo terminé.";renderAll();openReport(r)}catch(err){$("deliverooImportStatus").textContent=err.message||"Import Deliveroo impossible."}e.target.value=""};

$("exportJson").onclick=()=>download(`driveflow-backup-v4-${businessToday()}.json`,JSON.stringify({version:4,sessions,uberBatches,deliverooOrders,settings},null,2),"application/json");
$("restoreJson").onclick=()=>$("restoreJsonInput").click();$("restoreJsonInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(d.version!==4||!Array.isArray(d.sessions))throw new Error();sessions=d.sessions;uberBatches=Array.isArray(d.uberBatches)?d.uberBatches:[];deliverooOrders=Array.isArray(d.deliverooOrders)?d.deliverooOrders:[];settings={...DEFAULTS,...(d.settings||{})};saveAll();applyTheme();renderAll();alert("Sauvegarde restaurée.")}catch{alert("Sauvegarde DriveFlow V4 invalide.")}e.target.value=""};
$("exportHistoryCsv").onclick=exportSummaryCsv;

if(matchMedia)matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(settings.theme==="system")applyTheme()});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("driveflow-sw.js").catch(()=>{}));

/* Initial */
$("overrideDate").value=businessToday();
renderAll();switchView("today");
})();