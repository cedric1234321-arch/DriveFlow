(() => {
"use strict";

/* DriveFlow V6 Core
   Pure business logic: no DOM, no localStorage. */

const DF = {};

DF.VERSION = "6.0.0-dev";
DF.URSSAF_PRESETS = Object.freeze({
  acre_legacy: { label: "ACRE (ancien régime)", rate: 10.6 },
  acre_2026: { label: "ACRE (depuis le 1er juillet 2026)", rate: 15.9 },
  standard_bic_service: { label: "Standard – prestations de services BIC", rate: 21.2 }
});

DF.n = v => {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
DF.clamp = (v, a, b) => Math.min(b, Math.max(a, DF.n(v)));
DF.round2 = v => Math.round((DF.n(v) + Number.EPSILON) * 100) / 100;
DF.isoWeekKey = date => {
  const d = new Date(`${date}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4, 12);
  const firstDay = (firstThu.getDay() + 6) % 7;
  firstThu.setDate(firstThu.getDate() - firstDay + 3);
  const week = 1 + Math.round((d - firstThu) / 604800000);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
};

DF.weightedQuantile = (values, weights, q) => {
  const rows = values.map((v, i) => ({ v: DF.n(v), w: Math.max(0, DF.n(weights[i])) }))
    .filter(x => Number.isFinite(x.v) && x.w > 0)
    .sort((a, b) => a.v - b.v);
  if (!rows.length) return null;
  const total = rows.reduce((a, x) => a + x.w, 0);
  const target = DF.clamp(q, 0, 1) * total;
  let c = 0;
  for (const row of rows) {
    c += row.w;
    if (c >= target) return row.v;
  }
  return rows[rows.length - 1].v;
};

DF.weightedMean = (values, weights) => {
  let sw = 0, sx = 0;
  for (let i = 0; i < values.length; i++) {
    const w = Math.max(0, DF.n(weights[i]));
    const v = DF.n(values[i]);
    if (!Number.isFinite(v) || !w) continue;
    sw += w;
    sx += w * v;
  }
  return sw ? sx / sw : null;
};

DF.effectiveSampleSize = weights => {
  const w = weights.map(x => Math.max(0, DF.n(x)));
  const s = w.reduce((a, x) => a + x, 0);
  const s2 = w.reduce((a, x) => a + x * x, 0);
  return s2 ? (s * s) / s2 : 0;
};

DF.resolveEffectiveRow = (history, date) => {
  const d = String(date || "");
  return (Array.isArray(history) ? history : [])
    .filter(x => x && x.effectiveFrom && x.effectiveFrom <= d)
    .sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)))
    .at(-1) || null;
};
DF.resolveEffectiveValue = (history, date, key) => {
  const row = DF.resolveEffectiveRow(history, date);
  return row ? DF.n(row[key]) : null;
};

DF.resolveUrssaf = (settings, date) => {
  const enabled = settings?.urssafEnabled === true;
  if (!enabled) return { enabled: false, rate: 0, source: "disabled" };
  const history = Array.isArray(settings?.urssafRateHistory) ? settings.urssafRateHistory.filter(x=>x?.effectiveFrom) : [];
  const row = DF.resolveEffectiveRow(history, date);
  if (row) return { enabled: true, rate: Math.max(0, DF.n(row.ratePct)), source: "history" };
  // Once an effective-dated history exists, dates before its first row must not
  // inherit today's rate retroactively.
  if (history.length) return { enabled: true, rate: 0, source: "before_history" };
  return { enabled: true, rate: Math.max(0, DF.n(settings?.urssafRatePct)), source: "current" };
};

DF.sessionFuel = ({ distanceKm, date, fuelPriceHistory, consumptionHistory, priceOverride, consumptionOverride }) => {
  const km = Math.max(0, DF.n(distanceKm));
  const price = priceOverride != null ? DF.n(priceOverride) : DF.resolveEffectiveValue(fuelPriceHistory, date, "pricePerL");
  const consumption = consumptionOverride != null ? DF.n(consumptionOverride) : DF.resolveEffectiveValue(consumptionHistory, date, "litresPer100km");
  if (!(price > 0) || !(consumption > 0)) return 0;
  return km * consumption / 100 * price;
};

DF.financialMetrics = ({ ca, fuel = 0, urssafEnabled = false, urssafRatePct = 0 }) => {
  const gross = Math.max(0, DF.n(ca));
  const fuelCost = Math.max(0, DF.n(fuel));
  const netAfterFuel = gross - fuelCost;
  const urssafRate = urssafEnabled ? Math.max(0, DF.n(urssafRatePct)) : 0;
  const urssaf = gross * urssafRate / 100;
  const netFinal = netAfterFuel - urssaf;
  return {
    gross,
    fuel: fuelCost,
    netAfterFuel,
    urssafEnabled: !!urssafEnabled,
    urssafRatePct: urssafRate,
    urssaf,
    netFinal,
    netAvailable: netFinal
  };
};

DF.resolveSavingsRule = ({ defaultRule, weeklyOverrides }, date) => {
  const key = DF.isoWeekKey(date);
  const override = weeklyOverrides?.[key];
  const base = override || defaultRule || { mode: "fixed_daily", value: 25 };
  const mode = ["fixed_daily", "fixed_week", "percent_net"].includes(base.mode) ? base.mode : "fixed_daily";
  return { mode, value: Math.max(0, DF.n(base.value)), source: override ? "week" : "default", weekKey: key };
};

DF.savingsForPeriod = ({ netAvailable, rule, workedDays = 0 }) => {
  const net = Math.max(0, DF.n(netAvailable));
  const r = rule || { mode: "fixed_daily", value: 25 };
  let target = 0;
  if (r.mode === "fixed_week") target = Math.max(0, DF.n(r.value));
  else if (r.mode === "percent_net") target = net * Math.max(0, DF.n(r.value)) / 100;
  else target = Math.max(0, DF.n(r.value)) * Math.max(0, Math.round(DF.n(workedDays)));
  const saved = Math.min(net, target);
  return { target, saved, remaining: Math.max(0, target - saved), availableAfterSavings: Math.max(0, net - saved), reached: target === 0 ? null : saved >= target };
};

DF.buildIndexes = ({ sessions = [], uberBatches = [], deliverooOrders = [], cashTips = [] }) => {
  const sessionsByDate = new Map(), sessionsById = new Map();
  const uberByDate = new Map(), deliverooByDate = new Map();
  const recordsBySession = new Map(), cashTipsBySession = new Map(), cashTipsByDate = new Map();
  for (const s of sessions) {
    sessionsById.set(s.id, s);
    if (!sessionsByDate.has(s.date)) sessionsByDate.set(s.date, []);
    sessionsByDate.get(s.date).push(s);
  }
  const addRecord = (map, r) => {
    const d = r.businessDate || r.date;
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(r);
    if (r.manualSessionId) {
      if (!recordsBySession.has(r.manualSessionId)) recordsBySession.set(r.manualSessionId, []);
      recordsBySession.get(r.manualSessionId).push(r);
    }
  };
  uberBatches.forEach(r => addRecord(uberByDate, r));
  deliverooOrders.forEach(r => addRecord(deliverooByDate, r));
  for (const tip of cashTips) {
    if (tip.sessionId) {
      if (!cashTipsBySession.has(tip.sessionId)) cashTipsBySession.set(tip.sessionId, []);
      cashTipsBySession.get(tip.sessionId).push(tip);
    }
    if (tip.date) {
      if (!cashTipsByDate.has(tip.date)) cashTipsByDate.set(tip.date, []);
      cashTipsByDate.get(tip.date).push(tip);
    }
  }
  return { sessionsByDate, sessionsById, uberByDate, deliverooByDate, recordsBySession, cashTipsBySession, cashTipsByDate };
};

DF.migrateSettingsV5ToV6 = old => ({
  schemaVersion: 6,
  defaultSavingsRule: { mode: "fixed_daily", value: Math.max(0, DF.n(old?.defaultGoal || 25)) },
  weeklySavingsOverrides: {},
  displayMoneyMode: old?.displayMoneyMode === "net" ? "net" : "gross",
  theme: old?.theme || "system",
  hideMoney: !!old?.hideMoney,
  fuelPriceHistory: [{ effectiveFrom: "2026-08-18", pricePerL: Math.max(0, DF.n(old?.fuelPrice || 2.2)), source: "v5-migration" }],
  consumptionHistory: [{ effectiveFrom: "2026-08-18", litresPer100km: Math.max(0, DF.n(old?.fuelConsumption || 5.5)), source: "v5-migration" }],
  urssafEnabled: false,
  urssafRatePct: DF.URSSAF_PRESETS.standard_bic_service.rate,
  urssafRateHistory: [],
  goalOverridesLegacy: old?.goalOverrides || {},
  uberImport: old?.uberImport || {},
  historyImport: old?.historyImport || {}
});

if (typeof module !== "undefined" && module.exports) module.exports = DF;
else globalThis.DriveFlowV6Core = DF;
})();