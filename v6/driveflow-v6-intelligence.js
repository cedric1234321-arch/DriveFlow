(() => {
"use strict";

/* DriveFlow V6 Intelligence
   Explainable on-device forecasting + probability-aware weekly planning.
   Depends on DriveFlowV6Core (browser) or require('./driveflow-v6-core.js') (Node). */

const DF = typeof module !== "undefined" && module.exports
  ? require("./driveflow-v6-core.js")
  : globalThis.DriveFlowV6Core;
const INT = {};

INT.cyclicDistance = (a, b, period) => {
  const d = Math.abs(DF.n(a) - DF.n(b)) % period;
  return Math.min(d, period - d);
};
INT.qualityWeight = q => q === "exact" ? 1 : q === "partial" ? 0.7 : 0.45;

INT.comparableRows = (sessions, target, opts = {}) => {
  const cfg = {
    hourSigma: 1,
    weekdaySigma: 1.5,
    durationSigma: 3,
    recencyHalfLifeDays: 45,
    maxNeighbors: 60,
    ...opts
  };
  const rows = [];
  for (const s of sessions || []) {
    if (!s || !(DF.n(s.hours) > 0) || !Number.isFinite(DF.n(s.caHourly))) continue;
    const dh = INT.cyclicDistance(s.startHour, target.startHour, 24);
    const dd = Math.abs(DF.n(s.hours) - DF.n(target.hours));
    const dw = INT.cyclicDistance(s.weekday, target.weekday, 7);
    const age = Math.max(0, DF.n(target.dateDays) - DF.n(s.dateDays));
    let w = Math.exp(-0.5 * Math.pow(dh / cfg.hourSigma, 2));
    w *= Math.exp(-0.5 * Math.pow(dw / cfg.weekdaySigma, 2));
    w *= Math.exp(-0.5 * Math.pow(dd / cfg.durationSigma, 2));
    w *= Math.exp(-Math.log(2) * age / cfg.recencyHalfLifeDays);
    w *= INT.qualityWeight(s.timeQuality);
    if (opts.weatherSimilarity && target.weather && s.weather) w *= opts.weatherSimilarity(s.weather, target.weather);
    if (w > 0) rows.push({ s, w });
  }
  rows.sort((a, b) => b.w - a.w);
  return rows.slice(0, cfg.maxNeighbors);
};

INT.forecastMetric = (rows, valueFn, qLow = 0.15, qHigh = 0.85) => {
  const vals = rows.map(x => DF.n(valueFn(x.s)));
  const weights = rows.map(x => x.w);
  const mean = DF.weightedMean(vals, weights);
  return {
    mean,
    low: DF.weightedQuantile(vals, weights, qLow),
    high: DF.weightedQuantile(vals, weights, qHigh),
    effectiveN: DF.effectiveSampleSize(weights),
    neighbors: rows.length
  };
};

INT.forecastSession = (sessions, target, financialContext = {}, opts = {}) => {
  const rows = INT.comparableRows(sessions, target, opts);
  if (!rows.length) return { status: "insufficient", effectiveN: 0, neighbors: 0 };
  const caH = INT.forecastMetric(rows, s => s.caHourly);
  const kmRows = rows.filter(x => DF.n(x.s.kmHourly) > 0);
  const kmH = INT.forecastMetric(kmRows, s => s.kmHourly);
  const hours = Math.max(0, DF.n(target.hours));
  const expectedCa = Math.max(0, DF.n(caH.mean) * hours);
  const expectedKm = kmH.mean == null ? 0 : Math.max(0, DF.n(kmH.mean) * hours);
  const fuel = DF.sessionFuel({
    distanceKm: expectedKm,
    date: target.date,
    fuelPriceHistory: financialContext.fuelPriceHistory,
    consumptionHistory: financialContext.consumptionHistory,
    priceOverride: financialContext.fuelPriceOverride,
    consumptionOverride: financialContext.consumptionOverride
  });
  const ur = DF.resolveUrssaf(financialContext, target.date);
  const fin = DF.financialMetrics({ ca: expectedCa, fuel, urssafEnabled: ur.enabled, urssafRatePct: ur.rate });
  const confidence = INT.confidence({ effectiveN: caH.effectiveN, neighbors: caH.neighbors, rows });
  return {
    status: confidence === "insufficient" ? "insufficient" : "ok",
    expectedHourlyCa: caH.mean,
    lowHourlyCa: caH.low,
    highHourlyCa: caH.high,
    expectedCa,
    lowCa: caH.low == null ? null : caH.low * hours,
    highCa: caH.high == null ? null : caH.high * hours,
    expectedKm,
    fuel,
    urssaf: fin.urssaf,
    netAfterFuel: fin.netAfterFuel,
    netFinal: fin.netFinal,
    effectiveN: caH.effectiveN,
    neighbors: caH.neighbors,
    confidence,
    comparableIds: rows.slice(0, 10).map(x => x.s.id).filter(Boolean)
  };
};

INT.confidence = ({ effectiveN, neighbors, rows }) => {
  if (neighbors < 5 || effectiveN < 2.5) return "insufficient";
  const exactWeight = rows.reduce((a, x) => a + (x.s.timeQuality === "exact" ? x.w : 0), 0);
  const total = rows.reduce((a, x) => a + x.w, 0);
  const exactShare = total ? exactWeight / total : 0;
  if (effectiveN >= 10 && neighbors >= 20 && exactShare >= 0.15) return "high";
  if (effectiveN >= 6 && neighbors >= 12) return "medium";
  return "low";
};

INT.goalProbability = (sessions, target, goal, metric = "ca", financialContext = {}, opts = {}) => {
  const rows = INT.comparableRows(sessions, target, opts);
  if (!rows.length) return null;
  const duration = Math.max(0, DF.n(target.hours));
  let hit = 0, total = 0;
  for (const { s, w } of rows) {
    const ca = Math.max(0, DF.n(s.caHourly) * duration);
    let value = ca;
    if (metric !== "ca") {
      const km = Math.max(0, DF.n(s.kmHourly) * duration);
      const fuel = DF.sessionFuel({ distanceKm: km, date: target.date, fuelPriceHistory: financialContext.fuelPriceHistory, consumptionHistory: financialContext.consumptionHistory });
      const ur = DF.resolveUrssaf(financialContext, target.date);
      value = DF.financialMetrics({ ca, fuel, urssafEnabled: ur.enabled, urssafRatePct: ur.rate }).netFinal;
    }
    total += w;
    if (value >= DF.n(goal)) hit += w;
  }
  return total ? hit / total : null;
};

INT.scoreCandidates = ({ sessions, candidates, financialContext, opts }) => {
  return (candidates || []).map(c => ({ ...c, forecast: INT.forecastSession(sessions, c, financialContext, opts) }))
    .filter(c => c.forecast.status === "ok");
};

INT.candidatesOverlap = (a, b) => {
  if (!a || !b || a.date !== b.date) return false;
  const a0 = DF.n(a.startHour), a1 = a0 + Math.max(0, DF.n(a.hours));
  const b0 = DF.n(b.startHour), b1 = b0 + Math.max(0, DF.n(b.hours));
  return a0 < b1 && b0 < a1;
};
INT.conflictsWithAny = (candidate, selected) => (selected || []).some(x => INT.candidatesOverlap(candidate, x));

INT.hashSeed = value => {
  let h = 2166136261 >>> 0;
  for (const ch of String(value || "DriveFlow")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
INT.prng = seed => {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => { x += 0x6D2B79F5; let t=x; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
};
INT.pickWeighted = (rows, random) => {
  const total = rows.reduce((a,x)=>a+Math.max(0,DF.n(x.w)),0);
  if (!total) return null;
  let target=random()*total;
  for (const row of rows) { target -= Math.max(0,DF.n(row.w)); if (target <= 0) return row.s; }
  return rows.at(-1)?.s || null;
};
INT.quantile = (values, q) => {
  const a=(values||[]).filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return null;
  const i=Math.max(0,Math.min(a.length-1,Math.floor((a.length-1)*Math.max(0,Math.min(1,q))))); return a[i];
};

INT.simulatePlan = ({ sessions, selected, financialContext = {}, caGoal = 0, savingsGoal = 0, opts = {}, runs = 500 }) => {
  if (!(selected || []).length) return { runs:0, caGoalProbability:null, savingsGoalProbability:null };
  const prepared = selected.map(c => ({ c, rows:INT.comparableRows(sessions,c,opts) })).filter(x=>x.rows.length);
  if (prepared.length !== selected.length) return { runs:0, caGoalProbability:null, savingsGoalProbability:null };
  const key=selected.map(c=>`${c.id||""}|${c.date}|${c.startHour}|${c.hours}`).join(";");
  const random=INT.prng(INT.hashSeed(key));
  const caSamples=[],netSamples=[];
  for(let i=0;i<Math.max(100,Math.round(runs));i++){
    let totalCa=0,totalNet=0;
    for(const {c,rows} of prepared){
      const s=INT.pickWeighted(rows,random); if(!s)continue;
      const hours=Math.max(0,DF.n(c.hours)),ca=Math.max(0,DF.n(s.caHourly)*hours),km=Math.max(0,DF.n(s.kmHourly)*hours);
      const fuel=DF.sessionFuel({distanceKm:km,date:c.date,fuelPriceHistory:financialContext.fuelPriceHistory,consumptionHistory:financialContext.consumptionHistory});
      const ur=DF.resolveUrssaf(financialContext,c.date);
      const fin=DF.financialMetrics({ca,fuel,urssafEnabled:ur.enabled,urssafRatePct:ur.rate});
      totalCa+=ca; totalNet+=fin.netFinal;
    }
    caSamples.push(totalCa);netSamples.push(totalNet);
  }
  const caG=Math.max(0,DF.n(caGoal)),savG=Math.max(0,DF.n(savingsGoal));
  return {
    runs:caSamples.length,
    caLow:INT.quantile(caSamples,.15),caMedian:INT.quantile(caSamples,.5),caHigh:INT.quantile(caSamples,.85),
    netLow:INT.quantile(netSamples,.15),netMedian:INT.quantile(netSamples,.5),netHigh:INT.quantile(netSamples,.85),
    caGoalProbability:caG===0?1:caSamples.filter(x=>x>=caG).length/caSamples.length,
    savingsGoalProbability:savG===0?1:netSamples.filter(x=>x>=savG).length/netSamples.length,
    jointGoalProbability:(caG===0&&savG===0)?1:caSamples.filter((x,i)=>x>=caG&&netSamples[i]>=savG).length/caSamples.length
  };
};

INT.planWeek = ({
  sessions, candidates, financialContext = {}, caGoal = 0, savingsGoal = 0,
  priority = "min_time", targetProbability = 0.72, simulationRuns = 500, opts = {}
}) => {
  const scored = INT.scoreCandidates({ sessions, candidates, financialContext, opts });
  const metric = c => {
    const f = c.forecast;
    if (priority === "min_sessions") return f.expectedCa;
    if (priority === "max_ca") return f.expectedCa;
    if (priority === "max_hourly") return f.expectedHourlyCa;
    return f.netFinal / Math.max(0.25, DF.n(c.hours));
  };
  scored.sort((a, b) => metric(b) - metric(a));
  const selected = [];
  let ca = 0, net = 0, hours = 0, simulation = null;
  const caG=Math.max(0,DF.n(caGoal)),savG=Math.max(0,DF.n(savingsGoal)),targetP=DF.clamp(targetProbability,0,1);

  for (const c of scored) {
    if (INT.conflictsWithAny(c, selected)) continue;
    if (priority !== "max_ca" && selected.length) {
      const expectedDone = ca >= caG && net >= savG;
      const probabilityDone = simulation && simulation.caGoalProbability >= targetP && simulation.savingsGoalProbability >= targetP;
      if (expectedDone && probabilityDone) break;
    }
    selected.push(c);
    ca += c.forecast.expectedCa;
    net += c.forecast.netFinal;
    hours += DF.n(c.hours);
    simulation = INT.simulatePlan({ sessions, selected, financialContext, caGoal:caG, savingsGoal:savG, opts, runs:simulationRuns });
  }

  if (!simulation && selected.length) simulation = INT.simulatePlan({ sessions, selected, financialContext, caGoal:caG, savingsGoal:savG, opts, runs:simulationRuns });
  const confidenceOrder = { high: 3, medium: 2, low: 1, insufficient: 0 };
  const confidence = selected.length
    ? selected.map(x => x.forecast.confidence).sort((a,b)=>confidenceOrder[a]-confidenceOrder[b])[0]
    : "insufficient";
  const expectedSavings=Math.min(Math.max(0,net),savG);
  return {
    selected,
    expectedCa: ca,
    expectedNet: net,
    expectedSavings,
    totalHours: hours,
    sessionsCount: selected.length,
    caGoal: caG,
    savingsGoal: savG,
    targetProbability:targetP,
    caGoalReachedOnExpectation: ca >= caG,
    savingsGoalReachedOnExpectation: net >= savG,
    caGoalProbability:simulation?.caGoalProbability ?? null,
    savingsGoalProbability:simulation?.savingsGoalProbability ?? null,
    jointGoalProbability:simulation?.jointGoalProbability ?? null,
    caRange: simulation ? { low:simulation.caLow, median:simulation.caMedian, high:simulation.caHigh } : null,
    netRange: simulation ? { low:simulation.netLow, median:simulation.netMedian, high:simulation.netHigh } : null,
    simulationRuns:simulation?.runs||0,
    probabilityTargetReached:!!simulation && simulation.caGoalProbability>=targetP && simulation.savingsGoalProbability>=targetP,
    confidence
  };
};

if (typeof module !== "undefined" && module.exports) module.exports = INT;
else globalThis.DriveFlowV6Intelligence = INT;
})();