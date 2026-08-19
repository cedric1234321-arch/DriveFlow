(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data,INT=globalThis.DriveFlowV6Intelligence,DF=globalThis.DriveFlowV6Core;
if(!DATA||!INT||!DF)return;
const P={};
P.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
P.hours=h=>{const m=Math.round(DF.n(h)*60),hh=Math.floor(m/60),mm=m%60;return mm?`${hh}h${String(mm).padStart(2,"0")}`:`${hh}h`;};
P.clock=h=>{let hh=Math.floor(h)%24,mm=Math.round((h-Math.floor(h))*60);if(mm===60){hh=(hh+1)%24;mm=0;}if(hh<0)hh+=24;return`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;};
P.day=date=>new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"}).format(DATA.parseDate(date));
P.conf=c=>({high:"Élevée",medium:"Moyenne",low:"Faible",insufficient:"Insuffisante"}[c]||"—");
P.ensure=()=>{if(document.getElementById("v6PlannerBackdrop"))return;const b=document.createElement("div");b.id="v6PlannerBackdrop";b.className="sheet-backdrop";b.hidden=true;const s=document.createElement("section");s.id="v6PlannerSheet";s.className="sheet";s.hidden=true;s.innerHTML='<div class="sheet-handle"></div><div id="v6PlannerContent"></div>';b.onclick=P.close;document.body.append(b,s);};
P.openHtml=html=>{P.ensure();document.getElementById("v6PlannerContent").innerHTML=html;document.getElementById("v6PlannerBackdrop").hidden=false;document.getElementById("v6PlannerSheet").hidden=false;};
P.close=()=>{const b=document.getElementById("v6PlannerBackdrop"),s=document.getElementById("v6PlannerSheet");if(b)b.hidden=true;if(s)s.hidden=true;};
P.dates=()=>DATA.nextWeekDates(DATA.businessToday());
P.rangeSeq=0;
P.rangeHtml=(dayIndex,start="12:00",end="14:30")=>{
  const id=++P.rangeSeq;
  return `<div class="planner-range" data-range-id="${id}" style="display:grid;grid-template-columns:1fr auto 1fr auto;gap:7px;align-items:center;margin-top:8px">
    <input type="time" data-av-start="${dayIndex}" value="${start}" aria-label="Début du créneau">
    <span class="tiny">→</span>
    <input type="time" data-av-end="${dayIndex}" value="${end}" aria-label="Fin du créneau">
    <button type="button" class="link-button" data-remove-range="${id}" aria-label="Supprimer ce créneau">×</button>
  </div>`;
};
P.dayHtml=(date,i)=>`<section class="subtle-card planner-day" data-planner-day="${i}" style="margin-bottom:9px">
  <div class="row">
    <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-av-day="${i}" checked><strong>${P.day(date)}</strong></label>
    <button type="button" class="link-button" data-add-range="${i}">+ créneau</button>
  </div>
  <div data-ranges-for="${i}">
    ${P.rangeHtml(i,"11:30","14:30")}
    ${P.rangeHtml(i,"17:30","23:30")}
  </div>
</section>`;
P.syncDayDisabled=i=>{
  const on=document.querySelector(`[data-av-day="${i}"]`)?.checked!==false;
  document.querySelectorAll(`[data-av-start="${i}"],[data-av-end="${i}"]`).forEach(x=>x.disabled=!on);
  const add=document.querySelector(`[data-add-range="${i}"]`);if(add)add.disabled=!on;
};
P.bindAvailability=dates=>{
  document.querySelectorAll("[data-av-day]").forEach(x=>x.onchange=()=>P.syncDayDisabled(Number(x.dataset.avDay)));
  document.querySelectorAll("[data-add-range]").forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.addRange),box=document.querySelector(`[data-ranges-for="${i}"]`);if(!box)return;
    box.insertAdjacentHTML("beforeend",P.rangeHtml(i,"18:00","21:00"));P.bindRangeRemovers();
  });
  P.bindRangeRemovers();
  document.getElementById("pv6All").onclick=()=>document.querySelectorAll("[data-av-day]").forEach(x=>{x.checked=true;P.syncDayDisabled(Number(x.dataset.avDay));});
  document.getElementById("pv6None").onclick=()=>document.querySelectorAll("[data-av-day]").forEach(x=>{x.checked=false;P.syncDayDisabled(Number(x.dataset.avDay));});
  document.getElementById("pv6Preset").onclick=()=>{
    dates.forEach((_,i)=>{
      const day=document.querySelector(`[data-av-day="${i}"]`);if(day)day.checked=true;
      const box=document.querySelector(`[data-ranges-for="${i}"]`);if(box)box.innerHTML=P.rangeHtml(i,"11:30","14:30")+P.rangeHtml(i,"17:30","23:30");
      P.syncDayDisabled(i);
    });
    P.bindRangeRemovers();
  };
};
P.bindRangeRemovers=()=>document.querySelectorAll("[data-remove-range]").forEach(b=>b.onclick=()=>document.querySelector(`[data-range-id="${b.dataset.removeRange}"]`)?.remove());
P.open=()=>{
  const dates=P.dates();P.rangeSeq=0;
  P.openHtml(`<h2>Planifier ma semaine</h2><div class="sheet-sub">${P.day(dates[0])} → ${P.day(dates[6])}. Choisis précisément les jours et heures où tu peux travailler : DriveFlow optimise uniquement à l’intérieur de ces disponibilités.</div>
    <div class="inline-fields"><div class="field"><label>CA à atteindre</label><input id="pv6Ca" type="number" min="0" step="10" value="300"></div><div class="field"><label>Épargne nette à atteindre</label><input id="pv6Savings" type="number" min="0" step="10" value="150"></div></div>
    <div class="section-title" style="margin-top:8px"><h2>Mes disponibilités</h2><div class="tiny"><button id="pv6Preset" class="link-button">Midi + soir</button> · <button id="pv6All" class="link-button">Tous les jours</button> · <button id="pv6None" class="link-button">Aucun</button></div></div>
    <div class="tiny" style="margin:-3px 0 10px">Les horaires sont entièrement modifiables. Tu peux ajouter plusieurs créneaux le même jour, par exemple 11:45–14:00 puis 18:30–22:15.</div>
    <div id="pv6Availability">${dates.map(P.dayHtml).join("")}</div>
    <div class="field"><label>Priorité</label><select id="pv6Priority"><option value="min_time">Travailler le moins de temps possible</option><option value="min_sessions">Faire le moins de sessions possible</option><option value="max_hourly">Maximiser le taux horaire</option><option value="max_ca">Maximiser le CA</option></select></div>
    <div class="field"><label>Niveau de prudence</label><select id="pv6Safety"><option value="0.72">Équilibré · objectif ≈ 72 %</option><option value="0.85">Prudent · objectif ≈ 85 %</option><option value="0.60">Plus agressif · objectif ≈ 60 %</option></select></div>
    <button id="pv6Generate" class="primary">Générer le meilleur plan</button><div id="pv6Result" style="margin-top:12px"></div><button id="pv6Close" class="secondary" style="margin-top:10px">Fermer</button>`);
  document.getElementById("pv6Close").onclick=P.close;P.bindAvailability(dates);
  document.getElementById("pv6Generate").onclick=()=>P.generate(dates);
};
P.timeHour=v=>{const m=String(v||"").match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])+Number(m[2])/60:null;};
P.selectedWindows=dates=>{
  const windows=[];const errors=[];
  dates.forEach((date,i)=>{
    if(!document.querySelector(`[data-av-day="${i}"]`)?.checked)return;
    const box=document.querySelector(`[data-ranges-for="${i}"]`);if(!box)return;
    const starts=[...box.querySelectorAll(`[data-av-start="${i}"]`)];const ends=[...box.querySelectorAll(`[data-av-end="${i}"]`)];
    starts.forEach((s,k)=>{
      let a=P.timeHour(s.value),b=P.timeHour(ends[k]?.value);if(a==null||b==null){errors.push(`${P.day(date)} : horaire incomplet`);return;}
      if(b<=a)b+=24;
      if(b-a<1){errors.push(`${P.day(date)} : un créneau doit durer au moins 1 h`);return;}
      windows.push({date,dayIndex:i,startHour:a,endHour:b});
    });
  });
  return{windows,errors};
};
P.candidatesFromWindows=windows=>{
  const out=[],seen=new Set();
  for(const w of windows){
    const span=w.endHour-w.startHour;
    let durations=span<=2?[1,1.5,span]:[1.5,2.5,3.5,Math.min(4,span)];
    durations=[...new Set(durations.map(x=>Math.round(x*2)/2))].filter(x=>x>=1&&x<=span+0.001);
    for(let start=w.startHour;start+1<=w.endHour+0.001;start+=0.5){
      for(const hours of durations){if(start+hours>w.endHour+0.001)continue;const key=`${w.date}|${start}|${hours}`;if(seen.has(key))continue;seen.add(key);out.push(DATA.targetFrom(w.date,start,hours,`${w.date}-custom-${start}-${hours}`));}
    }
  }
  return out;
};
P.generate=async dates=>{
  const btn=document.getElementById("pv6Generate"),out=document.getElementById("pv6Result"),selection=P.selectedWindows(dates);
  if(selection.errors.length){out.innerHTML=`<div class="subtle-card danger">${selection.errors.join("<br>")}</div>`;return;}
  let candidates=P.candidatesFromWindows(selection.windows);
  if(!candidates.length){out.innerHTML='<div class="subtle-card danger">Sélectionne au moins un jour et un créneau horaire.</div>';return;}
  btn.disabled=true;btn.textContent="Calcul du meilleur plan…";out.innerHTML=`<div class="subtle-card muted">Analyse de ${candidates.length} possibilités selon ton historique et la météo disponible…</div>`;
  try{
    candidates=await DATA.attachForecastWeather(candidates);const state=DATA.load(),ctx=DATA.buildContext(state),caGoal=Math.max(0,DF.n(document.getElementById("pv6Ca").value)),savingsGoal=Math.max(0,DF.n(document.getElementById("pv6Savings").value)),targetProbability=DF.n(document.getElementById("pv6Safety").value)||.72;
    const opts=state.weatherMeta?.modelEnabled&&globalThis.DriveFlowV6Weather?{weatherSimilarity:globalThis.DriveFlowV6Weather.similarity}:{};
    const plan=INT.planWeek({sessions:DATA.analyticsSessions(state,ctx),candidates,financialContext:state.settings,caGoal,savingsGoal,priority:document.getElementById("pv6Priority").value,targetProbability,simulationRuns:600,opts});
    plan.availabilityWindows=selection.windows;out.innerHTML=P.result(plan);
    if(plan.selected?.length){const save=document.createElement("button");save.className="secondary";save.style.marginTop="9px";save.textContent="Enregistrer ce plan";save.onclick=()=>P.save(plan,dates[0]);out.appendChild(save);}
  }catch(e){out.innerHTML=`<div class="subtle-card danger">${String(e?.message||"Calcul impossible.")}</div>`;}
  finally{btn.disabled=false;btn.textContent="Recalculer";}
};
P.result=plan=>{
  if(!plan.selected?.length)return'<div class="subtle-card muted">Aucun plan suffisamment exploitable avec ces disponibilités.</div>';
  const targetHit=plan.probabilityTargetReached?'<span class="badge high">Objectif de prudence atteint</span>':'<span class="badge medium">Plan le plus proche disponible</span>';
  return `<section class="card"><div class="row"><span class="label">Meilleur plan</span>${targetHit}</div><div class="hero-grid" style="margin-top:12px"><div><strong class="value small">${P.hours(plan.totalHours)}</strong><div class="tiny">Temps prévu · ${plan.sessionsCount} session${plan.sessionsCount>1?"s":""}</div></div><div><strong class="value small green">≈ ${P.euro(plan.expectedCa)}</strong><div class="tiny">CA attendu</div></div></div><div class="divider"></div><div class="breakdown"><div class="line"><span>Net attendu</span><strong>${P.euro(plan.expectedNet)}</strong></div><div class="line"><span>Épargne visée</span><strong class="purple">${P.euro(plan.expectedSavings)}</strong></div><div class="line"><span>Probabilité objectif CA</span><strong>${plan.caGoalProbability==null?"—":Math.round(plan.caGoalProbability*100)+" %"}</strong></div><div class="line"><span>Probabilité objectif épargne</span><strong>${plan.savingsGoalProbability==null?"—":Math.round(plan.savingsGoalProbability*100)+" %"}</strong></div><div class="line"><span>Atteindre les deux</span><strong class="purple">${plan.jointGoalProbability==null?"—":Math.round(plan.jointGoalProbability*100)+" %"}</strong></div></div>${plan.caRange?`<div class="tiny" style="margin-top:9px">Zone habituelle CA : ${P.euro(plan.caRange.low)} – ${P.euro(plan.caRange.high)}</div>`:""}</section><div class="plan-list">${plan.selected.map(c=>`<article class="plan-row"><div class="top"><strong>${P.day(c.date)} · ${P.clock(c.startHour)}–${P.clock(c.startHour+c.hours)}</strong><strong class="green">≈ ${P.euro(c.forecast.expectedCa)}</strong></div><div class="meta"><span>${P.hours(c.hours)}</span><span>Confiance ${P.conf(c.forecast.confidence)}</span><span>Base ${c.forecast.analysisWindowLabel||"historique pondéré"}</span></div></article>`).join("")}</div><div class="tiny" style="margin-top:9px">${plan.simulationRuns||0} simulations historiques pondérées. Une prévision reste une estimation, pas une garantie.</div>`;
};
P.save=(plan,date)=>{const state=DATA.load(),entry={...plan,weekKey:DF.isoWeekKey(date),createdAt:new Date().toISOString(),selected:plan.selected.map(c=>({id:c.id,date:c.date,startHour:c.startHour,hours:c.hours,forecast:c.forecast}))};state.weeklyPlans=(state.weeklyPlans||[]).filter(x=>x.weekKey!==entry.weekKey);state.weeklyPlans.push(entry);DATA.save(state);P.close();location.reload();};

// Capture before the original V6 handler so the custom per-day planner is the
// single planner experience.
document.addEventListener("click",e=>{const b=e.target.closest?.("#openPlanner");if(!b)return;e.preventDefault();e.stopImmediatePropagation();P.open();},true);
P.ensure();globalThis.DriveFlowV6PlannerUI=P;
})();