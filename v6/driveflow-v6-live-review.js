(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data;
const INT=globalThis.DriveFlowV6Intelligence;
const DF=globalThis.DriveFlowV6Core;
const WX=globalThis.DriveFlowV6Weather;
const W=globalThis.DriveFlowV6WriteUI;
const RULES=globalThis.DriveFlowV6ReviewRules;
if(!DATA||!INT||!DF||!RULES)return;

const R={optWeekOffset:0,optToken:0,statsToken:0,optHeat:new Map(),optWeatherRows:[],autoWeatherStarted:false};
R.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
R.rate=v=>`${DF.n(v).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1})} €/h`;
R.clock=h=>{let hh=Math.floor(DF.n(h))%24,mm=Math.round((DF.n(h)-Math.floor(DF.n(h)))*60);if(mm===60){hh=(hh+1)%24;mm=0;}if(hh<0)hh+=24;return`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;};
R.dateLong=date=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(DATA.parseDate(date));
R.dateShort=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"}).format(DATA.parseDate(date));
R.weekDayUpper=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(DATA.parseDate(date)).replace(/\.?$/,".").toUpperCase();
R.dayMonth=date=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long"}).format(DATA.parseDate(date));
R.weekLabel=dates=>`${R.weekDayUpper(dates[0])} ${R.dayMonth(dates[0])} – ${R.weekDayUpper(dates[6])} ${R.dayMonth(dates[6])}`;
R.weatherIcon=w=>{const c=Number(w?.dominantWeatherCode);if((w?.rainMm||0)>.05||(w?.precipitationMm||0)>.05)return"🌧️";if(c>=95)return"⛈️";if([0,1].includes(c))return"☀️";if(c===2)return"🌤️";if(c===3)return"☁️";return"🌥️";};
R.daysFrom=(start,count)=>Array.from({length:count},(_,i)=>DATA.iso(DATA.addDays(DATA.parseDate(start),i)));
R.optDates=offset=>{
  const base=DATA.nextWeekDates(DATA.businessToday()),shift=Math.max(0,Math.min(3,Number(offset)||0))*7;
  return base.map(d=>DATA.iso(DATA.addDays(DATA.parseDate(d),shift)));
};
R.metric=(c,netMode)=>netMode?DF.n(c.forecast?.netFinal)/Math.max(.25,DF.n(c.hours)):DF.n(c.forecast?.expectedHourlyCa);
R.intelligenceOpts=state=>state.weatherMeta?.modelEnabled&&WX?.similarity?{weatherSimilarity:WX.similarity}:{};

/* Directional savings carry: an earlier surplus may fund a later target, never the reverse. */
R.patchSavings=()=>{
  if(DATA.__reviewSavingsPatched)return;
  DATA.__reviewSavingsPatched=true;
  const previous=DATA.aggregateDates.bind(DATA);
  DATA.aggregateDates=(state,ctx,dates)=>{
    const out=previous(state,ctx,dates),first=dates?.[0];if(!first)return out;
    const rule=DF.resolveSavingsRule({defaultRule:state.settings?.defaultSavingsRule,weeklyOverrides:state.settings?.weeklySavingsOverrides},first);
    if(rule.mode!=="fixed_daily")return out;
    const by={};
    (dates||[]).forEach(date=>{const d=DATA.dayMetrics(state,ctx,date);by[date]={netFinal:d.netFinal,ca:d.ca,worked:!!(d.sessions?.length||d.ca)};});
    const schedule=RULES.dailySavingsSchedule({dates,daysByDate:by,rule,dailyOverrides:state.settings?.dailySavingsOverrides||{}});
    if(!schedule)return out;
    out.savingsRule={...rule,directionalCarry:true};
    out.savingsSchedule=schedule;
    out.savings={target:schedule.target,saved:schedule.saved,remaining:schedule.remaining,availableAfterSavings:Math.max(0,out.netFinal-schedule.saved),reached:schedule.reached,carryForward:schedule.carryForward};
    return out;
  };
};
R.daySavingsDetail=(state,date)=>{
  const dates=DATA.weekDates(date),ctx=DATA.buildContext(state),rule=DF.resolveSavingsRule({defaultRule:state.settings.defaultSavingsRule,weeklyOverrides:state.settings.weeklySavingsOverrides},date);
  if(rule.mode!=="fixed_daily")return null;
  const by={};dates.forEach(d=>{const x=DATA.dayMetrics(state,ctx,d);by[d]={netFinal:x.netFinal,ca:x.ca,worked:!!(x.sessions?.length||x.ca)};});
  return RULES.dailySavingsSchedule({dates,daysByDate:by,rule,dailyOverrides:state.settings.dailySavingsOverrides||{}})?.details?.find(x=>x.date===date)||null;
};

R.addNativeDatePicker=(nav,currentIso,mode)=>{
  if(!nav||nav.querySelector(".review-date-picker"))return;
  const center=nav.querySelector(".date-center");if(!center)return;
  center.style.position="relative";
  const input=document.createElement("input");input.type="date";input.value=currentIso;input.className="review-date-picker";input.setAttribute("aria-label",mode==="day"?"Choisir une date":"Choisir une semaine");
  input.onchange=()=>{
    if(!input.value)return;
    if(mode==="day"){
      const diff=Math.round((DATA.parseDate(input.value)-DATA.parseDate(currentIso))/86400000);if(!diff)return;
      const b=nav.querySelector(diff>0?'[data-day="1"]':'[data-day="-1"]');if(b){b.dataset.day=String(diff);b.click();}
    }else{
      const target=DATA.startOfWeek(input.value),current=DATA.startOfWeek(currentIso),diff=Math.round((target-current)/86400000);if(!diff)return;
      const b=nav.querySelector(diff>0?'[data-week="7"]':'[data-week="-7"]');if(b){b.dataset.week=String(diff);b.click();}
    }
  };
  center.appendChild(input);
};

R.enhanceToday=()=>{
  const view=document.getElementById("todayView");if(!view)return;
  const nav=view.querySelector(".date-nav"),small=nav?.querySelector(".date-center small");
  const raw=small?.dataset.iso||(/^\d{4}-\d{2}-\d{2}$/.test(small?.textContent?.trim()||"")?small.textContent.trim():null);
  if(raw){small.dataset.iso=raw;small.textContent=R.dateLong(raw);R.addNativeDatePicker(nav,raw,"day");}
  const hero=[...view.querySelectorAll(".hero-metric")];
  const gross=hero.find(x=>x.querySelector(".label")?.textContent.trim()==="CA brut");if(gross)gross.querySelector("small").textContent="Uber + Deliveroo";
  const net=hero.find(x=>/^Net/.test(x.querySelector(".label")?.textContent.trim()||""));if(net)net.querySelector("small").textContent="Charges déduites";
  const fuel=[...view.querySelectorAll(".breakdown .line")].find(x=>/^Carburant/.test(x.querySelector("span")?.textContent||""));
  if(fuel){const span=fuel.querySelector("span"),m=span.textContent.match(/Carburant(?:\s*·\s*([\d.,]+)\s*€\/L)?/);span.textContent=m?.[1]?`Carburant · ${m[1]} €/L`:"Carburant";}
  const manage=view.querySelector("#v6ManageSessions");if(manage)manage.textContent="Créer / gérer";
  if(raw){
    const state=DATA.load(),detail=R.daySavingsDetail(state,raw),label=[...view.querySelectorAll(".label")].find(x=>x.textContent.trim()==="Épargne réalisée");
    if(detail&&label){const card=label.closest(".metric-card"),strong=card?.querySelector("strong"),tiny=card?.querySelector("small");if(strong)strong.textContent=R.euro(detail.credited);if(tiny)tiny.textContent=`Objectif ${R.euro(detail.target)}${detail.carryIn>0?` · ${R.euro(detail.carryIn)} reportés`:""}`;}
  }
};

R.renderWeekChart=(view,start)=>{
  const chart=view.querySelector(".mini-chart");if(!chart||chart.dataset.reviewGrouped)return;
  const state=DATA.load(),ctx=DATA.buildContext(state),dates=DATA.weekDates(start),vals=dates.map(d=>DATA.dayMetrics(state,ctx,d)),max=Math.max(1,...vals.flatMap(x=>[x.ca,x.netFinal]));
  const parent=chart.parentElement;if(!parent)return;
  parent.innerHTML=`<div class="review-chart-legend"><span><i class="review-dot gross"></i>Brut</span><span><i class="review-dot net"></i>Net</span></div><div class="review-week-bars">${vals.map((d,i)=>`<div class="review-day-bars"><div class="review-bar-pair"><i class="bar" style="height:${Math.max(3,d.ca/max*100)}%"></i><i class="bar net" style="height:${Math.max(3,d.netFinal/max*100)}%"></i></div><small>${new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(DATA.parseDate(dates[i]))}</small></div>`).join("")}</div>`;
};
R.enhanceWeek=()=>{
  const view=document.getElementById("weekView");if(!view)return;
  const nav=view.querySelector(".date-nav"),strong=nav?.querySelector(".date-center strong"),small=nav?.querySelector(".date-center small");
  let start=nav?.dataset.weekStart||null;
  if(!start){const m=strong?.textContent.match(/(\d{4}-\d{2}-\d{2})/);start=m?.[1]||null;if(start)nav.dataset.weekStart=start;}
  if(start){const dates=DATA.weekDates(start);if(strong)strong.textContent=R.weekLabel(dates);if(small)small.textContent=RULES.isoWeekDisplay(DF.isoWeekKey(dates[0]));R.addNativeDatePicker(nav,start,"week");R.renderWeekChart(view,start);}
};

R.openDailyGoal=()=>{
  if(!W?.open)return;const state=DATA.load(),today=DATA.businessToday();state.settings.dailySavingsOverrides||={};
  const defaultFor=date=>{const rule=DF.resolveSavingsRule({defaultRule:state.settings.defaultSavingsRule,weeklyOverrides:state.settings.weeklySavingsOverrides},date);return rule.mode==="fixed_daily"?DF.n(rule.value):0;};
  const valueFor=date=>Object.prototype.hasOwnProperty.call(state.settings.dailySavingsOverrides,date)?DF.n(state.settings.dailySavingsOverrides[date]):defaultFor(date);
  W.open(`<h2>Objectif d’épargne par jour</h2><div class="sheet-sub">Ajuste une journée précise. 0 € peut servir à marquer une journée sans objectif. Un surplus d’un jour précédent peut aider un jour suivant, jamais l’inverse.</div><div class="field"><label>Date</label><input id="reviewGoalDate" type="date" value="${today}"></div><div class="field"><label>Objectif du jour</label><input id="reviewGoalValue" type="number" min="0" step="1" value="${valueFor(today)}"></div><button id="reviewGoalSave" class="primary">Enregistrer pour ce jour</button><button id="reviewGoalDefault" class="secondary" style="margin-top:9px">Revenir à la règle par défaut</button><button id="reviewGoalClose" class="secondary" style="margin-top:9px">Fermer</button>`);
  const date=document.getElementById("reviewGoalDate"),value=document.getElementById("reviewGoalValue");date.onchange=()=>{value.value=valueFor(date.value);};
  document.getElementById("reviewGoalSave").onclick=()=>{const latest=DATA.load();latest.settings.dailySavingsOverrides||={};latest.settings.dailySavingsOverrides[date.value]=Math.max(0,DF.n(value.value));DATA.save(latest);W.close();location.reload();};
  document.getElementById("reviewGoalDefault").onclick=()=>{const latest=DATA.load();latest.settings.dailySavingsOverrides||={};delete latest.settings.dailySavingsOverrides[date.value];DATA.save(latest);W.close();location.reload();};
  document.getElementById("reviewGoalClose").onclick=W.close;
};
R.openDataHub=()=>{
  if(!W?.open)return;const state=DATA.load(),weather=state.weatherMeta?.status==="complete"?"Synchronisée":"Synchronisation automatique",fuel=globalThis.DriveFlowV6Fuel?.meta?.status?.startsWith?.("ready")?"Actif":"Automatique";
  W.open(`<h2>Données et activité</h2><div class="sheet-sub">Imports, sauvegardes et gestion de l’activité.</div><section class="subtle-card"><div class="row"><span>Sessions</span><strong>${state.sessions?.length||0}</strong></div><div class="row" style="margin-top:7px"><span>Uber</span><strong>${state.uberBatches?.length||0}</strong></div><div class="row" style="margin-top:7px"><span>Deliveroo</span><strong>${state.deliverooOrders?.length||0}</strong></div></section><div class="section-title"><h2>Activité</h2></div><button id="reviewManageSessions" class="secondary">Créer / gérer les sessions</button><div class="section-title"><h2>Importer</h2></div><div style="display:grid;gap:8px"><button id="reviewUber" class="secondary">Importer Uber CSV</button><button id="reviewDeliveroo" class="secondary">Importer Deliveroo CSV</button><button id="reviewHistory" class="secondary">Importer historique CSV</button></div><div class="section-title"><h2>Sauvegarde</h2></div><div style="display:grid;gap:8px"><button id="reviewExport" class="secondary">Exporter une sauvegarde V6</button><button id="reviewRestore" class="secondary">Restaurer une sauvegarde V5 / V6</button><button id="reviewReset" class="secondary danger">Recréer la copie V6 depuis V5</button></div><div class="section-title"><h2>Automatique</h2></div><section class="subtle-card"><div class="row"><span>Météo</span><strong>${weather}</strong></div><div class="row" style="margin-top:8px"><span>Carburant</span><strong>${fuel}</strong></div></section><button id="reviewDataClose" class="secondary" style="margin-top:12px">Fermer</button>`);
  const q=id=>document.getElementById(id);q("reviewManageSessions").onclick=()=>W.openManager?.();q("reviewUber").onclick=()=>W.importUber?.();q("reviewDeliveroo").onclick=()=>W.importDeliveroo?.();q("reviewHistory").onclick=()=>W.importHistory?.();
  q("reviewExport").onclick=()=>globalThis.DriveFlowV6UXPolish?.exportBackup?.();q("reviewRestore").onclick=()=>W.restoreBackup?.();q("reviewReset").onclick=()=>{const b=document.getElementById("resetV6");if(b)b.click();else if(confirm("Recréer uniquement la copie V6 depuis les données V5 ?")){localStorage.removeItem(DATA.KEY);location.reload();}};q("reviewDataClose").onclick=W.close;
};
R.enhanceSettings=()=>{
  const view=document.getElementById("settingsView");if(!view)return;
  const weatherCard=[...view.querySelectorAll(".card")].find(c=>/Météo historique Montpellier/.test(c.textContent||""));if(weatherCard)weatherCard.hidden=true;
  const oldExport=[...view.querySelectorAll(".card")].find(c=>/Exporter une sauvegarde V6/.test(c.textContent||"")&&c.querySelector("#exportV6"));if(oldExport)oldExport.hidden=true;
  const hub=view.querySelector("#v6DataManagement");if(hub){hub.className="card settings-list";hub.innerHTML=`<button id="reviewDataHub" class="settings-row review-settings-button" type="button"><div style="text-align:left"><strong>Données et activité</strong><div class="desc">Imports, sauvegardes et sessions</div></div><span class="link-button">Ouvrir ›</span></button>`;document.getElementById("reviewDataHub").onclick=R.openDataHub;}
  if(!view.querySelector("#reviewDailyGoal")){
    const savings=[...view.querySelectorAll(".card")].find(c=>/Épargne par défaut/.test(c.textContent||""));if(savings){const card=document.createElement("section");card.id="reviewDailyGoal";card.className="card settings-list";card.innerHTML=`<button class="settings-row review-settings-button" type="button"><div style="text-align:left"><strong>Objectifs par jour</strong><div class="desc">Modifier un jour précis ou définir 0 €</div></div><span class="link-button">Modifier ›</span></button>`;savings.after(card);card.querySelector("button").onclick=R.openDailyGoal;}
  }
  const fuelRow=view.querySelector("#v6FuelHistoryStatus");if(fuelRow){const s=fuelRow.querySelector("strong"),d=fuelRow.querySelector(".desc");if(s)s.textContent="Prix carburant automatique";if(d)d.textContent="Historique intégré";}
  const footer=[...view.querySelectorAll(".card.row")].find(c=>/DriveFlow/.test(c.textContent||""));if(footer){const tiny=footer.querySelector(".tiny"),badge=footer.querySelector(".dev-badge");if(tiny)tiny.textContent="V6 Preview · build 20";if(badge)badge.textContent="RC 20";}
};

R.slotHtml=(c,state)=>{const net=state.settings.displayMoneyMode==="net",f=c.forecast,w=c.weather,hourly=R.metric(c,net),amount=net?f.netFinal:f.expectedCa;return`<article class="slot-row"><div class="top"><div><strong>${R.dateShort(c.date)} · ${R.clock(c.startHour)}–${R.clock(c.startHour+c.hours)}</strong><div class="meta"><span class="${net?"blue":"green"}">${R.rate(hourly)}</span><span>≈ ${R.euro(amount)}</span>${w?`<span>${R.weatherIcon(w)} ${w.temperatureAvg!=null?Math.round(w.temperatureAvg)+"°":""}</span>`:""}</div></div><span class="badge ${f.confidence||"low"}">${({high:"Élevée",medium:"Moyenne",low:"Faible",insufficient:"Insuffisante"})[f.confidence]||"—"}</span></div><div class="meta"><span>${Math.round(f.neighbors||0)} observations comparables</span><span>Zone CA ${R.euro(f.lowCa)}–${R.euro(f.highCa)}</span></div></article>`;};
R.refreshStatsUpcoming=async()=>{
  const view=document.getElementById("statsView");if(!view)return;const title=[...view.querySelectorAll(".section-title")].find(x=>/Meilleurs créneaux à venir/.test(x.textContent||""));const list=title?.nextElementSibling;if(!title||!list?.classList.contains("slot-list"))return;
  const tomorrow=DATA.iso(DATA.addDays(DATA.parseDate(DATA.businessToday()),1)),key=`${tomorrow}|${DATA.load().settings.displayMoneyMode}`;if(list.dataset.reviewUpcoming===key)return;list.dataset.reviewUpcoming=key;const token=++R.statsToken;
  const label=title.querySelector("button")||title.querySelector("span");if(label)label.textContent=`Dès ${R.dateShort(tomorrow)}`;list.innerHTML='<div class="subtle-card muted">Analyse des 7 prochains jours…</div>';
  let candidates=DATA.defaultCandidates(R.daysFrom(tomorrow,7));candidates=await DATA.attachForecastWeather(candidates);if(token!==R.statsToken||!list.isConnected)return;
  const state=DATA.load(),ctx=DATA.buildContext(state),rows=INT.scoreCandidates({sessions:DATA.analyticsSessions(state,ctx),candidates,financialContext:state.settings,opts:R.intelligenceOpts(state)}).sort((a,b)=>R.metric(b,state.settings.displayMoneyMode==="net")-R.metric(a,state.settings.displayMoneyMode==="net"));
  const top=DATA.distinctTop(rows,4);list.innerHTML=top.length?top.map(c=>R.slotHtml(c,state)).join(""):'<div class="subtle-card muted">Pas encore assez de données comparables.</div>';
};

R.fetchForecastRows=async dates=>{try{const WF=globalThis.DriveFlowV6WeatherForecastUI;return WF?.fetch?await WF.fetch(dates):[];}catch{return[];}};
R.cellWeather=(date,start,hours)=>{const rows=(R.optWeatherRows||[]).filter(x=>String(x.time).startsWith(date)).filter(x=>{const m=String(x.time).match(/T(\d{2}):(\d{2})/);if(!m)return false;const h=Number(m[1])+Number(m[2])/60;return h>=start&&h<start+hours;});return{rainMm:rows.reduce((a,x)=>a+Math.max(DF.n(x.rain),DF.n(x.precipitation)),0),prob:rows.length?Math.max(...rows.map(x=>DF.n(x.precipitationProbability))):null};};
R.openHeatDetail=key=>{const c=R.optHeat.get(key);if(!c||!W?.open)return;const state=DATA.load(),ctx=DATA.buildContext(state),sessions=DATA.analyticsSessions(state,ctx),f=c.forecast,base=INT.forecastSession(sessions,c,state.settings,{}),wx=R.cellWeather(c.date,c.startHour,c.hours),applied=!!(state.weatherMeta?.modelEnabled&&c.weather&&WX?.similarity),delta=applied&&base?.expectedHourlyCa>0?(f.expectedHourlyCa/base.expectedHourlyCa-1)*100:null;
  const weather=wx.rainMm>=.05?`Pluie prévue : ${wx.rainMm.toFixed(1)} mm${wx.prob!=null?` · risque max ${Math.round(wx.prob)} %`:""}`:wx.prob!=null&&wx.prob>=30?`Risque de pluie jusqu’à ${Math.round(wx.prob)} %`:c.weather?.wetRoadActive?"Pluie récente / sol humide pris en compte.":"Pas de pluie significative prévue.";
  const impact=delta==null?"La météo est affichée sans modifier le CA tant que son effet n’est pas validé par le modèle.":`Effet météo estimé : ${delta>=0?"+":""}${delta.toFixed(1)} % par rapport au niveau habituel de ce créneau.`;
  W.open(`<h2>${R.dateShort(c.date)} · ${R.clock(c.startHour)}</h2><div class="sheet-sub">Historique du créneau et contexte prévu.</div><section class="card"><div class="row"><span>Potentiel brut attendu</span><strong>${R.rate(f.expectedHourlyCa)}</strong></div><div class="row" style="margin-top:8px"><span>Zone historique</span><strong>${R.rate(f.lowHourlyCa)} – ${R.rate(f.highHourlyCa)}</strong></div><div class="row" style="margin-top:8px"><span>Observations comparables</span><strong>${Math.round(f.neighbors||0)}</strong></div></section><section class="subtle-card"><strong>Météo</strong><div class="tiny" style="margin-top:6px">${weather}</div><div class="tiny" style="margin-top:6px">${impact}</div></section><button id="reviewHeatClose" class="secondary" style="margin-top:12px">Fermer</button>`);document.getElementById("reviewHeatClose").onclick=W.close;};
R.heatmapHtml=(dates,scored)=>{const hours=[12,18,19,20],map=new Map(scored.map(c=>[`${c.date}|${c.startHour}`,c]));R.optHeat=map;const keep=hours.filter(h=>{const vals=dates.map(d=>map.get(`${d}|${h}`)?.forecast?.expectedHourlyCa).filter(Number.isFinite),strong=vals.some(v=>v>=12),green=vals.filter(v=>v>=10&&v<12).length;return strong||green>=3;});if(!keep.length)return'<div class="tiny">Aucun créneau suffisamment intéressant à afficher cette semaine.</div>';
  let html=`<div class="review-heatmap" style="grid-template-columns:42px repeat(${keep.length},1fr)"><div></div>${keep.map(h=>`<div class="h">${h}h</div>`).join("")}`;for(const date of dates){html+=`<div class="d">${new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(DATA.parseDate(date))}</div>`;for(const h of keep){const c=map.get(`${date}|${h}`),v=c?.forecast?.expectedHourlyCa;if(!Number.isFinite(v)){html+='<div class="cell review-heat-white">—</div>';continue;}const tier=RULES.heatTier(v),key=`${date}|${h}`;html+=tier==="white"?`<div class="cell review-heat-white">${v.toFixed(1)}</div>`:`<button class="cell review-heat-${tier}" data-review-heat="${key}">${v.toFixed(1)}</button>`;}}return html+'</div><div class="review-heat-legend"><span>Rouge &gt;13,5</span><span>Orange 12–13,5</span><span>Vert 10–12</span></div>';};
R.weatherHtml=(dates,rows)=>{const WF=globalThis.DriveFlowV6WeatherForecastUI;if(!rows.length||!WF?.summary)return'<div class="subtle-card muted">Prévisions pas encore disponibles pour cette semaine.</div>';const summaries=dates.map(d=>WF.summary(rows,d));return`<div class="review-weather-strip">${summaries.map(s=>s?WF.dayHtml(s):'<div class="weather-day"><strong>—</strong><span>—</span><small>Indisponible</small></div>').join("")}</div>`;};
R.renderOptimization=async(force=false)=>{
  const view=document.getElementById("optimizationView");if(!view)return;const key=String(R.optWeekOffset);if(!force&&view.querySelector(`#reviewOptimizationRoot[data-week="${key}"]`))return;const token=++R.optToken,dates=R.optDates(R.optWeekOffset),state=DATA.load();
  const options=Array.from({length:4},(_,i)=>{const ds=R.optDates(i);return`<option value="${i}" ${i===R.optWeekOffset?"selected":""}>Semaine ${i+1} · ${R.dayMonth(ds[0])} – ${R.dayMonth(ds[6])}</option>`;}).join("");
  view.innerHTML=`<div id="reviewOptimizationRoot" data-week="${key}"><div class="page-head"><div><span class="eyebrow">Décider</span><h1>Optimisation</h1><p>Quand travailler, combien de temps, quoi viser</p></div></div><section class="big-callout"><div class="field" style="margin:0 0 10px"><label>Semaine analysée</label><select id="reviewOptWeek">${options}</select></div><div class="row"><strong>${R.weekLabel(dates)}</strong><button id="reviewPlan" class="chip active">Planifier</button></div><p>Les meilleurs créneaux, la heatmap et la météo suivent la semaine sélectionnée.</p></section><div class="section-title"><h2>Meilleurs créneaux</h2><span class="tiny">Brut / Net selon tes réglages</span></div><div id="reviewOptTop" class="slot-list"><div class="subtle-card muted">Analyse en cours…</div></div><div class="section-title"><h2>Heatmap semaine</h2><span class="tiny">CA brut / h attendu</span></div><section id="reviewOptHeat" class="card"><div class="tiny">Calcul…</div></section><div class="section-title"><h2>Conditions prévues</h2></div><div id="reviewOptWeather"><div class="subtle-card muted">Chargement météo…</div></div><section class="card"><div class="row"><div><strong>Météo automatique</strong><div class="tiny">Historique et prévisions récupérés automatiquement lorsque disponibles.</div></div><span class="badge ${state.weatherMeta?.modelEnabled?"high":"medium"}">${state.weatherMeta?.modelEnabled?"Active":"Contexte"}</span></div></section></div>`;
  document.getElementById("reviewOptWeek").onchange=e=>{R.optWeekOffset=Math.max(0,Math.min(3,Number(e.target.value)||0));const P=globalThis.DriveFlowV6PlannerUI;if(P)P.weekOffset=R.optWeekOffset;R.renderOptimization(true);};
  document.getElementById("reviewPlan").onclick=()=>{const P=globalThis.DriveFlowV6PlannerUI;if(P){P.weekOffset=R.optWeekOffset;P.open();}};
  let candidates=DATA.defaultCandidates(dates),heatCandidates=[];for(const date of dates)for(const h of[12,18,19,20])heatCandidates.push(DATA.targetFrom(date,h,h===12?2:3,`${date}-review-${h}`));
  [candidates,heatCandidates]=await Promise.all([DATA.attachForecastWeather(candidates),DATA.attachForecastWeather(heatCandidates)]);const weatherRows=await R.fetchForecastRows(dates);if(token!==R.optToken||!document.getElementById("reviewOptimizationRoot"))return;R.optWeatherRows=weatherRows;
  const fresh=DATA.load(),ctx=DATA.buildContext(fresh),sessions=DATA.analyticsSessions(fresh,ctx),opts=R.intelligenceOpts(fresh),scored=INT.scoreCandidates({sessions,candidates,financialContext:fresh.settings,opts}),heatScored=INT.scoreCandidates({sessions,candidates:heatCandidates,financialContext:fresh.settings,opts}),net=fresh.settings.displayMoneyMode==="net";
  scored.sort((a,b)=>R.metric(b,net)-R.metric(a,net));const top=DATA.distinctTop(scored,4),topBox=document.getElementById("reviewOptTop"),heatBox=document.getElementById("reviewOptHeat"),wxBox=document.getElementById("reviewOptWeather");if(topBox)topBox.innerHTML=top.length?top.map(c=>R.slotHtml(c,fresh)).join(""):'<div class="subtle-card muted">Pas assez de données comparables.</div>';if(heatBox){heatBox.innerHTML=R.heatmapHtml(dates,heatScored);heatBox.querySelectorAll("[data-review-heat]").forEach(b=>b.onclick=()=>R.openHeatDetail(b.dataset.reviewHeat));}if(wxBox)wxBox.innerHTML=R.weatherHtml(dates,weatherRows);
};

R.autoWeather=()=>{
  if(R.autoWeatherStarted)return;R.autoWeatherStarted=true;setTimeout(async()=>{try{if(!navigator.onLine)return;const state=DATA.load(),ctx=DATA.buildContext(state),pending=(state.sessions||[]).filter(s=>DATA.inferSessionCity(state,ctx,s).toLowerCase().includes("montpellier")&&!state.weatherBySessionId?.[s.id]&&DATA.sessionBounds(s));if(!pending.length)return;await DATA.enrichHistoricalWeather(state);}catch{}},2600);
};
R.installStyles=()=>{if(document.getElementById("reviewStyles"))return;const s=document.createElement("style");s.id="reviewStyles";s.textContent=`.review-date-picker{position:absolute;inset:0;width:100%;height:100%;opacity:0;z-index:3;cursor:pointer}.review-chart-legend{display:flex;justify-content:flex-end;gap:14px;font-size:11px;color:var(--muted);margin-bottom:8px}.review-chart-legend span{display:flex;align-items:center;gap:5px}.review-dot{width:8px;height:8px;border-radius:50%;display:inline-block}.review-dot.gross{background:var(--green)}.review-dot.net{background:#4db3ff}.review-week-bars{height:130px;display:grid;grid-template-columns:repeat(7,1fr);gap:7px;align-items:end}.review-day-bars{height:100%;display:grid;grid-template-rows:1fr auto;gap:5px;text-align:center;color:var(--muted);font-size:9px}.review-bar-pair{display:flex;align-items:flex-end;justify-content:center;gap:3px;height:100%;border-bottom:1px solid var(--line);padding:0 2px}.review-bar-pair .bar{width:min(12px,42%);flex:none}.review-settings-button{width:100%;border:0;background:none;color:inherit}.review-heatmap{display:grid;gap:4px;font-size:9px}.review-heatmap .h,.review-heatmap .d{display:flex;align-items:center;justify-content:center;color:var(--muted);min-height:27px}.review-heatmap .cell{border:0;min-height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;width:100%;padding:0}.review-heat-red{background:rgba(255,106,114,.36);color:#ffd0d2}.review-heat-orange{background:rgba(255,183,74,.28);color:#ffe1ad}.review-heat-green{background:rgba(54,217,119,.22);color:#a8f7c5}.review-heat-white{background:rgba(255,255,255,.035);color:var(--muted)}.review-heat-legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:9px;color:var(--muted);font-size:9px}.review-weather-strip{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(86px,1fr);gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px;scrollbar-width:none}.review-weather-strip::-webkit-scrollbar{display:none}`;document.head.appendChild(s);};
R.enhance=()=>{R.enhanceToday();R.enhanceWeek();R.enhanceSettings();R.refreshStatsUpcoming();R.renderOptimization();};

R.patchSavings();R.installStyles();R.autoWeather();
const observer=new MutationObserver(()=>{clearTimeout(R._t);R._t=setTimeout(R.enhance,95);});observer.observe(document.documentElement,{subtree:true,childList:true});
R.enhance();
globalThis.DriveFlowV6LiveReview=R;
})();
