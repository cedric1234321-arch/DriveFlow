(() => {
"use strict";

const isNode=typeof module!=="undefined"&&module.exports;
const IO=isNode?require("./driveflow-v6-io.js"):globalThis.DriveFlowV6IO;
const MIG=isNode?require("./driveflow-v6-migration.js"):globalThis.DriveFlowV6Migration;
if(!IO||!MIG)return;

const clone=value=>JSON.parse(JSON.stringify(value));
const today=()=>{
  const d=new Date();
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};

IO.backupVersion=backup=>Number(backup?.schemaVersion||backup?.version||0);
IO.validateBackup=backup=>{
  const version=IO.backupVersion(backup);
  if(version===6){
    if(!Array.isArray(backup?.sessions)||!Array.isArray(backup?.uberBatches)||!Array.isArray(backup?.deliverooOrders))throw new Error("Sauvegarde DriveFlow V6 invalide.");
    return version;
  }
  if(version===4||version===5){
    if(!Array.isArray(backup?.sessions))throw new Error("Sauvegarde DriveFlow V4/V5 invalide.");
    return version;
  }
  throw new Error("Sauvegarde DriveFlow non reconnue.");
};

IO.restoreBackup=backup=>{
  const version=IO.validateBackup(backup);
  if(version===6){
    return clone({
      ...backup,
      version:6,
      schemaVersion:6,
      cashTips:Array.isArray(backup.cashTips)?backup.cashTips:[],
      weeklyPlans:Array.isArray(backup.weeklyPlans)?backup.weeklyPlans:[],
      weatherBySessionId:backup.weatherBySessionId&&typeof backup.weatherBySessionId==="object"?backup.weatherBySessionId:{},
      weatherMeta:backup.weatherMeta&&typeof backup.weatherMeta==="object"?backup.weatherMeta:{status:"idle",modelEnabled:false}
    });
  }
  const migrated=MIG.migrateBackupV5ToV6(backup,today());
  migrated.migratedAt=new Date().toISOString();
  migrated.weatherBySessionId={};
  migrated.weatherMeta={status:"idle",modelEnabled:false};
  return clone(migrated);
};

if(isNode)module.exports={backupVersion:IO.backupVersion,validateBackup:IO.validateBackup,restoreBackup:IO.restoreBackup};
else globalThis.DriveFlowV6BackupCompat={backupVersion:IO.backupVersion};
})();