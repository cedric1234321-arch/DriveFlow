(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data;
const INT=globalThis.DriveFlowV6Intelligence;
const DF=globalThis.DriveFlowV6Core;
const WX=globalThis.DriveFlowV6Weather;
const W=globalThis.DriveFlowV6WriteUI;
if(!DATA||!INT||!DF)return;

const UX={};

/* ---------- Splash: keep the branded cold-start screen visible long enough to feel intentional. ---------- */
UX.installSplashMinimum=()=>{
  const splash=document.getElementById("splash");
  if(!splash||splash.dataset.v6SplashMinimum)return;
  splash.dataset.v6SplashMinimum="1";
  const started=performance.now(),minimumMs=1500;
  let timer=null;
  const enforce=()=>{
    const remaining=minimumMs-(performance.now()-started);
    if(splash.classList.contains("hide")&&remaining>0){
      splash.classList.remove("hide");
      clearTimeout(timer);
      timer=setTimeout(()=>splash.classList.add("hide"),remaining);
    }
  };
  new MutationObserver(enforce).observe(splash,{attributes:true,attributeFilter:["class"]});
  enforce();
};

/* ---------- Settings: one compact entry point, all import/export actions one level deeper. ---------- */
UX.exportBackup=()=>{
  const state=DATA.load();
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`driveflow-backup-v6-${DATA.businessToday()}.json`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
UX.openDataHub=()=>{
  if(!W?.open)return;
  const state=DATA.load();
  const sessions=state.sessions?.length||0,uber=state.uberBatches?.length||0,deliveroo=state.deliverooOrders?.length||0;
  W.open(`<h2>Données et activité</h2>
    <div class="sheet-sub">Imports, sauvegardes et gestion de l’activité sont regroupés ici pour garder les Réglages légers.</div>
    <section class="subtle-card" style="margin-bottom:12px">
      <div class="row"><span>Sessions</span><strong>${sessions}</strong></div>
      <div class="row" style="margin-top:7px"><span>Uber</span><strong>${uber} lignes/groupes</strong></div>
      <div class="row" style="margin-top:7px"><span>Deliveroo</span><strong>${deliveroo} lignes</strong></div>
    </section>
    <div class="section-title" style="margin-top:8px"><h2>Activité</h2></div>
    <button id="uxManageSessions" class="secondary">Gérer les sessions</button>
    <div class="section-title"><h2>Importer</h2></div>
    <div style="display:grid;gap:8px">
      <button id="uxImportUber" class="secondary">Importer Uber CSV</button>
      <button id="uxImportDeliveroo" class="secondary">Importer Deliveroo CSV</button>
      <button id="uxImportHistory" class="secondary">Importer historique CSV</button>
    </div>
    <div class="tiny" style="margin-top:8px">Uber remplace le snapshot officiel Uber. Deliveroo fonctionne en ajout/mise à jour.</div>
    <div class="section-title"><h2>Sauvegarde</h2></div>
    <div style="display:grid;gap:8px">
      <button id="uxExportBackup" class="secondary">Exporter une sauvegarde V6</button>
      <button id="uxRestoreBackup" class="secondary">Restaurer une sauvegarde</button>
      <button id="uxResetV6" class="secondary danger">Recréer la copie V6 depuis V5</button>
    </div>
    <div class="section-title"><h2>Données externes</h2></div>
    <section class="subtle-card">
      <div><strong>Météo</strong><div class="tiny" style="margin-top:3px">Historique + prévisions récupérés par API Open-Meteo : aucun fichier météo à importer.</div></div>
      <div class="divider"></div>
      <div><strong>Carburant</strong><div class="tiny" style="margin-top:3px">Historique gazole Montpellier issu de la série officielle locale intégrée à DriveFlow.</div></div>
    </section>
    <button id="uxDataClose" class="secondary" style="margin-top:12px">Fermer</button>`);
  const byId=id=>document.getElementById(id);
  if(byId("uxManageSessions"))byId("uxManageSessions").onclick=()=>W.openManager?.();
  if(byId("uxImportUber"))byId("uxImportUber").onclick=()=>W.importUber?.();
  if(byId("uxImportDeliveroo"))byId("uxImportDeliveroo").onclick=()=>W.importDeliveroo?.();
  if(byId("uxImportHistory"))byId("uxImportHistory").onclick=()=>W.importHistory?.();
  if(byId("uxExportBackup"))byId("uxExportBackup").onclick=UX.exportBackup;
  if(byId("uxRestoreBackup"))byId("uxRestoreBackup").onclick=()=>W.restoreBackup?.();
  if(byId("uxResetV6"))byId("uxResetV6").onclick=()=>{
    const legacy=document.getElementById("resetV6");
    if(legacy)legacy.click();
    else if(confirm("Recréer uniquement la copie V6 depuis les données V5 ?")){localStorage.removeItem(DATA.KEY);location.reload();}
  };
  if(byId("uxDataClose"))byId("uxDataClose").onclick=()=>W.close?.();
};
UX.compactSettings=()=>{
  const view=document.getElementById("settingsView");
  const hub=view?.querySelector("#v6DataManagement");
  if(!view||!hub||hub.dataset.compact==="1")return;
  hub.dataset.compact="1";
  hub.className="card settings-list";
  hub.innerHTML=`<button id="v6DataHubOpen" class="settings-row ux-settings-button" type="button"><div style="text-align:left"><strong>Données et activité</strong><div class="desc">Imports, sauvegardes et gestion des sessions</div></div><span class="link-button">Ouvrir ›</span></button>`;
  document.getElementById("v6DataHubOpen").onclick=UX.openDataHub;
  const exportButton=view.querySelector("#exportV6");
  const oldExportCard=exportButton?.closest(".card");
  if(oldExportCard)oldExportCard.hidden=true;
};

/* ---------- Planner: allow any of the next four calendar weeks. ---------- */
UX.patchPlanner=()=>{
  const P=globalThis.DriveFlowV6PlannerUI;
  if(!P||P.__v6FourWeekPicker)return;
  P.__v6FourWeekPicker=true;
  P.weekOffset=0;
  const baseDates=()=>DATA.nextWeekDates(DATA.businessToday());
  P.dates=()=>{
    const shift=Math.max(0,Math.min(3,Number(P.weekOffset)||0))*7;
    return baseDates().map(d=>DATA.iso(DATA.addDays(DATA.parseDate(d),shift)));
  };
  const originalOpen=P.open.bind(P);
  const label=d=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short"}).format(DATA.parseDate(d));
  P.open=()=>{
    originalOpen();
    const content=document.getElementById("v6PlannerContent");if(!content)return;
    const dates=P.dates();
    const picker=document.createElement("div");picker.className="field";picker.id="v6PlannerWeekPicker";
    const options=Array.from({length:4},(_,i)=>{
      const ds=baseDates().map(d=>DATA.iso(DATA.addDays(DATA.parseDate(d),i*7)));
      return `<option value="${i}" ${i===P.weekOffset?"selected":""}>Semaine ${i+1} · ${label(ds[0])} → ${label(ds[6])}</option>`;
    }).join("");
    picker.innerHTML=`<label>Semaine à planifier</label><select id="v6PlannerWeekSelect">${options}</select><div class="tiny">Les prévisions météo sont utilisées uniquement lorsqu’elles sont disponibles pour les dates choisies ; sinon le plan repose sur l’historique.</div>`;
    const sub=content.querySelector(".sheet-sub");
    if(sub)sub.after(picker);else content.prepend(picker);
    document.getElementById("v6PlannerWeekSelect").onchange=e=>{P.weekOffset=Number(e.target.value)||0;P.open();};
    if(sub)sub.textContent=`${P.day(dates[0])} → ${P.day(dates[6])}. Choisis précisément les jours et heures disponibles.`;
  };
};

/* ---------- Interactive gross-hourly heatmap with explicit business thresholds. ---------- */
UX.heatmap={busy:false,current:new Map(),weatherRows:[],sessions:[],state:null};
UX.heatTier=v=>v>13?"red":v>10?"orange":v>8.5?"green":"white";
UX.hourOf=time=>{const m=String(time||"").match(/T(\d{2}):(\d{2})/);return m?Number(m[1])+Number(m[2])/60:null;};
UX.cellWeather=(date,start,hours)=>{
  const rows=(UX.heatmap.weatherRows||[]).filter(r=>String(r.time).startsWith(date)).filter(r=>{const h=UX.hourOf(r.time);return h!=null&&h>=start&&h<start+hours;});
  if(!rows.length)return{prob:null,rainMm:0};
  return{prob:Math.max(...rows.map(r=>Number(r.precipitationProbability)||0)),rainMm:rows.reduce((a,r)=>a+Math.max(Number(r.rain)||0,Number(r.precipitation)||0),0)};
};
UX.openHeatDetail=key=>{
  const c=UX.heatmap.current.get(key),state=UX.heatmap.state,sessions=UX.heatmap.sessions;
  if(!c||!state||!W?.open)return;
  const f=c.forecast,base=INT.forecastSession(sessions,c,state.settings,{}),wx=UX.cellWeather(c.date,c.startHour,c.hours);
  const weatherApplied=!!(state.weatherMeta?.modelEnabled&&c.weather&&WX?.similarity);
  const delta=weatherApplied&&base?.expectedHourlyCa>0?((f.expectedHourlyCa/base.expectedHourlyCa)-1)*100:null;
  const weatherText=wx.rainMm>=0.05?`Pluie prévue sur ce créneau : ${wx.rainMm.toFixed(1)} mm${wx.prob!=null?` · risque max ${Math.round(wx.prob)} %`:""}`:wx.prob!=null&&wx.prob>=30?`Risque de pluie sur ce créneau : jusqu’à ${Math.round(wx.prob)} %`:(c.weather?.wetRoadActive?"Pluie récente / sol humide pris en compte.":"Pas de pluie significative prévue sur ce créneau.");
  let impact="La météo est affichée mais son impact n’est pas appliqué au CA tant que le modèle météo n’est pas validé.";
  if(delta!=null){const sign=delta>0?"+":"";impact=`Impact météo estimé : ${sign}${delta.toFixed(1)} % par rapport au niveau historique normal de ce créneau.`;}
  const low=Number.isFinite(f.lowHourlyCa)?`${f.lowHourlyCa.toFixed(1)} €/h`:"—",high=Number.isFinite(f.highHourlyCa)?`${f.highHourlyCa.toFixed(1)} €/h`:"—";
  const dateLabel=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(DATA.parseDate(c.date));
  const clock=h=>{const hh=Math.floor(h)%24,mm=Math.round((h-Math.floor(h))*60);return`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;};
  W.open(`<h2>${dateLabel} · ${clock(c.startHour)}</h2>
    <div class="sheet-sub">Lecture du créneau à partir de ton historique DriveFlow et du contexte prévu.</div>
    <section class="card">
      <div class="row"><span>Potentiel brut attendu</span><strong>${f.expectedHourlyCa.toFixed(1)} €/h</strong></div>
      <div class="row" style="margin-top:8px"><span>Zone historique habituelle</span><strong>${low} – ${high}</strong></div>
      <div class="row" style="margin-top:8px"><span>Observations comparables</span><strong>${Math.round(f.neighbors||0)}</strong></div>
      <div class="row" style="margin-top:8px"><span>Échantillon effectif pondéré</span><strong>${Number(f.effectiveN||0).toFixed(1)}</strong></div>
    </section>
    <section class="subtle-card"><strong>Contexte météo</strong><div class="tiny" style="margin-top:6px">${weatherText}</div><div class="tiny" style="margin-top:6px">${impact}</div></section>
    <button id="uxHeatClose" class="secondary" style="margin-top:12px">Fermer</button>`);
  const close=document.getElementById("uxHeatClose");if(close)close.onclick=()=>W.close?.();
};
UX.renderHeatmap=async()=>{
  if(UX.heatmap.busy)return;
  const view=document.getElementById("optimizationView"),heat=view?.querySelector(".heatmap");
  if(!view||!heat||heat.dataset.v6Interactive==="1")return;
  UX.heatmap.busy=true;
  try{
    const state=DATA.load(),ctx=DATA.buildContext(state),sessions=DATA.analyticsSessions(state,ctx),dates=DATA.nextWeekDates(DATA.businessToday()),hours=[12,18,19,20];
    let candidates=[];
    for(const date of dates)for(const h of hours)candidates.push(DATA.targetFrom(date,h,h===12?2:3,`${date}-heat-${h}`));
    candidates=await DATA.attachForecastWeather(candidates);
    const opts=state.weatherMeta?.modelEnabled&&WX?.similarity?{weatherSimilarity:WX.similarity}:{};
    const scored=INT.scoreCandidates({sessions,candidates,financialContext:state.settings,opts});
    const map=new Map(scored.map(c=>[`${c.date}|${c.startHour}`,c]));
    const keepHours=hours.filter(h=>{
      const vals=dates.map(d=>map.get(`${d}|${h}`)?.forecast?.expectedHourlyCa).filter(Number.isFinite);
      const strong=vals.some(v=>v>10),greenDays=vals.filter(v=>v>8.5&&v<=10).length;
      return strong||greenDays>=3;
    });
    if(!keepHours.length){heat.innerHTML='<div class="tiny" style="padding:8px">Aucun créneau n’atteint actuellement le seuil d’intérêt de la heatmap.</div>';heat.dataset.v6Interactive="1";return;}
    try{
      const WF=globalThis.DriveFlowV6WeatherForecastUI;
      UX.heatmap.weatherRows=WF?.fetch?await WF.fetch(dates):[];
    }catch{UX.heatmap.weatherRows=[];}
    UX.heatmap.current=map;UX.heatmap.sessions=sessions;UX.heatmap.state=state;
    heat.style.gridTemplateColumns=`42px repeat(${keepHours.length},1fr)`;
    let html=`<div></div>${keepHours.map(h=>`<div class="h">${h}h</div>`).join("")}`;
    for(const date of dates){
      html+=`<div class="d">${new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(DATA.parseDate(date))}</div>`;
      for(const h of keepHours){
        const c=map.get(`${date}|${h}`),v=c?.forecast?.expectedHourlyCa;
        if(!Number.isFinite(v)){html+='<div class="cell ux-heat-white">—</div>';continue;}
        const tier=UX.heatTier(v),key=`${date}|${h}`;
        if(tier==="white")html+='<div class="cell ux-heat-white">—</div>';
        else html+=`<button type="button" class="cell ux-heat-button ux-heat-${tier}" data-ux-heat="${key}" aria-label="Détail ${date} ${h}h">${v.toFixed(1)}</button>`;
      }
    }
    heat.innerHTML=html;heat.dataset.v6Interactive="1";
    heat.querySelectorAll("[data-ux-heat]").forEach(b=>b.onclick=()=>UX.openHeatDetail(b.dataset.uxHeat));
    const title=heat.closest(".card")?.previousElementSibling;
    const tiny=title?.querySelector?.(".tiny");if(tiny)tiny.textContent="Brut/h · rouge >13 · orange >10 · vert >8,5";
  }finally{UX.heatmap.busy=false;}
};

UX.installStyles=()=>{
  if(document.getElementById("v6UxPolishStyles"))return;
  const style=document.createElement("style");style.id="v6UxPolishStyles";style.textContent=`
    .ux-settings-button{width:100%;border:0;background:transparent;color:inherit;text-align:left}
    .ux-heat-button{border:0;cursor:pointer;color:inherit;font:inherit}
    .ux-heat-red{background:rgba(255,82,92,.34)!important;color:#ffd2d5!important}
    .ux-heat-orange{background:rgba(255,159,64,.28)!important;color:#ffd3a3!important}
    .ux-heat-green{background:rgba(54,217,119,.20)!important;color:#9af2ba!important}
    .ux-heat-white{background:rgba(255,255,255,.045)!important;color:rgba(255,255,255,.32)!important}
  `;document.head.appendChild(style);
};
UX.enhance=()=>{UX.compactSettings();UX.patchPlanner();UX.renderHeatmap();};
UX.installStyles();UX.installSplashMinimum();UX.patchPlanner();
const obs=new MutationObserver(()=>{clearTimeout(UX._t);UX._t=setTimeout(UX.enhance,70);});
obs.observe(document.documentElement,{subtree:true,childList:true});
UX.enhance();
globalThis.DriveFlowV6UXPolish=UX;
})();