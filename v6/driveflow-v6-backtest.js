(() => {
"use strict";

const DF = typeof module !== "undefined" && module.exports
  ? require("./driveflow-v6-core.js")
  : globalThis.DriveFlowV6Core;
const INT = typeof module !== "undefined" && module.exports
  ? require("./driveflow-v6-intelligence.js")
  : globalThis.DriveFlowV6Intelligence;
const BT = {};

BT.mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
BT.mae = errors => BT.mean(errors.map(Math.abs));
BT.evaluateWeather = (rows, { weatherSimilarity, minTraining = 40, minTests = 50, enableThresholdPct = 1.5 } = {}) => {
  const sorted=(rows||[]).filter(r=>r&&r.weather&&r.date&&DF.n(r.hours)>0&&DF.n(r.ca)>=0).slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(!weatherSimilarity || sorted.length < minTraining + 10){
    return {status:"insufficient",tests:0,enabled:false,reason:"not_enough_weather_rows"};
  }
  const baseErrors=[],weatherErrors=[],dated=[];
  for(let i=minTraining;i<sorted.length;i++){
    const target=sorted[i],train=sorted.slice(0,i).filter(r=>r.dateDays<target.dateDays);
    if(train.length<minTraining)continue;
    const base=INT.forecastSession(train,target,{},{});
    const wx=INT.forecastSession(train,target,{}, {weatherSimilarity});
    if(base.status!=="ok"||wx.status!=="ok")continue;
    const actual=DF.n(target.ca),be=Math.abs(base.expectedCa-actual),we=Math.abs(wx.expectedCa-actual);
    baseErrors.push(be);weatherErrors.push(we);dated.push({date:target.date,base:be,weather:we});
  }
  if(baseErrors.length<minTests)return {status:"insufficient",tests:baseErrors.length,enabled:false,reason:"not_enough_walk_forward_tests"};
  const baseMae=BT.mae(baseErrors),weatherMae=BT.mae(weatherErrors),improvementPct=baseMae?((baseMae-weatherMae)/baseMae)*100:0;
  const mid=Math.floor(dated.length/2),first=dated.slice(0,mid),second=dated.slice(mid);
  const splitImp = part => {
    const b=BT.mae(part.map(x=>x.base)),w=BT.mae(part.map(x=>x.weather)); return b?((b-w)/b)*100:0;
  };
  const firstHalfImprovementPct=splitImp(first),secondHalfImprovementPct=splitImp(second);
  const stable=firstHalfImprovementPct>0&&secondHalfImprovementPct>0;
  const enabled=improvementPct>=enableThresholdPct&&stable;
  return {
    status:"ok",tests:baseErrors.length,baseMae,weatherMae,improvementPct,
    firstHalfImprovementPct,secondHalfImprovementPct,stable,enabled,
    thresholdPct:enableThresholdPct,
    evaluatedAt:new Date().toISOString()
  };
};

if(typeof module!=="undefined"&&module.exports)module.exports=BT;else globalThis.DriveFlowV6Backtest=BT;
})();