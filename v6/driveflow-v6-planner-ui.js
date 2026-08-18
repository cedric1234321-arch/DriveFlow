(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data,INT=globalThis.DriveFlowV6Intelligence,DF=globalThis.DriveFlowV6Core;
if(!DATA||!INT||!DF)return;
const P={};
P.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
P.hours=h=>{const m=Math.round(DF.n(h)*60),hh=Math.floor(m/60),mm=m%60;return mm?`${hh}h${String(mm).padStart(2,"0")}`:`${hh}h`;};
P.clock=h=>{let hh=Math.floor(h)%24,mm=Math.round((h-Math.floor(h))*60);if(mm===60){hh=(hh+1)%24;mm=0;}return`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;};
P.day=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"}).format(DATA.parseDate(date));
P.conf=c=>({high:"Élevée",medium:"Moyenne",low:"Faible",insufficient:"Insuffisante"}[c]||"—");
P.ensure=()=>{if(document.getElementById("v6PlannerBackdrop"))return;const b=document.createElement("div");b.id="v6PlannerBackdrop";b.className="sheet-backdrop";b.hidden=true;const s=document.createElement("section");s.id="v6PlannerSheet";s.className="sheet";s.hidden=true;s.innerHTML='<div class="sheet-handle"></div><div id="v6PlannerContent"></div>';b.onclick=P.close;document.body.append(b,s);};
P.openHtml=html=>{P.ensure();document.getElementById("v6PlannerContent").innerHTML=html;document.getElementById("v6PlannerBackdrop").hidden=false;document.getElementById("v6PlannerSheet").hidden=false;};
P.close=()=>{const b=document.getElementById("v6PlannerBackdrop"),s=document.getElementById("v6PlannerSheet");if(b)b.hidden=true;if(s)s.hidden=true;};
P.dates=()=>DATA.nextWeekDates(DATA.businessToday());
P.matrix=dates=>dates.map((d,i)=>`<div class="settings-row" style="padding:10px 2px"><div><strong>${P.day(d)}</strong><div class="desc">Disponibilités</div></div><div style="display:flex;gap:13px;align-items:center"><label class="tiny" style="display:flex;align-items:center;gap:5px"><input type="checkbox" data-av-day="${i}" data-av-kind="mid" checked> Midi</label><label class="tiny" style="display:flex;align-items:center;gap:5px"><input type="checkbox" data-av-day="${i}" data-av-kind="eve" checked> Soir</label></div></div>`).join("");
P.open=()=>{
  const dates=P.dates();P.openHtml(`<h2>Planifier ma semaine</h2><div class="sheet-sub">${P.day(dates[0])} → ${P.day(dates[6])}. DriveFlow cherche les créneaux qui atteignent tes objectifs avec le moins de travail possible.</div>
    <div class="inline-fields"><div class="field"><label>CA à atteindre</label><input id="pv6Ca" type="number" min="0" step="10" value="300"></div><div class="field"><label>Épargne nette à atteindre</label><input id="pv6Savings" type="number" min="0" step="10" value="150"></div></div>
    <div class="section-title" style="margin-top:8px"><h2>Mes disponibilités</h2><div><button id="pv6All" class="link-button">Tout</button> · <button id="pv6None" class="link-button">Aucun</button></div></div><section class="card settings-list">${P.matrix(dates)}</section>
    <div class="field"><label>Priorité</label><select id="pv6Priority"><option value="min_time">Travailler le moins de temps possible</option><option value="min_sessions">Faire le moins de sessions possible</option><option value="max_hourly">Maximiser le taux horaire</option><option value="max_ca">Maximiser le CA</option></select></div>
    <div class="field"><label>Niveau de prudence</label><select id="pv6Safety"><option value="0.72">Équilibré · objectif ≈ 72 %</option><option value="0.85">Prudent · objectif ≈ 85 %</option><option value="0.60">Plus agressif · objectif ≈ 60 %</option></select></div>
    <button id="pv6Generate" class="primary">Générer le meilleur plan</button><div id="pv6Result" style="margin-top:12px"></div><button id="pv6Close" class="secondary" style="margin-top:10px">Fermer</button>`);
  document.getElementById("pv6Close").onclick=P.close;
  document.getElementById("pv6All").onclick=()=>document.querySelectorAll("[data-av-kind]").forEach(x=>x.checked=true);
  document.getElementById("pv6None").onclick=()=>document.querySelectorAll("[data-av-kind]").forEach(x=>x.checked=false);
  document.getElementById("pv6Generate").onclick=()=>P.generate(dates);
};
P.selectedAvailability=dates=>{
  const byDay=dates.map(()=>({mid:false,eve:false}));document.querySelectorAll("[data-av-kind]").forEach(x=>{if(x.checked)byDay[Number(x.dataset.avDay)][x.dataset.avKind]=true;});return byDay;
};
P.generate=async dates=>{
  const btn=document.getElementById("pv6Generate"),out=document.getElementById("pv6Result");btn.disabled=true;btn.textContent="Calcul du meilleur plan…";out.innerHTML='<div class="subtle-card muted">Analyse des créneaux comparables et de la météo disponible…</div>';
  const availability=P.selectedAvailability(dates);let candidates=[];
  availability.forEach((a,i)=>{if(a.mid||a.eve)candidates.push(...DATA.availabilityCandidates([dates[i]],{midday:a.mid,evening:a.eve}));});
  if(!candidates.length){out.innerHTML='<div class="subtle-card danger">Sélectionne au moins une disponibilité.</div>';btn.disabled=false;btn.textContent="Générer le meilleur plan";return;}
  candidates=await DATA.attachForecastWeather(candidates);const state=DATA.load(),ctx=DATA.buildContext(state),caGoal=Math.max(0,DF.n(document.getElementById("pv6Ca").value)),savingsGoal=Math.max(0,DF.n(document.getElementById("pv6Savings").value)),targetProbability=DF.n(document.getElementById("pv6Safety").value)||.72;
  const opts=state.weatherMeta?.modelEnabled&&globalThis.DriveFlowV6Weather?{weatherSimilarity:globalThis.DriveFlowV6Weather.similarity}:{};
  const plan=INT.planWeek({sessions:DATA.analyticsSessions(state,ctx),candidates,financialContext:state.settings,caGoal,savingsGoal,priority:document.getElementById("pv6Priority").value,targetProbability,simulationRuns:600,opts});
  out.innerHTML=P.result(plan);btn.disabled=false;btn.textContent="Recalculer";
  if(plan.selected?.length){const save=document.createElement("button");save.className="secondary";save.style.marginTop="9px";save.textContent="Enregistrer ce plan";save.onclick=()=>P.save(plan,dates[0]);out.appendChild(save);}
};
P.result=plan=>{
  if(!plan.selected?.length)return'<div class="subtle-card muted">Aucun plan suffisamment exploitable avec ces disponibilités.</div>';
  const targetHit=plan.probabilityTargetReached?'<span class="badge high">Objectif de prudence atteint</span>':'<span class="badge medium">Plan le plus proche disponible</span>';
  return `<section class="card"><div class="row"><span class="label">Meilleur plan</span>${targetHit}</div><div class="hero-grid" style="margin-top:12px"><div><strong class="value small">${P.hours(plan.totalHours)}</strong><div class="tiny">Temps prévu · ${plan.sessionsCount} session${plan.sessionsCount>1?"s":""}</div></div><div><strong class="value small green">≈ ${P.euro(plan.expectedCa)}</strong><div class="tiny">CA attendu</div></div></div><div class="divider"></div><div class="breakdown"><div class="line"><span>Net attendu</span><strong>${P.euro(plan.expectedNet)}</strong></div><div class="line"><span>Épargne visée</span><strong class="purple">${P.euro(plan.expectedSavings)}</strong></div><div class="line"><span>Probabilité objectif CA</span><strong>${plan.caGoalProbability==null?"—":Math.round(plan.caGoalProbability*100)+" %"}</strong></div><div class="line"><span>Probabilité objectif épargne</span><strong>${plan.savingsGoalProbability==null?"—":Math.round(plan.savingsGoalProbability*100)+" %"}</strong></div><div class="line"><span>Atteindre les deux</span><strong class="purple">${plan.jointGoalProbability==null?"—":Math.round(plan.jointGoalProbability*100)+" %"}</strong></div></div>${plan.caRange?`<div class="tiny" style="margin-top:9px">Zone habituelle CA : ${P.euro(plan.caRange.low)} – ${P.euro(plan.caRange.high)}</div>`:""}</section><div class="plan-list">${plan.selected.map(c=>`<article class="plan-row"><div class="top"><strong>${P.day(c.date)} · ${P.clock(c.startHour)}–${P.clock(c.startHour+c.hours)}</strong><strong class="green">≈ ${P.euro(c.forecast.expectedCa)}</strong></div><div class="meta"><span>${P.hours(c.hours)}</span><span>Confiance ${P.conf(c.forecast.confidence)}</span><span>Base ${c.forecast.analysisWindowLabel||"historique pondéré"}</span></div></article>`).join("")}</div><div class="tiny" style="margin-top:9px">${plan.simulationRuns||0} simulations historiques pondérées. Une prévision reste une estimation, pas une garantie.</div>`;
};
P.save=(plan,date)=>{const state=DATA.load(),entry={...plan,weekKey:DF.isoWeekKey(date),createdAt:new Date().toISOString(),selected:plan.selected.map(c=>({id:c.id,date:c.date,startHour:c.startHour,hours:c.hours,forecast:c.forecast}))};state.weeklyPlans=(state.weeklyPlans||[]).filter(x=>x.weekKey!==entry.weekKey);state.weeklyPlans.push(entry);DATA.save(state);P.close();location.reload();};

// Capture before the original V6 dev handler so this richer per-day planner is
// the single planner experience.
document.addEventListener("click",e=>{const b=e.target.closest?.("#openPlanner");if(!b)return;e.preventDefault();e.stopImmediatePropagation();P.open();},true);
P.ensure();globalThis.DriveFlowV6PlannerUI=P;
})();