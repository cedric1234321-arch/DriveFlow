(() => {
"use strict";

const DF=globalThis.DriveFlowV6Core, INT=globalThis.DriveFlowV6Intelligence, DATA=globalThis.DriveFlowV6Data, WX=globalThis.DriveFlowV6Weather;
if(!DF||!INT||!DATA) throw new Error("DriveFlow V6 modules missing");

let state=DATA.load(),ctx=DATA.buildContext(state);
let activeView="today",selectedDate=DATA.businessToday(),weekRef=selectedDate,statsMode="m3";
let forecastCandidates=[],forecastLoading=false;
const $=id=>document.getElementById(id);
const euro=v=>`${DF.n(v).toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:2})} €`;
const rate=v=>`${DF.n(v).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:2})} €/h`;
const km=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:1})} km`;
const pct=v=>`${Math.round(DF.n(v)*100)} %`;
const fmtHours=h=>{const m=Math.round(DF.n(h)*60),hh=Math.floor(m/60),mm=m%60;return mm?`${hh}h${String(mm).padStart(2,"0")}`:`${hh}h`;};
const dayName=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"}).format(DATA.parseDate(date));
const longDay=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(DATA.parseDate(date));
const monthDay=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"}).format(DATA.parseDate(date));
const clock=h=>{let hh=Math.floor(h)%24,mm=Math.round((h-Math.floor(h))*60);if(mm===60){hh=(hh+1)%24;mm=0;}return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;};
const moneyClass=()=>state.settings.hideMoney?"money hidden-money":"money";
const netLabel=()=>state.settings.urssafEnabled?"Net final":"Net après carburant";
const displayNet=()=>state.settings.displayMoneyMode==="net";
const financialContext=()=>state.settings;
const intelligenceOpts=()=>state.weatherMeta?.modelEnabled?{weatherSimilarity:WX?.similarity}:{};

function save(){DATA.save(state);ctx=DATA.buildContext(state);}
function toast(text){const t=$("toast");t.textContent=text;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2200);}
function showSheet(html){$("sheetContent").innerHTML=html;$("sheetBackdrop").hidden=false;$("sheet").hidden=false;}
function closeSheet(){$("sheetBackdrop").hidden=true;$("sheet").hidden=true;$("sheetContent").innerHTML="";}
function confBadge(c){const labels={high:"Élevée",medium:"Moyenne",low:"Faible",insufficient:"Insuffisant"};return `<span class="badge ${c||"insufficient"}">${labels[c]||labels.insufficient}</span>`;}
function weatherIcon(w){const c=Number(w?.dominantWeatherCode);if(w?.rainMm>0.5||w?.precipitationMm>0.5)return "🌧";if([0,1].includes(c))return "☀️";if([2].includes(c))return "🌤";if([3].includes(c))return "☁️";return "🌥";}
function render(){renderToday();renderWeek();renderStats();renderOptimization();renderSettings();applyPrivacy();}
function applyPrivacy(){document.querySelectorAll(".money").forEach(x=>x.classList.toggle("hidden-money",state.settings.hideMoney));}
function setView(view){activeView=view;document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.dataset.view===view));document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===view));window.scrollTo({top:0,behavior:"instant"});if(view==="optimization"||view==="stats")ensureForecast();}

function daySavings(date,d){
  const rule=DF.resolveSavingsRule({defaultRule:state.settings.defaultSavingsRule,weeklyOverrides:state.settings.weeklySavingsOverrides},date);
  if(rule.mode==="fixed_daily")return DF.savingsForPeriod({netAvailable:d.netFinal,rule,workedDays:d.sessions.length?1:0});
  const wk=DATA.weekDates(date),agg=DATA.aggregateDates(state,ctx,wk);return agg.savings;
}

function renderToday(){
  const d=DATA.dayMetrics(state,ctx,selectedDate),sav=daySavings(selectedDate,d),hourly=displayNet()?d.hourlyNet:d.hourlyGross;
  const fuelPrice=DF.resolveEffectiveValue(state.settings.fuelPriceHistory,selectedDate,"pricePerL");
  $("todayView").innerHTML=`
    <div class="page-head"><div><span class="eyebrow">Journée</span><h1>Aujourd’hui</h1><p>${longDay(selectedDate)}</p></div></div>
    <section class="card date-nav"><button data-day="-1">‹</button><div class="date-center"><strong>${selectedDate===DATA.businessToday()?"Aujourd’hui":dayName(selectedDate)}</strong><small>${selectedDate}</small></div><button data-day="1">›</button></section>
    <div class="hero-grid">
      <article class="card hero-metric"><span class="label">CA brut</span><strong class="value green ${moneyClass()}">${euro(d.ca)}</strong><small class="tiny">Uber + Deliveroo + espèces</small></article>
      <article class="card hero-metric"><span class="label">${netLabel()}</span><strong class="value blue ${moneyClass()}">${euro(d.netFinal)}</strong><small class="tiny">Après charges activées</small></article>
    </div>
    <div class="metric-grid">
      <article class="card metric-card"><span class="label">Épargne réalisée</span><strong class="purple ${moneyClass()}">${euro(sav.saved)}</strong><small class="tiny">Objectif ${euro(sav.target)}</small></article>
      <article class="card metric-card"><span class="label">Taux horaire ${displayNet()?"net":"brut"}</span><strong class="${displayNet()?"blue":"green"} ${moneyClass()}">${rate(hourly)}</strong><small class="tiny">${fmtHours(d.hours)} de travail</small></article>
    </div>
    <section class="card breakdown">
      <div class="line"><span>Commandes</span><strong>${Math.round(d.orders)}</strong></div>
      <div class="line"><span>Distance</span><strong>${km(d.distance)}</strong></div>
      <div class="line"><span>Carburant ${fuelPrice?`· ${DF.n(fuelPrice).toFixed(2)} €/L`:""}</span><strong class="${moneyClass()}">−${euro(d.fuel)}</strong></div>
      ${state.settings.urssafEnabled?`<div class="line"><span>URSSAF · ${DF.resolveUrssaf(state.settings,selectedDate).rate.toFixed(1)} % du CA</span><strong class="purple ${moneyClass()}">−${euro(d.urssaf)}</strong></div>`:""}
      <div class="line"><span>Net après carburant</span><strong class="blue ${moneyClass()}">${euro(d.netAfterFuel)}</strong></div>
      ${state.settings.urssafEnabled?`<div class="line"><span>Net final</span><strong class="purple ${moneyClass()}">${euro(d.netFinal)}</strong></div>`:""}
    </section>
    <div class="section-title"><h2>Sessions</h2><button id="addTipBtn">+ Pourboire espèces</button></div>
    <div class="session-list">${d.sessions.length?d.sessions.map(s=>sessionHtml(s)).join(""):`<div class="subtle-card muted">Aucune session enregistrée.</div>`}</div>`;
  $("todayView").querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>{selectedDate=DATA.iso(DATA.addDays(DATA.parseDate(selectedDate),Number(b.dataset.day)));renderToday();});
  $("addTipBtn").onclick=openCashTipSheet;
}
function sessionHtml(s){const m=DATA.sessionMetrics(state,ctx,s);return `<article class="session-row"><div class="top"><div><strong>${s.start||"—"} → ${s.end||"—"}</strong><div class="meta"><span>${s.type||"Session"}</span><span>${fmtHours(m.hours)}</span><span>${km(m.distance)}</span></div></div><strong class="${moneyClass()}">${euro(displayNet()?m.netFinal:m.ca)}</strong></div>${m.cashTips?`<div class="meta"><span class="purple">Pourboires espèces ${euro(m.cashTips)}</span></div>`:""}</article>`;}

function renderWeek(){
  const dates=DATA.weekDates(weekRef),a=DATA.aggregateDates(state,ctx,dates),max=Math.max(1,...a.days.map(d=>d.ca)),ur=state.settings.urssafEnabled;
  $("weekView").innerHTML=`
    <div class="page-head"><div><span class="eyebrow">Pilotage</span><h1>Semaine</h1><p>${dayName(dates[0])} – ${dayName(dates[6])}</p></div></div>
    <section class="card date-nav"><button data-week="-7">‹</button><div class="date-center"><strong>${dates[0]} → ${dates[6]}</strong><small>${DF.isoWeekKey(dates[0])}</small></div><button data-week="7">›</button></section>
    <section class="card"><div class="mini-chart">${dates.map(date=>{const d=DATA.dayMetrics(state,ctx,date),h=Math.max(4,d.ca/max*100),hn=Math.max(3,d.netFinal/max*100);return `<i class="bar" style="height:${h}%"></i><i class="bar net" style="height:${hn}%"></i>`;}).join("")}</div><div class="chart-labels">${dates.map(d=>`<span>${new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(DATA.parseDate(d))}</span>`).join("")}</div></section>
    <div class="hero-grid"><article class="card hero-metric"><span class="label">CA semaine</span><strong class="value green ${moneyClass()}">${euro(a.ca)}</strong><small class="tiny">${a.workedDays} jour${a.workedDays>1?"s":""} travaillé${a.workedDays>1?"s":""}</small></article><article class="card hero-metric"><span class="label">${netLabel()}</span><strong class="value blue ${moneyClass()}">${euro(a.netFinal)}</strong><small class="tiny">Carburant ${euro(a.fuel)}${ur?` · URSSAF ${euro(a.urssaf)}`:""}</small></article></div>
    <section class="card"><div class="row"><div><span class="label">Épargne</span><div style="margin-top:6px"><strong class="value small purple ${moneyClass()}">${euro(a.savings.saved)}</strong> <span class="muted">/ ${euro(a.savings.target)}</span></div></div><button id="weekSavingsEdit" class="link-button">Modifier</button></div><div class="progress" style="margin-top:12px"><div style="width:${Math.min(100,a.savings.target?a.savings.saved/a.savings.target*100:0)}%"></div></div><div class="row tiny" style="margin-top:8px"><span>${savingsRuleLabel(a.savingsRule)}</span><span>Reste ${euro(a.savings.remaining)}</span></div></section>
    <div class="metric-grid"><article class="card metric-card"><span class="label">Taux horaire</span><strong>${rate(displayNet()?a.hourlyNet:a.hourlyGross)}</strong></article><article class="card metric-card"><span class="label">Temps de travail</span><strong>${fmtHours(a.hours)}</strong></article><article class="card metric-card"><span class="label">Commandes</span><strong>${Math.round(a.orders)}</strong></article><article class="card metric-card"><span class="label">Distance</span><strong>${km(a.distance)}</strong></article></div>
    ${weekPlanRecap(dates[0])}`;
  $("weekView").querySelectorAll("[data-week]").forEach(b=>b.onclick=()=>{weekRef=DATA.iso(DATA.addDays(DATA.parseDate(weekRef),Number(b.dataset.week)));renderWeek();});
  $("weekSavingsEdit").onclick=()=>openSavingsSheet(dates[0]);
}
function savingsRuleLabel(r){if(r.mode==="fixed_week")return `${euro(r.value)} sur la semaine`;if(r.mode==="percent_net")return `${DF.n(r.value)} % du Net`;return `${euro(r.value)} / jour travaillé`;}
function weekPlanRecap(date){const key=DF.isoWeekKey(date),p=(state.weeklyPlans||[]).find(x=>x.weekKey===key);if(!p)return `<section class="big-callout"><strong>Planifier cette semaine</strong><p>Définis ton objectif de CA, ton épargne et tes disponibilités. DriveFlow sélectionnera les créneaux les plus efficaces.</p><button class="primary" style="margin-top:12px" data-go-plan="1">Ouvrir Optimisation</button></section>`;return `<section class="card"><span class="label">Plan DriveFlow</span><div class="row" style="margin-top:8px"><strong>${p.sessionsCount} sessions · ${fmtHours(p.totalHours)}</strong><strong class="green ${moneyClass()}">≈ ${euro(p.expectedCa)}</strong></div><div class="tiny" style="margin-top:7px">Objectif CA ${euro(p.caGoal)} · Épargne ${euro(p.savingsGoal)}</div></section>`;}

function renderStats(){
  const dates=DATA.rangeDates(selectedDate,statsMode),a=DATA.aggregateDates(state,ctx,dates),ss=dates.flatMap(d=>ctx.indexes.sessionsByDate.get(d)||[]),sessionMetrics=ss.map(s=>DATA.sessionMetrics(state,ctx,s));
  const avgSession=ss.length?a.ca/ss.length:0,avgDay=a.workedDays?a.ca/a.workedDays:0,avgDuration=ss.length?sessionMetrics.reduce((x,m)=>x+m.hours,0)/ss.length:0;
  const top=getTopUpcoming(4);
  $("statsView").innerHTML=`
    <div class="page-head"><div><span class="eyebrow">Comprendre</span><h1>Stats</h1><p>Des données qui servent à décider</p></div></div>
    <div class="chips" id="statsChips">${[["week","Semaine"],["m1","1 mois"],["m3","3 mois"],["m6","6 mois"],["m12","12 mois"]].map(([k,l])=>`<button class="chip ${statsMode===k?"active":""}" data-stats="${k}">${l}</button>`).join("")}</div>
    <div class="metric-grid" style="margin-top:12px"><article class="card metric-card"><span class="label">Taux horaire ${displayNet()?"net":"brut"}</span><strong class="${displayNet()?"blue":"green"} ${moneyClass()}">${rate(displayNet()?a.hourlyNet:a.hourlyGross)}</strong></article><article class="card metric-card"><span class="label">CA moyen / session</span><strong class="${moneyClass()}">${euro(avgSession)}</strong></article><article class="card metric-card"><span class="label">CA moyen / jour travaillé</span><strong class="${moneyClass()}">${euro(avgDay)}</strong></article><article class="card metric-card"><span class="label">Durée moyenne / session</span><strong>${fmtHours(avgDuration)}</strong></article></div>
    <div class="section-title"><h2>Meilleurs créneaux à venir</h2><button data-nav-inline="optimization">Voir tout</button></div>
    <div class="slot-list">${forecastLoading?`<div class="subtle-card muted">Calcul des créneaux…</div>`:top.length?top.map(slotHtml).join(""):`<div class="subtle-card muted">Données insuffisantes pour une recommandation fiable.</div>`}</div>
    <div class="section-title"><h2>Insights</h2></div><div class="insight-list">${buildInsights(DATA.analyticsSessions(state,ctx),dates).map(x=>`<article class="insight-row"><strong>${x.title}</strong><div class="tiny" style="margin-top:5px">${x.text}</div></article>`).join("")}</div>`;
  $("statsView").querySelectorAll("[data-stats]").forEach(b=>b.onclick=()=>{statsMode=b.dataset.stats;renderStats();});
  $("statsView").querySelectorAll("[data-nav-inline]").forEach(b=>b.onclick=()=>setView(b.dataset.navInline));
}
function buildInsights(rows,dates){
  const min=dates[0],max=dates.at(-1),r=rows.filter(x=>x.date>=min&&x.date<=max),out=[];
  const byDay=Array.from({length:7},()=>[]);r.forEach(x=>{if(x.hours>0)byDay[x.weekday].push(x.caHourly);});
  const av=byDay.map(a=>a.length?{n:a.length,v:a.reduce((x,y)=>x+y,0)/a.length}:null),best=av.map((x,i)=>x?{...x,i}:null).filter(Boolean).sort((a,b)=>b.v-a.v)[0];
  if(best&&best.n>=5){const names=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];out.push({title:`Le ${names[best.i]} ressort le mieux`,text:`${rate(best.v)} brut en moyenne sur ${best.n} sessions de la période.`});}
  const evening=r.filter(x=>x.startHour>=17),mid=r.filter(x=>x.startHour>=10&&x.startHour<17);const mean=x=>x.length?x.reduce((a,b)=>a+b.caHourly,0)/x.length:0;
  if(evening.length>=8&&mid.length>=8){const e=mean(evening),m=mean(mid),delta=m?((e/m)-1)*100:0;out.push({title:delta>=0?"Les soirées sont plus efficaces":"Les midis sont plus efficaces",text:`Écart observé de ${Math.abs(delta).toFixed(0)} % sur cette période (${evening.length} soirées, ${mid.length} midis).`});}
  const exact=r.filter(x=>x.timeQuality==="exact");out.push({title:"Durée optimale : prudence",text:`${exact.length} sessions de cette période ont des horaires exacts. DriveFlow évite de surinterpréter les durées reconstruites.`});
  return out.slice(0,3);
}

function slotMetric(c){return displayNet()?c.forecast.netFinal/Math.max(.25,c.hours):c.forecast.expectedHourlyCa;}
function getTopUpcoming(n=4){
  if(!forecastCandidates.length)return [];
  const rows=INT.scoreCandidates({sessions:DATA.analyticsSessions(state,ctx),candidates:forecastCandidates,financialContext:financialContext(),opts:intelligenceOpts()}).sort((a,b)=>slotMetric(b)-slotMetric(a));
  return DATA.distinctTop(rows,n);
}
function slotHtml(c){const f=c.forecast,w=c.weather;return `<article class="slot-row"><div class="top"><div><strong>${monthDay(c.date)} · ${clock(c.startHour)}–${clock(c.startHour+c.hours)}</strong><div class="meta"><span class="${displayNet()?"blue":"green"}">${rate(slotMetric(c))}</span><span>≈ ${euro(displayNet()?f.netFinal:f.expectedCa)}</span>${w?`<span>${weatherIcon(w)} ${w.temperatureAvg!=null?Math.round(w.temperatureAvg)+"°":""}</span>`:""}</div></div>${confBadge(f.confidence)}</div><div class="meta"><span>${Math.round(f.neighbors)} observations comparables</span><span>Zone CA ${euro(f.lowCa)}–${euro(f.highCa)}</span></div></article>`;}

function renderOptimization(){
  const top=getTopUpcoming(4),dates=DATA.nextWeekDates(DATA.businessToday());
  $("optimizationView").innerHTML=`
    <div class="page-head"><div><span class="eyebrow">Décider</span><h1>Optimisation</h1><p>Quand travailler, combien de temps, quoi viser</p></div></div>
    <section class="big-callout"><div class="row"><div><span class="label">Semaine à venir</span><strong style="display:block;margin-top:5px">${dayName(dates[0])} → ${dayName(dates[6])}</strong></div><button id="openPlanner" class="chip active">Planifier</button></div><p>Les recommandations utilisent ton historique, la récence et, si elle est validée par backtest, la météo.</p></section>
    <div class="section-title"><h2>Meilleurs créneaux</h2><span class="tiny">Base historique pondérée</span></div><div class="slot-list">${forecastLoading?`<div class="subtle-card muted">Analyse en cours…</div>`:top.length?top.map(slotHtml).join(""):`<div class="subtle-card muted">Pas encore assez de données comparables.</div>`}</div>
    <div class="section-title"><h2>Heatmap semaine</h2><span class="tiny">${displayNet()?"Net":"CA"} / h attendu</span></div><section class="card">${heatmapHtml(dates)}</section>
    <div class="section-title"><h2>Conditions prévues</h2></div>${weatherSummaryHtml(dates)}
    <section class="card"><div class="row"><div><strong>Météo dans le modèle</strong><div class="tiny">${weatherModelStatus()}</div></div>${state.weatherMeta?.modelEnabled?confBadge("high"):confBadge(state.weatherMeta?.status==="complete"?"medium":"insufficient")}</div></section>`;
  $("openPlanner").onclick=openPlannerSheet;
}
function heatmapHtml(dates){
  const hours=[12,18,19,20],rows=INT.scoreCandidates({sessions:DATA.analyticsSessions(state,ctx),candidates:forecastCandidates,financialContext:financialContext(),opts:intelligenceOpts()});
  const map=new Map(rows.map(x=>[`${x.date}|${Math.round(x.startHour*2)/2}`,slotMetric(x)])),vals=[...map.values()].filter(Number.isFinite),lo=vals.length?Math.min(...vals):0,hi=vals.length?Math.max(...vals):1;
  let html=`<div class="heatmap"><div></div>${hours.map(h=>`<div class="h">${h}h</div>`).join("")}`;
  dates.forEach(date=>{html+=`<div class="d">${new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(DATA.parseDate(date))}</div>`;hours.forEach(h=>{let best=null;for(const off of [0,-.5,.5]){const v=map.get(`${date}|${h+off}`);if(v!=null&&(best==null||v>best))best=v;}const r=best==null?0:(best-lo)/Math.max(.01,hi-lo),c=best==null?"":r>.75?"c4":r>.5?"c3":r>.25?"c2":"c1";html+=`<div class="cell ${c}">${best==null?"—":DF.n(best).toFixed(1)}</div>`;});});return html+`</div>`;
}
function weatherSummaryHtml(dates){const withW=forecastCandidates.filter(c=>c.weather),byDate=new Map();withW.forEach(c=>{if(!byDate.has(c.date))byDate.set(c.date,c.weather);});if(!byDate.size)return `<div class="subtle-card muted">Prévision météo indisponible pour le moment.</div>`;return `<div class="weather-strip">${dates.slice(0,4).map(d=>{const w=byDate.get(d);return `<div class="weather-day"><strong>${new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric"}).format(DATA.parseDate(d))}</strong><span>${weatherIcon(w)}</span><small>${w?.temperatureAvg!=null?Math.round(w.temperatureAvg)+"°C":"—"}<br>${w?.rainMm?`${w.rainMm.toFixed(1)} mm pluie`:`${Math.round(w?.windSpeedAvg||0)} km/h`}</small></div>`;}).join("")}</div>`;}
function weatherModelStatus(){const m=state.weatherMeta||{};if(m.modelEnabled)return `Activée : la météo a amélioré les backtests (${m.improvementPct?.toFixed?.(1)||""} %).`;if(m.status==="complete")return "Historique météo chargé. Backtest d’utilité à finaliser avant activation.";if(m.status==="loading")return "Enrichissement de l’historique en cours.";if(m.status==="error")return "Téléchargement météo interrompu. Réessaie depuis Réglages.";return "Pas encore enrichi. Les recommandations actuelles n’utilisent pas la météo.";}

function renderSettings(){
  const s=state.settings,price=DF.resolveEffectiveValue(s.fuelPriceHistory,DATA.businessToday(),"pricePerL")||0,cons=DF.resolveEffectiveValue(s.consumptionHistory,DATA.businessToday(),"litresPer100km")||0,ur=DF.resolveUrssaf(s,DATA.businessToday());
  $("settingsView").innerHTML=`
    <div class="page-head"><div><span class="eyebrow">Personnaliser</span><h1>Réglages</h1><p>Les paramètres qui influencent tes calculs</p></div></div>
    <section class="card"><span class="label">Affichage principal</span><div class="segmented" style="margin-top:9px"><button data-money="gross" class="${s.displayMoneyMode!=="net"?"active":""}">Brut</button><button data-money="net" class="${s.displayMoneyMode==="net"?"active":""}">Net</button></div><div class="tiny" style="margin-top:8px">Le Net inclut le carburant et l’URSSAF lorsqu’elle est activée.</div></section>
    <section class="card settings-list">
      <div class="settings-row"><div><strong>Apparence</strong><div class="desc">Clair, sombre ou système</div></div><select id="themeSetting"><option value="system">Système</option><option value="dark">Sombre</option><option value="light">Clair</option></select></div>
      <div class="settings-row"><div><strong>Prix du carburant</strong><div class="desc">Valeur actuelle, historisée par date</div></div><button id="fuelPriceEdit" class="link-button">${DF.n(price).toFixed(2)} €/L ›</button></div>
      <div class="settings-row"><div><strong>Consommation véhicule</strong><div class="desc">Historisée comme le prix</div></div><button id="consEdit" class="link-button">${DF.n(cons).toFixed(1)} L/100 ›</button></div>
    </section>
    <section class="card settings-list">
      <div class="settings-row"><div><strong>Prendre en compte l’URSSAF</strong><div class="desc">Cotisations calculées sur le CA brut</div></div><input id="urssafToggle" class="toggle" type="checkbox" ${s.urssafEnabled?"checked":""}></div>
      ${s.urssafEnabled?`<div class="settings-row"><div><strong>Taux URSSAF</strong><div class="desc">Actuellement ${ur.rate.toFixed(1)} %</div></div><button id="urssafEdit" class="link-button">Modifier ›</button></div>`:""}
    </section>
    <section class="card settings-list"><div class="settings-row"><div><strong>Épargne par défaut</strong><div class="desc">${savingsRuleLabel(s.defaultSavingsRule)}</div></div><button id="defaultSavingsEdit" class="link-button">Modifier ›</button></div></section>
    <section class="card settings-list"><div class="settings-row"><div><strong>Météo historique Montpellier</strong><div class="desc">${weatherModelStatus()}</div></div><button id="weatherEnrich" class="link-button">${state.weatherMeta?.status==="complete"?"Actualiser":"Enrichir"} ›</button></div></section>
    <section class="card"><button id="exportV6" class="secondary">Exporter une sauvegarde V6</button><button id="resetV6" class="secondary danger" style="margin-top:9px">Réinitialiser la copie V6 depuis V5</button><div class="tiny" style="margin-top:9px">La V5 de production n’est jamais effacée par cette branche.</div></section>
    <section class="card row"><div><strong>DriveFlow</strong><div class="tiny">V6.0.0-dev · Branche isolée</div></div><span class="dev-badge">RC DEV</span></section>`;
  $("settingsView").querySelectorAll("[data-money]").forEach(b=>b.onclick=()=>{s.displayMoneyMode=b.dataset.money;save();render();});
  $("themeSetting").value=s.theme||"system";$("themeSetting").onchange=e=>{s.theme=e.target.value;save();applyTheme();};
  $("fuelPriceEdit").onclick=()=>openEffectiveValueSheet("fuel");$("consEdit").onclick=()=>openEffectiveValueSheet("cons");
  $("urssafToggle").onchange=e=>{s.urssafEnabled=e.target.checked;save();render();}; if($("urssafEdit"))$("urssafEdit").onclick=openUrssafSheet;
  $("defaultSavingsEdit").onclick=()=>openSavingsSheet(DATA.businessToday(),true);
  $("weatherEnrich").onclick=runWeatherEnrichment;$("exportV6").onclick=exportBackup;$("resetV6").onclick=resetFromV5;
}

function openCashTipSheet(){const ss=ctx.indexes.sessionsByDate.get(selectedDate)||[];showSheet(`<h2>Pourboire espèces</h2><div class="sheet-sub">Ajoute un pourboire sans créer de commande.</div><div class="field"><label>Montant</label><input id="tipAmount" type="number" min="0" step="0.01" inputmode="decimal"></div><div class="field"><label>Plateforme</label><select id="tipPlatform"><option value="uber">Uber Eats</option><option value="deliveroo">Deliveroo</option></select></div><div class="field"><label>Session</label><select id="tipSession">${ss.map(s=>`<option value="${s.id}">${s.start||"—"} → ${s.end||"—"}</option>`).join("")}</select></div><button id="saveTip" class="primary" ${ss.length?"":"disabled"}>Ajouter</button>`);$("saveTip").onclick=()=>{const amount=DF.n($("tipAmount").value),sessionId=$("tipSession").value;if(!(amount>0)||!sessionId)return;state.cashTips.push({id:`tip_${Date.now().toString(36)}`,sessionId,date:selectedDate,amount,platform:$("tipPlatform").value,createdAt:new Date().toISOString(),source:"manual-v6"});save();closeSheet();render();toast("Pourboire ajouté");};}
function openSavingsSheet(date,isDefault=false){const current=isDefault?state.settings.defaultSavingsRule:DF.resolveSavingsRule({defaultRule:state.settings.defaultSavingsRule,weeklyOverrides:state.settings.weeklySavingsOverrides},date);showSheet(`<h2>${isDefault?"Épargne par défaut":"Objectif d’épargne de la semaine"}</h2><div class="sheet-sub">Cette règle ${isDefault?"sera proposée aux nouvelles semaines":"ne modifie que cette semaine"}.</div><div class="field"><label>Mode</label><select id="savMode"><option value="fixed_daily">Montant par jour travaillé</option><option value="fixed_week">Montant fixe sur la semaine</option><option value="percent_net">Pourcentage du Net</option></select></div><div class="field"><label>Valeur</label><input id="savValue" type="number" min="0" step="0.01" value="${DF.n(current.value)}"></div><button id="saveSavings" class="primary">Enregistrer</button>`);$("savMode").value=current.mode;$("saveSavings").onclick=()=>{const rule={mode:$("savMode").value,value:Math.max(0,DF.n($("savValue").value))};if(isDefault)state.settings.defaultSavingsRule=rule;else state.settings.weeklySavingsOverrides[DF.isoWeekKey(date)]=rule;save();closeSheet();render();toast("Objectif d’épargne enregistré");};}
function openEffectiveValueSheet(kind){const fuel=kind==="fuel",history=fuel?state.settings.fuelPriceHistory:state.settings.consumptionHistory,key=fuel?"pricePerL":"litresPer100km",current=DF.resolveEffectiveValue(history,DATA.businessToday(),key)||0;showSheet(`<h2>${fuel?"Prix du carburant":"Consommation véhicule"}</h2><div class="sheet-sub">La nouvelle valeur s’applique à partir de la date choisie. Le passé reste inchangé.</div><div class="field"><label>${fuel?"Prix €/L":"L/100 km"}</label><input id="effValue" type="number" min="0" step="${fuel?"0.01":"0.1"}" value="${current}"></div><div class="field"><label>Applicable à partir du</label><input id="effDate" type="date" value="${DATA.businessToday()}"></div><button id="saveEff" class="primary">Enregistrer</button>`);$("saveEff").onclick=()=>{const v=Math.max(0,DF.n($("effValue").value)),date=$("effDate").value;if(!date||!(v>0))return;history.push(fuel?{effectiveFrom:date,pricePerL:v,source:"manual-v6"}:{effectiveFrom:date,litresPer100km:v,source:"manual-v6"});save();closeSheet();render();toast("Valeur historisée");};}
function openUrssafSheet(){const presets=DF.URSSAF_PRESETS,cur=DF.resolveUrssaf(state.settings,DATA.businessToday()).rate;showSheet(`<h2>URSSAF / Charges sociales</h2><div class="sheet-sub">Le taux s’applique au CA brut. Désactive l’interrupteur principal si tu ne veux pas le prendre en compte.</div><div class="field"><label>Taux</label><select id="urRate">${Object.entries(presets).map(([k,p])=>`<option value="${p.rate}">${p.label} · ${p.rate.toFixed(1)} %</option>`).join("")}<option value="custom">Personnalisé</option></select></div><div class="field" id="customUr" hidden><label>Taux personnalisé (%)</label><input id="customUrValue" type="number" min="0" step="0.1" value="${cur}"></div><div class="field"><label>Applicable à partir du</label><input id="urDate" type="date" value="${DATA.businessToday()}"></div><button id="saveUr" class="primary">Enregistrer</button>`);const select=$("urRate"),match=Object.values(presets).find(p=>Math.abs(p.rate-cur)<.01);select.value=match?String(match.rate):"custom";$("customUr").hidden=!!match;select.onchange=()=>$("customUr").hidden=select.value!=="custom";$("saveUr").onclick=()=>{const v=select.value==="custom"?DF.n($("customUrValue").value):DF.n(select.value),date=$("urDate").value;if(!date||!(v>=0))return;state.settings.urssafRatePct=v;state.settings.urssafRateHistory.push({effectiveFrom:date,ratePct:v,source:"manual-v6"});save();closeSheet();render();toast("Taux URSSAF historisé");};}
function openPlannerSheet(){const dates=DATA.nextWeekDates(DATA.businessToday());showSheet(`<h2>Planifier ma semaine</h2><div class="sheet-sub">${dayName(dates[0])} → ${dayName(dates[6])}. DriveFlow cherche le moins de travail nécessaire parmi tes disponibilités.</div><div class="inline-fields"><div class="field"><label>CA à atteindre</label><input id="planCa" type="number" min="0" step="10" value="300"></div><div class="field"><label>Épargne nette</label><input id="planSav" type="number" min="0" step="10" value="150"></div></div><div class="card"><div class="settings-row" style="padding:7px 0"><div><strong>Midis</strong><div class="desc">12:00–14:30</div></div><input id="planMid" class="toggle" type="checkbox" checked></div><div class="settings-row" style="padding:7px 0"><div><strong>Soirs</strong><div class="desc">17:30–23:30</div></div><input id="planEve" class="toggle" type="checkbox" checked></div></div><div class="field"><label>Priorité</label><select id="planPriority"><option value="min_time">Travailler le moins de temps possible</option><option value="min_sessions">Faire le moins de sessions possible</option><option value="max_hourly">Maximiser le taux horaire</option><option value="max_ca">Maximiser le CA</option></select></div><button id="generatePlan" class="primary">Générer le meilleur plan</button><div id="planResult" style="margin-top:12px"></div>`);$("generatePlan").onclick=async()=>{const btn=$("generatePlan");btn.disabled=true;btn.textContent="Calcul…";let candidates=DATA.availabilityCandidates(dates,{midday:$("planMid").checked,evening:$("planEve").checked});candidates=await DATA.attachForecastWeather(candidates);const plan=INT.planWeek({sessions:DATA.analyticsSessions(state,ctx),candidates,financialContext:financialContext(),caGoal:DF.n($("planCa").value),savingsGoal:DF.n($("planSav").value),priority:$("planPriority").value,opts:intelligenceOpts()});$("planResult").innerHTML=planHtml(plan);btn.disabled=false;btn.textContent="Recalculer";const keep=document.createElement("button");keep.className="secondary";keep.style.marginTop="9px";keep.textContent="Enregistrer ce plan";keep.onclick=()=>{const entry={...plan,weekKey:DF.isoWeekKey(dates[0]),createdAt:new Date().toISOString(),selected:plan.selected.map(c=>({id:c.id,date:c.date,startHour:c.startHour,hours:c.hours,forecast:c.forecast}))};state.weeklyPlans=(state.weeklyPlans||[]).filter(x=>x.weekKey!==entry.weekKey);state.weeklyPlans.push(entry);save();closeSheet();render();toast("Plan enregistré");};$("planResult").appendChild(keep);};}
function planHtml(p){if(!p.selected?.length)return `<div class="subtle-card muted">Aucun plan fiable avec ces disponibilités. Élargis-les ou réduis l’objectif.</div>`;return `<div class="card"><span class="label">Plan proposé</span><div class="hero-grid" style="margin-top:10px"><div><strong class="value small">${fmtHours(p.totalHours)}</strong><div class="tiny">Temps prévu</div></div><div><strong class="value small green ${moneyClass()}">≈ ${euro(p.expectedCa)}</strong><div class="tiny">CA attendu</div></div></div><div class="row" style="margin-top:12px"><span>Épargne visée</span><strong class="purple ${moneyClass()}">${euro(p.expectedSavings)}</strong></div><div class="row" style="margin-top:8px"><span>Confiance globale</span>${confBadge(p.confidence)}</div></div><div class="plan-list">${p.selected.map(c=>`<article class="plan-row"><div class="top"><strong>${monthDay(c.date)} · ${clock(c.startHour)}–${clock(c.startHour+c.hours)}</strong><strong class="green ${moneyClass()}">≈ ${euro(c.forecast.expectedCa)}</strong></div><div class="meta"><span>${fmtHours(c.hours)}</span><span>${confBadge(c.forecast.confidence)}</span></div></article>`).join("")}</div><div class="tiny" style="margin-top:10px">La probabilité agrégée d’atteinte des deux objectifs sera ajoutée après calibration Monte-Carlo du planificateur. Les montants restent des estimations, pas des garanties.</div>`;}

async function ensureForecast(){if(forecastLoading||forecastCandidates.length)return;forecastLoading=true;renderStats();renderOptimization();let c=DATA.defaultCandidates(DATA.nextWeekDates(DATA.businessToday()));forecastCandidates=await DATA.attachForecastWeather(c);forecastLoading=false;renderStats();renderOptimization();}
async function runWeatherEnrichment(){toast("Enrichissement météo lancé");state.weatherMeta.status="loading";save();renderSettings();const res=await DATA.enrichHistoricalWeather(state,({done,total})=>{state.weatherMeta.progress=total?done/total:0;renderSettings();});state=DATA.load();ctx=DATA.buildContext(state);render();toast(res.status==="complete"?`${res.count} sessions enrichies par la météo`:"Météo non disponible");}
function exportBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`driveflow-backup-v6-${DATA.businessToday()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function resetFromV5(){if(!confirm("Réinitialiser uniquement la copie V6 à partir des données V5 ? La V5 reste intacte."))return;localStorage.removeItem(DATA.KEY);state=DATA.load();ctx=DATA.buildContext(state);forecastCandidates=[];render();ensureForecast();toast("Copie V6 recréée depuis V5");}

function applyTheme(){document.documentElement.classList.remove("light");const mode=state.settings.theme||"system",light=mode==="light"||(mode==="system"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.classList.toggle("light",light);}
function installEvents(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>setView(b.dataset.nav));$("brandHome").onclick=()=>setView("today");$("privacyBtn").onclick=()=>{state.settings.hideMoney=!state.settings.hideMoney;save();applyPrivacy();};$("sheetBackdrop").onclick=closeSheet;
  document.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});document.addEventListener("gesturechange",e=>e.preventDefault(),{passive:false});document.addEventListener("gestureend",e=>e.preventDefault(),{passive:false});
  document.addEventListener("click",e=>{const b=e.target.closest("[data-go-plan]");if(b)setView("optimization");});
}

applyTheme();installEvents();render();ensureForecast();
setTimeout(()=>$("splash").classList.add("hide"),300);
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("driveflow-v6-sw.js").catch(()=>{});
})();