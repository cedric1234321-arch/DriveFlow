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

MIG.migrateBackupV5ToV6 = (backup, migrationDate = "2026-08-18") => {
  if (!backup || !Array.isArray(backup.sessions)) throw new Error("Sauvegarde DriveFlow invalide");
  const settings = DF.migrateSettingsV5ToV6(backup.settings || {});
  settings.fuelPriceHistory[0].effectiveFrom = migrationDate;
  settings.consumptionHistory[0].effectiveFrom = migrationDate;
  settings.dailySavingsOverrides = { ...(backup.settings?.goalOverrides || {}) };

  const sessions = backup.sessions.map(s => ({ ...s }));
  const cashTips = sessions.flatMap(MIG.parseCashTipsFromNote);

  return {
    version: 6,
    schemaVersion: 6,
    migratedFromVersion: backup.version || 5,
    migratedAt: null,
    sessions,
    uberBatches: Array.isArray(backup.uberBatches) ? backup.uberBatches.map(x => ({ ...x })) : [],
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
  cashTipsAmount: DF.round2((after?.cashTips || []).reduce((a,x)=>a+DF.n(x.amount),0))
});

if (typeof module !== "undefined" && module.exports) module.exports = MIG;
else globalThis.DriveFlowV6Migration = MIG;
})();