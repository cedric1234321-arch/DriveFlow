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

WX.aggregateInterval = (rows, startIsoLocal, endIsoLocal) => {
  const selected = (rows || []).filter(r => r.time >= startIsoLocal && r.time < endIsoLocal);
  if (!selected.length) return null;
  const finite = arr => arr.filter(Number.isFinite);
  const avg = arr => { const x=finite(arr); return x.length ? x.reduce((a,b)=>a+b,0)/x.length : null; };
  return {
    hours: selected.length,
    temperatureAvg: avg(selected.map(x=>x.temperature)),
    apparentTemperatureAvg: avg(selected.map(x=>x.apparentTemperature)),
    precipitationMm: selected.reduce((a,x)=>a+x.precipitation,0),
    rainMm: selected.reduce((a,x)=>a+x.rain,0),
    rainHours: selected.filter(x=>x.rain>0 || x.precipitation>0).length,
    windSpeedAvg: avg(selected.map(x=>x.windSpeed)),
    windGustMax: Math.max(...selected.map(x=>x.windGusts)),
    dominantWeatherCode: WX.mode(selected.map(x=>x.weatherCode).filter(Number.isFinite))
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