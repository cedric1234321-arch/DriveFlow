(() => {
"use strict";
const DATA=globalThis.DriveFlowV6Data,DF=globalThis.DriveFlowV6Core;
if(!DATA||!DF)return;

const originalAggregate=DATA.aggregateDates.bind(DATA);
DATA.aggregateDates=(state,ctx,dates)=>{
  const out=originalAggregate(state,ctx,dates),first=dates?.[0];if(!first)return out;
  const weekKey=DF.isoWeekKey(first),weekly=state.settings?.weeklySavingsOverrides?.[weekKey],legacy=state.settings?.dailySavingsOverrides||{},base=state.settings?.defaultSavingsRule||{mode:"fixed_daily",value:25};
  if(weekly||base.mode!=="fixed_daily")return out;
  const relevant=out.days.filter(d=>d.sessions.length||d.ca);
  if(!relevant.some(d=>Object.prototype.hasOwnProperty.call(legacy,d.date)))return out;
  const target=relevant.reduce((sum,d)=>sum+Math.max(0,DF.n(Object.prototype.hasOwnProperty.call(legacy,d.date)?legacy[d.date]:base.value)),0),saved=Math.min(Math.max(0,out.netFinal),target);
  out.savingsRule={mode:"fixed_week",value:target,source:"legacy_daily_overrides",weekKey};
  out.savings={target,saved,remaining:Math.max(0,target-saved),availableAfterSavings:Math.max(0,out.netFinal-saved),reached:target===0?null:saved>=target};
  return out;
};

const todayDate=()=>{const x=document.querySelector('#todayView .date-nav .date-center small')?.textContent?.trim();return /^\d{4}-\d{2}-\d{2}$/.test(x||"")?x:null;};
const euro=v=>`${DF.n(v).toLocaleString("fr-FR",{maximumFractionDigits:2})} €`;
const enhanceToday=()=>{
  const date=todayDate();if(!date)return;const state=DATA.load(),legacy=state.settings?.dailySavingsOverrides||{},week=state.settings?.weeklySavingsOverrides?.[DF.isoWeekKey(date)];
  if(week||!Object.prototype.hasOwnProperty.call(legacy,date))return;
  const view=document.getElementById('todayView'),label=[...view.querySelectorAll('.label')].find(x=>x.textContent.trim()==='Épargne réalisée');if(!label)return;
  const card=label.closest('.metric-card'),ctx=DATA.buildContext(state),d=DATA.dayMetrics(state,ctx,date),target=Math.max(0,DF.n(legacy[date])),saved=Math.min(Math.max(0,d.netFinal),target),strong=card.querySelector('strong'),small=card.querySelector('small');
  if(strong)strong.textContent=euro(saved);if(small)small.textContent=`Objectif ${euro(target)} · règle V5 conservée`;
};
const obs=new MutationObserver(()=>{clearTimeout(enhanceToday._t);enhanceToday._t=setTimeout(enhanceToday,30);});obs.observe(document.documentElement,{subtree:true,childList:true});enhanceToday();
globalThis.DriveFlowV6SavingsCompat={enhanceToday};
})();