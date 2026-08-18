(() => {
"use strict";

const INT=globalThis.DriveFlowV6Intelligence, DF=globalThis.DriveFlowV6Core;
if(!INT||!DF)return;
const PLAN={};

PLAN.sumOption=items=>({
  selected:items,
  ca:items.reduce((a,x)=>a+DF.n(x.forecast.expectedCa),0),
  net:items.reduce((a,x)=>a+DF.n(x.forecast.netFinal),0),
  hours:items.reduce((a,x)=>a+DF.n(x.hours),0),
  sessions:items.length
});
PLAN.dominates=(a,b)=>a.hours<=b.hours+1e-9&&a.sessions<=b.sessions&&a.ca>=b.ca-1e-9&&a.net>=b.net-1e-9&&(a.hours<b.hours-1e-9||a.sessions<b.sessions||a.ca>b.ca+1e-9||a.net>b.net+1e-9);
PLAN.pareto=states=>{
  const sorted=states.slice().sort((a,b)=>a.hours-b.hours||a.sessions-b.sessions||b.net-a.net||b.ca-a.ca),out=[];
  for(const s of sorted){if(out.some(x=>PLAN.dominates(x,s)))continue;for(let i=out.length-1;i>=0;i--)if(PLAN.dominates(s,out[i]))out.splice(i,1);out.push(s);}return out;
};
PLAN.dayOptions=rows=>{
  const byDate=new Map();for(const c of rows){if(!byDate.has(c.date))byDate.set(c.date,[]);byDate.get(c.date).push(c);}
  const out=new Map();for(const [date,list] of byDate){
    const lunch=list.filter(c=>DF.n(c.startHour)<16.5),eve=list.filter(c=>DF.n(c.startHour)>=16.5),opts=[PLAN.sumOption([])];
    for(const c of list)opts.push(PLAN.sumOption([c]));
    for(const a of lunch)for(const b of eve)if(!INT.candidatesOverlap(a,b))opts.push(PLAN.sumOption([a,b]));
    out.set(date,PLAN.pareto(opts));
  }return out;
};
PLAN.progressScore=(s,caGoal,netGoal)=>{
  const ca=caGoal>0?Math.min(1,s.ca/caGoal):1,net=netGoal>0?Math.min(1,s.net/netGoal):1;
  return (ca+net)/Math.max(.25,s.hours||.25);
};
PLAN.pruneBeam=(states,{priority,caGoal,netGoal,beamWidth})=>{
  let p=PLAN.pareto(states);const reached=s=>s.ca>=caGoal&&s.net>=netGoal;
  p.sort((a,b)=>{
    const ar=reached(a),br=reached(b);if(ar!==br)return ar?-1:1;
    if(priority==="min_sessions")return ar?(a.sessions-b.sessions||a.hours-b.hours):(PLAN.progressScore(b,caGoal,netGoal)-PLAN.progressScore(a,caGoal,netGoal));
    if(priority==="max_ca")return b.ca-a.ca||b.net-a.net;
    if(priority==="max_hourly")return (b.net/Math.max(.25,b.hours))-(a.net/Math.max(.25,a.hours))||b.ca-a.ca;
    return ar?(a.hours-b.hours||a.sessions-b.sessions):(PLAN.progressScore(b,caGoal,netGoal)-PLAN.progressScore(a,caGoal,netGoal));
  });
  return p.slice(0,beamWidth);
};
PLAN.combineDays=(scored,{priority,caGoal,netGoal,beamWidth=700})=>{
  const options=PLAN.dayOptions(scored),dates=[...options.keys()].sort();let states=[{selected:[],ca:0,net:0,hours:0,sessions:0}];
  for(const date of dates){const next=[];for(const s of states)for(const o of options.get(date)){next.push({selected:s.selected.concat(o.selected),ca:s.ca+o.ca,net:s.net+o.net,hours:s.hours+o.hours,sessions:s.sessions+o.sessions});}states=PLAN.pruneBeam(next,{priority,caGoal,netGoal,beamWidth});}
  return states;
};
PLAN.rankFinal=(states,priority,caGoal,netGoal)=>{
  const reached=s=>s.ca>=caGoal&&s.net>=netGoal;return states.slice().sort((a,b)=>{
    const ar=reached(a),br=reached(b);if(ar!==br)return ar?-1:1;
    if(priority==="min_sessions")return a.sessions-b.sessions||a.hours-b.hours||b.net-a.net;
    if(priority==="max_ca")return b.ca-a.ca||b.net-a.net||a.hours-b.hours;
    if(priority==="max_hourly")return (b.net/Math.max(.25,b.hours))-(a.net/Math.max(.25,a.hours))||a.hours-b.hours;
    return a.hours-b.hours||a.sessions-b.sessions||b.net-a.net;
  });
};
PLAN.confidence=selected=>{
  const order={high:3,medium:2,low:1,insufficient:0};return selected.length?selected.map(x=>x.forecast.confidence).sort((a,b)=>order[a]-order[b])[0]:"insufficient";
};

// Replace the original greedy planner. Forecasting remains unchanged; only the
// combinatorial weekly selection is upgraded.
INT.planWeek=({sessions,candidates,financialContext={},caGoal=0,savingsGoal=0,priority="min_time",targetProbability=.72,simulationRuns=500,opts={}})=>{
  const scored=INT.scoreCandidates({sessions,candidates,financialContext,opts}),caG=Math.max(0,DF.n(caGoal)),netG=Math.max(0,DF.n(savingsGoal)),targetP=DF.clamp(targetProbability,0,1);
  if(!scored.length)return{selected:[],expectedCa:0,expectedNet:0,expectedSavings:0,totalHours:0,sessionsCount:0,caGoal:caG,savingsGoal:netG,targetProbability:targetP,confidence:"insufficient",probabilityTargetReached:false};
  const states=PLAN.rankFinal(PLAN.combineDays(scored,{priority,caGoal:caG,netGoal:netG}),priority,caG,netG);
  const shortlist=states.slice(0,Math.min(24,states.length));let best=null,bestSim=null;
  for(const s of shortlist){
    if(!s.selected.length)continue;
    const sim=INT.simulatePlan({sessions,selected:s.selected,financialContext,caGoal:caG,savingsGoal:netG,opts,runs:simulationRuns});
    const safe=(sim.caGoalProbability??0)>=targetP&&(sim.savingsGoalProbability??0)>=targetP;
    if(safe){best=s;bestSim=sim;break;}
    if(!best||((sim.jointGoalProbability??0)>(bestSim?.jointGoalProbability??0))){best=s;bestSim=sim;}
  }
  best ||= states[0];if(!bestSim&&best?.selected?.length)bestSim=INT.simulatePlan({sessions,selected:best.selected,financialContext,caGoal:caG,savingsGoal:netG,opts,runs:simulationRuns});
  const sim=bestSim,net=best?.net||0,ca=best?.ca||0;
  return {
    selected:best?.selected||[],expectedCa:ca,expectedNet:net,expectedSavings:Math.min(Math.max(0,net),netG),totalHours:best?.hours||0,sessionsCount:best?.sessions||0,
    caGoal:caG,savingsGoal:netG,targetProbability:targetP,caGoalReachedOnExpectation:ca>=caG,savingsGoalReachedOnExpectation:net>=netG,
    caGoalProbability:sim?.caGoalProbability??null,savingsGoalProbability:sim?.savingsGoalProbability??null,jointGoalProbability:sim?.jointGoalProbability??null,
    caRange:sim?{low:sim.caLow,median:sim.caMedian,high:sim.caHigh}:null,netRange:sim?{low:sim.netLow,median:sim.netMedian,high:sim.netHigh}:null,simulationRuns:sim?.runs||0,
    probabilityTargetReached:!!sim&&(sim.caGoalProbability??0)>=targetP&&(sim.savingsGoalProbability??0)>=targetP,confidence:PLAN.confidence(best?.selected||[]),optimizer:"beam-v1"
  };
};

globalThis.DriveFlowV6Planner=PLAN;
})();