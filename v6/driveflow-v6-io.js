(() => {
"use strict";

const DF = typeof module !== "undefined" && module.exports
  ? require("./driveflow-v6-core.js")
  : globalThis.DriveFlowV6Core;
const IO = {};

IO.pad=x=>String(x).padStart(2,"0");
IO.uid=(p="id")=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
IO.parseCsvLine=(line,sep)=>{const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===sep&&!q){out.push(cur);cur="";}else cur+=ch;}out.push(cur);return out;};
IO.parseCSV=text=>{
  const lines=String(text||"").replace(/^\uFEFF/,"").replace(/\r/g,"").split("\n").filter(x=>x.trim());if(!lines.length)return[];
  const commas=IO.parseCsvLine(lines[0],",").length,semis=IO.parseCsvLine(lines[0],";").length,sep=semis>commas?";":",";
  const headers=IO.parseCsvLine(lines[0],sep).map(h=>h.trim());
  return lines.slice(1).map(line=>{const vals=IO.parseCsvLine(line,sep),o={};headers.forEach((h,i)=>o[h]=(vals[i]??"").trim());return o;});
};
IO.normalizeDate=v=>{v=String(v||"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${IO.pad(m[2])}-${IO.pad(m[1])}`:"";};
IO.normalizeDateTime=v=>{const m=String(v||"").trim().replace("T"," ").match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?/);return m?`${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]||"00"}`:"";};
IO.businessDateFromTimestamp=ts=>{const m=String(ts||"").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);if(!m)return"";const d=new Date(+m[1],+m[2]-1,+m[3],12);if(+m[4]<4)d.setDate(d.getDate()-1);return `${d.getFullYear()}-${IO.pad(d.getMonth()+1)}-${IO.pad(d.getDate())}`;};
IO.businessMinute=t=>{if(!t)return null;const [h,m]=String(t).split(":").map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return null;let v=h*60+m;if(v<240)v+=1440;return v-240;};
IO.sessionMinute=s=>({start:IO.businessMinute(s?.start),end:IO.businessMinute(s?.end)});
IO.pauseMinutes=s=>{if(s?.pauseMinutesTotal!==undefined&&s?.pauseMinutesTotal!==null&&s?.pauseMinutesTotal!=="")return Math.max(0,DF.n(s.pauseMinutesTotal));if(!s?.pauseStart||!s?.pauseEnd)return 0;const a=IO.businessMinute(s.pauseStart),b=IO.businessMinute(s.pauseEnd);return a!=null&&b!=null&&b>a?b-a:0;};

IO.validateSession=(s,allSessions=[],minGap=30)=>{
  if(!s?.date||!s?.start||!s?.end)return"Renseigne la date, l’heure de début et l’heure de fin.";
  const {start:a,end:b}=IO.sessionMinute(s);if(a==null||b==null||b<=a)return"La fin de session doit être postérieure au début.";
  if((s.pauseStart&&!s.pauseEnd)||(!s.pauseStart&&s.pauseEnd))return"Renseigne le début et la fin de la pause, ou laisse les deux champs vides.";
  if(s.pauseStart&&s.pauseEnd){const ps=IO.businessMinute(s.pauseStart),pe=IO.businessMinute(s.pauseEnd);if(pe<=ps||ps<a||pe>b)return"La pause doit se trouver entièrement à l’intérieur de la session.";}
  if(IO.pauseMinutes(s)>b-a)return"La durée des pauses ne peut pas dépasser la durée de la session.";
  const os=s.odoStart!==null&&s.odoStart!==undefined&&s.odoStart!=="",oe=s.odoEnd!==null&&s.odoEnd!==undefined&&s.odoEnd!=="";
  if(os!==oe)return"Renseigne les deux kilométrages, départ et arrivée.";
  if(os&&DF.n(s.odoEnd)<DF.n(s.odoStart))return"Le kilométrage d’arrivée ne peut pas être inférieur au kilométrage de départ.";
  for(const o of allSessions.filter(x=>x?.date===s.date&&x.id!==s.id&&x.autoHistorical!==true)){
    const om=IO.sessionMinute(o);if(om.start==null||om.end==null)continue;
    if(!(b+minGap<=om.start||a>=om.end+minGap))return`Garde au moins ${minGap} minutes entre deux sessions.`;
  }
  return"";
};
IO.upsertSession=(state,session)=>{
  const err=IO.validateSession(session,state.sessions||[]);if(err)throw new Error(err);
  state.sessions ||= [];const i=state.sessions.findIndex(x=>x.id===session.id);const next={...session,id:session.id||IO.uid("session")};
  if(i>=0)state.sessions[i]=next;else state.sessions.push(next);return next;
};
IO.deleteSession=(state,id)=>{
  state.sessions=(state.sessions||[]).filter(x=>x.id!==id);
  for(const r of state.uberBatches||[])if(r.manualSessionId===id)r.manualSessionId=null;
  for(const r of state.deliverooOrders||[])if(r.manualSessionId===id)r.manualSessionId=null;
  for(const t of state.cashTips||[])if(t.sessionId===id)t.sessionId=null;
};

IO.importUberRows=(state,rows)=>{
  const required=["Trip UUID","Local Amount","Classification","Category","Local Timestamp"],headers=rows[0]?Object.keys(rows[0]):[];
  const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Colonnes Uber manquantes : ${missing.join(", ")}`);
  const old=new Map((state.uberBatches||[]).map(x=>[x.id,x])),groups=new Map();
  rows.forEach((r,idx)=>{const raw=String(r["Trip UUID"]||"").trim(),key=raw||`standalone:${r["Local Timestamp"]||""}:${r["Classification"]||""}:${idx}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
  const fresh=[];
  groups.forEach((rs,uuid)=>{
    const base=rs.filter(r=>r["Classification"]==="delivery.fare.upfront_base"),total=rs.reduce((a,r)=>a+DF.n(r["Local Amount"]),0),fare=base.reduce((a,r)=>a+DF.n(r["Local Amount"]),0);
    const tips=rs.filter(r=>r["Category"]==="tip"||r["Classification"]==="transport.misc.tip").reduce((a,r)=>a+DF.n(r["Local Amount"]),0);
    const timestamp=(base[0]||rs[0])["Local Timestamp"],id=`uber:${uuid}`,prev=old.get(id);
    fresh.push({id,tripUUID:uuid,platform:"uber",timestamp,businessDate:IO.businessDateFromTimestamp(timestamp),city:(base[0]||rs[0])["City Name"]||"",total,fare,tips,other:total-fare-tips,orderCount:base.length,orderValues:base.map(r=>DF.n(r["Local Amount"])),paymentRows:rs.length,manualSessionId:prev?.manualSessionId||null});
  });
  fresh.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));state.uberBatches=fresh;
  const dates=fresh.map(x=>x.businessDate).filter(Boolean).sort();state.settings ||= {};state.settings.uberImport={minDate:dates[0]||null,maxDate:dates.at(-1)||null,importedAt:new Date().toISOString(),rows:rows.length};
  return {groups:fresh.length,orders:fresh.reduce((a,x)=>a+DF.n(x.orderCount),0),minDate:dates[0]||null,maxDate:dates.at(-1)||null};
};

IO.importDeliverooRows=(state,rows)=>{
  const required=["date","time","earnings","order_count","merchant"],headers=rows[0]?Object.keys(rows[0]).map(x=>x.toLowerCase()):[];
  const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Colonnes Deliveroo manquantes : ${missing.join(", ")}`);
  state.deliverooOrders ||= [];const old=new Map(state.deliverooOrders.map(x=>[x.id,x]));let added=0,updated=0,skipped=0;
  rows.forEach(raw=>{
    const r={};Object.keys(raw).forEach(k=>r[k.toLowerCase()]=raw[k]);const date=IO.normalizeDate(r.date),time=String(r.time||"").trim().slice(0,5),merchant=String(r.merchant||"").trim();
    if(!date||!/^\d{2}:\d{2}$/.test(time)||!merchant){skipped++;return;}
    const earn=DF.n(r.earnings),count=Math.max(1,Math.round(DF.n(r.order_count))),key=(r.external_id||`${date}|${time}|${merchant}|${count}`).toLowerCase().replace(/\s+/g," ").trim(),id=`deliveroo:${key}`,prev=old.get(id),timestamp=`${date} ${time}:00`;
    const obj={id,platform:"deliveroo",timestamp,businessDate:IO.businessDateFromTimestamp(timestamp),earnings:earn,orderCount:count,merchant,notes:r.notes||"",manualSessionId:prev?.manualSessionId||null};
    if(prev){if(Math.abs(DF.n(prev.earnings)-earn)>.001||DF.n(prev.orderCount)!==count)updated++;Object.assign(prev,obj);}else{state.deliverooOrders.push(obj);old.set(id,obj);added++;}
  });
  state.deliverooOrders.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));return{added,updated,skipped,total:state.deliverooOrders.length};
};

IO.timestampMinutes=ts=>{const m=String(ts||"").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);if(!m)return null;return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)).getTime()/60000;};
IO.historyRelativeMinute=(date,ts)=>{const b=IO.timestampMinutes(`${date} 04:00:00`),x=IO.timestampMinutes(ts);return b==null||x==null?null:Math.round(x-b);};
IO.timeFromTimestamp=ts=>{const m=String(ts||"").match(/[ T](\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"";};
IO.importHistoryRows=(state,rows)=>{
  const required=["session_id","date","type","start_datetime","end_datetime","pause_minutes","distance_km","distance_source","confidence"],headers=rows[0]?Object.keys(rows[0]).map(x=>x.toLowerCase()):[];
  const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Colonnes historique manquantes : ${missing.join(", ")}`);
  state.sessions ||= [];const existing=new Map(state.sessions.filter(s=>s.historyImported).map(s=>[s.historySourceId,s]));let imported=0,updated=0,invalid=0,protectedEdits=0;
  for(let idx=0;idx<rows.length;idx++){
    const raw=rows[idx],r={};Object.keys(raw).forEach(k=>r[k.toLowerCase()]=raw[k]);const date=IO.normalizeDate(r.date),startTs=IO.normalizeDateTime(r.start_datetime),endTs=IO.normalizeDateTime(r.end_datetime),sourceId=String(r.session_id||`row-${idx+2}`).trim();
    const startAbs=IO.timestampMinutes(startTs),endAbs=IO.timestampMinutes(endTs);if(!date||!sourceId||startAbs==null||endAbs==null||endAbs<=startAbs){invalid++;continue;}
    const prev=existing.get(sourceId);if(prev?.manualEdited){protectedEdits++;continue;}
    const blank=v=>String(v??"").trim()==="";const obj={
      id:prev?.id||`history:${sourceId}`,historySourceId:sourceId,historyImported:true,manualEdited:false,date,type:["Midi","Soir","Autre"].includes(r.type)?r.type:"Autre",start:IO.timeFromTimestamp(startTs),end:IO.timeFromTimestamp(endTs),historyStartTimestamp:startTs,historyEndTimestamp:endTs,historyStartMinute:IO.historyRelativeMinute(date,startTs),historyEndMinute:IO.historyRelativeMinute(date,endTs),pauseStart:"",pauseEnd:"",pauseMinutesTotal:Math.max(0,DF.n(r.pause_minutes)),odoStart:blank(r.odo_start)?null:DF.n(r.odo_start),odoEnd:blank(r.odo_end)?null:DF.n(r.odo_end),distanceKm:blank(r.distance_km)?null:Math.max(0,DF.n(r.distance_km)),distanceSource:String(r.distance_source||"").trim(),confidence:String(r.confidence||"").trim(),fuelConsumptionAtTime:blank(r.fuel_consumption_l100)?null:DF.n(r.fuel_consumption_l100),fuelPriceAtTime:blank(r.fuel_price_eur_l)?null:DF.n(r.fuel_price_eur_l),timeSource:String(r.time_source||"").trim(),historyExpectedOrders:blank(r.orders_total)?null:DF.n(r.orders_total),historyExpectedEarnings:blank(r.earnings_total)?null:DF.n(r.earnings_total),manualUber:0,manualUberOrders:0,manualDeliveroo:0,manualDeliverooOrders:0,note:String(r.note||"").trim()
    };
    if(prev){Object.assign(prev,obj);updated++;}else{state.sessions.push(obj);existing.set(sourceId,obj);imported++;}
  }
  state.settings ||= {};state.settings.historyImport={...(state.settings.historyImport||{}),importedAt:new Date().toISOString(),rows:rows.length,imported:imported+updated};
  return{imported,updated,invalid,protectedEdits};
};

IO.validateBackup=backup=>{
  if(!backup||Number(backup.schemaVersion)!==6||!Array.isArray(backup.sessions)||!Array.isArray(backup.uberBatches)||!Array.isArray(backup.deliverooOrders))throw new Error("Sauvegarde DriveFlow V6 invalide.");
  return true;
};
IO.restoreBackup=backup=>{IO.validateBackup(backup);return JSON.parse(JSON.stringify({...backup,cashTips:Array.isArray(backup.cashTips)?backup.cashTips:[],weeklyPlans:Array.isArray(backup.weeklyPlans)?backup.weeklyPlans:[]}));};

if(typeof module!=="undefined"&&module.exports)module.exports=IO;else globalThis.DriveFlowV6IO=IO;
})();