(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data, WX=globalThis.DriveFlowV6Weather, BT=globalThis.DriveFlowV6Backtest;
if(!DATA||!WX||!BT)return;
const original=DATA.enrichHistoricalWeather;
if(typeof original!=="function")return;

DATA.enrichHistoricalWeather = async (state,onProgress=()=>{}) => {
  const result=await original(state,onProgress);
  if(result.status!=="complete")return result;
  const ctx=DATA.buildContext(state),rows=DATA.analyticsSessions(state,ctx);
  const test=BT.evaluateWeather(rows,{weatherSimilarity:WX.similarity,minTraining:40,minTests:50,enableThresholdPct:1.5});
  state.weatherMeta={
    ...(state.weatherMeta||{}),
    validationStatus:test.status,
    modelEnabled:!!test.enabled,
    improvementPct:test.improvementPct??null,
    baseMae:test.baseMae??null,
    weatherMae:test.weatherMae??null,
    firstHalfImprovementPct:test.firstHalfImprovementPct??null,
    secondHalfImprovementPct:test.secondHalfImprovementPct??null,
    backtestTests:test.tests||0,
    backtestedAt:test.evaluatedAt||new Date().toISOString()
  };
  DATA.save(state);
  return {...result,backtest:test};
};
})();