(() => {
"use strict";
const FUEL=globalThis.DriveFlowV6Fuel,DATA=globalThis.DriveFlowV6Data;
if(!FUEL||!DATA)return;
const U={};
U.date=()=>{const x=document.querySelector('#todayView .date-nav .date-center small')?.textContent?.trim();return /^\d{4}-\d{2}-\d{2}$/.test(x||"")?x:DATA.businessToday();};
U.enhanceToday=()=>{
  const view=document.getElementById('todayView');if(!view)return;const state=DATA.load(),date=U.date(),p=DATA.fuelPriceForDate?.(state,date)||null;
  const line=[...view.querySelectorAll('.breakdown .line')].find(x=>/^Carburant/.test(x.querySelector('span')?.textContent||''));if(!line||!p)return;
  const source=p.source==='official_montpellier'?'médiane locale':p.source==='session_snapshot'?'estimation historique':'manuel';
  line.querySelector('span').textContent=`Carburant · ${Number(p.pricePerL).toFixed(2)} €/L · ${source}`;
};
U.enhanceSettings=()=>{
  const view=document.getElementById('settingsView');if(!view||view.querySelector('#v6FuelHistoryStatus'))return;
  const cards=[...view.querySelectorAll('.card')],financial=cards.find(c=>/Prix du carburant/.test(c.textContent||''));if(!financial)return;
  const row=document.createElement('div');row.id='v6FuelHistoryStatus';row.className='settings-row';const m=FUEL.meta||{};
  row.innerHTML=`<div><strong>Historique local gazole</strong><div class="desc">${m.status==='ready'||m.status==='ready_cached'?`${m.rows} jours issus de la série officielle locale`:m.status==='pending'?'En attente du traitement des archives officielles':'Fallback sur tes valeurs DriveFlow'}</div></div><span class="tiny">${m.status==='ready'||m.status==='ready_cached'?'Actif':'Préparé'}</span>`;
  financial.querySelector('.settings-list')?.appendChild(row) || financial.appendChild(row);
};
U.enhance=()=>{U.enhanceToday();U.enhanceSettings();};
const obs=new MutationObserver(()=>{clearTimeout(U._t);U._t=setTimeout(U.enhance,40);});obs.observe(document.documentElement,{subtree:true,childList:true});U.enhance();globalThis.DriveFlowV6FuelUI=U;
})();