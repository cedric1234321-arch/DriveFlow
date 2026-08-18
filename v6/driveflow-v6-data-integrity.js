(() => {
"use strict";
const DATA=globalThis.DriveFlowV6Data, DF=globalThis.DriveFlowV6Core;
if(!DATA||!DF)return;

// Fold V5 manual pause ranges into V6 active-duration calculations when no
// permanent historical pause total is stored on the session.
DATA.sessionMinutes = s => {
  let a=null,b=null;
  if(Number.isFinite(Number(s?.historyStartMinute)))a=Number(s.historyStartMinute);
  else if(Number.isFinite(Number(s?.autoStartMinute)))a=Number(s.autoStartMinute);
  else a=DATA.businessMinute(s?.start);
  if(Number.isFinite(Number(s?.historyEndMinute)))b=Number(s.historyEndMinute);
  else if(Number.isFinite(Number(s?.autoEndMinute)))b=Number(s.autoEndMinute);
  else b=DATA.businessMinute(s?.end);
  if(a==null||b==null||b<=a)return 0;
  let pauses=0;
  if(s?.pauseMinutesTotal!==undefined&&s?.pauseMinutesTotal!==null&&s?.pauseMinutesTotal!=="")pauses=Math.max(0,DF.n(s.pauseMinutesTotal));
  else if(s?.pauseStart&&s?.pauseEnd){const ps=DATA.businessMinute(s.pauseStart),pe=DATA.businessMinute(s.pauseEnd);if(ps!=null&&pe!=null&&pe>ps)pauses=pe-ps;}
  return Math.max(0,b-a-pauses);
};

DATA.auditState = state => {
  const issues=[];
  for(const key of ["sessions","uberBatches","deliverooOrders","cashTips","weeklyPlans"])if(!Array.isArray(state?.[key]))issues.push(`${key}:not_array`);
  const duplicateIds = arr => {const seen=new Set(),dupes=[];for(const x of arr||[]){if(!x?.id)continue;if(seen.has(x.id))dupes.push(x.id);seen.add(x.id);}return dupes;};
  const sessionDupes=duplicateIds(state?.sessions),uberDupes=duplicateIds(state?.uberBatches),delDupes=duplicateIds(state?.deliverooOrders),tipDupes=duplicateIds(state?.cashTips);
  if(sessionDupes.length)issues.push(`duplicate_sessions:${sessionDupes.length}`);
  if(uberDupes.length)issues.push(`duplicate_uber:${uberDupes.length}`);
  if(delDupes.length)issues.push(`duplicate_deliveroo:${delDupes.length}`);
  if(tipDupes.length)issues.push(`duplicate_tips:${tipDupes.length}`);
  const sessionIds=new Set((state?.sessions||[]).map(x=>x.id));
  const danglingTips=(state?.cashTips||[]).filter(t=>t.sessionId&&!sessionIds.has(t.sessionId));
  if(danglingTips.length)issues.push(`dangling_tips:${danglingTips.length}`);
  return {ok:issues.length===0,issues,counts:{sessions:state?.sessions?.length||0,uber:state?.uberBatches?.length||0,deliveroo:state?.deliverooOrders?.length||0,tips:state?.cashTips?.length||0,plans:state?.weeklyPlans?.length||0}};
};
})();