const assert=require('assert');

class LocalStorageMock{
  constructor(){this.m=new Map();this.writes=[];}
  getItem(k){return this.m.has(k)?this.m.get(k):null;}
  setItem(k,v){this.m.set(k,String(v));this.writes.push(k);}
  removeItem(k){this.m.delete(k);}
  clear(){this.m.clear();}
}
global.localStorage=new LocalStorageMock();
global.DriveFlowV6Core=require('./driveflow-v6-core.js');
global.DriveFlowV6Migration=require('./driveflow-v6-migration.js');
global.DriveFlowV6Weather=require('./driveflow-v6-weather.js');
const DF=global.DriveFlowV6Core;

// Seed V5 exactly as the V6 browser migration sees it.
const session={id:'s1',date:'2026-08-12',type:'Soir',start:'18:00',end:'21:00',pauseStart:'19:00',pauseEnd:'19:30',odoStart:100,odoEnd:130,manualUber:0,manualUberOrders:0,manualDeliveroo:0,manualDeliverooOrders:0,note:''};
const uber={id:'uber:u1',tripUUID:'u1',timestamp:'2026-08-12 19:00:00',businessDate:'2026-08-12',city:'Montpellier',total:42,orderCount:5,manualSessionId:null};
localStorage.setItem('driveflow.sessions.v4',JSON.stringify([session]));
localStorage.setItem('driveflow.uber.v4',JSON.stringify([uber]));
localStorage.setItem('driveflow.deliveroo.v4','[]');
localStorage.setItem('driveflow.settings.v4',JSON.stringify({fuelConsumption:5.5,fuelPrice:2,uberImport:{minDate:'2026-01-01',maxDate:'2026-08-12',rows:100}}));

global.DriveFlowV6Data=require('./driveflow-v6-data.js');
const DATA=global.DriveFlowV6Data;
require('./driveflow-v6-persistence.js');
require('./driveflow-v6-data-integrity.js');

const state=DATA.load();
assert.equal(state.schemaVersion,6);
assert.equal(state.sessions.length,1);
assert.equal(state.uberBatches.length,1);
assert(localStorage.getItem('driveflow.v6.meta'));
assert(localStorage.getItem('driveflow.v6.sessions'));
assert(localStorage.getItem('driveflow.v6.uber'));
assert.equal(localStorage.getItem('driveflow.state.v6'),null,'unified dev blob should no longer be canonical');

// Manual V5 pause range must reduce active time from 3h to 2h30.
assert.equal(DATA.sessionMinutes(state.sessions[0]),150);

// Official Uber import wins over zero manual amount inside the manual session.
let ctx=DATA.buildContext(state),metrics=DATA.sessionMetrics(state,ctx,state.sessions[0]);
assert.equal(metrics.ca,42);
assert.equal(metrics.orders,5);
assert.equal(metrics.distance,30);

// Split persistence should write only the changed block plus the small meta marker.
localStorage.writes=[];
state.settings.displayMoneyMode='net';
DATA.save(state);
assert(localStorage.writes.includes('driveflow.v6.settings'));
assert(!localStorage.writes.includes('driveflow.v6.uber'));
assert(!localStorage.writes.includes('driveflow.v6.sessions'));

// Cash tip is additive but does not change order count.
state.cashTips.push({id:'tip1',sessionId:'s1',date:'2026-08-12',amount:10,platform:'uber'});
DATA.save(state);ctx=DATA.buildContext(state);metrics=DATA.sessionMetrics(state,ctx,state.sessions[0]);
assert.equal(metrics.ca,52);
assert.equal(metrics.orders,5);

const audit=DATA.auditState(state);
assert.equal(audit.ok,true);
assert.equal(audit.counts.tips,1);

// Removing the V6 marker is the reset signal: split data is rebuilt from untouched V5.
localStorage.removeItem(DATA.KEY);
const reset=DATA.load();
assert.equal(reset.sessions.length,1);
assert.equal(reset.cashTips.length,0);
assert.equal(reset.uberBatches.length,1);

console.log('DriveFlow V6 browserless persistence/data tests passed');