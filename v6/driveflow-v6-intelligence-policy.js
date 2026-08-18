(() => {
"use strict";

const isNode=typeof module!=="undefined"&&module.exports;
const INT=isNode?require("./driveflow-v6-intelligence.js"):globalThis.DriveFlowV6Intelligence;
const DF=isNode?require("./driveflow-v6-core.js"):globalThis.DriveFlowV6Core;
if(!INT||!DF)return;
const POLICY={};
POLICY.WINDOWS=Object.freeze([{days:92,label:"3 mois"},{days:183,label:"6 mois"},{days:366,label:"12 mois"}]);
POLICY.originalForecast=INT.forecastSession.bind(INT);
POLICY.filterWindow=(sessions,target,days)=>{
  const targetDays=DF.n(target?.dateDays);return(sessions||[]).filter(s=>{const age=targetDays-DF.n(s?.dateDays);return age>=0&&age<=days;});
};
POLICY.goodEnough=f=>f?.status==="ok"&&f.neighbors>=12&&f.effectiveN>=5.5&&f.confidence!=="low";

INT.forecastSession=(sessions,target,financialContext={},opts={})=>{
  let fallback=null;
  for(const w of POLICY.WINDOWS){
    const subset=POLICY.filterWindow(sessions,target,w.days);if(subset.length<8)continue;
    const f=POLICY.originalForecast(subset,target,financialContext,opts),decorated={...f,analysisWindowDays:w.days,analysisWindowLabel:w.label,analysisRows:subset.length};
    fallback=decorated;if(POLICY.goodEnough(f))return decorated;
  }
  const all=POLICY.originalForecast(sessions,target,financialContext,opts);
  if(all?.status==="ok")return{...all,analysisWindowDays:null,analysisWindowLabel:"historique complet",analysisRows:(sessions||[]).length};
  return fallback||{...all,analysisWindowDays:null,analysisWindowLabel:"historique complet",analysisRows:(sessions||[]).length};
};

if(isNode)module.exports=POLICY;else globalThis.DriveFlowV6IntelligencePolicy=POLICY;
})();