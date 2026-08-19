(() => {
"use strict";

/* DriveFlow V6 weather adapter for Open-Meteo.
   No API key is stored. Historical and forecast calls are separated. */

const WX = {};
WX.DEFAULT_LOCATION = Object.freeze({ name: "Montpellier", latitude: 43.6109, longitude: 3.8763, timezone: "Europe/Paris" });
WX.HOURLY_VARS = Object.freeze([
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "weather_code",
  "wind_speed_10m",
  "wind_gusts_10m"
]);

WX.buildUrl = ({ mode = "archive", startDate, endDate, location = WX.DEFAULT_LOCATION }) => {
  const base = mode === "forecast" ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
  const p = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: WX.HOURLY_VARS.join(","),
    timezone: location.timezone || "Europe/Paris"
  });
  if (startDate) p.set("start_date", startDate);
  if (endDate) p.set("end_date", endDate);
  return `${base}?${p.toString()}`;
};

WX.normalizeHourly = payload => {
  const h = payload?.hourly || {};
  const times = Array.isArray(h.time) ? h.time : [];
  return times.map((time, i) => ({
    time,
    temperature: Number(h.temperature_2m?.[i]),
    apparentTemperature: Number(h.apparent_temperature?.[i]),
    precipitation: Number(h.precipitation?.[i]) || 0,
    rain: Number(h.rain?.[i]) || 0,
    weatherCode: Number(h.weather_code?.[i]),
    windSpeed: Number(h.wind_speed_10m?.[i]) || 0,
    windGusts: Number(h.wind_gusts_10m?.[i]) || 0
  }));
};

// Convert a local ISO timestamp to a timezone-agnostic minute index. We must not
// let the device's current timezone alter Europe/Paris historical clock values.
WX.localMinute = value => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) / 60000;
};
WX.overlapHours = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / 60;
WX.weightedMode = pairs => {
  const counts = new Map();
  let best = null, bestW = -1;
  for (const [value, weight] of pairs || []) {
    if (!Number.isFinite(value) || !(weight > 0)) continue;
    const w = (counts.get(value) || 0) + weight;
    counts.set(value, w);
    if (w > bestW) { best = value; bestW = w; }
  }
  return best;
};

WX.aggregateInterval = (rows, startIsoLocal, endIsoLocal) => {
  const start = WX.localMinute(startIsoLocal), end = WX.localMinute(endIsoLocal);
  if (start == null || end == null || end <= start) return null;

  const instant = [], precip = [];
  for (const row of rows || []) {
    const t = WX.localMinute(row.time);
    if (t == null) continue;

    // Instantaneous variables are approximated over the clock hour starting at t.
    // This gives short sessions (e.g. 12:10–12:55) a usable weather context.
    const wi = WX.overlapHours(start, end, t, t + 60);
    if (wi > 0) instant.push({ row, weight: wi });

    // Open-Meteo precipitation/rain are sums of the preceding hour, so the value
    // timestamped at t is apportioned over [t-60, t).
    const wp = WX.overlapHours(start, end, t - 60, t);
    if (wp > 0) precip.push({ row, weight: wp });
  }
  if (!instant.length) return null;

  const weightedAverage = key => {
    let sw = 0, sx = 0;
    for (const x of instant) {
      const v = Number(x.row[key]);
      if (!Number.isFinite(v)) continue;
      sw += x.weight; sx += v * x.weight;
    }
    return sw ? sx / sw : null;
  };
  const precipitationMm = precip.reduce((a,x)=>a+(Number(x.row.precipitation)||0)*x.weight,0);
  const rainMm = precip.reduce((a,x)=>a+(Number(x.row.rain)||0)*x.weight,0);
  const rainHours = precip.reduce((a,x)=>a+((Number(x.row.rain)>0||Number(x.row.precipitation)>0)?x.weight:0),0);
  const gusts = instant.map(x=>Number(x.row.windGusts)).filter(Number.isFinite);

  return {
    hours: (end - start) / 60,
    weatherObservationHours: instant.reduce((a,x)=>a+x.weight,0),
    temperatureAvg: weightedAverage("temperature"),
    apparentTemperatureAvg: weightedAverage("apparentTemperature"),
    precipitationMm,
    rainMm,
    rainHours,
    windSpeedAvg: weightedAverage("windSpeed"),
    windGustMax: gusts.length ? Math.max(...gusts) : null,
    dominantWeatherCode: WX.weightedMode(instant.map(x=>[Number(x.row.weatherCode),x.weight]))
  };
};

WX.mode = values => {
  const counts = new Map();
  let best = null, bestN = -1;
  for (const v of values || []) {
    const n=(counts.get(v)||0)+1; counts.set(v,n);
    if(n>bestN){best=v;bestN=n;}
  }
  return best;
};

WX.similarity = (a, b) => {
  if (!a || !b) return 1;
  const exp = x => Math.exp(-0.5*x*x);
  const temp = exp(((Number(a.temperatureAvg)||0)-(Number(b.temperatureAvg)||0))/8);
  const rainA = Math.log1p(Number(a.precipitationMm)||0), rainB=Math.log1p(Number(b.precipitationMm)||0);
  const rain = exp((rainA-rainB)/1.2);
  const wind = exp(((Number(a.windSpeedAvg)||0)-(Number(b.windSpeedAvg)||0))/15);
  return Math.max(0.15, temp*rain*wind);
};

WX.fetchJson = async url => {
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  return r.json();
};

WX.fetchArchive = async ({ startDate, endDate, location = WX.DEFAULT_LOCATION }) => {
  const url = WX.buildUrl({ mode:"archive", startDate, endDate, location });
  return WX.normalizeHourly(await WX.fetchJson(url));
};
WX.fetchForecast = async ({ startDate, endDate, location = WX.DEFAULT_LOCATION }) => {
  const url = WX.buildUrl({ mode:"forecast", startDate, endDate, location });
  return WX.normalizeHourly(await WX.fetchJson(url));
};

if (typeof module !== "undefined" && module.exports) module.exports = WX;
else globalThis.DriveFlowV6Weather = WX;
})();