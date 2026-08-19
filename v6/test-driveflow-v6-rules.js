const assert=require('assert');
const DF=require('./driveflow-v6-core.js');

// Weekly savings overrides must affect only their ISO week.
const settings={
  defaultSavingsRule:{mode:'fixed_daily',value:25},
  weeklySavingsOverrides:{
    [DF.isoWeekKey('2026-08-17')]:{mode:'fixed_week',value:150}
  }
};
const inWeek=DF.resolveSavingsRule({defaultRule:settings.defaultSavingsRule,weeklyOverrides:settings.weeklySavingsOverrides},'2026-08-19');
const nextWeek=DF.resolveSavingsRule({defaultRule:settings.defaultSavingsRule,weeklyOverrides:settings.weeklySavingsOverrides},'2026-08-24');
assert.equal(inWeek.mode,'fixed_week');
assert.equal(inWeek.value,150);
assert.equal(inWeek.source,'week');
assert.equal(nextWeek.mode,'fixed_daily');
assert.equal(nextWeek.value,25);
assert.equal(nextWeek.source,'default');
assert.equal(DF.savingsForPeriod({netAvailable:200,rule:inWeek,workedDays:4}).saved,150);
assert.equal(DF.savingsForPeriod({netAvailable:200,rule:{mode:'percent_net',value:50},workedDays:4}).saved,100);

// URSSAF effective-dated rates must never leak backwards in time.
const urssaf={
  urssafEnabled:true,
  urssafRatePct:21.2,
  urssafRateHistory:[
    {effectiveFrom:'2026-07-01',ratePct:15.9},
    {effectiveFrom:'2026-10-01',ratePct:21.2}
  ]
};
const before=DF.resolveUrssaf(urssaf,'2026-06-30');
const acre=DF.resolveUrssaf(urssaf,'2026-08-19');
const standard=DF.resolveUrssaf(urssaf,'2026-10-02');
assert.equal(before.rate,0);
assert.equal(before.source,'before_history');
assert.equal(acre.rate,15.9);
assert.equal(standard.rate,21.2);
assert.equal(DF.resolveUrssaf({...urssaf,urssafEnabled:false},'2026-10-02').rate,0);

const fin=DF.financialMetrics({ca:100,fuel:10,urssafEnabled:true,urssafRatePct:21.2});
assert.equal(DF.round2(fin.urssaf),21.2);
assert.equal(DF.round2(fin.netFinal),68.8);

console.log('DriveFlow V6 savings/URSSAF rule tests passed');
