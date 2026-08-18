(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data, DF=globalThis.DriveFlowV6Core;
if(!DATA||!DF)return;
const A={};
A.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
A.rate=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €/h`;
A.hours=h=>{const m=Math.round(DF.n(h)*60),hh=Math.floor(m/60),mm=m%60;return mm?`${hh}h${String(mm).padStart(2,"0")}`:`${hh}h`;};
A.day=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(DATA.parseDate(date));
A.escape=s=>String(s??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
A.ensure=()=>{if(document.getElementById("v6AnalyticsBackdrop"))return;const b=document.createElement("div");b.id="v6AnalyticsBackdrop";b.className="sheet-backdrop";b.hidden=true;const s=document.createElement("section");s.id="v6AnalyticsSheet";s.className="sheet";s.hidden=true;s.innerHTML='<div class="sheet-handle"></div><div id="v6AnalyticsContent"></div>';b.onclick=A.close;document.body.append(b,s);};
A.open=html=>{A.ensure();document.getElementById("v6AnalyticsContent").innerHTML=html;document.getElementById("v6AnalyticsBackdrop").hidden=false;document.getElementById("v6AnalyticsSheet").hidden=false;};
A.close=()=>{const b=document.getElementById("v6AnalyticsBackdrop"),s=document.getElementById("v6AnalyticsSheet");if(b)b.hidden=true;if(s)s.hidden=true;};
A.stateCtx=()=>{const state=DATA.load();return{state,ctx:DATA.buildContext(state)};};
A.range=(months=3)=>{const end=DATA.parseDate(DATA.businessToday()),start=new Date(end);start.setMonth(start.getMonth()-months);return{start:DATA.iso(start),end:DATA.iso(end)};};

A.openHistory=(monthRef=DATA.businessToday())=>{
  const {state,ctx}=A.stateCtx(),d=DATA.parseDate(monthRef),first=DATA.iso(new Date(d.getFullYear(),d.getMonth(),1,12)),last=DATA.iso(new Date(d.getFullYear(),d.getMonth()+1,0,12));
  const dates=DATA.datesBetween(first,last),days=dates.map(x=>DATA.dayMetrics(state,ctx,x)).filter(x=>x.sessions.length||x.ca).reverse();
  A.open(`<h2>Historique</h2><div class="sheet-sub">Consulte tes journées et sessions passées sans charger tous les calculs sur l’écran principal.</div>
    <div class="date-nav card"><button id="histPrev">‹</button><div class="date-center"><strong>${new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(d)}</strong><small>${days.length} jours travaillés</small></div><button id="histNext">›</button></div>
    <div class="session-list">${days.length?days.map(day=>`<article class="session-row"><div class="top"><div><strong>${A.day(day.date)}</strong><div class="meta"><span>${day.sessions.length} session${day.sessions.length>1?"s":""}</span><span>${A.hours(day.hours)}</span><span>${day.orders} commandes</span></div></div><div style="text-align:right"><strong class="green">${A.euro(day.ca)}</strong><div class="tiny">Net ${A.euro(day.netFinal)}</div></div></div></article>`).join(""):'<div class="subtle-card muted">Aucune activité sur ce mois.</div>'}</div><button id="histClose" class="secondary" style="margin-top:12px">Fermer</button>`);
  document.getElementById("histClose").onclick=A.close;document.getElementById("histPrev").onclick=()=>{const x=new Date(d);x.setMonth(x.getMonth()-1);A.openHistory(DATA.iso(x));};document.getElementById("histNext").onclick=()=>{const x=new Date(d);x.setMonth(x.getMonth()+1);A.openHistory(DATA.iso(x));};
};

A.openTop=(months=12)=>{
  const {state,ctx}=A.stateCtx(),r=A.range(months),dates=DATA.datesBetween(r.start,r.end),days=dates.map(x=>DATA.dayMetrics(state,ctx,x)).filter(x=>x.sessions.length||x.ca),sessions=[];
  for(const date of dates)for(const s of ctx.indexes.sessionsByDate.get(date)||[]){const m=DATA.sessionMetrics(state,ctx,s);if(m.hours>0)sessions.push({s,m});}
  const bestDay=days.slice().sort((a,b)=>b.ca-a.ca)[0],bestNetDay=days.slice().sort((a,b)=>b.netFinal-a.netFinal)[0],bestSession=sessions.slice().sort((a,b)=>b.m.ca-a.m.ca)[0],bestHourly=sessions.filter(x=>x.m.hours>=1).sort((a,b)=>(b.m.ca/b.m.hours)-(a.m.ca/a.m.hours))[0];
  A.open(`<h2>Top performances</h2><div class="sheet-sub">Records observés sur les ${months} derniers mois.</div><div class="chips">${[1,3,6,12].map(m=>`<button class="chip ${m===months?"active":""}" data-top-months="${m}">${m} mois</button>`).join("")}</div>
    <div class="metric-grid" style="margin-top:12px">
      <article class="card metric-card"><span class="label">Meilleur jour CA</span><strong class="green">${bestDay?A.euro(bestDay.ca):"—"}</strong><small class="tiny">${bestDay?A.day(bestDay.date):""}</small></article>
      <article class="card metric-card"><span class="label">Meilleur jour Net</span><strong class="blue">${bestNetDay?A.euro(bestNetDay.netFinal):"—"}</strong><small class="tiny">${bestNetDay?A.day(bestNetDay.date):""}</small></article>
      <article class="card metric-card"><span class="label">Meilleure session</span><strong>${bestSession?A.euro(bestSession.m.ca):"—"}</strong><small class="tiny">${bestSession?`${A.day(bestSession.s.date)} · ${A.hours(bestSession.m.hours)}`:""}</small></article>
      <article class="card metric-card"><span class="label">Meilleur taux horaire</span><strong class="purple">${bestHourly?A.rate(bestHourly.m.ca/bestHourly.m.hours):"—"}</strong><small class="tiny">Sessions ≥ 1h</small></article>
    </div><button id="topClose" class="secondary">Fermer</button>`);
  document.getElementById("topClose").onclick=A.close;document.querySelectorAll("[data-top-months]").forEach(b=>b.onclick=()=>A.openTop(Number(b.dataset.topMonths)));
};

A.platformData=(state,start,end)=>{
  const uber=(state.uberBatches||[]).filter(x=>(x.businessDate||"")>=start&&(x.businessDate||"")<=end),del=(state.deliverooOrders||[]).filter(x=>(x.businessDate||"")>=start&&(x.businessDate||"")<=end),tips=(state.cashTips||[]).filter(x=>x.date>=start&&x.date<=end);
  const out={uber:{ca:uber.reduce((a,x)=>a+DF.n(x.total),0),orders:uber.reduce((a,x)=>a+DF.n(x.orderCount),0),tips:0},deliveroo:{ca:del.reduce((a,x)=>a+DF.n(x.earnings),0),orders:del.reduce((a,x)=>a+DF.n(x.orderCount),0),tips:0}};
  for(const t of tips){if(out[t.platform]){out[t.platform].ca+=DF.n(t.amount);out[t.platform].tips+=DF.n(t.amount);}}
  return out;
};
A.openCompare=(months=3)=>{
  const {state}=A.stateCtx(),r=A.range(months),p=A.platformData(state,r.start,r.end),total=p.uber.ca+p.deliveroo.ca;
  const row=(name,x)=>`<article class="card"><div class="row"><strong>${name}</strong><strong>${A.euro(x.ca)}</strong></div><div class="divider"></div><div class="breakdown"><div class="line"><span>Commandes</span><strong>${Math.round(x.orders)}</strong></div><div class="line"><span>CA / commande</span><strong>${x.orders?A.euro(x.ca/x.orders):"—"}</strong></div><div class="line"><span>Part du CA</span><strong>${total?Math.round(x.ca/total*100):0} %</strong></div>${x.tips?`<div class="line"><span>Pourboires espèces V6</span><strong>${A.euro(x.tips)}</strong></div>`:""}</div></article>`;
  A.open(`<h2>Uber ↔ Deliveroo</h2><div class="sheet-sub">Comparaison des revenus réellement présents dans les imports sur les ${months} derniers mois.</div><div class="chips">${[1,3,6,12].map(m=>`<button class="chip ${m===months?"active":""}" data-cmp-months="${m}">${m} mois</button>`).join("")}</div><div style="margin-top:12px">${row("Uber Eats",p.uber)}${row("Deliveroo",p.deliveroo)}</div><div class="tiny" style="margin:0 2px 12px">Cette comparaison suit les exports disponibles : une plateforme non importée sur une période peut être sous-représentée.</div><button id="cmpClose" class="secondary">Fermer</button>`);
  document.getElementById("cmpClose").onclick=A.close;document.querySelectorAll("[data-cmp-months]").forEach(b=>b.onclick=()=>A.openCompare(Number(b.dataset.cmpMonths)));
};

A.enhanceStats=()=>{
  const v=document.getElementById("statsView");if(!v||v.querySelector("#v6AnalyticsLinks"))return;const box=document.createElement("div");box.id="v6AnalyticsLinks";box.innerHTML='<div class="section-title"><h2>Analyses détaillées</h2></div><div class="two-grid"><button id="v6TopBtn" class="secondary">Top performances</button><button id="v6CompareBtn" class="secondary">Uber ↔ Deliveroo</button></div>';v.appendChild(box);document.getElementById("v6TopBtn").onclick=()=>A.openTop();document.getElementById("v6CompareBtn").onclick=()=>A.openCompare();
};
A.enhanceSettings=()=>{
  const v=document.getElementById("settingsView");if(!v||v.querySelector("#v6HistoryLink"))return;const b=document.createElement("button");b.id="v6HistoryLink";b.className="secondary";b.style.marginBottom="12px";b.textContent="Historique des journées ›";const data=v.querySelector("#v6DataManagement");if(data)data.before(b);else v.appendChild(b);b.onclick=()=>A.openHistory();
};
A.enhanceWeekReview=()=>{
  const v=document.getElementById("weekView");if(!v||v.querySelector("#v6PlanReview"))return;
  const dateText=v.querySelector(".date-center strong")?.textContent||"",start=(dateText.match(/\d{4}-\d{2}-\d{2}/)||[])[0];if(!start)return;
  const {state,ctx}=A.stateCtx(),plan=(state.weeklyPlans||[]).find(x=>x.weekKey===DF.isoWeekKey(start));if(!plan)return;
  const actual=DATA.aggregateDates(state,ctx,DATA.weekDates(start));if(!actual.workedDays)return;
  const card=document.createElement("section");card.id="v6PlanReview";card.className="card";const caDelta=plan.expectedCa?((actual.ca/plan.expectedCa)-1)*100:null,hoursDelta=plan.totalHours?actual.hours-plan.totalHours:null;
  card.innerHTML=`<span class="label">Prévision vs réalité</span><div class="two-grid" style="margin-top:10px"><div><strong class="green">${A.euro(actual.ca)}</strong><div class="tiny">Réalisé · prévu ${A.euro(plan.expectedCa)}</div></div><div><strong>${A.hours(actual.hours)}</strong><div class="tiny">Réalisé · prévu ${A.hours(plan.totalHours)}</div></div></div><div class="divider"></div><div class="tiny">${caDelta==null?"":`CA ${caDelta>=0?"+":""}${caDelta.toFixed(0)} % vs prévision`} ${hoursDelta==null?"":`· Temps ${hoursDelta>=0?"+":""}${A.hours(Math.abs(hoursDelta))} ${hoursDelta<0?"de moins":"de plus"}`}</div>`;v.appendChild(card);
};
A.enhance=()=>{A.ensure();A.enhanceStats();A.enhanceSettings();A.enhanceWeekReview();};
const obs=new MutationObserver(()=>{clearTimeout(A._t);A._t=setTimeout(A.enhance,30);});obs.observe(document.documentElement,{subtree:true,childList:true});A.enhance();globalThis.DriveFlowV6AnalyticsUI=A;
})();