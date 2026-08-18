(() => {
"use strict";

/* DriveFlow V6 Intelligence
   Explainable on-device forecasting + weekly planning.
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
  const kmH = INT.forecastMetric(rows.filter(x => DF.n(x.s.kmHourly) > 0), s => s.kmHourly);
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

INT.planWeek = ({ sessions, candidates, financialContext = {}, caGoal = 0, savingsGoal = 0, priority = "min_time", opts = {} }) => {
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
  let ca = 0, net = 0, hours = 0;
  for (const c of scored) {
    if (priority !== "max_ca" && ca >= DF.n(caGoal) && net >= DF.n(savingsGoal)) break;
    selected.push(c);
    ca += c.forecast.expectedCa;
    net += c.forecast.netFinal;
    hours += DF.n(c.hours);
  }
  const confidenceOrder = { high: 3, medium: 2, low: 1, insufficient: 0 };
  const confidence = selected.length
    ? selected.map(x => x.forecast.confidence).sort((a,b)=>confidenceOrder[a]-confidenceOrder[b])[0]
    : "insufficient";
  return {
    selected,
    expectedCa: ca,
    expectedNet: net,
    expectedSavings: Math.min(Math.max(0, net), Math.max(0, DF.n(savingsGoal))),
    totalHours: hours,
    sessionsCount: selected.length,
    caGoal: DF.n(caGoal),
    savingsGoal: DF.n(savingsGoal),
    caGoalReachedOnExpectation: ca >= DF.n(caGoal),
    savingsGoalReachedOnExpectation: net >= DF.n(savingsGoal),
    confidence
  };
};

if (typeof module !== "undefined" && module.exports) module.exports = INT;
else globalThis.DriveFlowV6Intelligence = INT;
})();