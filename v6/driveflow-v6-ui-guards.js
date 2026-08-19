(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data, DF=globalThis.DriveFlowV6Core, INT=globalThis.DriveFlowV6Intelligence;
if(!DATA||!DF||!INT)return;

const UI={};
UI.escape=s=>String(s??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
UI.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
UI.pct=v=>v==null?"—":`${Math.round(DF.n(v)*100)} %`;
UI.ensureModal=()=>{
  if(document.getElementById("v6GuardBackdrop"))return;
  const b=document.createElement("div");b.id="v6GuardBackdrop";b.className="sheet-backdrop";b.hidden=true;
  const s=document.createElement("section");s.id="v6GuardSheet";s.className="sheet";s.hidden=true;s.innerHTML='<div class="sheet-handle"></div><div id="v6GuardContent"></div>';
  b.onclick=UI.close;document.body.append(b,s);
};
UI.open=html=>{UI.ensureModal();document.getElementById("v6GuardContent").innerHTML=html;document.getElementById("v6GuardBackdrop").hidden=false;document.getElementById("v6GuardSheet").hidden=false;};
UI.close=()=>{const b=document.getElementById("v6GuardBackdrop"),s=document.getElementById("v6GuardSheet");if(b)b.hidden=true;if(s)s.hidden=true;};

// Keep a reference to the most recent planner result so the UI layer can show
// calibrated probabilities even though the original development renderer was
// created before Monte-Carlo plan calibration existed.
const originalPlanWeek=INT.planWeek.bind(INT);
INT.planWeek=args=>{const plan=originalPlanWeek(args);globalThis.DriveFlowV6LastPlan=plan;return plan;};

UI.enhancePlanner=()=>{
  const box=document.getElementById("planResult"),plan=globalThis.DriveFlowV6LastPlan;if(!box||!plan?.selected?.length)return;
  const old=[...box.querySelectorAll(".tiny")].find(x=>/probabilit.+ajout/i.test(x.textContent));if(old)old.remove();
  if(box.querySelector("#v6ProbabilityCard"))return;
  const card=document.createElement("div");card.id="v6ProbabilityCard";card.className="card";card.style.marginTop="10px";
  card.innerHTML=`<span class="label">Fiabilité du plan</span>
    <div class="breakdown" style="margin-top:10px">
      <div class="line"><span>Atteindre l’objectif CA</span><strong>${UI.pct(plan.caGoalProbability)}</strong></div>
      <div class="line"><span>Atteindre l’objectif d’épargne</span><strong>${UI.pct(plan.savingsGoalProbability)}</strong></div>
      <div class="line"><span>Atteindre les deux</span><strong class="purple">${UI.pct(plan.jointGoalProbability)}</strong></div>
    </div>
    ${plan.caRange?`<div class="tiny" style="margin-top:9px">Zone habituelle CA : ${UI.euro(plan.caRange.low)} – ${UI.euro(plan.caRange.high)} · médiane ${UI.euro(plan.caRange.median)}</div>`:""}
    ${plan.netRange?`<div class="tiny" style="margin-top:4px">Zone habituelle Net : ${UI.euro(plan.netRange.low)} – ${UI.euro(plan.netRange.high)}</div>`:""}
    <div class="tiny" style="margin-top:7px">${plan.simulationRuns||0} simulations historiques pondérées · objectif de prudence ${Math.round((plan.targetProbability||.72)*100)} %.</div>`;
  const keep=[...box.querySelectorAll("button")].find(b=>/Enregistrer ce plan/i.test(b.textContent));if(keep)box.insertBefore(card,keep);else box.appendChild(card);
};

UI.openUrssafActivation=toggle=>{
  const presets=DF.URSSAF_PRESETS,today=DATA.businessToday();
  UI.open(`<h2>Activer l’URSSAF</h2><div class="sheet-sub">Choisis ton taux et sa date de début. DriveFlow ne l’appliquera pas aux périodes antérieures.</div>
    <div class="field"><label>Taux</label><select id="guardUrRate">${Object.values(presets).map(p=>`<option value="${p.rate}">${UI.escape(p.label)} · ${p.rate.toFixed(1)} %</option>`).join("")}<option value="custom">Personnalisé</option></select></div>
    <div class="field" id="guardUrCustom" hidden><label>Taux personnalisé (%)</label><input id="guardUrCustomValue" type="number" min="0" step="0.1" value="21.2"></div>
    <div class="field"><label>Applicable à partir du</label><input id="guardUrDate" type="date" value="${today}"></div>
    <div class="tiny" style="margin-bottom:12px">Les cotisations sont calculées sur le CA brut. Le carburant ne réduit pas l’assiette.</div>
    <button id="guardUrSave" class="primary">Activer</button><button id="guardUrCancel" class="secondary" style="margin-top:9px">Annuler</button>`);
  const select=document.getElementById("guardUrRate");select.value=String(DF.URSSAF_PRESETS.standard_bic_service.rate);select.onchange=()=>document.getElementById("guardUrCustom").hidden=select.value!=="custom";
  document.getElementById("guardUrCancel").onclick=()=>{toggle.checked=false;UI.close();};
  document.getElementById("guardUrSave").onclick=()=>{
    const state=DATA.load(),date=document.getElementById("guardUrDate").value,rate=select.value==="custom"?DF.n(document.getElementById("guardUrCustomValue").value):DF.n(select.value);
    if(!date||rate<0)return;
    state.settings.urssafEnabled=true;state.settings.urssafRatePct=rate;state.settings.urssafRateHistory ||= [];
    state.settings.urssafRateHistory.push({effectiveFrom:date,ratePct:rate,source:"activation-v6"});
    DATA.save(state);UI.close();location.reload();
  };
};

// Capture before the development app's onchange property so activation cannot
// accidentally apply today's rate to the full historical dataset.
document.addEventListener("change",e=>{
  if(e.target?.id!=="urssafToggle")return;
  if(e.target.checked){e.preventDefault();e.stopImmediatePropagation();e.target.checked=false;UI.openUrssafActivation(e.target);}
},true);

const observer=new MutationObserver(()=>{clearTimeout(UI._t);UI._t=setTimeout(UI.enhancePlanner,20);});observer.observe(document.documentElement,{subtree:true,childList:true});
UI.ensureModal();
globalThis.DriveFlowV6UIGuards=UI;
})();