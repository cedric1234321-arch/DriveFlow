(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data,INT=globalThis.DriveFlowV6Intelligence,DF=globalThis.DriveFlowV6Core;
const W=globalThis.DriveFlowV6WriteUI,RULES=globalThis.DriveFlowV6ReviewRules,LR=globalThis.DriveFlowV6LiveReview;
if(!DATA||!INT||!DF||!RULES||!LR)return;
const B={};
B.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;

B.installStyles=()=>{
  if(document.getElementById("driveflowBuild21Styles"))return;
  const s=document.createElement("style");s.id="driveflowBuild21Styles";s.textContent=`
    /* Build 20 grouped the bars correctly but the original bar colours were scoped
       to .mini-chart, so the replacement chart became visually transparent. */
    .review-bar-pair .bar{display:block;width:min(12px,42%);flex:none;min-height:2px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#28df7e,#147f4d)}
    .review-bar-pair .bar.net{background:linear-gradient(180deg,#4db3ff,#1d71bb)}
    .planner-range.review-required{outline:1px solid rgba(181,108,255,.5);border-radius:11px;padding:7px}
    .review-required-line{display:flex;align-items:center;gap:6px;margin-top:7px;color:var(--muted);font-size:11px}
    .review-planner-tools{margin:0 0 10px}.review-planner-tools .inline-fields{margin-top:9px}
  `;document.head.appendChild(s);
};

/* New heatmap business thresholds: red > 13, orange 12–13, green 10.5–12. */
B.patchHeatmap=()=>{
  LR.heatmapHtml=(dates,scored)=>{
    const hours=[12,18,19,20],map=new Map(scored.map(c=>[`${c.date}|${c.startHour}`,c]));LR.optHeat=map;
    const keep=hours.filter(h=>{
      const vals=dates.map(d=>map.get(`${d}|${h}`)?.forecast?.expectedHourlyCa).filter(Number.isFinite);
      const strong=vals.some(v=>v>=12),green=vals.filter(v=>v>=10.5&&v<12).length;
      return strong||green>=3;
    });
    if(!keep.length)return'<div class="tiny">Aucun créneau suffisamment intéressant à afficher cette semaine.</div>';
    let html=`<div class="review-heatmap" style="grid-template-columns:42px repeat(${keep.length},1fr)"><div></div>${keep.map(h=>`<div class="h">${h}h</div>`).join("")}`;
    for(const date of dates){
      html+=`<div class="d">${new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(DATA.parseDate(date))}</div>`;
      for(const h of keep){
        const c=map.get(`${date}|${h}`),v=c?.forecast?.expectedHourlyCa;
        if(!Number.isFinite(v)){html+='<div class="cell review-heat-white">—</div>';continue;}
        const tier=RULES.heatTier(v),key=`${date}|${h}`;
        html+=tier==="white"?`<div class="cell review-heat-white">${v.toFixed(1)}</div>`:`<button class="cell review-heat-${tier}" data-review-heat="${key}">${v.toFixed(1)}</button>`;
      }
    }
    return html+'</div><div class="review-heat-legend"><span>Rouge &gt; 13</span><span>Orange 12–13</span><span>Vert 10,5–12</span><span>Blanc &lt; 10,5</span></div>';
  };
  globalThis.DriveFlowV6UXPolish && (globalThis.DriveFlowV6UXPolish.heatTier=RULES.heatTier);
};

B.patchSettings=()=>{
  if(LR.__build21Settings)return;LR.__build21Settings=true;
  const previous=LR.enhanceSettings.bind(LR);
  LR.enhanceSettings=()=>{
    previous();
    const view=document.getElementById("settingsView");if(!view)return;
    const weather=[...view.querySelectorAll(".card")].find(c=>/Météo historique Montpellier/.test(c.textContent||""));if(weather)weather.hidden=true;
    const oldExport=[...view.querySelectorAll(".card")].find(c=>c.querySelector("#exportV6"));if(oldExport)oldExport.hidden=true;
    const hub=view.querySelector("#v6DataManagement");
    if(hub&&!hub.querySelector("#reviewDataHub")){
      hub.dataset.reviewCompact="21";hub.className="card settings-list";
      hub.innerHTML=`<button id="reviewDataHub" class="settings-row review-settings-button" type="button"><div style="text-align:left"><strong>Données et activité</strong><div class="desc">Imports, sauvegardes et sessions</div></div><span class="link-button">Ouvrir ›</span></button>`;
    }
    const open=view.querySelector("#reviewDataHub");if(open)open.onclick=LR.openDataHub;
    const footer=[...view.querySelectorAll(".card.row")].find(c=>/DriveFlow/.test(c.textContent||""));
    if(footer){const tiny=footer.querySelector(".tiny"),badge=footer.querySelector(".dev-badge");if(tiny)tiny.textContent="V6 Preview · Build 21";if(badge)badge.textContent="RC 21";}
    const top=document.getElementById("devBadge");if(top)top.textContent="RC 21";
  };
};

B.patchSessionManager=()=>{
  if(!W||W.__build21Manager)return;W.__build21Manager=true;
  if(typeof W.managerHtml==="function"){
    const previous=W.managerHtml.bind(W);
    W.managerHtml=(date,state)=>previous(date,state).replace("<h2>Gérer les sessions</h2>","<h2>Créer / gérer les sessions</h2>");
  }
};

B.patchPlanner=()=>{
  const P=globalThis.DriveFlowV6PlannerUI;if(!P||P.__build21Planner)return;P.__build21Planner=true;
  P.rangeHtml=(dayIndex,start="12:00",end="14:30")=>{
    const id=++P.rangeSeq;
    return `<div class="planner-range" data-range-id="${id}" style="margin-top:8px"><div style="display:grid;grid-template-columns:1fr auto 1fr auto;gap:7px;align-items:center"><input type="time" data-av-start="${dayIndex}" value="${start}" aria-label="Début du créneau"><span class="tiny">→</span><input type="time" data-av-end="${dayIndex}" value="${end}" aria-label="Fin du créneau"><button type="button" class="link-button" data-remove-range="${id}" aria-label="Supprimer ce créneau">×</button></div><label class="review-required-line"><input type="checkbox" data-required-range="${id}"> Je veux forcément travailler sur ce créneau</label></div>`;
  };
  P.selectedWindows=dates=>{
    const windows=[],errors=[];
    dates.forEach((date,i)=>{
      if(!document.querySelector(`[data-av-day="${i}"]`)?.checked)return;
      document.querySelectorAll(`[data-ranges-for="${i}"] .planner-range`).forEach(row=>{
        let a=P.timeHour(row.querySelector(`[data-av-start="${i}"]`)?.value),b=P.timeHour(row.querySelector(`[data-av-end="${i}"]`)?.value);
        if(a==null||b==null){errors.push(`${P.day(date)} : horaire incomplet`);return;}
        if(b<=a)b+=24;if(b-a<1){errors.push(`${P.day(date)} : un créneau doit durer au moins 1 h`);return;}
        const required=!!row.querySelector("[data-required-range]")?.checked;row.classList.toggle("review-required",required);
        windows.push({date,dayIndex:i,startHour:a,endHour:b,required});
      });
    });
    return{windows,errors};
  };
  const previousOpen=P.open.bind(P);
  P.open=()=>{previousOpen();B.decoratePlanner(P);};
  P.generate=dates=>B.generatePlan(P,dates);
};

B.readWeekType=P=>Array.from({length:7},(_,i)=>({
  enabled:document.querySelector(`[data-av-day="${i}"]`)?.checked!==false,
  ranges:[...document.querySelectorAll(`[data-ranges-for="${i}"] .planner-range`)].map(row=>({
    start:row.querySelector(`[data-av-start="${i}"]`)?.value||"",
    end:row.querySelector(`[data-av-end="${i}"]`)?.value||"",
    required:!!row.querySelector("[data-required-range]")?.checked
  }))
}));
B.loadWeekType=(P,preset)=>{
  (preset||[]).forEach((day,i)=>{
    const toggle=document.querySelector(`[data-av-day="${i}"]`),box=document.querySelector(`[data-ranges-for="${i}"]`);if(toggle)toggle.checked=day.enabled!==false;
    if(box){box.innerHTML=(day.ranges||[]).map(r=>P.rangeHtml(i,r.start||"12:00",r.end||"14:30")).join("");[...box.querySelectorAll(".planner-range")].forEach((row,k)=>{const req=row.querySelector("[data-required-range]");if(req&&day.ranges?.[k]?.required){req.checked=true;row.classList.add("review-required");}});}
    P.syncDayDisabled(i);
  });
  P.bindRangeRemovers();
};
B.decoratePlanner=P=>{
  const content=document.getElementById("v6PlannerContent");if(!content||content.querySelector("#build21WeekType"))return;
  const title=[...content.querySelectorAll(".section-title")].find(x=>x.querySelector("h2")?.textContent.trim()==="Mes disponibilités");if(!title)return;
  const box=document.createElement("section");box.id="build21WeekType";box.className="subtle-card review-planner-tools";
  box.innerHTML=`<strong>Ma semaine type</strong><div class="tiny" style="margin-top:4px">Enregistre tes disponibilités habituelles puis recharge-les en un clic.</div><div class="inline-fields"><button id="build21LoadWeek" class="secondary">Charger</button><button id="build21SaveWeek" class="secondary">Enregistrer</button></div><div class="tiny" style="margin-top:8px">Pour un créneau imposé, coche « Je veux forcément travailler ». DriveFlow le conserve et complète autour avec les meilleurs créneaux disponibles.</div>`;
  title.after(box);
  document.getElementById("build21SaveWeek").onclick=()=>{const state=DATA.load();state.settings.plannerAvailabilityPreset=B.readWeekType(P);DATA.save(state);W?.toast?.("Semaine type enregistrée");};
  document.getElementById("build21LoadWeek").onclick=()=>{const preset=DATA.load().settings?.plannerAvailabilityPreset;if(!preset){W?.toast?.("Aucune semaine type enregistrée");return;}B.loadWeekType(P,preset);};
};
B.overlap=(a,b)=>a.date===b.date&&a.startHour<b.endHour&&b.startHour<a.endHour;
B.generatePlan=async(P,dates)=>{
  const btn=document.getElementById("pv6Generate"),out=document.getElementById("pv6Result"),selection=P.selectedWindows(dates);if(!btn||!out)return;
  if(selection.errors.length){out.innerHTML=`<div class="subtle-card danger">${selection.errors.join("<br>")}</div>`;return;}
  if(!selection.windows.length){out.innerHTML='<div class="subtle-card danger">Sélectionne au moins un jour et un créneau.</div>';return;}
  const requiredWindows=selection.windows.filter(x=>x.required);
  for(let i=0;i<requiredWindows.length;i++)for(let j=i+1;j<requiredWindows.length;j++)if(B.overlap(requiredWindows[i],requiredWindows[j])){out.innerHTML='<div class="subtle-card danger">Deux créneaux obligatoires se chevauchent.</div>';return;}
  btn.disabled=true;btn.textContent="Calcul du meilleur plan…";out.innerHTML='<div class="subtle-card muted">DriveFlow conserve les créneaux obligatoires puis complète avec les meilleures disponibilités…</div>';
  try{
    const state=DATA.load(),ctx=DATA.buildContext(state),sessions=DATA.analyticsSessions(state,ctx),caGoal=Math.max(0,DF.n(document.getElementById("pv6Ca").value)),savingsGoal=Math.max(0,DF.n(document.getElementById("pv6Savings").value)),targetProbability=DF.n(document.getElementById("pv6Safety").value)||.72,priority=document.getElementById("pv6Priority").value,opts=state.weatherMeta?.modelEnabled&&globalThis.DriveFlowV6Weather?.similarity?{weatherSimilarity:globalThis.DriveFlowV6Weather.similarity}:{};
    const required=requiredWindows.map((w,i)=>DATA.targetFrom(w.date,w.startHour,w.endHour-w.startHour,`${w.date}-required-${i}`));
    let candidates=P.candidatesFromWindows(selection.windows).filter(c=>!required.some(r=>INT.candidatesOverlap(c,r))),all=await DATA.attachForecastWeather([...required,...candidates]);
    const requiredAttached=all.slice(0,required.length),rest=all.slice(required.length),fixed=requiredAttached.map(c=>({...c,required:true,forecast:INT.forecastSession(sessions,c,state.settings,opts)}));
    const fixedCa=fixed.reduce((a,c)=>a+DF.n(c.forecast.expectedCa),0),fixedNet=fixed.reduce((a,c)=>a+DF.n(c.forecast.netFinal),0),remainingCa=Math.max(0,caGoal-fixedCa),remainingSavings=Math.max(0,savingsGoal-fixedNet);
    let extra={selected:[]};
    if(priority==="max_ca"||remainingCa>0||remainingSavings>0)extra=INT.planWeek({sessions,candidates:rest,financialContext:state.settings,caGoal:remainingCa,savingsGoal:remainingSavings,priority,targetProbability,simulationRuns:600,opts});
    const selected=[...fixed,...extra.selected].sort((a,b)=>a.date.localeCompare(b.date)||a.startHour-b.startHour),expectedCa=selected.reduce((a,c)=>a+DF.n(c.forecast.expectedCa),0),expectedNet=selected.reduce((a,c)=>a+DF.n(c.forecast.netFinal),0),simulation=INT.simulatePlan({sessions,selected,financialContext:state.settings,caGoal,savingsGoal,opts,runs:600}),order={insufficient:0,low:1,medium:2,high:3},confidence=selected.map(c=>c.forecast.confidence||"insufficient").sort((a,b)=>order[a]-order[b])[0]||"insufficient";
    const plan={selected,expectedCa,expectedNet,expectedSavings:Math.min(Math.max(0,expectedNet),savingsGoal),totalHours:selected.reduce((a,c)=>a+DF.n(c.hours),0),sessionsCount:selected.length,caGoal,savingsGoal,targetProbability,caGoalProbability:simulation.caGoalProbability,savingsGoalProbability:simulation.savingsGoalProbability,jointGoalProbability:simulation.jointGoalProbability,caRange:simulation.runs?{low:simulation.caLow,median:simulation.caMedian,high:simulation.caHigh}:null,netRange:simulation.runs?{low:simulation.netLow,median:simulation.netMedian,high:simulation.netHigh}:null,simulationRuns:simulation.runs,probabilityTargetReached:simulation.caGoalProbability>=targetProbability&&simulation.savingsGoalProbability>=targetProbability,confidence,availabilityWindows:selection.windows};
    out.innerHTML=B.planHtml(P,plan);const save=document.createElement("button");save.className="secondary";save.style.marginTop="9px";save.textContent="Enregistrer ce plan";save.onclick=()=>B.savePlan(P,plan,dates[0]);out.appendChild(save);
  }catch(e){out.innerHTML=`<div class="subtle-card danger">${String(e?.message||"Calcul impossible.")}</div>`;}finally{btn.disabled=false;btn.textContent="Recalculer";}
};
B.planHtml=(P,p)=>{
  if(!p.selected?.length)return'<div class="subtle-card muted">Aucun plan exploitable avec ces disponibilités.</div>';
  return `<section class="card"><div class="row"><span class="label">Plan proposé</span><span class="badge ${p.probabilityTargetReached?"high":"medium"}">${p.probabilityTargetReached?"Prudence atteinte":"Meilleur compromis"}</span></div><div class="hero-grid" style="margin-top:12px"><div><strong class="value small">${P.hours(p.totalHours)}</strong><div class="tiny">Temps prévu</div></div><div><strong class="value small green">≈ ${P.euro(p.expectedCa)}</strong><div class="tiny">CA attendu</div></div></div><div class="divider"></div><div class="breakdown"><div class="line"><span>Net attendu</span><strong>${P.euro(p.expectedNet)}</strong></div><div class="line"><span>Probabilité objectif CA</span><strong>${p.caGoalProbability==null?"—":Math.round(p.caGoalProbability*100)+" %"}</strong></div><div class="line"><span>Atteindre les deux objectifs</span><strong>${p.jointGoalProbability==null?"—":Math.round(p.jointGoalProbability*100)+" %"}</strong></div></div></section><div class="plan-list">${p.selected.map(c=>`<article class="plan-row"><div class="top"><strong>${P.day(c.date)} · ${P.clock(c.startHour)}–${P.clock(c.startHour+c.hours)}</strong><strong class="green">≈ ${P.euro(c.forecast.expectedCa)}</strong></div><div class="meta"><span>${P.hours(c.hours)}</span>${c.required?'<span class="purple">Obligatoire</span>':""}<span>Confiance ${P.conf(c.forecast.confidence)}</span></div></article>`).join("")}</div><div class="tiny" style="margin-top:9px">Les créneaux obligatoires sont toujours conservés. Les autres sont choisis par DriveFlow parmi tes disponibilités.</div>`;
};
B.savePlan=(P,plan,date)=>{const state=DATA.load(),entry={...plan,weekKey:DF.isoWeekKey(date),createdAt:new Date().toISOString(),selected:plan.selected.map(c=>({id:c.id,date:c.date,startHour:c.startHour,hours:c.hours,required:!!c.required,forecast:c.forecast}))};state.weeklyPlans=(state.weeklyPlans||[]).filter(x=>x.weekKey!==entry.weekKey);state.weeklyPlans.push(entry);DATA.save(state);P.close();location.reload();};

B.applyLabels=()=>{
  const badge=document.getElementById("devBadge");if(badge)badge.textContent="RC 21";
  const splash=document.querySelector("#splash small");if(splash)splash.textContent="V6 Preview · Build 21";
  const view=document.getElementById("settingsView");if(view){const footer=[...view.querySelectorAll(".card.row")].find(c=>/DriveFlow/.test(c.textContent||""));if(footer){const tiny=footer.querySelector(".tiny"),b=footer.querySelector(".dev-badge");if(tiny)tiny.textContent="V6 Preview · Build 21";if(b)b.textContent="RC 21";}}
};
B.enhance=()=>{LR.enhanceSettings?.();B.applyLabels();};
B.installStyles();B.patchHeatmap();B.patchSettings();B.patchSessionManager();B.patchPlanner();B.enhance();
const obs=new MutationObserver(()=>{clearTimeout(B._t);B._t=setTimeout(B.enhance,155);});obs.observe(document.documentElement,{subtree:true,childList:true});
globalThis.DriveFlowV6Build21=B;
})();
