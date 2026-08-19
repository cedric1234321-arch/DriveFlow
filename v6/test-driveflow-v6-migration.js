const assert=require('assert');
const MIG=require('./driveflow-v6-migration.js');

const backup={
  version:5,
  sessions:[
    {id:'paris',date:'2026-08-01',start:'18:00',end:'20:00',historyImported:false,note:''},
    {id:'local-night',date:'2026-08-02',start:'23:00',end:'02:00',historyImported:false,note:'10€ de pourboires Uber en espèces'},
    {id:'unknown',date:'2026-08-03',start:'12:00',end:'13:00',historyImported:false,note:''}
  ],
  uberBatches:[
    {id:'u1',timestamp:'2026-08-01 18:30:00',city:'Paris',orderCount:1,manualSessionId:null},
    {id:'u2',timestamp:'2026-08-03 00:30:00',city:'Montpellier',orderCount:2,manualSessionId:null}
  ],
  deliverooOrders:[],
  settings:{defaultGoal:25,fuelConsumption:6,fuelPrice:2.2,goalOverrides:{'2026-08-03':0}}
};
const out=MIG.migrateBackupV5ToV6(backup,'2026-08-19');
assert.equal(out.sessions.length,3);
assert.equal(out.sessions.find(s=>s.id==='paris').city,'Paris');
assert.equal(out.sessions.find(s=>s.id==='local-night').city,'Montpellier');
assert.equal(out.sessions.find(s=>s.id==='unknown').city,undefined);
assert.equal(out.cashTips.length,1);
assert.equal(out.cashTips[0].amount,10);
assert.equal(out.cashTips[0].platform,'uber');
assert.equal(out.settings.dailySavingsOverrides['2026-08-03'],0);
assert.equal(out.settings.fuelPriceHistory[0].effectiveFrom,'2026-08-01');
console.log('DriveFlow V6 migration tests passed');
