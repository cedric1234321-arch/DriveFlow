const DAILY_TARGET=25,WEEKLY_TARGET=175,STORAGE_KEY="livraisons.entries.v1",THEME_KEY="livraisons.theme.v1";
const seed=[{date:"2026-08-10",uber:21,deliveroo:17},{date:"2026-08-11",uber:30,deliveroo:9}];

let entries=loadEntries();
let selectedDate=todayIso();

function loadEntries(){
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw){try{return JSON.parse(raw)}catch(e){}}
  localStorage.setItem(STORAGE_KEY,JSON.stringify(seed));
  return [...seed];
}
function saveEntries(){localStorage.setItem(STORAGE_KEY,JSON.stringify(entries))}
function euro(n){return `${Number(n).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`}
function todayIso(){const d=new Date();return iso(d)}
function parseDate(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function startOfWeek(date){const d=new Date(date),day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d}
function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function shortDate(d){return new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"}).format(d)}
function longDate(d){return new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long"}).format(d)}
function fullDay(d){return new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(d)}
function calc(e){
  const total=Number(e?.uber||0)+Number(e?.deliveroo||0),saved=Math.min(total,DAILY_TARGET);
  return{total,saved,bonus:Math.max(0,total-DAILY_TARGET),success:total>=DAILY_TARGET}
}
function getEntry(date){return entries.find(e=>e.date===date)}
function upsertEntry(entry){
  const i=entries.findIndex(e=>e.date===entry.date);
  if(i>=0)entries[i]=entry;else entries.push(entry);
  entries.sort((a,b)=>a.date.localeCompare(b.date));
  saveEntries()
}

function dayContext(date){
  if(date===todayIso()) return "Aujourd’hui";
  const y=iso(addDays(parseDate(todayIso()),-1));
  const t=iso(addDays(parseDate(todayIso()),1));
  if(date===y) return "Hier";
  if(date===t) return "Demain";
  return "Journée";
}

const hiddenDatePicker=document.getElementById("hiddenDatePicker");
const entryDate=document.getElementById("entryDate");
const uberInput=document.getElementById("uberInput");
const deliverooInput=document.getElementById("deliverooInput");
const saveMsg=document.getElementById("saveMsg");
const entrySheet=document.getElementById("entrySheet");
const entryBackdrop=document.getElementById("entryBackdrop");

function setSelectedDate(date){
  selectedDate=date;
  hiddenDatePicker.value=date;
  renderAll();
}

document.getElementById("prevDayBtn").addEventListener("click",()=>setSelectedDate(iso(addDays(parseDate(selectedDate),-1))));
document.getElementById("nextDayBtn").addEventListener("click",()=>setSelectedDate(iso(addDays(parseDate(selectedDate),1))));
document.getElementById("datePickerBtn").addEventListener("click",()=>{
  hiddenDatePicker.value=selectedDate;
  if(typeof hiddenDatePicker.showPicker==="function") hiddenDatePicker.showPicker();
  else hiddenDatePicker.click();
});
hiddenDatePicker.addEventListener("change",()=>{if(hiddenDatePicker.value)setSelectedDate(hiddenDatePicker.value)});

function openEntry(date=selectedDate){
  const e=getEntry(date);
  entryDate.value=date;
  uberInput.value=e?.uber ?? "";
  deliverooInput.value=e?.deliveroo ?? "";
  document.getElementById("sheetTitle").textContent=e?"Modifier la journée":"Ajouter la journée";
  entryBackdrop.hidden=false;
  requestAnimationFrame(()=>entrySheet.classList.add("open"));
  entrySheet.setAttribute("aria-hidden","false");
  document.body.classList.add("sheet-open");
}
function closeEntry(){
  entrySheet.classList.remove("open");
  entrySheet.setAttribute("aria-hidden","true");
  document.body.classList.remove("sheet-open");
  setTimeout(()=>entryBackdrop.hidden=true,220);
}
document.getElementById("openEntryBtn").addEventListener("click",()=>openEntry());
document.getElementById("closeEntryBtn").addEventListener("click",closeEntry);
entryBackdrop.addEventListener("click",closeEntry);

document.getElementById("saveBtn").addEventListener("click",()=>{
  if(!entryDate.value)return;
  const entry={date:entryDate.value,uber:Number(uberInput.value||0),deliveroo:Number(deliverooInput.value||0)};
  upsertEntry(entry);
  selectedDate=entry.date;
  saveMsg.textContent="Journée enregistrée ✓";
  renderAll();
  setTimeout(()=>{saveMsg.textContent="";closeEntry()},650);
});

function renderDay(){
  const e=getEntry(selectedDate);
  const c=calc(e);
  const d=parseDate(selectedDate);

  document.getElementById("dayContext").textContent=dayContext(selectedDate);
  document.getElementById("selectedDayLabel").textContent=fullDay(d);
  document.getElementById("dayTotalLarge").textContent=euro(c.total);
  document.getElementById("dayUber").textContent=euro(e?.uber||0);
  document.getElementById("dayDeliveroo").textContent=euro(e?.deliveroo||0);
  document.getElementById("daySaved").textContent=euro(c.saved);
  document.getElementById("dayBonus").textContent=euro(c.bonus);

  const badge=document.getElementById("dayStatusBadge");
  badge.className="status-pill";
  if(!e){
    badge.classList.add("neutral");badge.textContent="À saisir";
  }else if(c.success){
    badge.classList.add("success");badge.textContent="Objectif atteint ✓";
  }else{
    badge.classList.add("warning");badge.textContent=`${euro(DAILY_TARGET-c.total)} à faire`;
  }

  const denom=Math.max(c.total,DAILY_TARGET);
  document.getElementById("daySavedBar").style.width=`${(c.saved/denom)*100}%`;
  document.getElementById("dayBonusBar").style.width=`${(c.bonus/denom)*100}%`;
  document.getElementById("daySavedLabel").textContent=`${euro(c.saved)} / 25 €`;
  document.getElementById("dayBonusLabel").textContent=`+${euro(c.bonus)}`;
}

function weekData(reference){
  const start=startOfWeek(reference),days=[];
  let saved=0,earned=0,bonus=0,success=0;
  for(let i=0;i<7;i++){
    const d=addDays(start,i),date=iso(d),e=getEntry(date),c=calc(e);
    saved+=c.saved;earned+=c.total;bonus+=c.bonus;if(c.success)success++;
    days.push({d,date,e,c})
  }
  return{start,end:addDays(start,6),days,saved,earned,bonus,success}
}

function renderWeek(){
  const w=weekData(parseDate(selectedDate));
  const pct=Math.min(100,(w.saved/WEEKLY_TARGET)*100);

  document.getElementById("weekSavedHero").textContent=euro(w.saved);
  document.getElementById("weekGoalHero").textContent=`sur ${WEEKLY_TARGET} €`;
  document.getElementById("weekProgressBar").style.width=`${pct}%`;
  document.getElementById("weekProgressPct").textContent=`${Math.round((w.saved/WEEKLY_TARGET)*100)} %`;
  document.getElementById("weekRemaining").textContent=`${euro(Math.max(0,WEEKLY_TARGET-w.saved))} restants`;
  document.getElementById("heroWeekBadge").textContent=`${w.success} / 7 jours`;

  document.getElementById("weekSaved").textContent=euro(w.saved);
  document.getElementById("weekEarned").textContent=euro(w.earned);
  document.getElementById("weekBonus").textContent=euro(w.bonus);
  document.getElementById("weekSuccess").textContent=`${w.success} / 7`;
  document.getElementById("weekTitle").textContent=`${longDate(w.start)} – ${longDate(w.end)}`;

  const rows=document.getElementById("weekRows");rows.innerHTML="";
  w.days.forEach(x=>{
    const denom=Math.max(x.c.total,DAILY_TARGET);
    const row=document.createElement("div");
    row.className="week-row";
    row.innerHTML=`<div class="week-row-top"><span>${shortDate(x.d)}</span><strong>${euro(x.c.total)}</strong></div>
      <div class="stack-track">
        <div class="stack saved" style="width:${(x.c.saved/denom)*100}%"></div>
        <div class="stack bonus" style="width:${(x.c.bonus/denom)*100}%"></div>
      </div>
      <div class="week-row-meta">
        <span>${euro(x.c.saved)} épargnés</span>
        <span>${x.c.bonus?`+${euro(x.c.bonus)} bonus`:(x.c.total?`${euro(DAILY_TARGET-x.c.total)} manquants`:"—")}</span>
      </div>`;
    row.addEventListener("click",()=>{setSelectedDate(x.date);switchView("day")});
    rows.appendChild(row)
  })
}
document.getElementById("thisWeekBtn").addEventListener("click",()=>{setSelectedDate(todayIso());renderWeek()});

function renderHistory(){
  const list=document.getElementById("historyList");list.innerHTML="";
  const sorted=[...entries].sort((a,b)=>b.date.localeCompare(a.date));
  if(!sorted.length){list.innerHTML='<div class="empty">Aucune journée enregistrée.</div>';return}
  sorted.forEach(e=>{
    const c=calc(e),item=document.createElement("div");item.className="history-item";
    item.innerHTML=`<div>
        <strong>${shortDate(parseDate(e.date))} · ${euro(c.total)}</strong>
        <small>Uber ${euro(e.uber)} · Deliveroo ${euro(e.deliveroo)}<br>Épargne ${euro(c.saved)} · Bonus ${euro(c.bonus)}</small>
      </div>
      <div class="history-actions">
        <button class="mini-btn edit">Voir</button>
        <button class="mini-btn delete">Suppr.</button>
      </div>`;
    item.querySelector(".edit").addEventListener("click",()=>{setSelectedDate(e.date);switchView("day")});
    item.querySelector(".delete").addEventListener("click",()=>{
      if(confirm("Supprimer cette journée ?")){
        entries=entries.filter(x=>x.date!==e.date);saveEntries();renderAll()
      }
    });
    list.appendChild(item)
  })
}

document.getElementById("exportBtn").addEventListener("click",()=>{
  const rows=[["Date","Uber Eats","Deliveroo","Total","Epargne","Bonus"]];
  entries.forEach(e=>{const c=calc(e);rows.push([e.date,e.uber,e.deliveroo,c.total,c.saved,c.bonus])});
  const csv=rows.map(r=>r.join(";")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="livraisons.csv";a.click();URL.revokeObjectURL(url)
});

function switchView(view){
  document.querySelectorAll(".seg-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(`${view}View`).classList.add("active")
}
document.querySelectorAll(".seg-btn").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));

function applyTheme(theme){
  document.documentElement.classList.remove("dark","light");
  if(theme)document.documentElement.classList.add(theme);
  document.getElementById("themeBtn").textContent=theme==="dark"?"☀":"☾"
}
let theme=localStorage.getItem(THEME_KEY)||"";applyTheme(theme);
document.getElementById("themeBtn").addEventListener("click",()=>{
  const isDark=document.documentElement.classList.contains("dark")||
    (!document.documentElement.classList.contains("light")&&matchMedia("(prefers-color-scheme: dark)").matches);
  theme=isDark?"light":"dark";localStorage.setItem(THEME_KEY,theme);applyTheme(theme)
});

function renderAll(){renderDay();renderWeek();renderHistory()}
hiddenDatePicker.value=selectedDate;
renderAll();

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("livraison-sw.js").catch(()=>{}))
}
