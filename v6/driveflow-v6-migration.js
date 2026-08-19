(() => {
"use strict";

const DF = typeof module !== "undefined" && module.exports
  ? require("./driveflow-v6-core.js")
  : globalThis.DriveFlowV6Core;

const MIG = {};

MIG.parseCashTipsFromNote = (session) => {
  const note = String(session?.note || "").trim();
  if (!note || !/pourboir/i.test(note) || !/esp[eè]ces/i.test(note)) return [];
  const amountMatch = note.match(/(\d+(?:[.,]\d{1,2})?)\s*€/i) || note.match(/€\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (!amountMatch) return [];
  const amount = DF.n(amountMatch[1]);
  if (!(amount > 0)) return [];
  let platform = null;
  if (/uber/i.test(note)) platform = "uber";
  else if (/deliveroo/i.test(note)) platform = "deliveroo";
  if (!platform) return [];
  return [{
    id: `tip_migrated_${session.id}`,
    sessionId: session.id,
    date: session.date,
    amount,
    platform,
    source: "v5-note-migration",
    createdAt: null,
    note: "Migré depuis la note V5"
  }];
};

MIG.addDaysIso = (date, days) => {
  const [y,m,d]=String(date||"").split("-").map(Number);
  if(!y||!m||!d)return String(date||"");
  const x=new Date(Date.UTC(y,m-1,d+days));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;
};
MIG.sessionBounds = session => {
  if(session?.historyStartTimestamp&&session?.historyEndTimestamp){
    return {start:String(session.historyStartTimestamp).replace("T"," ").slice(0,19),end:String(session.historyEndTimestamp).replace("T"," ").slice(0,19)};
  }
  if(!session?.date||!session?.start||!session?.end)return null;
  const toSeconds=t=>/^\d{1,2}:\d{2}$/.test(String(t))?`${String(t).padStart(5,"0")}:00`:null;
  const st=toSeconds(session.start),en=toSeconds(session.end);if(!st||!en)return null;
  const sh=Number(String(session.start).split(":")[0]),eh=Number(String(session.end).split(":")[0]);
  const startDate=sh<4?MIG.addDaysIso(session.date,1):session.date;
  let endDate=eh<4?MIG.addDaysIso(session.date,1):session.date;
  const start=`${startDate} ${st}`;let end=`${endDate} ${en}`;
  if(end<=start){endDate=MIG.addDaysIso(endDate,1);end=`${endDate} ${en}`;}
  return {start,end};
};
MIG.inferSessionCity = (session, uberBatches) => {
  const bounds=MIG.sessionBounds(session),counts=new Map();
  for(const r of uberBatches||[]){
    let match=r?.manualSessionId===session?.id;
    if(!match&&bounds&&!r?.manualSessionId){const t=String(r?.timestamp||"").replace("T"," ").slice(0,19);match=!!t&&t>=bounds.start&&t<=bounds.end;}
    if(!match)continue;
    const city=String(r?.city||"").trim();if(!city)continue;
    counts.set(city,(counts.get(city)||0)+Math.max(1,DF.n(r?.orderCount)));
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
};

MIG.migrateBackupV5ToV6 = (backup, migrationDate = "2026-08-18") => {
  if (!backup || !Array.isArray(backup.sessions)) throw new Error("Sauvegarde DriveFlow invalide");
  const uberBatches=Array.isArray(backup.uberBatches)?backup.uberBatches.map(x=>({...x})):[];
  const sessions = backup.sessions.map(s => {
    const copy={...s};
    const city=copy.city||MIG.inferSessionCity(copy,uberBatches);
    if(city)copy.city=city;
    return copy;
  });
  // V5 had one global fuel setting. Historical-import sessions already carry their
  // own snapshots, so the safest migration is to apply the V5 global value from
  // the first non-historical session onward rather than only from migration day.
  const firstCurrentEraDate = sessions
    .filter(s => s?.date && s.historyImported !== true && s.autoHistorical !== true)
    .map(s => s.date).sort()[0] || migrationDate;
  const settings = DF.migrateSettingsV5ToV6(backup.settings || {});
  settings.fuelPriceHistory[0].effectiveFrom = firstCurrentEraDate;
  settings.consumptionHistory[0].effectiveFrom = firstCurrentEraDate;
  settings.dailySavingsOverrides = { ...(backup.settings?.goalOverrides || {}) };

  const cashTips = sessions.flatMap(MIG.parseCashTipsFromNote);

  return {
    version: 6,
    schemaVersion: 6,
    migratedFromVersion: backup.version || 5,
    migratedAt: null,
    sessions,
    uberBatches,
    deliverooOrders: Array.isArray(backup.deliverooOrders) ? backup.deliverooOrders.map(x => ({ ...x })) : [],
    cashTips,
    weeklyPlans: [],
    settings
  };
};

MIG.auditMigration = (before, after) => ({
  sessionsBefore: before?.sessions?.length || 0,
  sessionsAfter: after?.sessions?.length || 0,
  uberBefore: before?.uberBatches?.length || 0,
  uberAfter: after?.uberBatches?.length || 0,
  deliverooBefore: before?.deliverooOrders?.length || 0,
  deliverooAfter: after?.deliverooOrders?.length || 0,
  cashTipsCreated: after?.cashTips?.length || 0,
  cashTipsAmount: DF.round2((after?.cashTips || []).reduce((a,x)=>a+DF.n(x.amount),0)),
  fuelSettingsEffectiveFrom: after?.settings?.fuelPriceHistory?.[0]?.effectiveFrom || null,
  cities: (after?.sessions||[]).reduce((acc,s)=>{const c=String(s?.city||"Unknown");acc[c]=(acc[c]||0)+1;return acc;},{})
});

if (typeof module !== "undefined" && module.exports) module.exports = MIG;
else globalThis.DriveFlowV6Migration = MIG;
})();