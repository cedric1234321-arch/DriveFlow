const assert=require('assert');
const IO=require('./driveflow-v6-io.js');
require('./driveflow-v6-backup-compat.js');

// Session rules: cross-midnight within the 04:00 business day, pauses, odometers and gap.
const existing=[{id:'a',date:'2026-08-19',start:'18:00',end:'20:00',autoHistorical:false}];
assert.equal(IO.validateSession({id:'b',date:'2026-08-19',start:'20:30',end:'22:00',odoStart:100,odoEnd:120},existing),'');
assert(IO.validateSession({id:'b',date:'2026-08-19',start:'20:20',end:'22:00',odoStart:100,odoEnd:120},existing).includes('30 minutes'));
assert.equal(IO.validateSession({id:'night',date:'2026-08-19',start:'23:30',end:'02:00',odoStart:100,odoEnd:120},[]),'');
assert(IO.validateSession({id:'odo',date:'2026-08-19',start:'18:00',end:'19:00',odoStart:120,odoEnd:100},[]).includes('kilométrage'));
assert(IO.validateSession({id:'pause',date:'2026-08-19',start:'18:00',end:'20:00',pauseStart:'17:30',pauseEnd:'18:30'},[]).includes('pause'));

// Uber snapshot: replacing official rows must preserve manual session classifications by stable trip id.
const uberState={uberBatches:[{id:'uber:t1',manualSessionId:'s1'}],settings:{}};
const uberRows=[
  {'Trip UUID':'t1','Local Amount':'8.00','Classification':'delivery.fare.upfront_base','Category':'fare','Local Timestamp':'2026-08-19 19:00:00','City Name':'Montpellier'},
  {'Trip UUID':'t1','Local Amount':'2.00','Classification':'transport.misc.tip','Category':'tip','Local Timestamp':'2026-08-19 19:00:00','City Name':'Montpellier'},
  {'Trip UUID':'t2','Local Amount':'7.50','Classification':'delivery.fare.upfront_base','Category':'fare','Local Timestamp':'2026-08-19 20:00:00','City Name':'Montpellier'}
];
const ur=IO.importUberRows(uberState,uberRows);
assert.equal(ur.groups,2);
assert.equal(ur.orders,2);
assert.equal(uberState.uberBatches.find(x=>x.id==='uber:t1').total,10);
assert.equal(uberState.uberBatches.find(x=>x.id==='uber:t1').manualSessionId,'s1');
assert.equal(uberState.settings.uberImport.minDate,'2026-08-19');

// Deliveroo is an idempotent upsert, not a destructive snapshot.
const delState={deliverooOrders:[]};
const d1=[{date:'19/08/2026',time:'19:30',earnings:'8,50',order_count:'1',merchant:'Test Food',notes:''}];
let dr=IO.importDeliverooRows(delState,d1);assert.equal(dr.added,1);assert.equal(dr.updated,0);
dr=IO.importDeliverooRows(delState,d1);assert.equal(dr.added,0);assert.equal(delState.deliverooOrders.length,1);
const d2=[{...d1[0],earnings:'9,20'}];dr=IO.importDeliverooRows(delState,d2);assert.equal(dr.updated,1);assert.equal(delState.deliverooOrders[0].earnings,9.2);

// Historical import must not overwrite a manually corrected imported session.
const histState={sessions:[{id:'history:x',historyImported:true,historySourceId:'x',manualEdited:true,start:'18:10'}],settings:{}};
const historyRows=[{session_id:'x',date:'19/08/2026',type:'Soir',start_datetime:'2026-08-19 18:00:00',end_datetime:'2026-08-19 20:00:00',pause_minutes:'0',distance_km:'20',distance_source:'ESTIMATED',confidence:'Estimated'}];
const hr=IO.importHistoryRows(histState,historyRows);assert.equal(hr.protectedEdits,1);assert.equal(histState.sessions[0].start,'18:10');

// V6 backup restore is a defensive deep clone and fills optional collections.
const backup={schemaVersion:6,sessions:[{id:'s'}],uberBatches:[],deliverooOrders:[],settings:{x:1}};
const restored=IO.restoreBackup(backup);assert.deepEqual(restored.cashTips,[]);assert.deepEqual(restored.weeklyPlans,[]);restored.sessions[0].id='changed';assert.equal(backup.sessions[0].id,'s');

// A backup exported by the current production V5 must restore directly in V6.
const v5={
  version:5,
  sessions:[{id:'v5s',date:'2026-08-18',start:'18:00',end:'20:00',note:'10€ de pourboires Uber en espèces'}],
  uberBatches:[{id:'u',timestamp:'2026-08-18 19:00:00',businessDate:'2026-08-18',city:'Montpellier',total:20,orderCount:2}],
  deliverooOrders:[],
  settings:{defaultGoal:25,fuelConsumption:6,fuelPrice:2.2,goalOverrides:{}}
};
const migrated=IO.restoreBackup(v5);
assert.equal(migrated.schemaVersion,6);
assert.equal(migrated.sessions.length,1);
assert.equal(migrated.uberBatches.length,1);
assert.equal(migrated.cashTips.length,1);
assert.equal(migrated.cashTips[0].amount,10);
assert.deepEqual(migrated.weatherBySessionId,{});
assert.throws(()=>IO.restoreBackup({version:3,sessions:[]}),/non reconnue/i);

console.log('DriveFlow V6 IO regression tests passed');
