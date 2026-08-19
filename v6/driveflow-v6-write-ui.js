(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data, IO=globalThis.DriveFlowV6IO, DF=globalThis.DriveFlowV6Core;
if(!DATA||!IO||!DF)return;

const W={};
W.uid=(p="session")=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
W.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
W.escape=s=>String(s??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
W.state=()=>DATA.load();
W.persist=state=>{DATA.save(state);};
W.reload=()=>location.reload();
W.toast=text=>{let t=document.getElementById("v6WriteToast");if(!t){t=document.createElement("div");t.id="v6WriteToast";t.className="toast";document.body.appendChild(t);}t.textContent=text;t.hidden=false;clearTimeout(W._toast);W._toast=setTimeout(()=>t.hidden=true,2200);};

W.ensureModal=()=>{
  if(document.getElementById("v6WriteBackdrop"))return;
  const backdrop=document.createElement("div");backdrop.id="v6WriteBackdrop";backdrop.className="sheet-backdrop";backdrop.hidden=true;
  const sheet=document.createElement("section");sheet.id="v6WriteSheet";sheet.className="sheet";sheet.hidden=true;sheet.innerHTML='<div class="sheet-handle"></div><div id="v6WriteContent"></div>';
  document.body.append(backdrop,sheet);backdrop.onclick=W.close;
};
W.open=html=>{W.ensureModal();document.getElementById("v6WriteContent").innerHTML=html;document.getElementById("v6WriteBackdrop").hidden=false;document.getElementById("v6WriteSheet").hidden=false;};
W.close=()=>{const b=document.getElementById("v6WriteBackdrop"),s=document.getElementById("v6WriteSheet");if(b)b.hidden=true;if(s)s.hidden=true;};

W.fieldValue=id=>document.getElementById(id)?.value??"";
W.numberOrNull=id=>W.fieldValue(id)===""?null:DF.n(W.fieldValue(id));
W.sessionFormHtml=(s={})=>`<h2>${s.id?"Modifier la session":"Nouvelle session"}</h2>
<div class="sheet-sub">Les horaires saisis ici sont considérés comme exacts. Garde au moins 30 minutes entre deux sessions.</div>
<div class="inline-fields"><div class="field"><label>Date</label><input id="wsDate" type="date" value="${W.escape(s.date||DATA.businessToday())}"></div><div class="field"><label>Type</label><select id="wsType"><option>Midi</option><option>Soir</option><option>Autre</option></select></div></div>
<div class="inline-fields"><div class="field"><label>Début</label><input id="wsStart" type="time" value="${W.escape(s.start||"")}"></div><div class="field"><label>Fin</label><input id="wsEnd" type="time" value="${W.escape(s.end||"")}"></div></div>
<div class="inline-fields"><div class="field"><label>Début pause</label><input id="wsPauseStart" type="time" value="${W.escape(s.pauseStart||"")}"></div><div class="field"><label>Fin pause</label><input id="wsPauseEnd" type="time" value="${W.escape(s.pauseEnd||"")}"></div></div>
${s.pauseMinutesTotal&&!s.pauseStart?`<div class="tiny" style="margin:-4px 0 12px">Pause historique actuelle : ${Math.round(DF.n(s.pauseMinutesTotal))} min. Elle est conservée tant que tu ne saisis pas une nouvelle plage.</div>`:""}
<div class="inline-fields"><div class="field"><label>Km départ</label><input id="wsOdoStart" type="number" step="0.1" value="${s.odoStart??""}"></div><div class="field"><label>Km arrivée</label><input id="wsOdoEnd" type="number" step="0.1" value="${s.odoEnd??""}"></div></div>
<div class="inline-fields"><div class="field"><label>Uber manuel (€)</label><input id="wsUber" type="number" min="0" step="0.01" value="${s.manualUber??0}"></div><div class="field"><label>Commandes Uber</label><input id="wsUberOrders" type="number" min="0" step="1" value="${s.manualUberOrders??0}"></div></div>
<div class="inline-fields"><div class="field"><label>Deliveroo manuel (€)</label><input id="wsDel" type="number" min="0" step="0.01" value="${s.manualDeliveroo??0}"></div><div class="field"><label>Commandes Deliveroo</label><input id="wsDelOrders" type="number" min="0" step="1" value="${s.manualDeliverooOrders??0}"></div></div>
<div class="field"><label>Note</label><input id="wsNote" type="text" value="${W.escape(s.note||"")}" placeholder="Optionnel"></div>
<div id="wsError" class="tiny danger" style="min-height:20px"></div>
<button id="wsSave" class="primary">Enregistrer</button>${s.id?'<button id="wsDelete" class="secondary danger" style="margin-top:9px">Supprimer la session</button>':''}<button id="wsCancel" class="secondary" style="margin-top:9px">Annuler</button>`;

W.openSessionEditor=(id=null,date=null)=>{
  const state=W.state(),prev=id?(state.sessions||[]).find(x=>x.id===id):null,s=prev||{date:date||DATA.businessToday(),type:"Soir"};
  W.open(W.sessionFormHtml(s));document.getElementById("wsType").value=s.type||"Autre";
  document.getElementById("wsCancel").onclick=W.close;
  document.getElementById("wsSave").onclick=()=>{
    const latest=W.state(),current=id?(latest.sessions||[]).find(x=>x.id===id):null;
    const base=current?{...current}:{id:W.uid("session")};
    const form={...base,date:W.fieldValue("wsDate"),type:W.fieldValue("wsType"),start:W.fieldValue("wsStart"),end:W.fieldValue("wsEnd"),pauseStart:W.fieldValue("wsPauseStart"),pauseEnd:W.fieldValue("wsPauseEnd"),odoStart:W.numberOrNull("wsOdoStart"),odoEnd:W.numberOrNull("wsOdoEnd"),manualUber:Math.max(0,DF.n(W.fieldValue("wsUber"))),manualUberOrders:Math.max(0,Math.round(DF.n(W.fieldValue("wsUberOrders")))),manualDeliveroo:Math.max(0,DF.n(W.fieldValue("wsDel"))),manualDeliverooOrders:Math.max(0,Math.round(DF.n(W.fieldValue("wsDelOrders")))),note:W.fieldValue("wsNote").trim()};
    if(current?.historyImported){
      form.manualEdited=true;
      const timeChanged=form.date!==current.date||form.start!==current.start||form.end!==current.end;
      if(timeChanged){form.historyStartTimestamp="";form.historyEndTimestamp="";form.historyStartMinute=null;form.historyEndMinute=null;}
      if(form.pauseStart&&form.pauseEnd)form.pauseMinutesTotal=null;else form.pauseMinutesTotal=current.pauseMinutesTotal;
      if(form.odoStart!==null&&form.odoEnd!==null){form.distanceKm=null;form.distanceSource="EXACT";form.confidence="Exact";}
    }else{
      form.historyImported=false;form.manualEdited=!!current?.manualEdited;
      if(form.pauseStart&&form.pauseEnd)form.pauseMinutesTotal=null;
      if(form.odoStart!==null&&form.odoEnd!==null){form.distanceKm=null;form.distanceSource="EXACT";}
      form.timeSource="Exact";
    }
    const err=IO.validateSession(form,latest.sessions||[],30);if(err){document.getElementById("wsError").textContent=err;return;}
    IO.upsertSession(latest,form);W.persist(latest);W.close();W.reload();
  };
  if(id)document.getElementById("wsDelete").onclick=()=>{if(!confirm("Supprimer cette session ? Les commandes importées et les pourboires restent conservés."))return;const latest=W.state();IO.deleteSession(latest,id);W.persist(latest);W.close();W.reload();};
};

W.managerHtml=(date,state)=>{const sessions=(state.sessions||[]).filter(s=>s.date===date).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));return `<h2>Gérer les sessions</h2><div class="sheet-sub">Créer ou corriger les horaires, pauses, kilomètres et montants manuels.</div><div class="field"><label>Date</label><input id="wmDate" type="date" value="${date}"></div><button id="wmAdd" class="primary">+ Nouvelle session</button><div class="session-list" style="margin-top:12px">${sessions.length?sessions.map(s=>`<button class="session-row" data-edit-session="${W.escape(s.id)}" style="text-align:left;width:100%"><div class="top"><div><strong>${W.escape(s.start||"—")} → ${W.escape(s.end||"—")}</strong><div class="meta"><span>${W.escape(s.type||"Session")}</span>${s.historyImported?'<span>Historique</span>':'<span>Manuel</span>'}</div></div><span>›</span></div></button>`).join(""):'<div class="subtle-card muted">Aucune session ce jour.</div>'}</div><button id="wmClose" class="secondary" style="margin-top:12px">Fermer</button>`;};
W.openManager=(date=DATA.businessToday())=>{const state=W.state();W.open(W.managerHtml(date,state));document.getElementById("wmDate").onchange=e=>W.openManager(e.target.value);document.getElementById("wmAdd").onclick=()=>W.openSessionEditor(null,date);document.getElementById("wmClose").onclick=W.close;document.querySelectorAll("[data-edit-session]").forEach(b=>b.onclick=()=>W.openSessionEditor(b.dataset.editSession));};

W.pickFile=(accept,handler)=>{const input=document.createElement("input");input.type="file";input.accept=accept;input.onchange=async()=>{const f=input.files?.[0];if(!f)return;try{await handler(f);}catch(e){alert(e.message||"Import impossible.");}};input.click();};
W.importUber=()=>W.pickFile(".csv,text/csv",async f=>{const state=W.state(),rows=IO.parseCSV(await f.text()),report=IO.importUberRows(state,rows);W.persist(state);alert(`Uber importé : ${report.groups} groupes, ${report.orders} commandes.\nPériode : ${report.minDate||"—"} → ${report.maxDate||"—"}`);W.reload();});
W.importDeliveroo=()=>W.pickFile(".csv,text/csv",async f=>{const state=W.state(),rows=IO.parseCSV(await f.text()),r=IO.importDeliverooRows(state,rows);W.persist(state);alert(`Deliveroo : ${r.added} nouvelles lignes, ${r.updated} mises à jour.`);W.reload();});
W.importHistory=()=>W.pickFile(".csv,text/csv",async f=>{const state=W.state(),rows=IO.parseCSV(await f.text()),r=IO.importHistoryRows(state,rows);W.persist(state);alert(`Historique : ${r.imported} ajoutées, ${r.updated} mises à jour, ${r.protectedEdits} corrections manuelles protégées.`);W.reload();});
W.restoreBackup=()=>W.pickFile(".json,application/json",async f=>{if(!confirm("Restaurer cette sauvegarde V6 ? La copie V6 actuelle sera remplacée. La V5 de production reste intacte."))return;const parsed=JSON.parse(await f.text()),restored=IO.restoreBackup(parsed);if(DATA.replaceState)DATA.replaceState(restored);else DATA.save(restored);alert("Sauvegarde V6 restaurée.");W.reload();});

W.enhanceToday=()=>{
  const view=document.getElementById("todayView");if(!view)return;
  const heads=[...view.querySelectorAll(".section-title")],head=heads.find(h=>h.querySelector("h2")?.textContent.trim()==="Sessions");if(!head||head.querySelector("#v6ManageSessions"))return;
  const controls=document.createElement("div");controls.style.display="flex";controls.style.gap="10px";controls.innerHTML='<button id="v6ManageSessions" class="link-button">Gérer</button>';
  const existing=head.querySelector("button");if(existing){const wrap=document.createElement("div");wrap.style.display="flex";wrap.style.gap="10px";existing.replaceWith(wrap);wrap.append(existing,controls.firstElementChild);}else head.appendChild(controls);
  const manage=document.getElementById("v6ManageSessions");if(manage)manage.onclick=()=>W.openManager();
};
W.enhanceSettings=()=>{
  const view=document.getElementById("settingsView");if(!view||view.querySelector("#v6DataManagement"))return;
  const section=document.createElement("section");section.id="v6DataManagement";section.className="card";section.innerHTML='<span class="label">Données & activité</span><div class="button-stack" style="display:grid;gap:8px;margin-top:10px"><button id="v6ManageAllSessions" class="secondary">Gérer les sessions</button><button id="v6ImportUber" class="secondary">Importer Uber</button><button id="v6ImportDeliveroo" class="secondary">Importer Deliveroo</button><button id="v6ImportHistory" class="secondary">Importer historique CSV</button><button id="v6RestoreBackup" class="secondary">Restaurer une sauvegarde V6</button></div><div class="tiny" style="margin-top:9px">Les imports Uber remplacent le snapshot Uber, Deliveroo est ajouté/mis à jour. Les sessions et pourboires restent indépendants.</div>';
  const cards=view.querySelectorAll(".card");const anchor=cards.length>=2?cards[cards.length-2]:null;if(anchor)anchor.before(section);else view.appendChild(section);
  document.getElementById("v6ManageAllSessions").onclick=()=>W.openManager();document.getElementById("v6ImportUber").onclick=W.importUber;document.getElementById("v6ImportDeliveroo").onclick=W.importDeliveroo;document.getElementById("v6ImportHistory").onclick=W.importHistory;document.getElementById("v6RestoreBackup").onclick=W.restoreBackup;
};
W.enhance=()=>{W.ensureModal();W.enhanceToday();W.enhanceSettings();};
const observer=new MutationObserver(()=>{clearTimeout(W._mut);W._mut=setTimeout(W.enhance,20);});observer.observe(document.documentElement,{subtree:true,childList:true});
W.enhance();

globalThis.DriveFlowV6WriteUI=W;
})();