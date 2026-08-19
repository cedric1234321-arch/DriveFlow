(() => {
"use strict";

const DATA=globalThis.DriveFlowV6Data;
if(!DATA)return;

const WF={cache:new Map(),busy:false};
WF.pad=n=>String(n).padStart(2,"0");
WF.dates=()=>DATA.nextWeekDates(DATA.businessToday());
WF.hour=v=>{const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?Number(m[1])+Number(m[2])/60:null;};
WF.rainCode=c=>{
  c=Number(c);
  return (c>=51&&c<=67)||(c>=80&&c<=82)||(c>=95&&c<=99);
};
WF.thunderCode=c=>Number(c)>=95&&Number(c)<=99;
WF.url=(start,end)=>{
  const p=new URLSearchParams({
    latitude:"43.6109",
    longitude:"3.8763",
    start_date:start,
    end_date:end,
    hourly:"temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m",
    timezone:"Europe/Paris"
  });
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
};
WF.fetch=async dates=>{
  const key=`${dates[0]}|${dates.at(-1)}`;
  if(WF.cache.has(key))return WF.cache.get(key);
  const r=await fetch(WF.url(dates[0],dates.at(-1)),{headers:{Accept:"application/json"},cache:"no-store"});
  if(!r.ok)throw new Error(`Open-Meteo HTTP ${r.status}`);
  const p=await r.json(),h=p?.hourly||{},times=Array.isArray(h.time)?h.time:[];
  const rows=times.map((time,i)=>({
    time,
    temperature:Number(h.temperature_2m?.[i]),
    apparentTemperature:Number(h.apparent_temperature?.[i]),
    precipitationProbability:Number(h.precipitation_probability?.[i])||0,
    precipitation:Number(h.precipitation?.[i])||0,
    rain:Number(h.rain?.[i])||0,
    weatherCode:Number(h.weather_code?.[i]),
    windSpeed:Number(h.wind_speed_10m?.[i])||0,
    windGusts:Number(h.wind_gusts_10m?.[i])||0
  }));
  WF.cache.set(key,rows);return rows;
};
WF.summary=(rows,date)=>{
  // DriveFlow is a delivery tool: summarize the useful delivery day, 10:00–24:00,
  // instead of accidentally using only the first midday candidate.
  const day=rows.filter(x=>String(x.time).startsWith(date));
  const work=day.filter(x=>{const h=WF.hour(x.time);return h!=null&&h>=10&&h<24;});
  const src=work.length?work:day;if(!src.length)return null;
  const rainRows=src.filter(x=>x.rain>=0.05||x.precipitation>=0.05||WF.rainCode(x.weatherCode));
  const rainMm=src.reduce((a,x)=>a+Math.max(0,x.rain),0);
  const precipMm=src.reduce((a,x)=>a+Math.max(0,x.precipitation),0);
  const maxProb=Math.max(0,...src.map(x=>x.precipitationProbability||0));
  const temps=src.map(x=>x.temperature).filter(Number.isFinite),winds=src.map(x=>x.windSpeed).filter(Number.isFinite);
  const codes=src.map(x=>x.weatherCode).filter(Number.isFinite);
  const thunder=src.some(x=>WF.thunderCode(x.weatherCode));
  let rainWindow="";
  if(rainRows.length){
    const hs=rainRows.map(x=>Math.floor(WF.hour(x.time))).filter(Number.isFinite);
    if(hs.length)rainWindow=`${Math.min(...hs)}h–${Math.min(24,Math.max(...hs)+1)}h`;
  }
  let icon="☀️";
  if(thunder)icon="⛈️";
  else if(rainMm>=0.1||precipMm>=0.1||rainRows.length)icon="🌧️";
  else if(maxProb>=30)icon="🌦️";
  else if(codes.some(c=>c===3))icon="☁️";
  else if(codes.some(c=>c===2))icon="🌤️";
  const minTemp=temps.length?Math.round(Math.min(...temps)):null,maxTemp=temps.length?Math.round(Math.max(...temps)):null;
  const wind=winds.length?Math.round(winds.reduce((a,b)=>a+b,0)/winds.length):0;
  return {date,icon,rainMm,precipMm,maxProb,rainWindow,minTemp,maxTemp,wind};
};
WF.dayHtml=s=>{
  if(!s)return '<div class="weather-day"><strong>—</strong><span>—</span><small>Indisponible</small></div>';
  const label=new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric"}).format(DATA.parseDate(s.date));
  let detail;
  if(s.rainMm>=0.1||s.precipMm>=0.1)detail=`${Math.max(s.rainMm,s.precipMm).toFixed(1)} mm${s.rainWindow?` · ${s.rainWindow}`:""}`;
  else if(s.maxProb>=30)detail=`Risque pluie ${Math.round(s.maxProb)} %`;
  else detail=`Vent ${s.wind} km/h`;
  const temp=s.minTemp==null?"—":`${s.minTemp}–${s.maxTemp}°C`;
  return `<div class="weather-day"><strong>${label}</strong><span>${s.icon}</span><small>${temp}<br>${detail}</small></div>`;
};
WF.render=async()=>{
  if(WF.busy)return;
  const view=document.getElementById("optimizationView"),strip=view?.querySelector(".weather-strip");
  if(!strip)return;
  const dates=WF.dates(),key=dates.join("|");
  if(strip.dataset.driveflowForecastKey===key)return;
  WF.busy=true;
  try{
    const rows=await WF.fetch(dates),summaries=dates.slice(0,4).map(d=>WF.summary(rows,d));
    const current=view.querySelector(".weather-strip");if(!current)return;
    current.innerHTML=summaries.map(WF.dayHtml).join("");current.dataset.driveflowForecastKey=key;
    let note=view.querySelector("#v6WeatherForecastSource");
    if(!note){note=document.createElement("div");note.id="v6WeatherForecastSource";note.className="tiny";note.style.margin="-4px 2px 12px";current.after(note);}
    note.textContent="Prévision Open-Meteo actualisée · pluie/risque calculés sur 10h–24h, pas uniquement sur le créneau du midi.";
  }catch(e){
    // Keep the native DriveFlow forecast UI if the dedicated verification call fails.
    console.warn("DriveFlow forecast summary refresh failed",e);
  }finally{WF.busy=false;}
};
WF.schedule=()=>{clearTimeout(WF._t);WF._t=setTimeout(WF.render,80);};
new MutationObserver(WF.schedule).observe(document.getElementById("optimizationView")||document.body,{subtree:true,childList:true});
document.addEventListener("click",e=>{if(e.target.closest?.('[data-nav="optimization"],[data-nav-inline="optimization"]'))WF.schedule();},true);
WF.schedule();
globalThis.DriveFlowV6WeatherForecastUI=WF;
})();