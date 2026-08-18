(() => {
"use strict";
const DATA=globalThis.DriveFlowV6Data, DF=globalThis.DriveFlowV6Core;
if(!DATA||!DF)return;
const C={};
C.escape=s=>String(s??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
C.euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
C.time=ts=>{const m=String(ts||"").match(/[ T](\d{2}:\d{2})/);return m?m[1]:"—";};
C.ensure=()=>{if(document.getElementById("v6ClassifierBackdrop"))return;const b=document.createElement("div");b.id="v6ClassifierBackdrop";b.className="sheet-backdrop";b.hidden=true;const s=document.createElement("section");s.id="v6ClassifierSheet";s.className="sheet";s.hidden=true;s.innerHTML='<div class="sheet-handle"></div><div id="v6ClassifierContent"></div>';b.onclick=C.close;document.body.append(b,s);};
C.open=html=>{C.ensure();document.getElementById("v6ClassifierContent").innerHTML=html;document.getElementById("v6ClassifierBackdrop").hidden=false;document.getElementById("v6ClassifierSheet").hidden=false;};
C.close=()=>{const b=document.getElementById("v6ClassifierBackdrop"),s=document.getElementById("v6ClassifierSheet");if(b)b.hidden=true;if(s)s.hidden=true;};
C.date=()=>{const text=document.querySelector('#todayView .date-nav .date-center small')?.textContent?.trim();return /^\d{4}-\d{2}-\d{2}$/.test(text||"")?text:DATA.businessToday();};
C.assignment=(state,ctx,r)=>{
  if(r.manualSessionId&&ctx.indexes.sessionsById.has(r.manualSessionId))return r.manualSessionId;
  const date=r.businessDate||r.date,candidates=(ctx.indexes.sessionsByDate.get(date)||[]).filter(s=>{const b=DATA.sessionBounds(s),t=DATA.recordTimestamp(r);return b&&t&&t>=b.start&&t<=b.end;});
  if(!candidates.length)return null;
  const priority=s=>s.autoHistorical===true?1:s.historyImported===true?2:3;
  candidates.sort((a,b)=>{const pa=priority(a),pb=priority(b);if(pa!==pb)return pb-pa;const ba=DATA.sessionBounds(a),bb=DATA.sessionBounds(b),span=x=>{const x0=new Date(x.start).getTime(),x1=new Date(x.end).getTime();return x1-x0;};return span(ba)-span(bb);});
  return candidates[0].id;
};
C.unassigned=(state,ctx,date)=>{
  const rows=[];for(const r of ctx.indexes.uberByDate.get(date)||[])if(DF.n(r.orderCount)>0&&!C.assignment(state,ctx,r))rows.push({...r,_platform:"uber",_amount:DF.n(r.total)});
  for(const r of ctx.indexes.deliverooByDate.get(date)||[])if(DF.n(r.orderCount)>0&&!C.assignment(state,ctx,r))rows.push({...r,_platform:"deliveroo",_amount:DF.n(r.earnings)});
  return rows.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
};
C.openClassifier=date=>{
  const state=DATA.load(),ctx=DATA.buildContext(state),rows=C.unassigned(state,ctx,date),sessions=(ctx.indexes.sessionsByDate.get(date)||[]).slice().sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
  C.open(`<h2>Éléments à classer</h2><div class="sheet-sub">Ces commandes comptent déjà dans ton CA. Classe-les dans une session pour fiabiliser les analyses horaires.</div>${rows.length?rows.map((r,i)=>`<article class="card"><div class="row"><div><strong>${r._platform==="uber"?"Uber Eats":"Deliveroo"} · ${C.time(r.timestamp)}</strong><div class="tiny">${Math.round(DF.n(r.orderCount))} commande${DF.n(r.orderCount)>1?"s":""} · ${C.euro(r._amount)}</div></div></div><div class="field" style="margin-top:10px;margin-bottom:0"><select data-classify-index="${i}"><option value="">Choisir une session…</option>${sessions.map(s=>`<option value="${C.escape(s.id)}">${C.escape(s.start||"—")} → ${C.escape(s.end||"—")} · ${C.escape(s.type||"Session")}</option>`).join("")}</select></div></article>`).join(""):'<div class="subtle-card muted">Tout est classé pour cette journée.</div>'}<button id="classifierSave" class="primary" ${rows.length&&sessions.length?"":"disabled"}>Enregistrer les classements</button><button id="classifierClose" class="secondary" style="margin-top:9px">Fermer</button>`);
  document.getElementById("classifierClose").onclick=C.close;document.getElementById("classifierSave").onclick=()=>{const latest=DATA.load(),byId=new Map([...latest.uberBatches,...latest.deliverooOrders].map(x=>[x.id,x]));document.querySelectorAll("[data-classify-index]").forEach(sel=>{const id=rows[Number(sel.dataset.classifyIndex)]?.id,target=byId.get(id);if(target&&sel.value)target.manualSessionId=sel.value;});DATA.save(latest);C.close();location.reload();};
};
C.enhance=()=>{
  const view=document.getElementById("todayView");if(!view)return;const date=C.date(),state=DATA.load(),ctx=DATA.buildContext(state),rows=C.unassigned(state,ctx,date),existing=view.querySelector("#v6UnassignedCard");
  if(!rows.length){if(existing)existing.remove();return;}if(existing){existing.querySelector("strong").textContent=`${rows.length} élément${rows.length>1?"s":""} à classer`;return;}
  const card=document.createElement("section");card.id="v6UnassignedCard";card.className="card";card.innerHTML=`<div class="row"><div><strong>${rows.length} élément${rows.length>1?"s":""} à classer</strong><div class="tiny">Le CA est compté, mais l’analyse horaire sera meilleure après classement.</div></div><button id="v6ClassifierOpen" class="chip active">Classer</button></div>`;
  const head=[...view.querySelectorAll(".section-title")].find(h=>h.querySelector("h2")?.textContent.trim()==="Sessions");if(head)head.before(card);else view.appendChild(card);document.getElementById("v6ClassifierOpen").onclick=()=>C.openClassifier(date);
};
const obs=new MutationObserver(()=>{clearTimeout(C._t);C._t=setTimeout(C.enhance,40);});obs.observe(document.documentElement,{subtree:true,childList:true});C.ensure();C.enhance();globalThis.DriveFlowV6ClassifierUI=C;
})();